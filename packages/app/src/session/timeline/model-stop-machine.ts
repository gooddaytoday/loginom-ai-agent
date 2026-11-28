export const MODEL_STOP_ACTION_TIMEOUT_MS = 30_000

export type ModelStopActionState =
  | { status: "idle"; attempt: number }
  | { status: "running"; attempt: number }
  | { status: "failed"; attempt: number }
  | { status: "disposed" }

type ModelStopActionEvent =
  | { type: "started" }
  | { type: "disposed" }
  | { type: "succeeded" | "failed"; attempt: number }

export const initialModelStopAction: ModelStopActionState = { status: "idle", attempt: 0 }

export function transitionModelStopAction(
  state: ModelStopActionState,
  event: ModelStopActionEvent,
): ModelStopActionState {
  if (state.status === "disposed") return state
  if (event.type === "disposed") return { status: "disposed" }
  if (event.type === "started") {
    if (state.status === "running") return state
    return { status: "running", attempt: state.attempt + 1 }
  }
  if (state.status !== "running" || state.attempt !== event.attempt) return state
  return { status: event.type === "succeeded" ? "idle" : "failed", attempt: state.attempt }
}

export function modelStopActionView(state: ModelStopActionState) {
  return { busy: state.status === "running", failed: state.status === "failed" }
}
