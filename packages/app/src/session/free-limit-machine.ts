type ReleaseReason = "expired" | "deleted" | "retry"

export type UnresolvedLimitState = { type: "checking"; missing: number } | { type: "released"; reason: ReleaseReason }

type Event =
  | { type: "clock"; now: number; resetAt: number | undefined }
  | { type: "lookup"; conversationMissing: boolean }
  | { type: "retry"; resetAt: number | undefined }

const MISSING_CONFIRMATIONS = 3

export const unresolvedLimitInitial: UnresolvedLimitState = { type: "checking", missing: 0 }

export function transitionUnresolvedLimit(state: UnresolvedLimitState, event: Event): UnresolvedLimitState {
  if (state.type === "released") return state

  if (event.type === "clock")
    return event.resetAt !== undefined && event.now >= event.resetAt ? { type: "released", reason: "expired" } : state

  if (event.type === "retry") return event.resetAt === undefined ? { type: "released", reason: "retry" } : state

  const missing = event.conversationMissing ? state.missing + 1 : 0

  return missing >= MISSING_CONFIRMATIONS ? { type: "released", reason: "deleted" } : { type: "checking", missing }
}
