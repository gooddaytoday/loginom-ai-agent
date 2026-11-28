import type { Finding, Snapshot, StepNode, Workflow } from "./contract"

export type Request = { sessionID: string; serverID: string; directory: string } & (
  | { finding: Finding; node?: never }
  | { node: StepNode; finding?: never }
  | { finding?: never; node?: never }
)

export type State =
  | { status: "closed" }
  | { status: "loading" | "empty" | "failed"; request: Request }
  | { status: "missing"; request: Request; reason: "unavailable" | "otherSnapshot" | "removed" }
  | { status: "ready"; request: Request; snapshot: Snapshot; path: readonly Workflow[]; selected?: number }

export type Event =
  | { type: "open"; request: Request }
  | { type: "loaded"; request: Request; snapshot: Snapshot | null }
  | { type: "failed"; request: Request }
  | { type: "close" }
  | { type: "module"; workflow: Workflow }
  | { type: "select"; index: number }
  | { type: "enter"; workflow: Workflow }
  | { type: "leave" }

function findPath(workflows: readonly Workflow[], guid: string): readonly Workflow[] | undefined {
  for (const workflow of workflows) {
    if (workflow.nodes.some((node) => node.guid === guid)) return [workflow]
    const nested = findPath(workflow.submodels, guid)

    if (nested) return [workflow, ...nested]
  }
}

export function transition(state: State, event: Event): State {
  switch (event.type) {
    case "open":
      return { status: "loading", request: event.request }
    case "close":
      return { status: "closed" }
    case "failed":
      return state.status === "loading" && state.request === event.request ? { ...state, status: "failed" } : state
    case "loaded": {
      if (state.status !== "loading" || state.request !== event.request) return state
      const snapshot = event.snapshot
      const { request } = state
      const { finding, node } = request

      if (node) {
        if (!snapshot) return { status: "missing", request, reason: "unavailable" }

        if (
          snapshot.source !== "window" ||
          snapshot.workflow.document_id !== node.document_id ||
          snapshot.workflow.workflow_id !== node.workflow_id
        ) {
          return { status: "missing", request, reason: "otherSnapshot" }
        }

        const index = snapshot.workflow.nodes.findIndex((candidate) => candidate.guid === node.node_id)

        if (index < 0) return { status: "missing", request, reason: "removed" }

        if (snapshot.workflow.nodes.findLastIndex((candidate) => candidate.guid === node.node_id) !== index)
          return { status: "missing", request, reason: "unavailable" }

        return { status: "ready", request, snapshot, path: [], selected: index }
      }

      if (!snapshot || (finding && (snapshot.source !== "saved" || snapshot.package.guid !== finding.packageGuid))) {
        return { ...state, status: "empty" }
      }

      if (snapshot.source === "saved" && finding) {
        for (const guid of finding.nodeGuids) {
          const path = findPath(snapshot.workflows, guid)

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
