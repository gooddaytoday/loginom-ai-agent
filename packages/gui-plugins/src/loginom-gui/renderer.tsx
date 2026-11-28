import { connectionRequiredTool, type Status } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { Product } from "@loginom-ai-agent/product"
import { dashboardLinkChannel } from "@loginom-ai-agent/product/dashboard-link"
import { ComposerPill, createKeyed, SettingsPage, type MountedSession, type Plugin } from "@opencode/plugin/gui"
import { builtinContext, Page as PluginPage, subscribeBuiltinDeepLinks, ToolRenderer } from "@opencode/plugin/gui/builtin"
import { Option, Schema } from "effect"
import { lazy, onCleanup, onMount, Show, Suspense } from "solid-js"
import { unwrap } from "solid-js/store"
import { DashboardLink } from "./contract"
import { transitionDashboard, type DashboardState, type DashboardStore } from "./dashboard-machine"
import type definition from "./index"
import { registerStartScreen } from "./start-screen"
import { profileService } from "./target"

const decodeLink = Schema.decodeUnknownOption(DashboardLink)

const publicAddress = new URL(Product.connection.url).href

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  registerStartScreen(ctx)
  const Catalog = lazy(() => import("./catalog-page"))
  ctx.add(PluginPage, {
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
  const Page = lazy(() => import("./page"))
  const service = profileService(ctx, activated)
  const { server, client, page, dispatch } = service
  const current = ctx.sessions.current
  const matches = (session: MountedSession | undefined) => !!session && session.server.id === server()?.id

  const publicStand = () => {
    const status = page().status

    return (
      status &&
      status.url === publicAddress &&
      status.username === Product.connection.username &&
      !status.hasPassword
    )
  }

  const savedServer = () => {
    const status = page().status

    if (status && status.generation > 0 && !publicStand()) return status
  }

  let settingsOpen = false

  let intent:
    | ({ client: ReturnType<typeof client> } & (
        | { source: "settings"; session: MountedSession }
        | { source: "card"; session: MountedSession; latest: () => boolean }
        | { source: "pill" }
      ))
    | undefined

  const refresh = () => {
    if (!document.hidden && client() && (!settingsOpen || page().awaitingActivation))
      dispatch({ type: "refresh", background: true, preserveDraft: settingsOpen })
  }

  createKeyed(
    () => {
      const session = current()

      return matches(session) ? session?.visit : undefined
    },
    () => {
      refresh()
      const timer = setInterval(refresh, 3000)
      document.addEventListener("visibilitychange", refresh)
      window.addEventListener("focus", refresh)
      onCleanup(() => {
        clearInterval(timer)
        document.removeEventListener("visibilitychange", refresh)
        window.removeEventListener("focus", refresh)
      })
    },
  )

  function openSettings(session?: MountedSession) {
    if (page().busy) return

    intent = session ? { source: "settings", client: client(), session } : undefined
    dispatch({ type: "reset", blank: !!session && !savedServer() })
    ctx.layout.settings("loginom")
  }

  function activated(status: Status) {
    const action = intent
    intent = undefined

    if (!action || action.client !== client() || ctx.signal.aborted) return

    ctx.toast.show({ title: ctx.t("connectedTo", { url: status.url }) })

    if (action.source === "settings") ctx.commands.run("common.goBack")

    if (action.source === "pill") return
    const session = action.session

    if (action.source === "card" && (session.visit !== current()?.visit || !action.latest())) return

    const target = session.server.client

    if (target !== action.client || !target) return

    void target.session
      .synthetic({ sessionID: session.id, text: ctx.t("continueTask"), resume: true }, { signal: ctx.signal })
      .catch(() => {
        if (!ctx.signal.aborted) ctx.toast.show({ title: ctx.t("resumeFailed"), variant: "error" })
      })
  }

  function connect(card?: { session: MountedSession; latest: () => boolean }) {
    if ((!publicStand() && !savedServer()) || page().connected || page().busy || page().awaitingActivation || page().status?.recoveryPending) return

    intent = card ? { ...card, source: "card", client: client() } : { source: "pill", client: client() }
    dispatch({ type: "reset" })
    dispatch({ type: "submit", submit: "save", now: Date.now() })
  }

  ctx.add(SettingsPage, {
    id: "loginom",
    icon: "arrow-up-right",
    get title() {
      return ctx.t("title")
    },
    render: () => (
      <Suspense>
        <Page
          service={service}
          onOpen={() => {
            settingsOpen = true

            if (intent?.source === "settings") return

            intent = undefined
            dispatch({ type: "reset" })

            if (client()) dispatch({ type: "refresh" })
          }}
          onClose={() => {
            settingsOpen = false
            intent = undefined
            dispatch({ type: "reset" })
          }}
        />
      </Suspense>
    ),
  })

  ctx.add(ToolRenderer, {
    tool: connectionRequiredTool,
    get title() {
      return ctx.t("connectTitle")
    },
    separate: true,
    render: (props) => (
      <Show when={props.metadata.connectionRequired === true && matches(current())}>
        <Show
          when={!page().connected}
          fallback={<p class="text-13-regular text-text-base">{ctx.t("connectedTrace")}</p>}
        >
          <Show when={props.latest}>
            <section
              class="grid min-w-0 gap-3 rounded-lg border border-border-base p-4"
              aria-label={ctx.t("connectTitle")}
            >
              <h3 class="text-14-medium text-text-strong">{ctx.t("connectTitle")}</h3>
              <Show
                when={!page().status?.recoveryPending}
                fallback={
                  <div class="grid justify-items-start gap-2">
                    <ctx.ui.Button disabled={page().busy} onClick={() => dispatch({ type: "refresh" })}>
                      {ctx.t("checkStatus")}
                    </ctx.ui.Button>
                  </div>
                }
              >
                <Show when={publicStand()}>
                  <p class="text-13-regular text-text-base">{ctx.t("publicStandDescription")}</p>
                </Show>
                <Show when={savedServer()}>
                  {(status) => <p class="break-all text-13-regular text-text-base">{status().url}</p>}
                </Show>
                <div class="flex flex-wrap gap-2">
                  <Show when={publicStand() || savedServer()}>
                    <ctx.ui.Button
                      variant="contrast"
                      disabled={page().busy || page().awaitingActivation}
                      onClick={() => {
                        const session = current()

                        if (props.latest && session && matches(session)) connect({ session, latest: () => props.latest })
                      }}
                    >
                      {ctx.t(page().checking ? "checking" : page().saving ? "saving" : publicStand() ? "connectPublic" : "connect")}
                    </ctx.ui.Button>
                  </Show>
                  <ctx.ui.Button
                    disabled={page().busy || !page().status}
                    onClick={() => {
                      const session = current()

                      if (props.latest && session && matches(session)) openSettings(session)
                    }}
                  >
                    {ctx.t(savedServer() ? "editConnection" : "ownServer")}
                  </ctx.ui.Button>
                </div>
              </Show>
              <Show
                when={
                  page().issue ??
                  page().fieldErrors.url ??
                  page().fieldErrors.username ??
                  page().fieldErrors.password ??
                  (page().message !== "disconnected" && page().message)
                }
              >
                {(message) => (
                  <p role="status" class="text-12-regular text-text-base">
                    {ctx.t(message())}
                  </p>
                )}
              </Show>
            </section>
          </Show>
        </Show>
      </Show>
    ),
  })

  ctx.add(ComposerPill, {
    id: "loginom",
    show: ({ session }) => {
      if (!matches(session)) return

      return {
        label: ctx.t("title"),
        title: ctx.t("title"),
        tone: page().connected ? "success" : "warning",
      }
    },
    menu: (input) => {
      onMount(refresh)
      const direct = () => !page().connected && (publicStand() || savedServer())

      return (
        <div class="flex flex-col items-start gap-2 p-2">
          <Show when={page().status?.url}>{(url) => <span class="max-w-full truncate">{url()}</span>}</Show>
          <Show when={page().status?.username}>{(name) => <span>{name()}</span>}</Show>
          <Show when={!page().connected}><span>{ctx.t("disconnected")}</span></Show>
          <ctx.ui.Button
            disabled={page().busy || (!!direct() && page().awaitingActivation && !page().status?.recoveryPending)}
            onClick={() => {
              input.close()

              if (page().status?.recoveryPending) dispatch({ type: "refresh" })
              else if (direct()) connect()
              else openSettings()
            }}
          >
            {ctx.t(page().status?.recoveryPending ? "checkStatus" : direct() ? "connect" : "connectionSettings")}
          </ctx.ui.Button>
        </div>
      )
    },
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

  ctx.add(PluginPage, {
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
