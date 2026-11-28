import type { DiagnosticsStatus } from "@loginom-ai-agent/loginom-host/diagnostics-rpc"
import { diagnosticsRows } from "./diagnostics-rows"

type Report = { type: "saved"; path: string } | { type: "failed" }

type Snapshot = { status?: DiagnosticsStatus; checked?: true; report?: Report }

type State = { attempt: number } & (
  | { type: "loading" | "disposed" }
  | { type: "idle" | "checking"; snapshot: Snapshot }
  | { type: "saving"; snapshot: Snapshot & { status: DiagnosticsStatus } }
)

type Event =
  | { type: "target"; available: boolean }
  | { type: "disposed" | "check" }
  | { type: "save"; available: boolean }
  | { type: "status"; attempt: number; status: DiagnosticsStatus | undefined }
  | { type: "report"; attempt: number; report: Report | undefined }

type Effect =
  | { type: "cancel" }
  | { type: "status"; attempt: number; check: boolean }
  | { type: "report"; attempt: number }

type Transition = { state: State; effects: Effect[] }

export const initial: State = { type: "loading", attempt: 0 }

export function transition(state: State, event: Event): Transition {
  const keep = { state, effects: [] }

  if (state.type === "disposed") return keep

  const attempt = state.attempt + 1

  switch (event.type) {
    case "disposed":
      return { state: { type: "disposed", attempt }, effects: [{ type: "cancel" }] }
    case "target":
      return event.available
        ? {
            state: { type: "loading", attempt },
            effects: [{ type: "cancel" }, { type: "status", attempt, check: false }],
          }
        : { state: { type: "idle", attempt, snapshot: {} }, effects: [{ type: "cancel" }] }
    case "check":
      if (state.type !== "idle") return keep

      return {
        state: { type: "checking", attempt, snapshot: { ...state.snapshot, checked: undefined } },
        effects: [{ type: "status", attempt, check: true }],
      }
    case "status":
      if (event.attempt !== state.attempt || (state.type !== "loading" && state.type !== "checking")) return keep

      return {
        state: {
          type: "idle",
          attempt: state.attempt,
          snapshot:
            state.type === "checking"
              ? { ...state.snapshot, status: event.status, checked: true }
              : { status: event.status },
        },
        effects: [],
      }
    case "save": {
      if (state.type !== "idle" || !state.snapshot.status || !event.available) return keep

      return {
        state: {
          type: "saving",
          attempt,
          snapshot: { ...state.snapshot, status: state.snapshot.status, report: undefined },
        },
        effects: [{ type: "report", attempt }],
      }
    }

    case "report":
      if (event.attempt !== state.attempt || state.type !== "saving") return keep

      return {
        state: { type: "idle", attempt: state.attempt, snapshot: { ...state.snapshot, report: event.report } },
        effects: [],
      }
  }
}

export function view(state: State, saveAvailable: boolean) {
  const snapshot = "snapshot" in state ? state.snapshot : undefined
  const status = snapshot?.status
  const rows = diagnosticsRows(status)

  return {
    status,
    rows,
    problems: snapshot?.checked ? rows.filter((row) => row.ok === false) : undefined,
    loading: state.type === "loading",
    checking: state.type === "checking",
    saving: state.type === "saving",
    canCheck: state.type === "idle",
    canSave: state.type === "idle" && !!status && saveAvailable,
    report: snapshot?.report,
  }
}
