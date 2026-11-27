import { CodeBlock, Slot, Style, type MountedSession, type Plugin } from "@opencode/plugin/gui"
import { Page, builtinContext } from "@opencode/plugin/gui/builtin"
import { Button } from "@opencode/ui/button"
import { createSignal, lazy, onCleanup, Show, Suspense, untrack } from "solid-js"
import { PackageSchema, readFinding, type Finding } from "./contract"
import { transition, type Event, type Request, type State } from "./machine"
import type definition from "./index"
import styles from "./schema.css?inline"

const pageID = "package-schema"

const SchemaPage = lazy(() => import("./page"))

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
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])
    dispatch({ type: "open", request })
    void Promise.try(() => {
      const server = ctx.servers.get(request.serverID)

      if (!server) throw new Error("Server unavailable")

      const input = request.finding
        ? { sessionID: request.sessionID, source: "saved" as const }
        : { sessionID: request.sessionID }

      return server.client.rpc(PackageSchema).schema(input, { location: { directory: request.directory }, signal })
    }).then(
      ({ snapshot }) => dispatch({ type: "loaded", request, snapshot }),
      () => dispatch({ type: "failed", request }),
    )
  }

  const open = (session: MountedSession, finding?: Finding) => {
    load({ sessionID: session.id, serverID: session.server.id, directory: session.directory, finding })
    builtinContext(ctx).layout.openPage(pageID)
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
}

export default setup
