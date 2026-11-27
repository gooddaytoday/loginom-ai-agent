import type { DashboardLinkResult } from "@loginom-ai-agent/product/dashboard-link"
import { isRpcError } from "@opencode/client/promise"
import { usePlugin, type ServerRef } from "@opencode/plugin/gui"
import { AbsolutePath } from "@opencode/schema"
import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { DashboardPreview } from "./contract"
import type definition from "./index"

type Target = Exclude<DashboardLinkResult, { code: string }>
export type DashboardIssue = "dashboardSnapshotGone" | "dashboardConnect" | "dashboardOpenFailed"

export default function Dashboard(props: { link: Target; issue?: DashboardIssue }) {
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
      {(server) => <Preview link={props.link} server={server} issue={props.issue} />}
    </Show>
  )
}

function Preview(props: { link: Target; server: ServerRef; issue?: DashboardIssue }) {
  const ctx = usePlugin<typeof definition>()
  const ipc = ctx.main(DashboardPreview)
  const controller = new AbortController()
  const signal = controller.signal
  const [preview, setPreview] = createSignal<{ kind: "loading" } | { kind: "failed" } | { kind: "ready"; id: string }>({
    kind: "loading",
  })
  const [editing, setEditing] = createSignal(false)
  const [editIssue, setEditIssue] = createSignal<"dashboardSnapshotGone" | "dashboardOpenFailed">()
  const link = props.link
  const location = { directory: AbsolutePath.make(link.directory) }

  onMount(() => {
    void (async () => {
      const deadline = Date.now() + 60_000
      const request = (): ReturnType<ServerRef["client"]["rpc"]["call"]> =>
        props.server.client.rpc
          .call(
            {
              rpcID: "loginom.dashboard",
              method: "preview",
              input: { id: link.id },
              location,
            },
            { signal },
          )
          .catch(async (error: unknown) => {
            if (!isRpcError(error) || error.type !== "rpc.unavailable" || Date.now() >= deadline) throw error
            await new Promise((resolve) => setTimeout(resolve, 100))
            signal.throwIfAborted()
            return request()
          })
      const { output } = await request()
      if (!output || typeof output !== "object" || !("url" in output) || typeof output.url !== "string")
        throw Error("Dashboard preview unavailable")
      const embed = await ipc.open({ url: output.url }, { signal })
      if (signal.aborted) return void ipc.close(embed).catch(() => undefined)
      setPreview({ kind: "ready", id: embed.id })
    })().catch(() => {
      if (!signal.aborted) setPreview({ kind: "failed" })
    })
  })
  onCleanup(() => {
    controller.abort()
    const current = preview()
    if (current.kind === "ready") void ipc.close({ id: current.id }).catch(() => undefined)
  })

  async function edit() {
    setEditIssue(undefined)
    setEditing(true)
    try {
      const { output } = await props.server.client.rpc.call(
        {
          rpcID: "loginom.dashboard",
          method: "find",
          input: { id: link.id },
        },
        { signal },
      )
      if (signal.aborted) return
      if (!output || typeof output !== "object" || !("found" in output) || output.found !== true) {
        setEditIssue("dashboardSnapshotGone")
        return
      }
      ctx.layout.draft({
        server: props.server.id,
        directory: link.directory,
        prompt: ctx.t(link.action === "create" ? "dashboardCreatePrompt" : "dashboardEditPrompt", {
          node: link.nodeName,
        }),
      })
    } catch {
      if (!signal.aborted) setEditIssue("dashboardOpenFailed")
    } finally {
      if (!signal.aborted) setEditing(false)
    }
  }

  const embed = () => {
    const current = preview()
    return current.kind === "ready" ? current.id : undefined
  }
  return (
    <section class="flex min-w-0 min-h-0 flex-1 flex-col gap-3 p-4" aria-label={ctx.t("dashboard")}>
      <header class="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-12-regular text-v2-text-text-weak">{ctx.t("dashboard")}</p>
          <h1 class="text-16-medium [overflow-wrap:anywhere]">{link.nodeName}</h1>
        </div>
        <ctx.ui.Button busy={editing()} onClick={() => void edit()}>
          {ctx.t("dashboardEdit")}
        </ctx.ui.Button>
      </header>
      <Show when={editIssue() ?? props.issue}>
        {(key) => <p role="alert">{ctx.t(key())}</p>}
      </Show>
      <Show when={link.notice}>
        <p role="status">{ctx.t("dashboardPublicationNotice")}</p>
      </Show>
      <ctx.embeds.View id={embed()} visible={!!embed()} class="relative flex min-h-0 flex-1 flex-col" radius={10}>
        <Show when={!embed()}>
          <p role="status" class="p-3">
            {ctx.t(preview().kind === "failed" ? "dashboardPreviewFailed" : "dashboardLoading")}
          </p>
        </Show>
      </ctx.embeds.View>
    </section>
  )
}
