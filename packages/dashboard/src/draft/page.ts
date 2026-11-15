import type { DashboardState, DashboardTable } from "../sdk/loginom"
import { mountDashboard, sandboxFrame } from "../shell/frame"

type Data = {
  nodeName: string
  created: string
  hash: string
  appUrl: string
  parameters: DashboardState["parameters"]
  sample: Pick<DashboardTable, "schema" | "rows">
}

void main().catch(stopped)

async function main() {
  const key = location.pathname.split("/")[1]
  const data = await (await fetch(`/${key}/data`, { cache: "no-store", signal: AbortSignal.timeout(2_000) })).json() as Data
  const header = document.createElement("header")
  header.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:6px 16px;background:#393744;color:white"
  header.append(Object.assign(document.createElement("strong"), { textContent: data.nodeName }))
  const stamp = new Date(data.created).toLocaleString("ru-RU")
  header.append(Object.assign(document.createElement("span"), {
    textContent: `Черновик — доступен только с этого компьютера. Данные: пример из ${data.sample.rows.length} строк от ${stamp}`,
  }))
  for (const parameter of data.parameters) {
    const field = Object.assign(document.createElement("label"), { textContent: parameter.name + " " })
    field.append(Object.assign(document.createElement("input"), { type: "number", disabled: true, value: parameter.value === null ? "" : String(parameter.value) }))
    header.append(field)
  }
  if (data.parameters.length) header.append(Object.assign(document.createElement("span"), { textContent: "Пересчёт доступен после публикации" }))
  const frame = sandboxFrame(data.appUrl)
  frame.style.cssText = "border:0;width:100%;height:calc(100vh - 48px)"
  const dashboard = mountDashboard(frame, {
    close: () => frame.replaceWith(note("Dashboard закрыт. Обновите страницу, чтобы открыть его снова")),
    silent: () => {
      document.body.dataset.state = "silent"
      frame.replaceWith(note("Dashboard не ответил"))
    },
    ready: () => { document.body.dataset.state = "ready" },
  })
  dashboard.send({
    type: "state", parameters: data.parameters,
    table: { schema: data.sample.schema, rows: data.sample.rows, truncated: false, totalRows: data.sample.rows.length },
    error: null, busy: false,
  })
  document.body.append(header, frame)
  async function poll() {
    const latest = await fetch(`/${key}/hash`, { cache: "no-store", signal: AbortSignal.timeout(2_000) })
      .then(response => response.ok ? response.json() as Promise<{ hash: string }> : undefined)
      .catch(() => undefined)
    if (!latest) {
      dashboard.stop()
      stopped()
      return
    }
    if (latest.hash !== data.hash) return location.reload()
    setTimeout(poll, 2_000)
  }
  setTimeout(poll, 2_000)
}

function note(text: string) {
  return Object.assign(document.createElement("p"), { textContent: text, role: "status" })
}

function stopped() {
  delete document.body.dataset.state
  document.body.replaceChildren(note("Черновик остановлен. Попросите агента показать его снова"))
}
