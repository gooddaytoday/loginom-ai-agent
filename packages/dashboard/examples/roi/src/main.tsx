import { useEffect, useState } from "react"
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { createRoot } from "react-dom/client"
import { onState, type DashboardState } from "./loginom"
import "./style.css"

type Table = NonNullable<DashboardState["table"]>

function channelsFrom(table: Table) {
  const columns = table.schema.map(column => column.name)
  const indexes = ["channel", "total_budget", "total_revenue", "roi_pct", "campaigns"].map(name => {
    const index = columns.indexOf(name)
    if (index < 0) throw Error(`В результате узла отсутствует поле «${name}».`)
    return index
  })
  return table.rows.map(row => {
    const numeric = (index: number) => {
      const cell = row[index]
      if (typeof cell !== "number" && (typeof cell !== "string" || !cell.trim())) return null
      const value = Number(cell)
      return Number.isFinite(value) ? value : null
    }
    return {
      name: String(row[indexes[0]] ?? "Без названия"),
      budget: numeric(indexes[1]), revenue: numeric(indexes[2]),
      roi: numeric(indexes[3]), campaigns: numeric(indexes[4]),
    }
  })
}

type Channel = ReturnType<typeof channelsFrom>[number]
const columns = [
  ["name", "Канал"], ["budget", "Бюджет"], ["revenue", "Выручка"], ["roi", "ROI"], ["campaigns", "Кампании"],
] as const
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2, style: "percent" })
const quantity = (value: number | null) => value === null ? "—" : number.format(value)
const roiLabel = (value: number | null) => value === null ? "—" : percent.format(value / 100)
const thresholdLabel = (value: number | null) => value === null ? "не задан" : quantity(value)

function total(channels: Channel[], field: "budget" | "revenue" | "campaigns") {
  return channels.reduce<number | null>((sum, channel) => {
    const value = channel[field]
    return sum === null || value === null ? null : sum + value
  }, 0)
}

function Comparison({ channels }: { channels: Channel[] }) {
  return <section className="comparison">
    <h2>ROI по каналам</h2>
    <ResponsiveContainer width="100%" height={Math.max(140, channels.length * 44)}>
      <BarChart data={channels} layout="vertical" margin={{ right: 12, top: 12 }}>
        <XAxis type="number" stroke="#d9edb5" tickFormatter={n => n + "%"} />
        <YAxis type="category" dataKey="name" width={86} tick={{ fill:"#fff", fontSize:12 }} />
        <YAxis yAxisId="roiLabels" orientation="right" type="category" dataKey={(channel: Channel) => roiLabel(channel.roi)}
          interval={0} width="auto" axisLine={false} tickLine={false} tick={{ fill: "#d9edb5", fontSize: 12 }} />
        <Tooltip formatter={value => roiLabel(Number(value))} contentStyle={{color:"#20312c"}} />
        <Bar name="ROI" dataKey="roi" fill="#c8e98e" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </section>
}

function Results({ channels }: { channels: Channel[] }) {
  const [sort, setSort] = useState<{ key: keyof Channel; direction: "ascending" | "descending" } | null>(null)
  const sorted = sort ? [...channels].sort((a, b) => {
    const direction = sort.direction === "ascending" ? 1 : -1
    if (sort.key === "name") return direction * a.name.localeCompare(b.name, "ru")
    const left = a[sort.key]
    const right = b[sort.key]
    if (left === right) return 0
    if (left === null) return 1
    if (right === null) return -1
    return direction * (left - right)
  }) : channels
  const budget = total(channels, "budget")
  const revenue = total(channels, "revenue")
  const roi = budget && revenue !== null ? (revenue - budget) / budget * 100 : null
  return <>
    <section className="metrics" aria-label="Итоги по всем каналам">
      {[["Бюджет", quantity(budget)], ["Выручка", quantity(revenue)], ["Общий ROI", roiLabel(roi)],
        ["Кампании", quantity(total(channels, "campaigns"))]].map(([label, value]) =>
        <div className={label === "Общий ROI" ? "metric roi" : "metric"} key={label}>
          <h2>{label}</h2><p>{value}</p>
        </div>)}
    </section>
    {channels.length === 0
      ? <section className="empty"><h2>Нет кампаний</h2><p>При этом пороге ни одна кампания не вошла в расчёт.</p></section>
      : <div className="details">
        <Comparison channels={channels} />
        <section className="records">
          <h2>Показатели каналов</h2>
          <div className="scroll">
            <table aria-label="Показатели каналов">
              <thead><tr>{columns.map(([key, label]) => {
                const direction = key === sort?.key ? sort.direction : undefined
                return <th key={key} scope="col" aria-sort={direction}>
                  <button type="button" onClick={() => setSort({
                    key, direction: direction === "ascending" ? "descending" : "ascending",
                  })}>{label} <span aria-hidden="true">{direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "↕"}</span></button>
                </th>
              })}</tr></thead>
              <tbody>{sorted.map((channel, index) => <tr key={index}>
                <th scope="row">{channel.name}</th><td>{quantity(channel.budget)}</td>
                <td>{quantity(channel.revenue)}</td><td className="return">{roiLabel(channel.roi)}</td>
                <td>{quantity(channel.campaigns)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>}
  </>
}

function App() {
  const [state, setState] = useState<DashboardState>()
  const [channels, setChannels] = useState<Channel[] | null>(null)
  const [error, setError] = useState("")
  useEffect(() => onState(value => {
    setState(value)
    setError(value.error ?? "")
    if (!value.table || value.error) return setChannels(null)
    try {
      setChannels(channelsFrom(value.table))
    } catch (failure) {
      setChannels(null)
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }), [])
  if (window.parent === window) return <p role="status">Откройте dashboard кнопкой Dashboard в Studio</p>
  const busy = !state || state.busy
  return <main>
    <header>
      <div className="heading">
        <div className="node"><span className="mark" aria-hidden="true"><i /><i /><i /></span>По убыванию ROI</div>
        <h1>Эффективность маркетинга</h1>
      </div>
    </header>
    <div className="status" role="status">
      {busy && <span>Идёт расчёт…</span>}
      {error && <span role="alert" className="failure">{error}</span>}
      {!busy && !channels && !error && <span>Нет данных</span>}
      {state && <span className="threshold">Расчёт при пороге MinBudget = {thresholdLabel(state.parameters.find(parameter => parameter.name === "MinBudget")?.value ?? null)}</span>}
      {channels && state?.table?.truncated && <span>показана часть: {state.table.rows.length} из {state.table.totalRows}</span>}
    </div>
    {channels && <Results channels={channels} />}
  </main>
}

createRoot(document.getElementById("root")!).render(<App />)
