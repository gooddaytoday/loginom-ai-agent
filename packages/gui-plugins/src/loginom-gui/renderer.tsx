import { connectionRequiredTool, type Status } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { Product } from "@loginom-ai-agent/product"
import { ComposerPill, createKeyed, SettingsPage, type MountedSession, type Plugin } from "@opencode/plugin/gui"
import { ToolRenderer } from "@opencode/plugin/gui/builtin"
import { lazy, onCleanup, onMount, Show, Suspense } from "solid-js"
import type definition from "./index"
import { profileService } from "./target"

const publicAddress = new URL(Product.connection.url).href

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Page = lazy(() => import("./page"))
  const service = profileService(ctx, activated)
  const { server, client, page, dispatch } = service
  const current = ctx.sessions.current
  const matches = (session: MountedSession | undefined) => !!session && session.server.id === server()?.id
  const publicStand = () => {
    const status = page().status

    return (
      status &&
      !status.deviceOnly &&
      status.url === publicAddress &&
      status.username === Product.connection.username &&
      !status.hasPassword
    )
  }

  let settingsOpen = false
  let intent:
    | { source: "settings" | "card" | "pill"; client: ReturnType<typeof client>; session?: MountedSession }
    | undefined

  const refresh = () => {
    if (!settingsOpen && !document.hidden && client()) dispatch({ type: "refresh", background: true })
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
    dispatch({ type: "reset", blank: !!session })
    ctx.layout.settings("loginom")
  }

  function activated(status: Status) {
    const action = intent
    intent = undefined
    if (!action || action.client !== client() || ctx.signal.aborted) return

    ctx.toast.show({ title: ctx.t("connectedTo", { url: status.url }) })
    if (action.source === "settings") ctx.commands.run("common.goBack")

    const session = action.session
    if (!session || (action.source === "card" && session.visit !== current()?.visit)) return

    const target = session.server.client
    if (target !== action.client || !target) return

    void target.session
      .synthetic({ sessionID: session.id, text: ctx.t("continueTask"), resume: true }, { signal: ctx.signal })
      .catch(() => {
        if (!ctx.signal.aborted) ctx.toast.show({ title: ctx.t("resumeFailed"), variant: "error" })
      })
  }

  function connect(session?: MountedSession) {
    if (!publicStand() || page().connected || page().busy) return

    intent = { source: session ? "card" : "pill", client: client(), session }
    dispatch({
      type: "edit",
      patch: { url: Product.connection.url, username: Product.connection.username, password: "", noPassword: true },
    })
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
            <section class="grid min-w-0 gap-3 rounded-lg border border-border-base p-4" aria-label={ctx.t("connectTitle")}>
              <h3 class="text-14-medium text-text-strong">{ctx.t("connectTitle")}</h3>
              <Show when={publicStand()}>
                <p class="text-13-regular text-text-base">{ctx.t("publicStandDescription")}</p>
              </Show>
              <div class="flex flex-wrap gap-2">
                <Show when={publicStand()}>
                  <ctx.ui.Button
                    variant="contrast"
                    disabled={page().busy}
                    onClick={() => {
                      if (props.latest) connect(current())
                    }}
                  >
                    {ctx.t(page().checking ? "checking" : page().saving ? "saving" : "connectPublic")}
                  </ctx.ui.Button>
                </Show>
                <ctx.ui.Button
                  disabled={page().busy || !page().status}
                  onClick={() => {
                    if (props.latest) openSettings(current())
                  }}
                >
                  {ctx.t("ownServer")}
                </ctx.ui.Button>
              </div>
              <Show
                when={
                  page().issue ??
                  page().fieldErrors.url ??
                  page().fieldErrors.username ??
                  page().fieldErrors.password ??
                  (page().message !== "disconnected" && page().message)
                }
              >
                {(message) => <p role="status" class="text-12-regular text-text-base">{ctx.t(message())}</p>}
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
        title: page().connected ? ctx.t("title") : `${ctx.t("title")} · ${ctx.t("disconnected")}`,
        tone: page().connected ? "success" : "warning",
      }
    },
    menu: (input) => {
      onMount(refresh)
      const direct = () => !page().connected && publicStand()

      return (
        <div class="flex flex-col items-start gap-2 p-2">
          <Show when={page().status?.url}>{(url) => <span class="max-w-full truncate">{url()}</span>}</Show>
          <Show when={page().status?.username}>{(name) => <span>{name()}</span>}</Show>
          <ctx.ui.Button
            disabled={page().busy}
            onClick={() => {
              input.close()
              if (direct()) connect()
              else openSettings()
            }}
          >
            {ctx.t(direct() ? "connect" : "connectionSettings")}
          </ctx.ui.Button>
        </div>
      )
    },
  })
}

export default setup
