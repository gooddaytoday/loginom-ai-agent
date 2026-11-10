import { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { dashboard } from "./loginom"
import type { DashboardState } from "./loginom"
import { summarize } from "./summary"
import "./style.css"

const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 })
const format = (value: number | null) => value === null ? "—" : number.format(value)
const percent = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatRoi = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : `${percent.format(value)} %`
const colors = ["#2b8b7e", "#527fc1", "#d79832", "#9170b5", "#d47162"]

function App() {
  const adapter = dashboard
  const [actual, setActual] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [last, setLast] = useState<{ table: NonNullable<DashboardState["table"]>; threshold: number | null } | null>(null)
  const [busy, setBusy] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validation, setValidation] = useState<string | null>(null)
  const request = useRef(0)
  const edit = useRef(0)
  const submitted = useRef<number | null>(null)

  async function calculate(action: () => Promise<DashboardState>) {
    const id = ++request.current
    const version = edit.current
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (id !== request.current) return
      const value = result.parameters.find(parameter => parameter.name === "MinBudget")?.value ?? null
      setActual(value)
      submitted.current = value
      if (version === edit.current) setDraft(value === null ? "" : String(value))
      setReady(result.parameters.some(parameter => parameter.name === "MinBudget"))
      setError(result.error)
      if (!result.error && result.table) setLast({ table: result.table, threshold: value })
    } catch (cause) {
      if (id !== request.current) return
      submitted.current = null
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (id === request.current) setBusy(false)
    }
  }

  useEffect(() => {
    if (!adapter) {
      setError("Откройте пульт у узла «По убыванию ROI» в Loginom.")
      setBusy(false)
      return
    }
    void calculate(() => adapter.state())
  }, [])

  function apply() {
    if (!adapter || !ready) return
    const value = Number(draft)
    if (!draft.trim() || !Number.isFinite(value) || value < 0) {
      setValidation("Введите конечное число не меньше нуля.")
      return
    }
    setValidation(null)
    if (submitted.current === value) return
    submitted.current = value
    void calculate(() => adapter.change(value, "MinBudget"))
  }

  const summary = last ? summarize(last.table) : null
  const totals = summary && !summary.error ? summary.totals : null

  return <main>
    <header>
      <div className="eyebrow"><span className="brand-mark">M</span> МАРКЕТИНГ / ОБЗОР КАМПАНИЙ</div>
      <div className="heading-row">
        <div><h1>Сводка маркетинговых кампаний</h1><p className="subtitle">Бюджет, выручка и результат по каждому каналу</p></div>
        <span className="live"><span /> Данные Loginom</span>
      </div>
    </header>

    <section className="filter-panel" aria-label="Параметры расчёта">
      <div><label htmlFor="min-budget">Минимальный бюджет</label><p className="hint">Параметр MinBudget · Enter или выход из поля для пересчёта</p></div>
      <div className="control">
        <input id="min-budget" type="number" min="0" step="any" value={draft} disabled={!ready}
          aria-invalid={Boolean(validation)} aria-describedby="budget-feedback"
          onChange={event => { edit.current++; setDraft(event.target.value); setValidation(null) }}
          onBlur={apply} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); apply() } }} />
        <span className="parameter">MinBudget</span>
      </div>
    </section>
    <div className="feedback" id="budget-feedback">
      {validation && <p className="error" role="alert">{validation}</p>}
      <p role="status" className={busy ? "calculating" : "muted"}>{busy ? "Идёт расчёт" : `Фактический MinBudget: ${format(actual)}`}</p>
      {error && <p className="error" role="alert">{error} · Фактический MinBudget: {format(actual)}</p>}
      {!busy && adapter && !ready && <p className="error">Параметр MinBudget недоступен в текущем состоянии.</p>}
    </div>

    {last && <p className="calculation-label">{busy || error ? "Последний успешный результат · " : "Данные · "}расчёт при пороге {format(last.threshold)}</p>}
    {summary?.error && <p className="error" role="alert">{summary.error}</p>}
    <section className="kpis" aria-label="Итоговые показатели" aria-busy={busy}>
      <article className="kpi budget"><span className="card-icon" aria-hidden="true">↗</span><h2>Общий бюджет</h2><strong>{format(totals?.budget ?? null)}</strong><p>Сумма бюджетов всех каналов</p></article>
      <article className="kpi revenue"><span className="card-icon" aria-hidden="true">↗</span><h2>Общая выручка</h2><strong>{format(totals?.revenue ?? null)}</strong><p>Сумма выручки всех каналов</p></article>
      <article className="kpi campaigns"><span className="card-icon" aria-hidden="true">▤</span><h2>Количество кампаний</h2><strong>{format(totals?.campaigns ?? null)}</strong><p>Сумма счётчиков campaigns</p></article>
    </section>

    <section className="chart-panel" aria-busy={busy} aria-labelledby="channels-chart-title">
      <div className="table-heading"><div><h2 id="channels-chart-title">Распределение бюджета по каналам</h2><p className="hint">Доля канала в общем бюджете</p></div><span className="table-tag">БЮДЖЕТ</span></div>
      {summary && !summary.error && summary.totals.budget > 0 && summary.rows.every(row => row.budget >= 0) ? <div className="chart-layout">
        <div className="channel-chart" role="img" aria-label="Круговая диаграмма бюджета по каналам. Значения и доли указаны в легенде.">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={summary.rows} dataKey="budget" nameKey="channel" outerRadius={112} stroke="#fff" strokeWidth={3} isAnimationActive={false}>
                {summary.rows.map((row, index) => <Cell key={`${row.channel}-${index}`} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip formatter={value => [typeof value === "number" ? `${format(value)} · ${percent.format(value / summary.totals.budget * 100)} %` : "—", "Бюджет"]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="chart-legend" aria-label="Бюджет и доля каждого канала">
          {summary.rows.map((row, index) => <li key={`${row.channel}-${index}`}>
            <span className="channel-dot" style={{ backgroundColor: colors[index % colors.length] }} aria-hidden="true" />
            <span className="legend-channel">{row.channel}<small>{format(row.budget)}</small></span>
            <strong>{percent.format(row.budget / summary.totals.budget * 100)} %</strong>
          </li>)}
        </ul>
      </div> : <p className="empty">{busy && !last ? "Ожидаем данные Loginom…" : "Нет данных с положительным общим бюджетом для круговой диаграммы."}</p>}
    </section>

    <section className="table-panel" aria-busy={busy}>
      <div className="table-heading"><div><h2>Показатели по каналам</h2><p className="hint">Порядок строк из узла «По убыванию ROI»</p></div><span className="table-tag">КАНАЛЫ</span></div>
      {summary && !summary.error ? <div className="table-scroll"><table>
        <thead><tr><th scope="col">Канал</th><th scope="col">Бюджет</th><th scope="col">Выручка</th><th scope="col">Кампании</th><th scope="col">ROI, %</th></tr></thead>
        <tbody>{summary.rows.map((row, index) => <tr key={`${row.channel}-${index}`}>
          <th scope="row"><span className="channel-dot" style={{ backgroundColor: colors[index % colors.length] }} aria-hidden="true" />{row.channel}</th><td>{format(row.budget)}</td><td>{format(row.revenue)}</td><td>{format(row.campaigns)}</td><td>{formatRoi(row.roi)}</td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">Итого</th><td>{format(summary.totals.budget)}</td><td>{format(summary.totals.revenue)}</td><td>{format(summary.totals.campaigns)}</td><td>{formatRoi(summary.totals.budget === 0 ? null : (summary.totals.revenue - summary.totals.budget) / summary.totals.budget * 100)}</td></tr></tfoot>
      </table>{summary.rows.length === 0 && <p className="empty">При этом пороге кампании не найдены.</p>}</div> : <div className="empty"><p>{busy ? "Ожидаем данные Loginom…" : "Нет рассчитанного результата."}</p></div>}
      {!last && !busy && adapter && <button type="button" onClick={() => void calculate(() => adapter.run())}>Выполнить</button>}
      {last && error && !busy && adapter && <button type="button" onClick={() => void calculate(() => adapter.run())}>Повторить расчёт</button>}
    </section>
    <footer>Источник: По убыванию ROI <span>Живые данные · штатный адаптер пульта</span></footer>
  </main>
}

createRoot(document.getElementById("root")!).render(<App />)
