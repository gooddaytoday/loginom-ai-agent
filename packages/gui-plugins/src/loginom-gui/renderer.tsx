import { isModelServerID } from "@loginom-ai-agent/loginom-host/model-server-id"
import { dashboardLinkChannel } from "@loginom-ai-agent/product/dashboard-link"
import { bindPlugin, SettingsPage, type Plugin } from "@opencode/plugin/gui"
import {
  builtinContext,
  BuiltinProviderSetup,
  Page,
  subscribeBuiltinDeepLinks,
  type ProviderSetupProps,
} from "@opencode/plugin/gui/builtin"
import { Option, Schema } from "effect"
import { lazy, onCleanup, Show, Suspense } from "solid-js"
import { unwrap } from "solid-js/store"
import { DashboardLink } from "./contract"
import { transitionDashboard, type DashboardState, type DashboardStore } from "./dashboard-machine"
import type definition from "./index"
import { registerStartScreen } from "./start-screen"

const decodeLink = Schema.decodeUnknownOption(DashboardLink)

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  registerStartScreen(ctx)

  const ModelServer = lazy(() => import("./model-server"))

  ctx.add(BuiltinProviderSetup, {
    id: "loginom-own-model-server",
    get title() {
      return ctx.t("modelServerTitle")
    },
    matchesProvider: isModelServerID,
    removal: {
      get title() {
        return ctx.t("modelServerRemove")
      },
      async run(client, provider, directory, signal) {
        const confirmed = await ctx.dialogs.confirm({
          title: ctx.t("modelServerRemove"),
          description: ctx.t("modelServerRemoveConfirm", { server: provider.name }),
          confirm: ctx.t("modelServerRemove"),
          danger: true,
        })

        if (!confirmed || signal.aborted) return false

        try {
          const { ModelServerRpc } = await import("@loginom-ai-agent/loginom-host/model-server-rpc")

          const result = await client
            .rpc(ModelServerRpc)
            .remove(
              { providerID: provider.id },
              {
                location: directory ? { directory } : undefined,
                signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
              },
            )

          if (result.ok) return true
        } catch {}

        if (!signal.aborted) ctx.toast.show({ variant: "error", title: ctx.t("modelServerRemoveFailed") })

        return false
      },
    },
    render: bindPlugin((props: ProviderSetupProps) => (
      <Suspense>
        <ModelServer {...props} />
      </Suspense>
    )),
  })

  const Catalog = lazy(() => import("./catalog-page"))

  ctx.add(Page, {
    id: "catalog",
    nav: {},
    get title() {
      return ctx.t("catalog.title")
    },
    render: () => (
      <Suspense>
        <Catalog />
      </Suspense>
    ),
  })

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

  const [store, setStore] = ctx.storage.memory<{ dashboard: DashboardState }>("dashboard", {
    initial: { dashboard: { nextAttempt: 1 } },
  })

  const dashboard: DashboardStore = {
    state: () => store.dashboard,
    dispatch(event) {
      const previous = unwrap(store.dashboard)
      const next = transitionDashboard(previous, event)

      if (next === previous) return

      setStore((draft) => {
        draft.dashboard = next
      })

      return next
    },
  }

  ctx.add(Page, {
    id: "dashboard",
    get title() {
      return ctx.t("dashboard")
    },
    render: () => (
      <Suspense>
        <Show
          when={dashboard.state().current?.link}
          keyed
          fallback={
            <p class="p-4" role="status">
              {ctx.t("dashboardOpenStudio")}
            </p>
          }
        >
          {(link) => <Dashboard link={link} dashboard={dashboard} />}
        </Show>
      </Suspense>
    ),
  })

  onCleanup(subscribeBuiltinDeepLinks(dashboardLinkChannel, (data) => {
    const decoded = decodeLink(data)

    if (Option.isNone(decoded)) return

    const link = decoded.value

    if ("code" in link) {
      const issue =
        link.code === "DASHBOARD_SNAPSHOT_UNAVAILABLE" || link.code === "DASHBOARD_SNAPSHOT_INVALID"
          ? "dashboardSnapshotGone"
          : link.code === "LOGINOM_CONFIG_REQUIRED"
            ? "dashboardConnect"
            : "dashboardOpenFailed"

      if (router.path().split("?")[0] === `/page/${ctx.id}/dashboard`) {
        if (dashboard.dispatch({ type: "link.failed", id: link.id, issue })) return
      }

      ctx.toast.show({ variant: "error", title: ctx.t(issue) })

      return
    }

    dashboard.dispatch({ type: "link.opened", link })
    router.openPage("dashboard")
  }))
}

export default setup
