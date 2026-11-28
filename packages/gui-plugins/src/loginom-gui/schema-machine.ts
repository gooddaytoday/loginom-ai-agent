import { findNodePath, overlayWorkflows, pathIn } from "./compare-schemas"
import type { Finding, Snapshot, Workflow } from "./schema-contract"
import type { ChangesWithSchema } from "./package-changes-data"

export type Request = { sessionID: string; serverID: string; directory: string; finding?: Finding }

type Comparison = {
  changes: ChangesWithSchema
  overlay: ChangesWithSchema["schemaDiff"]["after"]
  mode: "after" | "before"
}

export type State =
  | { status: "closed" }
  | { status: "loading" | "empty" | "failed"; request: Request }
  | {
      status: "ready"
      request: Request
      snapshot: Snapshot
      path: readonly Workflow[]
      selected?: number
      comparison?: Comparison
    }

export type Event =
  | { type: "open"; request: Request }
  | { type: "open-changes"; request: Request; changes: ChangesWithSchema }
  | { type: "mode"; mode: Comparison["mode"] }
  | { type: "loaded"; request: Request; snapshot: Snapshot | null }
  | { type: "failed"; request: Request }
  | { type: "close" }
  | { type: "module"; workflow: Workflow }
  | { type: "select"; index: number }
  | { type: "enter"; workflow: Workflow }
  | { type: "leave" }

export function transition(state: State, event: Event): State {
  switch (event.type) {
    case "open":
      return { status: "loading", request: event.request }
    case "open-changes": {
      const diff = event.changes.schemaDiff
      const overlay = { ...diff.after, workflows: overlayWorkflows(diff.before.workflows, diff.after.workflows) }

      return {
        status: "ready",
        request: event.request,
        snapshot: overlay,
        path: overlay.workflows.slice(0, 1),
        comparison: { changes: event.changes, overlay, mode: "after" },
      }
    }

    case "mode": {
      if (state.status !== "ready" || !state.comparison || state.comparison.mode === event.mode) return state
      const snapshot = event.mode === "before" ? state.comparison.changes.schemaDiff.before : state.comparison.overlay
      const path = pathIn(snapshot.workflows, state.path)
      const guid = state.path.at(-1)?.nodes[state.selected ?? -1]?.guid
      const index = guid ? path.at(-1)?.nodes.findIndex((node) => node.guid === guid && !node.boundary_role) : undefined

      return {
        ...state,
        snapshot,
        path,
        selected: index === -1 ? undefined : index,
        comparison: { ...state.comparison, mode: event.mode },
      }
    }

    case "close":
      return { status: "closed" }
    case "failed":
      return state.status === "loading" && state.request === event.request ? { ...state, status: "failed" } : state
    case "loaded": {
      if (state.status !== "loading" || state.request !== event.request) return state
      const snapshot = event.snapshot
      const finding = state.request.finding

      if (!snapshot || (finding && (snapshot.source !== "saved" || snapshot.package.guid !== finding.packageGuid))) {
        return { ...state, status: "empty" }
      }

      if (snapshot.source === "saved" && finding) {
        for (const guid of finding.nodeGuids) {
          const path = findNodePath(snapshot.workflows, guid)

          if (!path) continue
          const selected = path.at(-1)?.nodes.findIndex((node) => node.guid === guid)

          return { status: "ready", request: state.request, snapshot, path, selected }
        }

        return { ...state, status: "empty" }
      }

      const path = snapshot.source === "saved" ? snapshot.workflows.slice(0, 1) : []

      return { status: "ready", request: state.request, snapshot, path }
    }

    case "module":
      return state.status === "ready" ? { ...state, path: [event.workflow], selected: undefined } : state
    case "select":
      return state.status === "ready" ? { ...state, selected: event.index } : state
    case "enter":
      return state.status === "ready" ? { ...state, path: [...state.path, event.workflow], selected: undefined } : state
    case "leave": {
      if (state.status !== "ready" || state.path.length < 2) return state
      const child = state.path.at(-1)
      const path = state.path.slice(0, -1)
      const selected = path.at(-1)?.nodes.findIndex((node) => node.guid === child?.key.at(-1))

      return { ...state, path, selected: selected === -1 ? undefined : selected }
    }
  }
}
