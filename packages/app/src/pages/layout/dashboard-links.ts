import { base64Encode } from "@opencode-ai/core/util/encode"
import { useLocation, useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { makeEventListener } from "@solid-primitives/event-listener"
import { onMount } from "solid-js"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { ServerConnection, useServer } from "@/context/server"
import { useSettings } from "@/context/settings"
import { tabKey, useTabs } from "@/context/tabs"
import { pathKey } from "@/utils/path-key"
import { requireServerKey } from "@/utils/session-route"
import { showToast } from "@/utils/toast"
import { dashboardRoute, deliverDashboard } from "./dashboard-handoff"
import { deepLinkEvent, drainPendingDeepLinks, parseDashboardDeepLink } from "./deep-links"

export function useDashboardDeepLinks(handleOther?: (urls: string[]) => void) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams<{ serverKey?: string }>()
  const [search] = useSearchParams<{ draftId?: string; dashboardDraft?: string }>()
  const layout = useLayout()
  const tabs = useTabs()
  const server = useServer()
  const settings = useSettings()
  const platform = usePlatform()
  const language = useLanguage()
  const global = useGlobal()
  const requests = new Map<string, NonNullable<ReturnType<typeof parseDashboardDeepLink>>>()

  const captureOrigin = async (conn: ServerConnection.Any) => {
    const route = layout.route()
    const key = ServerConnection.key(conn)
    const ctx = global.ensureServerCtx(conn)
    let directory: string | undefined
    if (route.type === "home") {
      if (!layout.ready()) await layout.ready.promise
      const selection = layout.home.selection()
      if (selection.server === key) directory = selection.directory
    }
    if (route.type === "draft") {
      if (!tabs.ready()) await tabs.ready.promise
      const draft = tabs.store.find((tab) => tab.type === "draft" && tab.draftID === route.draftID)
      if (draft?.type !== "draft" || draft.server !== key) return null
      if (draft.dashboardOrigin !== undefined) return draft.dashboardOrigin
      directory = draft.directory
    }
    if (route.type === "session" && route.server === key) {
      if (!tabs.ready()) await tabs.ready.promise
      const tab = tabs.store.find((tab) => tab.type === "session" && tab.server === key && tab.sessionId === route.sessionId)
      if (tab?.dashboardOrigin !== undefined) return tab.dashboardOrigin
      const sessions = ctx.sync.session
      directory =
        sessions.peek(route.sessionId)?.directory ??
        (tab && tabs.info[tabKey(tab)]?.directory) ??
        (await sessions.resolve(route.sessionId)).directory
    }
    if (route.type === "dir-new-sesssion" && route.server === key) directory = route.dir
    if (!directory) return null

    const current = pathKey(directory)
    const projects = ctx.projects.list()
    const worktree = projects.find((project) => pathKey(project.worktree) === current)?.worktree ??
      projects.find((project) => project.sandboxes?.some((sandbox) => pathKey(sandbox) === current))?.worktree
    if (await platform.isDashboardWork?.(directory)) return null
    return worktree ?? directory
  }

  const receive = async (link: NonNullable<ReturnType<typeof parseDashboardDeepLink>>, cold: boolean) => {
    if (!platform.getDashboardTarget) return
    const path = location.pathname
    const draftID = search.draftId || search.dashboardDraft
    const current = !cold && (path === "/new-session" || /\/session(?:\/[^/]+)?\/?$/.test(path))
    const draft = path === "/new-session" && tabs.store.find((tab) => tab.type === "draft" && tab.draftID === draftID)
    const key =
      current && params.serverKey ? requireServerKey(params.serverKey) : current && draft ? draft.server : server.key
    const conn = server.list.find((item) => ServerConnection.key(item) === key)
    if (!conn || !ServerConnection.local(conn)) {
      showToast({ title: language.t("dashboard.target.localOnly"), variant: "error" })
      return
    }

    // A newer click wins even if snapshot replies arrive out of order.
    const route = dashboardRoute(key, "/")
    requests.set(route, link)
    try {
      const origin = settings.general.newLayoutDesigns() ? captureOrigin(conn).catch(() => null) : null
      const [snapshot, dashboardOrigin] = await Promise.all([
        platform.getDashboardTarget(link.id),
        origin,
      ])
      if (requests.get(route) !== link) return
      const item = { type: "dashboard", ...link, nodeName: snapshot.nodeName } as const
      layout.projects.open(snapshot.directory)
      if (snapshot.notice) showToast({ title: language.t(`dashboard.notice.${snapshot.notice.kind}`, {
        latest: snapshot.notice.latest ?? "", current: snapshot.notice.current ?? language.t("dashboard.version.none"), error: snapshot.notice.error ?? "",
      }) })
      if (settings.general.newLayoutDesigns()) {
        await tabs.ready.promise
        if (requests.get(route) !== link) return
        const draft = await tabs.newDraft({ server: key, directory: snapshot.directory, dashboardOrigin })
        deliverDashboard(dashboardRoute(key, "/new-session", draft.draftID), item)
        return
      }
      const path = `/${base64Encode(snapshot.directory)}/session`
      const draftID = crypto.randomUUID()
      deliverDashboard(dashboardRoute(key, path, draftID), item)
      navigate(`${path}?dashboardDraft=${draftID}`)
    } catch (error) {
      if (requests.get(route) !== link) return
      const message = error instanceof Error ? error.message : ""
      const key = message.includes("DASHBOARD_NOT_CONFIGURED") ? "dashboard.target.notConfigured"
        : /DASHBOARD_SNAPSHOT_(UNAVAILABLE|INVALID)/.test(message) ? "dashboard.target.snapshotGone"
        : /DASHBOARD_ACCESS_DENIED/.test(message) ? "dashboard.target.accessDenied"
        : /DASHBOARD_(PUBLICATION_(INVALID|TOO_LARGE)|INPUT_INVALID)/.test(message) ? "dashboard.target.publicationInvalid"
        : /DASHBOARD_(BINDING_CONFLICT|ORIGIN_MISMATCH)/.test(message) ? "dashboard.target.bindingConflict"
        : /LOGINOM_|DASHBOARD_(STORAGE_UNAVAILABLE|CANCELLED)/.test(message) ? "dashboard.target.connectionFailed"
        : "dashboard.target.failed"
      showToast({ title: language.t(key), variant: "error" })
    } finally {
      if (requests.get(route) === link) requests.delete(route)
    }
  }

  onMount(() => {
    if (handleOther && settings.general.newLayoutDesigns()) return
    const drain = () => {
      const cold = window.__LOGINOM_AI_AGENT__?.coldDashboard
      const urls = drainPendingDeepLinks(window)
      if (window.__LOGINOM_AI_AGENT__) delete window.__LOGINOM_AI_AGENT__.coldDashboard
      handleOther?.(urls)
      for (const url of urls) {
        const link = parseDashboardDeepLink(url)
        if (link) void receive(link, url === cold)
      }
    }
    makeEventListener(window, deepLinkEvent, drain)
    drain()
  })
}
