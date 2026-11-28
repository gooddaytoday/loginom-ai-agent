import { CodeBlock, createLatest, Slot, Style, type Context, type MountedSession } from "@opencode/plugin/gui"
import { Page, builtinContext } from "@opencode/plugin/gui/builtin"
import { Button } from "@opencode/ui/button"
import { createSignal, lazy, onCleanup, Show, Suspense, untrack } from "solid-js"
import { PackageSchema, readFinding, type Finding } from "./contract"
import { locateNode, transition, type Event, type Request, type State } from "./machine"
import styles from "./schema.css?inline"

const pageID = "package-schema"

const SchemaPage = lazy(() => import("./page"))

export function setupSchemaView(ctx: Context) {
  ctx.add(Style, styles)
  const [state, setState] = createSignal<State>({ status: "closed" })
  const dispatch = (event: Event) => setState((current) => transition(current, event))
  let controller: AbortController | undefined

  const close = () => {
    controller?.abort()
    dispatch({ type: "close" })
  }

  onCleanup(close)

  const requestFor = (session: MountedSession) => ({
    sessionID: session.id,
    serverID: session.server.id,
    directory: session.directory,
  })

  const read = (request: Request, signal: AbortSignal) => {
    const server = ctx.servers.get(request.serverID)

    if (!server) throw new Error("Server unavailable")

    const input = request.finding
      ? { sessionID: request.sessionID, source: "saved" as const }
      : { sessionID: request.sessionID }

    return server.client.rpc(PackageSchema).schema(input, {
      location: { directory: request.directory },
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    })
  }

  const load = (request: Request) => {
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    dispatch({ type: "open", request })
    void Promise.try(() => read(request, signal)).then(
      ({ snapshot }) => dispatch({ type: "loaded", request, snapshot }),
      () => dispatch({ type: "failed", request }),
    )
  }

  const open = (session: MountedSession, finding?: Finding) => {
    load({ ...requestFor(session), finding })
    builtinContext(ctx).layout.openPage(pageID)
  }

  const [previewRequest, setPreviewRequest] = createSignal<{
    session: MountedSession
    operationId: string
    revision: number
  }>()

  const previewed = new WeakMap<MountedSession, Set<string>>()

  const preview = createLatest(
    () => {
      const request = previewRequest()

      if (request?.session === ctx.sessions.current()) return request
    },
    async (request, signal) => {
      const result = await read(requestFor(request.session), signal)

      if (result.snapshot && !signal.aborted) {
        const operations = previewed.get(request.session) ?? new Set<string>()
        operations.add(request.operationId)
        previewed.set(request.session, operations)
      }

      return { revision: request.revision, ...result }
    },
  )

  const inspect = (session: MountedSession, operationId: string) => {
    if (previewed.get(session)?.has(operationId)) return

    const current = previewRequest()

    if (preview.loading && current?.session === session && current.operationId === operationId) return

    setPreviewRequest((previous) => ({ session, operationId, revision: (previous?.revision ?? 0) + 1 }))
  }

  const nodeAction = (guid: string) => {
    const scope = previewRequest()
    const current = preview.latest

    if (!scope || scope.session !== ctx.sessions.current() || scope.revision !== current?.revision) return

    if (!current.snapshot || !locateNode(current.snapshot, guid)) return

    return () => {
      if (scope.session !== ctx.sessions.current()) return

      const request = requestFor(scope.session)
      controller?.abort()
      dispatch({ type: "open", request })
      dispatch({ type: "loaded", request, snapshot: current.snapshot, nodeGuid: guid })
      builtinContext(ctx).layout.openPage(pageID)
    }
  }

  const back = () => {
    const current = untrack(state)

    if (current.status === "closed") return
    ctx.tabs.open({ server: current.request.serverID, id: current.request.sessionID }, { focus: true })
  }

  ctx.add(Page, {
    id: pageID,
    get title() {
      return ctx.t("schema")
    },
    render() {
      onCleanup(close)

      return (
        <Suspense fallback={<p role="status">{ctx.t("loading")}</p>}>
          <SchemaPage
            state={state}
            t={ctx.t}
            dispatch={dispatch}
            retry={() => {
              const current = untrack(state)

              if (current.status !== "closed") load({ ...current.request })
            }}
            back={back}
          />
        </Suspense>
      )
    },
  })

  ctx.add(Slot, {
    at: "session.header",
    render: (input) => (
      <Button
        type="button"
        size="small"
        variant="ghost"
        aria-label={ctx.t("schema")}
        title={ctx.t("schema")}
        disabled={!input.active}
        onClick={() => open(input.session)}
      >
        {input.compact ? "↗" : ctx.t("schema")}
      </Button>
    ),
  })

  ctx.add(Slot, {
    at: "session.location.menu",
    render: (input) => (
      <Show when={ctx.layout.narrow()}>
        <ctx.ui.MenuItem label={ctx.t("schema")} icon="branch" onSelect={() => open(input.session)} />
      </Show>
    ),
  })

  ctx.add(CodeBlock, {
    languages: ["loginom-finding"],
    render(block) {
      const finding = readFinding(block.code)

      if (!finding || !block.session) return

      return (
        <div class="flex flex-col items-start gap-2 p-3">
          <p>{finding.text}</p>
          <Button
            type="button"
            size="small"
            variant="neutral"
            onClick={() => {
              const session = block.session

              if (session) open(session, finding)
            }}
          >
            {ctx.t("showOnSchema")}
          </Button>
        </div>
      )
    },
  })

  return { inspect, nodeAction }
}

export type SchemaNavigation = ReturnType<typeof setupSchemaView>
