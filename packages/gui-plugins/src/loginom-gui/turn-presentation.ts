import type { SessionMessageAssistantTool } from "@opencode/client/promise"
import { Option } from "effect"
import type { Plugin } from "@opencode/plugin/gui"
import { TurnPresentation } from "@opencode/plugin/gui/builtin"
import type definition from "./index"
import { decodeFacts, loginomStepPhrase } from "./step-phrase"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(TurnPresentation, {
    describe(input) {
      if (input.phase === "working") {
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

      const calls = input.messages.flatMap((message) =>
        message.content.filter(
          (part): part is SessionMessageAssistantTool => part.type === "tool" && part.name.startsWith("loginom_"),
        ),
      )

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

      if (!actions.length) return

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
      }
    },
  })
}

export default setup
