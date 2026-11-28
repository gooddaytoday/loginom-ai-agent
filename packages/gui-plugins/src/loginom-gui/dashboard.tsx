import { isRpcError } from "@opencode/client/promise"
import { usePlugin, type ServerRef } from "@opencode/plugin/gui"
import { AbsolutePath } from "@opencode/schema"
import { Schema } from "effect"
import { onCleanup, onMount, Show } from "solid-js"
import { DashboardPreview } from "./contract"
import { dashboardView, type DashboardStore, type Target } from "./dashboard-machine"
import type definition from "./index"

type Props = { link: Target; dashboard: DashboardStore }

const locationOf = (link: Target) => ({ directory: AbsolutePath.make(link.directory) })

const previewUrl = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }))

const foundSnapshot = Schema.is(Schema.Struct({ found: Schema.Literal(true) }))

async function loadPreview(server: ServerRef, link: Target, lifetime: AbortSignal) {
  const deadline = Date.now() + 60_000
  const signal = AbortSignal.any([lifetime, AbortSignal.timeout(60_000)])
  const location = locationOf(link)
  let delay = 100

  while (true) {
    signal.throwIfAborted()

    try {
      const { output } = await server.client.rpc.call(
        { rpcID: "loginom.dashboard", method: "preview", input: { id: link.id }, location },
        { signal },
      )

      return previewUrl(output).url
    } catch (error) {
      const remaining = deadline - Date.now()

      if (signal.aborted || remaining <= 0 || !isRpcError(error) || error.type !== "rpc.unavailable") throw error

      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, remaining)))
      delay = Math.min(delay * 2, 2_000)
    }
  }
}

export default function Dashboard(props: Props) {
  const ctx = usePlugin<typeof definition>()

  const sidecar = () =>
    ctx.servers
      .list()
      .map(ctx.servers.get)
      .find((server) => server?.builtin)

  return (
    <Show
      when={sidecar()}
      keyed
      fallback={
        <p class="p-4" role="status">
          {ctx.t("dashboardLoading")}
        </p>
      }
    >
      {(server) => <Preview link={props.link} server={server} dashboard={props.dashboard} />}
    </Show>
  )
}

function Preview(props: Props & { server: ServerRef }) {
  const ctx = usePlugin<typeof definition>()
  const ipc = ctx.main(DashboardPreview)
  const controller = new AbortController()
  const signal = controller.signal
  const { link, server, dashboard } = props
  const display = () => dashboardView(dashboard.state(), link.id)

  onMount(() => {
    const view = dashboard.dispatch({ type: "view.opened", id: link.id })?.current?.view

    if (view?.status !== "open") return

    const attempt = view.attempt

    const opening = loadPreview(server, link, signal).then((url) => {
      signal.throwIfAborted()

      return ipc.open({ url })
    })

    void opening.then(
      (embed) => dashboard.dispatch({ type: "preview.ready", attempt, embed: embed.id }),
      () => dashboard.dispatch({ type: "preview.failed", attempt }),
    )
    onCleanup(() => {
      controller.abort()
      dashboard.dispatch({ type: "view.closed", attempt })
      void opening.then((embed) => ipc.close(embed)).catch(() => undefined)
    })
  })

  async function edit() {
    const viewAttempt = display().attempt

    if (viewAttempt === undefined) return

    const view = dashboard.dispatch({ type: "edit.requested", view: viewAttempt })?.current?.view

    if (view?.status !== "open" || view.edit.status !== "checking") return

    const attempt = view.edit.attempt

    try {
      const { output } = await server.client.rpc.call(
        { rpcID: "loginom.dashboard", method: "find", input: { id: link.id }, location: locationOf(link) },
        { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) },
      )

      if (!foundSnapshot(output)) {
        dashboard.dispatch({ type: "edit.finished", attempt, issue: "dashboardSnapshotGone" })

        return
      }

      if (!dashboard.dispatch({ type: "edit.finished", attempt })) return

      ctx.layout.draft({
        server: server.id,
        directory: link.directory,
        prompt: ctx.t(link.action === "create" ? "dashboardCreatePrompt" : "dashboardEditPrompt", {
          node: link.nodeName,
        }),
      })
    } catch {
      dashboard.dispatch({ type: "edit.finished", attempt, issue: "dashboardOpenFailed" })
    }
  }

  return (
    <section class="flex min-w-0 min-h-0 flex-1 flex-col gap-3 p-4" aria-label={ctx.t("dashboard")}>
      <header class="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-12-regular text-v2-text-text-weak">{ctx.t("dashboard")}</p>
          <h1 class="text-16-medium [overflow-wrap:anywhere]">{link.nodeName}</h1>
        </div>
        <ctx.ui.Button busy={display().editing} onClick={() => void edit()}>
          {ctx.t("dashboardEdit")}
        </ctx.ui.Button>
      </header>
      <Show when={display().issue}>
        {(key) => <p role="alert">{ctx.t(key())}</p>}
      </Show>
      <Show when={link.notice}>
        <p role="status">{ctx.t("dashboardPublicationNotice")}</p>
      </Show>
      <ctx.embeds.View
        id={display().embed}
        visible={!!display().embed}
        class="relative flex min-h-0 flex-1 flex-col"
        radius={10}
      >
        <Show when={!display().embed}>
          <p role="status" class="p-3">
            {ctx.t(display().previewFailed ? "dashboardPreviewFailed" : "dashboardLoading")}
          </p>
        </Show>
      </ctx.embeds.View>
    </section>
  )
}
