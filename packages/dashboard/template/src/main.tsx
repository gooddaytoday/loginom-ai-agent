import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { dashboard } from "./loginom"

function App() {
  const [status, setStatus] = useState("Идёт расчёт")
  useEffect(() => {
    if (!dashboard) {
      setStatus("Откройте Dashboard у узла Loginom.")
      return
    }
    dashboard.state()
      .then(result => setStatus(result.error ?? (result.table ? `Строк в результате: ${result.table.rows.length}` : "Результат ещё не рассчитан.")))
      .catch(error => setStatus(String(error)))
  }, [])
  return <p role="status">{status}</p>
}

createRoot(document.getElementById("root")!).render(<App />)
