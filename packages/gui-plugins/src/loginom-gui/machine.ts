import type { Finding, Snapshot, Workflow } from "./contract"

export type Request = { sessionID: string; serverID: string; directory: string; finding?: Finding }

export type State =
  | { status: "closed" }
  | { status: "loading" | "empty" | "failed"; request: Request }
  | { status: "ready"; request: Request; snapshot: Snapshot; path: readonly Workflow[]; selected?: number }

export type Event =
  | { type: "open"; request: Request }
  | { type: "loaded"; request: Request; snapshot: Snapshot | null; nodeGuid?: string }
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

export function locateNode(snapshot: Snapshot, guid: string) {
  const path = snapshot.source === "saved" ? findPath(snapshot.workflows, guid) : []
  const nodes = snapshot.source === "saved" ? path?.at(-1)?.nodes : snapshot.workflow.nodes
  const selected = nodes?.findIndex((node) => node.guid === guid) ?? -1

  if (path && selected >= 0) return { path, selected }
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
      const finding = state.request.finding

      if (!snapshot || (finding && (snapshot.source !== "saved" || snapshot.package.guid !== finding.packageGuid))) {
        return { ...state, status: "empty" }
      }

      if (snapshot.source === "saved" && finding) {
        for (const guid of finding.nodeGuids) {
          const node = locateNode(snapshot, guid)

          if (node) return { status: "ready", request: state.request, snapshot, ...node }
        }

        return { ...state, status: "empty" }
      }

      const node = event.nodeGuid ? locateNode(snapshot, event.nodeGuid) : undefined

      if (node) return { status: "ready", request: state.request, snapshot, ...node }

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
