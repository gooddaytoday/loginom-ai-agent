import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { onState } from "./loginom"
import type { DashboardState } from "./loginom"
import { summarize } from "./summary"
import "./style.css"

const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 })
const format = (value: number | null) => value === null ? "—" : number.format(value)
const percent = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatRoi = (value: number | null) => value === null || !Number.isFinite(value) ? "—" : `${percent.format(value)} %`
const colors = ["#2b8b7e", "#527fc1", "#d79832", "#9170b5", "#d47162"]

function App() {
  const [state, setState] = useState<DashboardState>()
  useEffect(() => onState(setState), [])
  if (window.parent === window) return <p role="status">Откройте dashboard кнопкой Dashboard в Studio</p>
  const busy = !state || state.busy
  const error = state?.error ?? null
  const actual = state?.parameters.find(parameter => parameter.name === "MinBudget")?.value ?? null
  const table = state?.table
  const summary = table ? summarize(table) : null
  const totals = summary && !summary.error ? summary.totals : null
  const partial = table?.truncated === true
  const unavailable = partial && table.rows.length === 0
  const showResult = !summary?.error && !unavailable
  const scope = partial ? " по полученным строкам" : ""
  const distribution = partial ? "по полученным строкам" : "по каналам"

  return <main>
    <header>
      <div className="eyebrow"><span className="brand-mark">M</span> МАРКЕТИНГ / ОБЗОР КАМПАНИЙ</div>
      <div className="heading-row">
        <div><h1>Сводка маркетинговых кампаний</h1><p className="subtitle">Бюджет, выручка и результат по каждому каналу</p></div>
        <span className="live"><span /> Данные Loginom</span>
      </div>
    </header>

    <div className="feedback">
      <p role="status" className="muted">Расчёт при пороге MinBudget = {actual === null ? "не задан" : format(actual)}</p>
      {busy && <p role="status" className="calculating">Идёт расчёт…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {partial && <p className="notice">{table.rows.length === table.totalRows
        ? "Содержимое некоторых ячеек сокращено"
        : `показана часть: ${table.rows.length} из ${table.totalRows}`}</p>}
    </div>

    {summary?.error && <p className="error" role="alert">{summary.error}</p>}
    {unavailable && !summary?.error && <p className="empty" role="status">Итоги недоступны</p>}
    {showResult && <section className="kpis" aria-label={`Итоговые показатели${scope}`} aria-busy={busy}>
      <article className="kpi budget">
        <span className="card-icon" aria-hidden="true">↗</span>
        <h2>{partial ? `Бюджет${scope}` : "Общий бюджет"}</h2>
        <strong>{format(totals?.budget ?? null)}</strong>{!partial && <p>Сумма бюджетов всех каналов</p>}
      </article>
      <article className="kpi revenue">
        <span className="card-icon" aria-hidden="true">↗</span>
        <h2>{partial ? `Выручка${scope}` : "Общая выручка"}</h2>
        <strong>{format(totals?.revenue ?? null)}</strong>{!partial && <p>Сумма выручки всех каналов</p>}
      </article>
      <article className="kpi campaigns">
        <span className="card-icon" aria-hidden="true">▤</span>
        <h2>Количество кампаний{scope}</h2>
        <strong>{format(totals?.campaigns ?? null)}</strong>{!partial && <p>Сумма счётчиков campaigns</p>}
      </article>
    </section>}

    {showResult && <section className="chart-panel" aria-busy={busy} aria-labelledby="channels-chart-title">
      <div className="table-heading"><div><h2 id="channels-chart-title">Распределение бюджета {distribution}</h2><p className="hint">{partial ? `Доля канала в бюджете${scope}` : "Доля канала в общем бюджете"}</p></div><span className="table-tag">БЮДЖЕТ</span></div>
      {summary && !summary.error && summary.totals.budget > 0 && summary.rows.every(row => row.budget >= 0) ? <div className="chart-layout">
        <div className="channel-chart" role="img" aria-label={`Круговая диаграмма бюджета ${distribution}. Значения и доли указаны в легенде.`}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={summary.rows} dataKey="budget" nameKey="channel" outerRadius={112} stroke="#fff" strokeWidth={3} isAnimationActive={false}>
                {summary.rows.map((row, index) => <Cell key={`${row.channel}-${index}`} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip formatter={value => [typeof value === "number" ? `${format(value)} · ${percent.format(value / summary.totals.budget * 100)} %${scope}` : "—", "Бюджет"]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="chart-legend" aria-label={partial ? `Бюджет и доли${scope}` : "Бюджет и доля каждого канала"}>
          {summary.rows.map((row, index) => <li key={`${row.channel}-${index}`}>
            <span className="channel-dot" style={{ backgroundColor: colors[index % colors.length] }} aria-hidden="true" />
            <span className="legend-channel">{row.channel}<small>{format(row.budget)}</small></span>
            <strong>{percent.format(row.budget / summary.totals.budget * 100)} %{partial && <><br /><small>по полученным строкам</small></>}</strong>
          </li>)}
        </ul>
      </div> : <p className="empty">{busy && !state?.table ? "Ожидаем данные Loginom…" : "Нет данных с положительным общим бюджетом для круговой диаграммы."}</p>}
    </section>}

    {showResult && <section className="table-panel" aria-busy={busy}>
      <div className="table-heading"><div><h2>Показатели по каналам</h2><p className="hint">Порядок строк из узла «По убыванию ROI»</p></div><span className="table-tag">КАНАЛЫ</span></div>
      {summary && !summary.error ? <div className="table-scroll"><table>
        <thead><tr><th scope="col">Канал</th><th scope="col">Бюджет</th><th scope="col">Выручка</th><th scope="col">Кампании</th><th scope="col">ROI, %</th></tr></thead>
        <tbody>{summary.rows.map((row, index) => <tr key={`${row.channel}-${index}`}>
          <th scope="row"><span className="channel-dot" style={{ backgroundColor: colors[index % colors.length] }} aria-hidden="true" />{row.channel}</th><td>{format(row.budget)}</td><td>{format(row.revenue)}</td><td>{format(row.campaigns)}</td><td>{formatRoi(row.roi)}</td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">Итого{scope}</th><td>{format(summary.totals.budget)}</td><td>{format(summary.totals.revenue)}</td><td>{format(summary.totals.campaigns)}</td><td>{formatRoi(summary.totals.budget === 0 ? null : (summary.totals.revenue - summary.totals.budget) / summary.totals.budget * 100)}</td></tr></tfoot>
      </table>{summary.rows.length === 0 && <p className="empty">При этом пороге кампании не найдены.</p>}</div> : <div className="empty"><p>{busy ? "Ожидаем данные Loginom…" : "Нет рассчитанного результата."}</p></div>}
    </section>}
    <footer>Источник: По убыванию ROI <span>Живые данные · штатный адаптер dashboard</span></footer>
  </main>
}

createRoot(document.getElementById("root")!).render(<App />)
