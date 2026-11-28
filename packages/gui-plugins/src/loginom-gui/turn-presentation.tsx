import type { SessionMessageAssistantTool } from "@opencode/client/promise"
import { Effect, Option, Schema, Semaphore } from "effect"
import { createLatest, type Plugin } from "@opencode/plugin/gui"
import { TurnPresentation, type TurnPresentationFooterProps } from "@opencode/plugin/gui/builtin"
import { Show } from "solid-js"
import { isExportRequest } from "./export-receipt"
import type definition from "./index"
import { decodeFacts, loginomStepPhrase } from "./step-phrase"

const decodeFiles = Schema.decodeUnknownOption(
  Schema.Struct({ files: Schema.Array(Schema.Struct({ name: Schema.NonEmptyString })) }),
)

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const requests = Semaphore.makeUnsafe(1)

  function ExportFooter(props: TurnPresentationFooterProps) {
    const exports = createLatest(
      () => {
        const client = ctx.servers.get(props.serverID)?.client

        if (!client || !props.sessionID) return

        return {
          client,
          serverID: props.serverID,
          sessionID: props.sessionID,
          messageID: props.messageID,
          directory: props.directory,
        }
      },
      ({ client, serverID, sessionID, messageID, directory }, signal) =>
        Effect.runPromise(
          requests.withPermit(
            Effect.tryPromise(async (requestSignal) => {
              const { output } = await client.rpc.call(
                {
                  rpcID: "loginom.exports",
                  method: "turn",
                  location: { directory },
                  input: { sessionID, messageID },
                },
                { signal: requestSignal },
              )

              return {
                serverID,
                sessionID,
                messageID,
                directory,
                files: Option.getOrUndefined(decodeFiles(output))?.files,
              }
            }),
          ),
          { signal },
        ),
    )

    const text = () => {
      const result = exports.latest

      if (
        !result?.files ||
        result.serverID !== props.serverID ||
        result.sessionID !== props.sessionID ||
        result.messageID !== props.messageID ||
        result.directory !== props.directory
      )
        return

      if (result.files.length) {
        const names = result.files.map((file) => file.name)

        return ctx.t("export.turnFiles", { names: new Intl.ListFormat(ctx.locale.locale()).format(names) })
      }

      if (
        props.messages.some((message) => message.content.some((part) => part.type === "tool" && isExportRequest(part)))
      )
        return ctx.t("export.noFiles")
    }

    return <Show when={text()}>{(label) => <p class="wrap-break-word">{label()}</p>}</Show>
  }

  ctx.add(TurnPresentation, {
    describe(input) {
      const calls = input.messages.flatMap((message) =>
        message.content.filter(
          (part): part is SessionMessageAssistantTool => part.type === "tool" && part.name.startsWith("loginom_"),
        ),
      )

      if (input.phase === "working") {
        if (!calls.length) return

        const todos = input.todos.flatMap(({ content, status }) =>
          status === "cancelled" ? [] : [{ content, status }],
        )

        if (!todos.length) return

        const current = todos.findIndex((todo) => todo.status === "in_progress")
        const focus = current >= 0 ? current : todos.findIndex((todo) => todo.status === "pending")
        const start = Math.max(0, Math.min(focus - 1, todos.length - 3))

        return {
          kind: "plan",
          label: ctx.t("turn.plan"),
          items: todos.slice(start, start + 3).map((todo) => ({
            text: todo.content,
            status: todo.status,
            statusLabel: ctx.t(`turn.plan.${todo.status}`),
          })),
        }
      }

      const locale = ctx.locale.locale()

      const actions = [
        ...new Set(
          calls.flatMap((call) => {
            if (call.state.status !== "completed" || call.state.metadata?.loginomPending === true) return []

            const decoded = decodeFacts(call.state.metadata?.loginom)
            const facts = Option.getOrUndefined(decoded)

            if (facts && (facts.state !== "settled" || (facts.status && facts.status !== "SUCCEEDED"))) return []

            return [loginomStepPhrase(ctx, decoded, { lowercase: true })]
          }),
        ),
      ]

      if (!actions.length) return { kind: "summary", footer: ExportFooter }

      const seconds = Math.round(input.durationMs / 1000)
      const number = new Intl.NumberFormat(locale)

      const duration =
        seconds < 60
          ? ctx.t("turn.duration.seconds", { seconds: number.format(seconds) })
          : ctx.t("turn.duration.minutesSeconds", {
              minutes: number.format(Math.floor(seconds / 60)),
              seconds: number.format(seconds % 60),
            })

      const displayed = actions.slice(0, 4)

      if (actions.length > displayed.length) displayed.push("…")

      return {
        kind: "summary",
        label: ctx.t("turn.worked", { duration, actions: displayed.join(", ") }),
        footer: ExportFooter,
      }
    },
  })
}

export default setup
