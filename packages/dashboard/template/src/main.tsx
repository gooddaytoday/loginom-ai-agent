import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { onState, type DashboardState } from "./loginom"

function App() {
  const [state, setState] = useState<DashboardState>()
  useEffect(() => onState(setState), [])
  if (window.parent === window) return <p role="status">Откройте dashboard кнопкой Dashboard в Studio</p>
  const table = state?.table
  const text = !state || state.busy
    ? "Идёт расчёт"
    : state.error ?? (!table || (table.rows.length === 0 && !table.truncated)
      ? "Нет данных"
      : `Строк в результате: ${table.rows.length}${table.truncated ? ` из ${table.totalRows}: показана часть` : ""}`)
  return (
    <>
      {state && <p>{state.parameters.map(parameter => `${parameter.name} = ${parameter.value ?? "не задан"}`).join(", ")}</p>}
      <p role={state && !state.busy && state.error !== null ? "alert" : "status"}>{text}</p>
    </>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
