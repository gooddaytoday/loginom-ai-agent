export type RemovalState = { status: "idle" } | { status: "removing"; attempt: symbol } | { status: "disposed" }

export type RemovalEvent = { type: "requested" | "settled"; attempt: symbol } | { type: "disposed" }

export function transitionRemoval(state: RemovalState, event: RemovalEvent): RemovalState {
  if (state.status === "disposed") return state

  if (event.type === "disposed") return { status: "disposed" }

  if (event.type === "requested" && state.status === "idle") return { status: "removing", attempt: event.attempt }

  if (event.type === "settled" && state.status === "removing" && state.attempt === event.attempt)
    return { status: "idle" }

  return state
}

export const canRemove = (state: RemovalState) => state.status === "idle"
