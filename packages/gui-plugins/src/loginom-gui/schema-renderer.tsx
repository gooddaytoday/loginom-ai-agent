import { CodeBlock, Slot, Style, type MountedSession, type Plugin } from "@opencode/plugin/gui"
import { Page, builtinContext } from "@opencode/plugin/gui/builtin"
import { Button } from "@opencode/ui/button"
import { createResource, createSignal, lazy, onCleanup, Show, Suspense, untrack } from "solid-js"
import { PackageSchema, readFinding } from "./contract"
import { copyText, isInvalidSession, readPackageCopy, samePackage } from "./copy"
import { transition, type Event, type Request, type State } from "./schema-machine"
import type definition from "./index"
import styles from "./schema.css?inline"
import registerSteps from "./step"

const pageID = "package-schema"

const SchemaPage = lazy(() => import("./schema-page"))

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(Style, styles)
  const [state, setState] = createSignal<State>({ status: "closed" })
  const dispatch = (event: Event) => setState((current) => transition(current, event))
  let controller: AbortController | undefined

  const close = () => {
    controller?.abort()
    dispatch({ type: "close" })
  }

  onCleanup(close)

  const load = (request: Request) => {
    controller?.abort()
    controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(request.node ? 24_000 : 15_000)])
    dispatch({ type: "open", request })
    void Promise.try(() => {
      const server = ctx.servers.get(request.serverID)

      if (!server) throw new Error("Server unavailable")

      const input = request.finding
        ? { sessionID: request.sessionID, source: "saved" as const }
        : request.node
          ? { sessionID: request.sessionID, target: { document_id: request.node.document_id, workflow_id: request.node.workflow_id } }
          : { sessionID: request.sessionID }

      return server.client.rpc(PackageSchema).schema(input, { location: { directory: request.directory }, signal })
    }).then(
      ({ snapshot, reason }) => dispatch({ type: "loaded", request, snapshot, reason }),
      (error) => {
        if (isInvalidSession(error)) dispatch({ type: "loaded", request, snapshot: null, reason: "workspaceUnavailable" })
        else dispatch({ type: "failed", request })
      },
    )
  }

  const open = (session: MountedSession, target?: Pick<Request, "finding" | "node">) => {
    const location = { sessionID: session.id, serverID: session.server.id, directory: session.directory }

    const request = target?.finding
      ? { ...location, finding: target.finding }
      : target?.node
        ? { ...location, node: target.node }
        : location

    load(request)
    builtinContext(ctx).layout.openPage(pageID)
  }

  registerSteps(ctx, (session, node) => open(session, { node }))

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

      const [copy] = createResource(
        () => {
          const current = state()

          if (current.status === "ready" && (current.snapshot.source === "window" || current.snapshot.target))
            return current.request

          if (current.status === "empty" && !current.request.finding) return current.request
        },
        (request) => readPackageCopy(ctx, request),
      )

      const verifiedCopy = () => {
        const current = state()

        if (copy.loading || copy.state === "unresolved") return
        const path = copy()

        if (current.status === "empty" && !current.request.finding) return path ?? null

        if (current.status === "ready") {
          const workflow = current.snapshot.source === "window" ? current.snapshot.workflow : current.snapshot.target

          if (!workflow) return

          if (path === "workspaceUnavailable") return path

          return path && samePackage(path, workflow) ? path : null
        }
      }

      return (
        <Suspense fallback={<p role="status">{ctx.t("schemaLoading")}</p>}>
          <SchemaPage
            state={state}
            t={ctx.t}
            dispatch={dispatch}
            retry={() => {
              const current = untrack(state)

              if (current.status !== "closed") load({ ...current.request })
            }}
            back={back}
            packageCopy={verifiedCopy}
            copyText={(text) => void copyText(ctx, text)}
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

              if (session) open(session, { finding })
            }}
          >
            {ctx.t("showOnSchema")}
          </Button>
        </div>
      )
    },
  })
}

export default setup
