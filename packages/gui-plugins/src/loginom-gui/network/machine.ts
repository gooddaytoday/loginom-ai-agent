import type { SaveResult, Status } from "@loginom-ai-agent/loginom-host/network-settings-rpc"

type Issue = Exclude<SaveResult, "saved"> | "unconfirmed"

type Form = { status: Status; draft: string }

export type State = { attempt: number } & (
  | { type: "loading" | "unavailable" | "disposed" }
  | ({ type: "ready"; issue?: Issue } & Form)
  | ({ type: "saving" | "reconciling"; port: number } & Form)
)

type Event =
  | { type: "target"; available: boolean }
  | { type: "dispose" }
  | { type: "loaded"; attempt: number; status?: Status }
  | { type: "edit"; draft: string }
  | { type: "save" }
  | { type: "saved"; attempt: number; result?: SaveResult }

export type Command =
  | { type: "status"; attempt: number }
  | { type: "save"; attempt: number; port: number }
  | { type: "cancel" }

export const initial: State = { type: "loading", attempt: 0 }

type Transition = { state: State; command?: Command }

export function transition(state: State, event: Event): Transition {
  if (state.type === "disposed") return { state }
  const { attempt } = state

  switch (event.type) {
    case "dispose":
      return { state: { type: "disposed", attempt }, command: { type: "cancel" } }
    case "target":
      return event.available
        ? { state: { type: "loading", attempt: attempt + 1 }, command: { type: "status", attempt: attempt + 1 } }
        : { state: { type: "unavailable", attempt: attempt + 1 }, command: { type: "cancel" } }
    case "loaded": {
      if (event.attempt !== attempt) return { state }
      const { status } = event

      if (state.type === "reconciling") {
        if (status?.port?.saved === state.port) {
          return { state: { type: "ready", attempt, status, draft: String(state.port) } }
        }

        return {
          state: { type: "ready", attempt, status: status ?? state.status, draft: state.draft, issue: "unconfirmed" },
        }
      }

      if (state.type !== "loading") return { state }

      return event.status
        ? { state: { type: "ready", attempt, status: event.status, draft: String(event.status.port?.saved ?? "") } }
        : { state: { type: "unavailable", attempt } }
    }

    case "edit":
      return state.type === "ready" ? { state: { ...state, draft: event.draft, issue: undefined } } : { state }
    case "save": {
      if (state.type !== "ready" || !state.status.port?.editable) return { state }
      const port = Number(state.draft)

      if (!/^\d+$/.test(state.draft) || port < 1 || port > state.status.port.maximum)
        return { state: { ...state, issue: "invalid" } }

      if (port === state.status.port.saved) return { state }

      return {
        state: { type: "saving", attempt: attempt + 1, status: state.status, draft: state.draft, port },
        command: { type: "save", attempt: attempt + 1, port },
      }
    }

    case "saved": {
      if (state.type !== "saving" || event.attempt !== attempt) return { state }
      const { status, draft } = state

      if (event.result === undefined) {
        return {
          state: { ...state, type: "reconciling", attempt: attempt + 1 },
          command: { type: "status", attempt: attempt + 1 },
        }
      }

      if (event.result !== "saved") return { state: { type: "ready", attempt, status, draft, issue: event.result } }

      return {
        state: {
          type: "ready",
          attempt,
          draft: String(state.port),
          status: { ...status, port: status.port && { ...status.port, saved: state.port } },
        },
      }
    }
  }
}
