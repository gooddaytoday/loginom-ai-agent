import { base64Encode } from "@opencode-ai/core/util/encode"
import { useLocation, useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { makeEventListener } from "@solid-primitives/event-listener"
import { onMount } from "solid-js"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { ServerConnection, useServer } from "@/context/server"
import { useSettings } from "@/context/settings"
import { useTabs } from "@/context/tabs"
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
  const requests = new Map<string, NonNullable<ReturnType<typeof parseDashboardDeepLink>>>()

  const receive = async (link: NonNullable<ReturnType<typeof parseDashboardDeepLink>>, cold: boolean) => {
    if (!platform.getDashboardTarget) return
    const path = location.pathname
    const draftID = search.draftId || search.dashboardDraft
    const current = !cold && (path === "/new-session" || /\/session(?:\/[^/]+)?\/?$/.test(path))
    const draft = path === "/new-session" && tabs.store.find((tab) => tab.type === "draft" && tab.draftID === draftID)
    const key =
      current && params.serverKey ? requireServerKey(params.serverKey) : current && draft ? draft.server : server.key
    if (!ServerConnection.local(server.list.find((item) => ServerConnection.key(item) === key))) {
      showToast({ title: language.t("dashboard.target.localOnly"), variant: "error" })
      return
    }

    // A newer click wins even if snapshot replies arrive out of order.
    const route = dashboardRoute(key, "/")
    requests.set(route, link)
    try {
      const snapshot = await platform.getDashboardTarget(link.id)
      if (requests.get(route) !== link) return
      const item = { type: "dashboard", ...link, nodeName: snapshot.nodeName, fresh: snapshot.fresh } as const
      layout.projects.open(snapshot.directory)
      if (settings.general.newLayoutDesigns()) {
        await tabs.ready.promise
        if (requests.get(route) !== link) return
        const draft = await tabs.newDraft({ server: key, directory: snapshot.directory })
        deliverDashboard(dashboardRoute(key, "/new-session", draft.draftID), item)
        return
      }
      const path = `/${base64Encode(snapshot.directory)}/session`
      const draftID = crypto.randomUUID()
      deliverDashboard(dashboardRoute(key, path, draftID), item)
      navigate(`${path}?dashboardDraft=${draftID}`)
    } catch (error) {
      if (requests.get(route) === link)
        showToast({
          title: language.t(
            error instanceof Error && error.message.includes("DASHBOARD_NOT_CONFIGURED")
              ? "dashboard.target.notConfigured"
              : "dashboard.target.snapshotGone",
          ),
          variant: "error",
        })
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
