import type { NodeContext } from "../node-context"

type State = { type: "idle" } | { type: "awaiting"; context: NodeContext; sessionKey: string; tabOpened: boolean }

type Event =
  | { type: "requested"; context: NodeContext; mounted?: string; tabs: readonly string[]; serverListed: boolean }
  | { type: "mounted"; sessionKey: string }
  | { type: "tabs.changed"; tabs: readonly string[] }

type Effect = { type: "open" | "attach"; context: NodeContext } | { type: "unavailable" }

type Transition = { state: State; effects: Effect[] }

export const initialNodeDraft: State = { type: "idle" }

export function transitionNodeDraft(state: State, event: Event): Transition {
  if (event.type === "requested") {
    if (!event.serverListed) return { state: initialNodeDraft, effects: [{ type: "unavailable" }] }
    const { context } = event
    const key = `${context.source.serverID}\n${context.source.sessionID}`

    if (event.mounted !== key)
      return {
        state: { type: "awaiting", context, sessionKey: key, tabOpened: event.tabs.includes(key) },
        effects: [{ type: "open", context }],
      }

    const effects: Effect[] = [{ type: "attach", context }]

    if (context.source.messageID) effects.push({ type: "open", context })

    return { state: initialNodeDraft, effects }
  }

  if (state.type === "idle") return { state, effects: [] }

  if (event.type === "mounted")
    return event.sessionKey === state.sessionKey
      ? { state: initialNodeDraft, effects: [{ type: "attach", context: state.context }] }
      : { state, effects: [] }

  // Absence is cancellation only after the target tab has opened.
  const open = event.tabs.includes(state.sessionKey)

  if (open === state.tabOpened) return { state, effects: [] }

  return { state: open ? { ...state, tabOpened: true } : initialNodeDraft, effects: [] }
}
