import type { ModelChoice } from "./dialog-machine"

export type SetupState =
  | { status: "picker" }
  | { status: "form"; id: string }
  | { status: "settling"; id: string; attempt: symbol; selection: ModelChoice }
  | { status: "closing"; id: string; completed: boolean }
  | { status: "disposed" }

export type SetupEvent =
  | { type: "opened"; id: string }
  | { type: "back" }
  | { type: "saved"; selection: ModelChoice; attempt: symbol }
  | { type: "settled"; attempt: symbol; outcome: "loaded" | "timed-out" | "cancelled" }
  | { type: "disposed" }

export function startSetup(id?: string): SetupState {
  return id ? { status: "form", id } : { status: "picker" }
}

export function transitionSetup(state: SetupState, event: SetupEvent): SetupState {
  if (state.status === "disposed") return state

  if (event.type === "disposed") return { status: "disposed" }

  if (state.status === "closing") return state

  if (event.type === "opened" && state.status === "picker") return startSetup(event.id)

  if (event.type === "back" && state.status !== "picker") return startSetup()

  if (event.type === "saved" && state.status === "form")
    return { status: "settling", id: state.id, selection: event.selection, attempt: event.attempt }

  if (event.type === "settled" && state.status === "settling" && state.attempt === event.attempt) {
    if (event.outcome === "cancelled") return startSetup()

    return { status: "closing", id: state.id, completed: event.outcome === "loaded" }
  }

  return state
}

export function setupView(state: SetupState) {
  return {
    id: "id" in state ? state.id : undefined,
    selection: state.status === "settling" ? state.selection : undefined,
    completed: state.status === "closing" && state.completed,
  }
}
