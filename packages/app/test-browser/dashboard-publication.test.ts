import { afterEach, beforeEach, expect, mock, test } from "bun:test"
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
const restoreMocks: Array<() => void> = []

async function mockExports(name: string, overrides: Record<string, unknown>) {
  const original = { ...await import(name) }
  mock.module(name, () => ({ ...original, ...overrides }))
  restoreMocks.push(() => mock.module(name, () => original))
}

beforeEach(async () => {
  await mockExports("@/context/language", { useLanguage: () => ({ t: translate }) })
})
afterEach(() => {
  for (const restore of restoreMocks.splice(0).reverse()) restore()
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
    const newDraft: PermissionRequest = {
      ...request,
      id: "new-draft",
      metadata: { dashboardConflict: { base: null, latest: { name: "20261114T120000Z.json", sourceHash: "c".repeat(64) } } },
    }
    setState("request", newDraft)
    expect(host.textContent).toContain("Для этого узла уже сохранили Dashboard. Если вы опубликуете свой черновик, после успешной сборки пользователи увидят вашу версию. Опубликовать?")
    expect(host.textContent).toContain("20261114T120000Z.json")
    expect(host.textContent).not.toContain("20261114T110000Z.json")
    expect(host.textContent).toContain("Заказы")
    expect(host.textContent).toContain("/fixture/orders.lgp")
    expect(decisions).toEqual([])
    const buttons = () => [...host.querySelectorAll("button")]
    expect(buttons().map(button => button.textContent)).toEqual(["Отмена", "Опубликовать мою версию"])
    buttons()[0].click()
    expect(decisions).toEqual(["reject"])
    setState("request", { ...newDraft, id: "new-draft-retry" })
    expect(decisions).toEqual(["reject"])
    buttons()[1].click()
    expect(decisions).toEqual(["reject", "once"])

    setState("request", { ...request, id: "first-publication", metadata: {} })
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(buttons().map(button => button.textContent)).toEqual([translate("ui.permission.deny"), translate("ui.permission.allowOnce")])
  } finally { dispose(); host.remove() }
})

test("deletion shows the bound node, package and loss of local edits before explicit approval", async () => {
  const { SessionPermissionDock } = await import("../src/pages/session/composer/session-permission-dock")
  const { autoRespondsPermission } = await import("../src/context/permission-auto-respond")
  const request: PermissionRequest = {
    id: "delete", sessionID: "session", permission: "dashboard_delete",
    patterns: ["Заказы", "/fixture/archive/orders.lgp"], always: ["*"],
    metadata: { publicationCount: 2, confirmedRemoved: 1 },
  }
  expect(autoRespondsPermission({ session: true }, [], request, "/fixture/work")).toBe(false)
  const decisions: string[] = []
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => createComponent(SessionPermissionDock, {
    request, responding: false, onDecide: value => decisions.push(value),
  }), host)
  try {
    expect(host.textContent).toContain("Заказы")
    expect(host.textContent).toContain("/fixture/archive/orders.lgp")
    expect(host.textContent).toContain("Опубликованных версий к удалению: 2")
    expect(host.textContent).toContain("Уже подтверждено удаление версий: 1")
    expect(host.textContent).toContain("Локальный черновик и неопубликованные правки будут удалены")
    const buttons = [...host.querySelectorAll("button")]
    expect(buttons.map(button => button.textContent)).toEqual(["Отмена", "Удалить"])
    expect(decisions).toEqual([])
    buttons[0].click()
    expect(decisions).toEqual(["reject"])
    buttons[1].click()
    expect(decisions).toEqual(["reject", "once"])
  } finally { dispose(); host.remove() }
})

test("opening a local draft displays the new-publication toast", async () => {
  const toasts: { title: string }[] = []
  const opened: string[] = []
  const { ServerConnection } = await import("@/context/server")
  const local = { type: "sidecar", variant: "base", http: { url: "http://127.0.0.1:17080" } } as const
  let failure: string | undefined
  await mockExports("@solidjs/router", { useLocation: () => ({ pathname: "/" }), useNavigate: () => () => {}, useParams: () => ({}), useSearchParams: () => [{}] })
  await mockExports("@/context/global", { useGlobal: () => ({}) })
  await mockExports("@/context/layout", { useLayout: () => ({ projects: { open: (path: string) => opened.push(path) } }) })
  await mockExports("@/context/tabs", { useTabs: () => ({ store: [] }) })
  await mockExports("@/context/settings", { useSettings: () => ({ general: { newLayoutDesigns: () => false } }) })
  await mockExports("@/context/server", { useServer: () => ({ key: ServerConnection.key(local), list: [local] }) })
  await mockExports("@/context/platform", { usePlatform: () => ({ getDashboardTarget: async () => { if (failure) throw Error(failure); return { directory: "/fixture/work", nodeName: "Заказы", fresh: false, action: "edit", notice: { kind: "newer-publication", latest: "20261114T110000Z.json" } } } }) })
  await mockExports("@/utils/toast", { showToast: (value: { title: string }) => toasts.push(value) })
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

test("opens the dashboard with no source project when the active session lookup stalls", async () => {
  const { ServerConnection } = await import("@/context/server")
  const local = { type: "sidecar", variant: "base", http: { url: "http://127.0.0.1:17080" } } as const
  const server = ServerConnection.key(local)
  const source = new Promise<never>(() => {})
  const opened = Promise.withResolvers<unknown>()
  let snapshotRequests = 0

  await mockExports("@solidjs/router", {
    useLocation: () => ({ pathname: "/" }),
    useNavigate: () => () => {},
    useParams: () => ({}),
    useSearchParams: () => [{}],
  })
  await mockExports("@/context/layout", {
    useLayout: () => ({
      route: () => ({ type: "session", server, sessionId: "previous" }),
      projects: { open: () => {} },
    }),
  })
  await mockExports("@/context/global", {
    useGlobal: () => ({
      ensureServerCtx: () => ({
        projects: { list: () => [] },
        sync: { session: { peek: () => undefined, resolve: () => source } },
      }),
    }),
  })
  await mockExports("@/context/tabs", {
    useTabs: () => ({
      store: [],
      ready: () => true,
      newDraft: async (draft: unknown) => {
        opened.resolve(draft)
        return { draftID: "dashboard" }
      },
    }),
  })
  await mockExports("@/context/settings", { useSettings: () => ({ general: { newLayoutDesigns: () => true } }) })
  await mockExports("@/context/server", { useServer: () => ({ key: server, list: [local] }) })
  await mockExports("@/context/platform", {
    usePlatform: () => ({
      getDashboardTarget: async () => {
        snapshotRequests++
        return { directory: "/fixture/dashboard/work", nodeName: "Заказы", fresh: true, action: "create" }
      },
    }),
  })
  const { useDashboardDeepLinks } = await import("../src/pages/layout/dashboard-links")
  window.__LOGINOM_AI_AGENT__ = {
    deepLinks: ["loginom-ai-agent://dashboard?id=77015e88-b7dd-408f-b09d-fb67dbad931d&action=create"],
  }
  const dispose = createRoot((dispose) => {
    useDashboardDeepLinks()
    return dispose
  })
  const deadline = Promise.withResolvers<string>()
  const timer = setTimeout(deadline.resolve, 2_500, "Dashboard did not open")
  try {
    expect(await Promise.race([opened.promise, deadline.promise])).toEqual({
      server,
      directory: "/fixture/dashboard/work",
      dashboardOrigin: null,
    })
    expect(snapshotRequests).toBe(1)
  } finally {
    clearTimeout(timer)
    dispose()
    delete window.__LOGINOM_AI_AGENT__
  }
})
