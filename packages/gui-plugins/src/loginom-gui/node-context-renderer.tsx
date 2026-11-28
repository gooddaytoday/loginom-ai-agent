import { createKeyed, type Plugin } from "@opencode/plugin/gui"
import { builtinContext, ComposerNoteHandler, type BuiltinComposerNote } from "@opencode/plugin/gui/builtin"
import { Icon } from "@opencode/ui/icon"
import { Option, Schema } from "effect"
import { uuid } from "@opencode/util/uuid"
import { createSignal, Show, untrack } from "solid-js"
import { LoginomNodeDraft } from "./contract"
import type definition from "./index"
import { encodeNodeContext, nodeSubject, readNodeContext, type NodeContext } from "./node-context"
import { initialNodeDraft, transitionNodeDraft } from "./node-context/machine"

const readBinding = Schema.decodeUnknownOption(
  Schema.Struct({
    open: Schema.NullOr(Schema.Boolean),
    path: Schema.NullOr(Schema.NonEmptyString),
    staleForSeconds: Schema.NullOr(Schema.Finite),
  }),
)

export const registerNodeContext: Plugin.Setup<typeof definition> = (ctx) => {
  const builtin = builtinContext(ctx)
  const [state, setState] = createSignal(initialNodeDraft)

  function attach(context: NodeContext) {
    const screen = ctx.screen.current()

    if (!screen) return

    const note: BuiltinComposerNote = {
      type: "note",
      origin: ctx.id,
      commentID: ctx.id,
      label: context.node.name,
      subtitle: context.node.package,
      icon: "branch",
      subject: nodeSubject(context),
      data: encodeNodeContext(context),
      comment: "",
    }

    screen.composer.detach(note.commentID)
    builtin.screen.attachNote(note)
    screen.composer.focus()
  }

  function dispatch(event: Parameters<typeof transitionNodeDraft>[1]) {
    const next = transitionNodeDraft(untrack(state), event)

    setState(next.state)
    next.effects.forEach((effect) => {
      if (effect.type === "attach") return attach(effect.context)

      if (effect.type === "unavailable")
        return void ctx.toast.show({ variant: "error", title: ctx.t("node.sourceUnavailable") })
      const source = effect.context.source

      const attempt = effect.attempt

      builtin.tabs.open(
        { server: source.serverID, id: source.sessionID },
        {
          focus: true,
          messageID: source.messageID,
          onUnavailable: attempt === undefined ? undefined : () => dispatch({ type: "open.failed", attempt }),
        },
      )
    })
  }

  const openTabs = () => ctx.sessions.list().map((session) => session.key)

  // Drive draft writes from the mounted screen and cancel if its target tab closes while waiting.
  createKeyed(
    () => ctx.sessions.current(),
    (session) => dispatch({ type: "mounted", sessionKey: session.key }),
    { equals: (previous, next) => previous.visit === next.visit },
  )
  createKeyed(openTabs, (tabs) => dispatch({ type: "tabs.changed", tabs }))

  ctx.provide(LoginomNodeDraft, {
    attach(context) {
      dispatch({
        type: "requested",
        attempt: uuid(),
        context,
        mounted: ctx.sessions.current()?.key,
        tabs: openTabs(),
        serverListed: ctx.servers.list().includes(context.source.serverID),
      })
    },
  })

  ctx.add(ComposerNoteHandler, {
    render(input) {
      const context = () => readNodeContext(input.data)

      return (
        <Show when={context()} fallback={<button onClick={input.remove}>{ctx.t("node.remove")}</button>}>
          {(value) => (
            <div
              class="flex shrink-0 items-center gap-2 rounded-full border border-v2-border-border-base px-2 py-1"
              role="group"
              aria-label={`${value().node.name} · ${value().node.package}`}
              title={`${value().node.name} · ${value().node.path}`}
            >
              <Icon name="branch" size="small" />
              <span class="max-w-[min(38vw,16rem)] truncate text-12-medium">{value().node.name}</span>
              <span class="max-w-[min(28vw,12rem)] truncate text-12-regular text-v2-text-text-muted">
                {value().node.package}
              </span>
              <button
                type="button"
                class="flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-v2-action-control-neutral-action-hover"
                aria-label={ctx.t("node.remove")}
                onClick={input.remove}
              >
                <Icon name="outline-xmark" size="small" />
              </button>
            </div>
          )}
        </Show>
      )
    },
    async check(data, session, signal) {
      const context = readNodeContext(data)

      if (!context || context.source.sessionID !== session?.id || context.source.serverID !== session.server.id)
        return ctx.t("node.differentConversation")

      // Package state is scoped to the conversation and its Location on the receiving server.
      const response = await session.server.client.rpc
        .call(
          {
            rpcID: "loginom.package-state",
            method: "snapshot",
            input: { sessionID: session.id },
            location: { directory: session.directory },
          },
          { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
        )
        .catch(() => undefined)

      const binding = Option.getOrUndefined(readBinding(response?.output))

      if (!binding) return ctx.t("node.missingPackage")

      if (binding.staleForSeconds !== null) return ctx.t("node.stalePackage")

      if (binding.open !== true || !binding.path) return ctx.t("node.missingPackage")

      if (binding.path !== context.node.path) return ctx.t("node.differentPackage")
    },
  })
}
