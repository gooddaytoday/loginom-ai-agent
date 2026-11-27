import { connectionRequiredTool, Definition, type Status } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { Product } from "@loginom-ai-agent/product"
import { ComposerPill, createKeyed, SettingsPage, type MountedSession, type Plugin } from "@opencode/plugin/gui"
import { ToolRenderer } from "@opencode/plugin/gui/builtin"
import { createMemo, createSignal, lazy, Show, Suspense } from "solid-js"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Page = lazy(() => import("./page"))
  const server = createMemo(() => {
    const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])
    if (ctx.desktop) return servers.find((item) => item.builtin)
    const serving = ctx.servers.get(location.origin)
    if (serving) return serving
    const local = servers.filter((item) => item.local)
    if (local.length === 1) return local.at(0)
  })
  const rpc = () => server()?.client?.rpc(Definition)
  const [status, setStatus] = createSignal<Status>()
  const [busy, setBusy] = createSignal(false)
  const [settings, setSettings] = createSignal<{ blank: boolean; session?: MountedSession }>()
  const matches = (session: MountedSession | undefined) => !!session && session.server.id === server()?.id
  const ready = () => status()?.state === "ready"
  const publicStand = () => {
    const value = status()
    return (
      value &&
      !value.deviceOnly &&
      value.url === new URL(Product.connection.url).href &&
      value.username === Product.connection.username &&
      !value.hasPassword
    )
  }

  createKeyed(
    () => server()?.client,
    (client) => {
      setStatus(undefined)
      const signal = AbortSignal.timeout(12_000)
      void client
        .rpc(Definition)
        .status({}, { signal })
        .then((result) => {
          if (result.ok && server()?.client === client) setStatus(result.value)
        })
        .catch(() => undefined)
    },
  )

  const openSettings = (blank: boolean, session?: MountedSession) => {
    setSettings({ blank, session })
    ctx.layout.settings("loginom")
  }
  const connected = async (value: Status, session?: MountedSession) => {
    setStatus(value)
    ctx.toast.show({ title: ctx.t("connectedTo", { url: value.url }) })
    if (!session) return
    try {
      if (!session.server.client) throw new Error("Session server unavailable")
      await session.server.client.session.synthetic({
        sessionID: session.id,
        text: ctx.t("continueTask"),
        resume: true,
      })
    } catch {
      ctx.toast.show({ title: ctx.t("resumeFailed"), variant: "error" })
    }
  }
  const connect = async (session?: MountedSession) => {
    const value = status()
    const client = rpc()
    if (!value || !client || !publicStand() || ready() || busy()) return
    setBusy(true)
    const report = (title: string) => ctx.toast.show({ title, variant: "error" })
    try {
      const check = await client.check(
        {
          revision: value.revision,
          url: Product.connection.url,
          username: Product.connection.username,
          password: { operation: "empty" },
        },
        { signal: AbortSignal.timeout(245_000) },
      )
      if (!check.ok) return report(ctx.t(check.issue))
      let result = await client.save(
        { revision: value.revision, validationId: check.value.validationId },
        { signal: AbortSignal.timeout(12_000) },
      )
      const deadline = Date.now() + 240_000
      while (
        result.ok &&
        !result.value.failed &&
        (result.value.state === "pending" || result.value.state === "starting") &&
        Date.now() < deadline
      ) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000))
        result = await client.status({}, { signal: AbortSignal.timeout(12_000) })
      }
      if (!result.ok) return report(ctx.t(result.issue))
      if (result.value.state !== "ready") return report(ctx.t("activationFailed"))
      await connected(result.value, session)
    } catch {
      report(ctx.t("serviceUnavailable"))
    } finally {
      setBusy(false)
    }
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
          server={server()}
          blank={settings()?.blank}
          onClose={() => setSettings(undefined)}
          onSaved={(value) => {
            const intent = settings()
            if (intent) ctx.commands.run("common.goBack")
            void connected(value, intent?.session)
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
      <Show
        when={props.metadata.connectionRequired === true && matches(ctx.sessions.current()) && status() && !ready()}
      >
        <section class="grid min-w-0 gap-3 rounded-lg border border-border-base p-4" aria-label={ctx.t("connectTitle")}>
          <h3 class="text-14-medium text-text-strong">{ctx.t("connectTitle")}</h3>
          <Show when={publicStand()}>
            <p class="text-13-regular text-text-base">{ctx.t("publicStandDescription")}</p>
          </Show>
          <div class="flex flex-wrap gap-2">
            <Show when={publicStand()}>
              <ctx.ui.Button variant="contrast" disabled={busy()} onClick={() => void connect(ctx.sessions.current())}>
                {ctx.t(busy() ? "checking" : "connectPublic")}
              </ctx.ui.Button>
            </Show>
            <ctx.ui.Button disabled={busy()} onClick={() => openSettings(true, ctx.sessions.current())}>
              {ctx.t("ownServer")}
            </ctx.ui.Button>
          </div>
        </section>
      </Show>
    ),
  })

  ctx.add(ComposerPill, {
    id: "loginom",
    show: ({ session }) => {
      if (!matches(session)) return
      const value = status()
      return {
        label: ctx.t("title"),
        title: ready() ? ctx.t("title") : `${ctx.t("title")} · ${ctx.t("disconnected")}`,
        tone: ready() ? "success" : "warning",
        rows: [
          ...(value?.url ? [{ id: "url", label: value.url }] : []),
          ...(value?.username ? [{ id: "username", label: value.username }] : []),
          {
            id: "settings",
            label: ctx.t(!ready() && publicStand() ? "connect" : "connectionSettings"),
            run: () => (!ready() && publicStand() ? void connect() : openSettings(false)),
          },
        ],
      }
    },
  })
}

export default setup
