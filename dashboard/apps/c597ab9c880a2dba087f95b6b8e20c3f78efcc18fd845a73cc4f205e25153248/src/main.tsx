import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { dashboard } from "./loginom"
import type { DashboardState } from "./loginom"
import { summarize } from "./summary"
import "./style.css"

function App() {
  const [result, setResult] = useState<DashboardState | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  async function load() {
    const adapter = dashboard
    if (!adapter) {
      setError("Откройте dashboard у узла Loginom.")
      setBusy(false)
      return
    }
    setBusy(true)
    setError(null)
    await adapter.state()
      .then(value => !value.table && !value.error ? adapter.run() : value)
      .then(value => {
        setResult(value)
        setError(value.error)
      })
      .catch(error => setError(String(error)))
    setBusy(false)
  }
  useEffect(() => {
    void load()
  }, [])
  const summary = result?.table ? summarize(result.table) : null
  const format = new Intl.NumberFormat("ru-RU")
  return <main aria-busy={busy}>
    <header>
      <div className="eyebrow">LOGINOM / МАРКЕТИНГ</div>
      <h1>Сводка по каналам</h1>
      <p>Количество кампаний по данным выхода узла</p>
    </header>
    {busy && <p role="status" className="notice">Идёт расчёт…</p>}
    {error && <div role="alert" className="error">{error}{result && <p>Текущее значение MinBudget: {result.value ?? "—"}</p>}</div>}
    {summary?.error && <p role="alert" className="error">{summary.error}</p>}
    {summary && !summary.error && <>
      {error && <p className="notice">Последняя успешная таблица — расчёт при пороге {result?.value ?? "—"}</p>}
      <section className="metrics" aria-label="Итоговые показатели">
        <div className="metric"><span>Всего кампаний</span><strong>{format.format(summary.total)}</strong><small>Сумма по всем каналам</small></div>
        <div className="metric secondary"><span>Каналов</span><strong>{format.format(summary.rows.length)}</strong><small>В текущем результате</small></div>
      </section>
      <section className="table-panel">
        <h2>Каналы и кампании</h2>
        <table>
          <caption>Кампании по каналам</caption>
          <thead><tr><th scope="col">Канал</th><th scope="col" className="number">Число кампаний</th></tr></thead>
          <tbody>{summary.rows.map((row, index) => <tr key={index}><td>{row.channel}</td><td className="number">{format.format(row.campaigns)}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row">Итого</th><td className="number">{format.format(summary.total)}</td></tr></tfoot>
        </table>
        {summary.rows.length === 0 && <p className="empty">В выходе узла нет каналов. Всего кампаний: 0.</p>}
      </section>
    </>}
    {!busy && !error && !result?.table && <p className="notice">Результат ещё не рассчитан.</p>}
    <footer>Источник: выход Loginom · По убыванию ROI</footer>
  </main>
}

createRoot(document.getElementById("root")!).render(<App />)
