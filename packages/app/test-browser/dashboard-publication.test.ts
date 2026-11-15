import { beforeAll, expect, mock, test } from "bun:test"
import { createComponent, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { dict } from "../src/i18n/ru"

const ui = await import("@opencode-ai/ui/i18n/ru")
const dictionary = { ...dict, ...ui.dict }

const translate = (key: string, params: Record<string, string> = {}) => {
  const value = dictionary[key as keyof typeof dictionary] ?? key
  return value.replace(/{{(\w+)}}/g, (_match, name: string) => params[name] ?? "")
}
beforeAll(() => {
  mock.module("@/context/language", () => ({ useLanguage: () => ({ t: translate }) }))
})

test("conflict is readable before a decision, keeps node/package, and offers no always approval", async () => {
  const { SessionPermissionDock } = await import("../src/pages/session/composer/session-permission-dock")
  const request: PermissionRequest = {
    id: "permission", sessionID: "session", permission: "dashboard_publish", patterns: ["Заказы", "/fixture/orders.lgp"], always: [],
    metadata: { dashboardConflict: { base: { name: "20261114T100000Z.json", sourceHash: "a".repeat(64) }, latest: { name: "20261114T110000Z.json", sourceHash: "b".repeat(64) } } },
  }
  const [state, setState] = createStore({ request })
  const decisions: string[] = []
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => createComponent(SessionPermissionDock, { get request() { return state.request }, responding: false, onDecide: value => decisions.push(value) }), host)
  try {
    expect(host.textContent).toContain("Заменить её локальным черновиком")
    expect(host.textContent).toContain("20261114T110000Z.json")
    expect(host.textContent).toContain("Заказы")
    expect(host.textContent).toContain("/fixture/orders.lgp")
    expect(decisions).toEqual([])
    setState("request", { ...request, metadata: { dashboardConflict: { base: null, latest: { name: "20261114T120000Z.json", sourceHash: "c".repeat(64) } } } })
    expect(host.textContent).toContain("20261114T120000Z.json")
    expect(host.textContent).not.toContain("20261114T110000Z.json")
    const buttons = [...host.querySelectorAll("button")]
    expect(buttons).toHaveLength(2)
    buttons.find(button => button.textContent === translate("ui.permission.deny"))!.click()
    expect(decisions).toEqual(["reject"])
  } finally { dispose(); host.remove() }
})

test("opening a local draft displays the new-publication toast", async () => {
  const toasts: { title: string }[] = []
  const opened: string[] = []
  let failure: string | undefined
  mock.module("@solidjs/router", () => ({ useLocation: () => ({ pathname: "/" }), useNavigate: () => () => {}, useParams: () => ({}), useSearchParams: () => [{}] }))
  mock.module("@/context/layout", () => ({ useLayout: () => ({ projects: { open: (path: string) => opened.push(path) } }) }))
  mock.module("@/context/tabs", () => ({ useTabs: () => ({ store: [] }) }))
  mock.module("@/context/settings", () => ({ useSettings: () => ({ general: { newLayoutDesigns: () => false } }) }))
  mock.module("@/context/server", () => ({ ServerConnection: { local: () => true, key: () => "local" }, useServer: () => ({ key: "local", list: [{}] }) }))
  mock.module("@/context/platform", () => ({ usePlatform: () => ({ getDashboardTarget: async () => { if (failure) throw Error(failure); return { directory: "/fixture/work", nodeName: "Заказы", fresh: false, action: "edit", notice: { kind: "newer-publication", latest: "20261114T110000Z.json" } } } }) }))
  mock.module("@/utils/toast", () => ({ showToast: (value: { title: string }) => toasts.push(value) }))
  const { useDashboardDeepLinks } = await import("../src/pages/layout/dashboard-links")
  window.__LOGINOM_AI_AGENT__ = { deepLinks: ["loginom-ai-agent://dashboard?id=77015e88-b7dd-408f-b09d-fb67dbad931d&action=edit"] }
  const dispose = createRoot(dispose => { useDashboardDeepLinks(); return dispose })
  try {
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(opened).toEqual(["/fixture/work"])
    expect(toasts).toHaveLength(1)
    expect(toasts[0].title).toContain("20261114T110000Z.json")
    expect(toasts[0].title).toContain("Локальные исходники сохранены")
  } finally { dispose(); delete window.__LOGINOM_AI_AGENT__ }
  for (const [code, text] of [
    ["DASHBOARD_ACCESS_DENIED", "Недостаточно прав"],
    ["DASHBOARD_PUBLICATION_INVALID", "неподдерживаемый формат"],
    ["LOGINOM_GENERATION_UNAVAILABLE", "Подключение Loginom недоступно или изменилось"],
  ]) {
    failure = code
    toasts.length = 0
    window.__LOGINOM_AI_AGENT__ = { deepLinks: ["loginom-ai-agent://dashboard?id=77015e88-b7dd-408f-b09d-fb67dbad931d&action=edit"] }
    const dispose = createRoot(dispose => { useDashboardDeepLinks(); return dispose })
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(toasts[0].title).toContain(text)
    } finally { dispose(); delete window.__LOGINOM_AI_AGENT__ }
  }
})
