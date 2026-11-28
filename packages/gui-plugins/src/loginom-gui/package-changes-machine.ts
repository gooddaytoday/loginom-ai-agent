export type Outcome =
  | { kind: "draft" }
  | { kind: "saved"; path: string; name: string }
  | { kind: "replaced"; path: string; backupPath: string }
  | { kind: "restored"; path: string }
  | { kind: "discarded" }

export type Action = "save" | "undo" | "replace" | "restore" | "discard"

type Failure = "busy" | "exists" | "forbidden" | "noCopy" | "stale" | "unconfirmed"

export type State =
  | { kind: "ready"; outcome: Outcome; failure?: Failure }
  | { kind: "working"; outcome: Outcome; action: Action }

type Event =
  | { kind: "start"; action: Action }
  | { kind: "cancel" }
  | { kind: "failure"; failure: Failure }
  | { kind: "success"; outcome: Outcome }

export const initial = (): State => ({ kind: "ready", outcome: { kind: "draft" } })

export function transition(state: State, event: Event): State {
  if (event.kind === "start") {
    if (state.kind !== "ready" || state.failure === "stale" || state.failure === "unconfirmed") return state
    const outcome = state.outcome.kind

    const allowed =
      (outcome === "draft" && ["save", "replace", "discard"].includes(event.action)) ||
      (outcome === "saved" && ["undo", "replace"].includes(event.action)) ||
      (outcome === "replaced" && event.action === "restore")

    return allowed ? { kind: "working", outcome: state.outcome, action: event.action } : state
  }

  if (state.kind === "ready") return state

  if (event.kind === "success") return { kind: "ready", outcome: event.outcome }

  if (event.kind === "failure") return { kind: "ready", outcome: state.outcome, failure: event.failure }

  return { kind: "ready", outcome: state.outcome }
}
