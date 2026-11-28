import type { Issue } from "@loginom-ai-agent/loginom-host/model-server-rpc"
import { Match } from "effect"

type Input = { address: string; key: string }

type Catalog = { models: readonly string[]; selected: string }

type Failure = { issue?: typeof Issue.Type }

export type State =
  | ({ status: "editing" } & Input & Failure)
  | ({ status: "discovering"; attempt: symbol } & Input)
  | ({ status: "ready" } & Input & Catalog & Failure)
  | ({ status: "saving"; attempt: symbol } & Input & Catalog)
  | { status: "disposed" }

export type Event =
  | { type: "edited"; field: keyof Input; value: string }
  | { type: "selected"; model: string }
  | { type: "requested"; action: "discover" | "save"; attempt: symbol }
  | ({ type: "discovered"; attempt: symbol } & Catalog)
  | { type: "stored"; attempt: symbol }
  | { type: "settled"; attempt: symbol; issue?: typeof Issue.Type }
  | { type: "disposed" }

export const initial: State = { status: "editing", address: "", key: "" }

export function transition(state: State, event: Event): State {
  if (state.status === "disposed") return state

  if (event.type === "disposed") return { status: "disposed" }
  const { address, key } = state

  if (state.status === "editing" || state.status === "ready") {
    if (event.type === "edited") return { status: "editing", address, key, [event.field]: event.value }

    if (event.type === "selected" && state.status === "ready" && state.models.includes(event.model))
      return { ...state, selected: event.model }

    if (event.type !== "requested" || !address.trim()) return state

    if (event.action === "discover") return { status: "discovering", address, key, attempt: event.attempt }

    if (state.status === "ready")
      return { status: "saving", address, key, models: state.models, selected: state.selected, attempt: event.attempt }

    return state
  }

  if (!("attempt" in event) || state.attempt !== event.attempt) return state

  if (state.status === "discovering" && event.type === "discovered")
    return { status: "ready", address, key, models: event.models, selected: event.selected }

  if (state.status === "saving" && event.type === "stored") return { ...state, key: "" }

  if (event.type !== "settled") return state

  if (state.status === "saving")
    return { status: "ready", address, key, models: state.models, selected: state.selected, issue: event.issue }

  return { status: "editing", address, key, issue: event.issue }
}

export function view(state: State) {
  return {
    address: state.status === "disposed" ? "" : state.address,
    key: state.status === "disposed" ? "" : state.key,
    models: "models" in state ? state.models : [],
    selected: "selected" in state ? state.selected : "",
    busy: Match.value(state.status).pipe(
      Match.when("discovering", () => "discover" as const),
      Match.when("saving", () => "save" as const),
      Match.orElse(() => undefined),
    ),
    issue: "issue" in state ? state.issue : undefined,
  }
}
