import { createKeyed, type Plugin, type ComposerNote } from "@opencode/plugin/gui"
import { ComposerNoteHandler } from "@opencode/plugin/gui/builtin"
import { Icon } from "@opencode/ui/icon"
import { Option, Schema } from "effect"
import { createSignal, Show, untrack } from "solid-js"
import type nodeContext from "./node-context-entry"
import { LoginomNodeDraft, encodeNodeContext, nodeSubject, readNodeContext, type NodeContext } from "./node-context"

import { initialNodeDraft, transitionNodeDraft } from "./node-context/machine"

const readBinding = Schema.decodeUnknownOption(
  Schema.Struct({
    open: Schema.NullOr(Schema.Boolean),
    path: Schema.NullOr(Schema.NonEmptyString),
    staleForSeconds: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
  }),
)

const setup: Plugin.Setup<typeof nodeContext> = (ctx) => {
  const [state, setState] = createSignal(initialNodeDraft)

  function attach(context: NodeContext) {
    const screen = ctx.screen.current()

    if (!screen) return

    const note: ComposerNote = {
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
    screen.composer.attach(note)
    screen.composer.focus()
  }

  function dispatch(event: Parameters<typeof transitionNodeDraft>[1]) {
    const next = transitionNodeDraft(untrack(state), event)

    setState(next.state)
    next.effects.forEach((effect) => {
      if (effect.type === "attach") return attach(effect.context)
      const source = effect.context.source

      ctx.tabs.open({ server: source.serverID, id: source.sessionID }, { focus: true, messageID: source.messageID })
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
      dispatch({ type: "requested", context, mounted: ctx.sessions.current()?.key, tabs: openTabs() })
    },
  })

  ctx.add(ComposerNoteHandler, {
    render(input) {
      const context = () => readNodeContext(input.data)

      return (
        <Show when={context()} fallback={<button onClick={input.remove}>{ctx.t("remove")}</button>}>
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
                aria-label={ctx.t("remove")}
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
        return ctx.t("differentConversation")

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

      if (binding?.staleForSeconds != null) return ctx.t("stalePackage")

      if (binding?.open !== true || !binding.path) return ctx.t("missingPackage")

      if (binding.path !== context.node.path) return ctx.t("differentPackage")
    },
  })
}

export default setup
