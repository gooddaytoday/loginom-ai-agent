import { createKeyed, type Plugin, type ComposerNote } from "@opencode/plugin/gui"
import { ComposerNoteHandler } from "@opencode/plugin/gui/builtin"
import { Icon } from "@opencode/ui/icon"
import { Option, Schema } from "effect"
import { Show } from "solid-js"
import type nodeContext from "./node-context-entry"
import { LoginomNodeDraft, encodeNodeContext, nodeSubject, readNodeContext, type NodeContext } from "./node-context"

const readBinding = Schema.decodeUnknownOption(Schema.Struct({ path: Schema.NullOr(Schema.NonEmptyString) }))

const setup: Plugin.Setup<typeof nodeContext> = (ctx) => {
  let pending: NodeContext | undefined

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

  createKeyed(
    () => ctx.sessions.current(),
    (session) => {
      if (!pending) return
      const context = pending
      pending = undefined

      if (session.id === context.source.sessionID && session.server.id === context.source.serverID) attach(context)
    },
    { equals: (previous, next) => previous.visit === next.visit },
  )

  ctx.provide(LoginomNodeDraft, {
    attach(context) {
      const session = ctx.sessions.current()
      const source = context.source
      const here = session?.id === source.sessionID && session.server.id === source.serverID
      pending = here ? undefined : context

      if (!here || source.messageID)
        ctx.tabs.open({ server: source.serverID, id: source.sessionID }, { focus: true, messageID: source.messageID })

      if (here) attach(context)
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

      if (!binding?.path) return ctx.t("missingPackage")

      if (binding.path !== context.node.path) return ctx.t("differentPackage")
    },
  })
}

export default setup
