import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

export const preflight = Rpc.define({
  id: "loginom.preflight",
  methods: {
    check: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ automation: Schema.Boolean })),
      output: Schema.toStandardSchemaV1(Schema.Struct({ code: Schema.optionalKey(Schema.String) })),
    },
  },
  events: {},
})

type State = { type: "idle" | "checking" | "ready" | "failed" } | { type: "blocked"; code: string }

type Event = { type: "check" | "failed" } | { type: "returned"; code?: string }

export function transition(state: State, event: Event): State {
  if (event.type === "check") return state.type === "checking" ? state : { type: "checking" }

  if (state.type !== "checking") return state

  if (event.type === "returned") return event.code ? { type: "blocked", code: event.code } : { type: "ready" }

  return { type: "failed" }
}
