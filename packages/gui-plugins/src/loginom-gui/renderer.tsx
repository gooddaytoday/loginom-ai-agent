import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { builtinContext, Page } from "@opencode/plugin/gui/builtin"
import { dashboardLinkEvent, type DashboardLinkResult } from "@loginom-ai-agent/product/dashboard-link"
import { createSignal, lazy, onCleanup, Show, Suspense } from "solid-js"
import type { DashboardIssue } from "./dashboard"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Settings = lazy(() => import("./page"))
  ctx.add(SettingsPage, {
    id: "loginom",
    icon: "arrow-up-right",
    get title() {
      return ctx.t("title")
    },
    render: () => (
      <Suspense>
        <Settings />
      </Suspense>
    ),
  })

  if (!ctx.desktop) return
  const Dashboard = lazy(() => import("./dashboard"))
  const router = builtinContext(ctx).router
  const [target, setTarget] = createSignal<Exclude<DashboardLinkResult, { code: string }>>()
  const [issue, setIssue] = createSignal<DashboardIssue>()
  ctx.add(Page, {
    id: "dashboard",
    get title() {
      return ctx.t("dashboard")
    },
    render: () => (
      <Suspense>
        <Show
          when={target()}
          keyed
          fallback={
            <p class="p-4" role="status">
              {ctx.t("dashboardOpenStudio")}
            </p>
          }
        >
          {(link) => <Dashboard link={link} issue={issue()} />}
        </Show>
      </Suspense>
    ),
  })

  const receive = () => {
    const pending = window.loginomDashboardLinks ?? []
    delete window.loginomDashboardLinks
    for (const link of pending) {
      if ("code" in link) {
        const code = link.code
        const message =
          code === "DASHBOARD_SNAPSHOT_UNAVAILABLE" || code === "DASHBOARD_SNAPSHOT_INVALID"
            ? "dashboardSnapshotGone"
            : code === "LOGINOM_CONFIG_REQUIRED"
              ? "dashboardConnect"
              : "dashboardOpenFailed"
        if (target() && router.path().split("?")[0] === `/page/${ctx.id}/dashboard`) setIssue(message)
        else ctx.toast.show({ variant: "error", title: ctx.t(message) })
        continue
      }
      setIssue(undefined)
      setTarget(link)
      router.openPage("dashboard")
    }
  }
  window.addEventListener(dashboardLinkEvent, receive)
  onCleanup(() => window.removeEventListener(dashboardLinkEvent, receive))
  receive()
}

export default setup
