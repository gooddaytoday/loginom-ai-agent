import { CodeBlock, Slot, Style, type MountedSession, type Plugin } from "@opencode/plugin/gui"
import { Page, ToolRenderer, builtinContext } from "@opencode/plugin/gui/builtin"
import { Button } from "@opencode/ui/button"
import { createMemo, createSignal, lazy, onCleanup, Show, Suspense, untrack } from "solid-js"
import { decodePackageChanges, packageChangesTool, type ChangesWithSchema } from "./package-changes-data"
import { PackageSchema, readFinding, type Finding } from "./schema-contract"
import { transition, type Event, type Request, type State } from "./schema-machine"
import type definition from "./index"
import styles from "./schema.css?inline"

const pageID = "package-schema"

const SchemaPage = lazy(() => import("./schema-page"))

const Card = lazy(async () => {
  const { PackageChangesCard } = await import("./package-changes")

  return { default: PackageChangesCard }
})

export const registerSchema: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(Style, styles)
  const router = builtinContext(ctx).router
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

  const openChanges = (session: MountedSession, changes: ChangesWithSchema) => {
    controller?.abort()
    dispatch({
      type: "open-changes",
      request: { sessionID: session.id, serverID: session.server.id, directory: session.directory },
      changes,
    })
    router.openPage(pageID)
  }

  const open = (session: MountedSession, finding?: Finding) => {
    load({ sessionID: session.id, serverID: session.server.id, directory: session.directory, finding })
    router.openPage(pageID)
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
        <Suspense fallback={<p role="status">{ctx.t("schema.loading")}</p>}>
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

  ctx.add(ToolRenderer, {
    tool: packageChangesTool,
    separate: true,
    get title() {
      return ctx.t("changes.title")
    },
    render(props) {
      const changes = createMemo(() =>
        props.status === "completed" ? decodePackageChanges(props.metadata) : undefined,
      )

      const target = createMemo(() => {
        const session = ctx.sessions.current()

        if (session && session.id === changes()?.sessionID && !session.pending) {
          return { sessionID: session.id, serverID: session.server.id, directory: session.directory }
        }
      })

      return (
        <Show when={target()} keyed>
          {(request) => (
            <Show when={changes()?.edits.length || changes()?.schemas ? changes() : undefined} keyed>
              {(value) => (
                <Suspense>
                  <Card changes={value} target={request} openSchema={openChanges} />
                </Suspense>
              )}
            </Show>
          )}
        </Show>
      )
    },
  })
}
