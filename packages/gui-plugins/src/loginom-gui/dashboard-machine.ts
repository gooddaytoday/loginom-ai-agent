import type { DashboardTarget } from "./contract"

export type Target = typeof DashboardTarget.Type

export type DashboardIssue = "dashboardSnapshotGone" | "dashboardConnect" | "dashboardOpenFailed"

type View =
  | { status: "closed" }
  | {
      status: "open"
      attempt: number
      preview: { status: "loading" | "failed" } | { status: "ready"; embed: string }
      edit: { status: "idle"; issue?: DashboardIssue } | { status: "checking"; attempt: number }
    }

type OpenView = Extract<View, { status: "open" }>

export type DashboardState = {
  nextAttempt: number
  current?: { link: Target; issue?: DashboardIssue; view: View }
}

type DashboardEvent =
  | { type: "link.opened"; link: Target }
  | { type: "link.failed"; id: string; issue: DashboardIssue }
  | { type: "view.opened"; id: string }
  | { type: "view.closed"; attempt: number }
  | { type: "preview.ready"; attempt: number; embed: string }
  | { type: "preview.failed"; attempt: number }
  | { type: "edit.requested"; view: number }
  | { type: "edit.finished"; attempt: number; issue?: DashboardIssue }

export function transitionDashboard(state: DashboardState, event: DashboardEvent): DashboardState {
  if (event.type === "link.opened") {
    return { ...state, current: { link: event.link, view: { status: "closed" } } }
  }

  const current = state.current

  if (!current) return state

  if (event.type === "link.failed") {
    return event.id === current.link.id ? { ...state, current: { ...current, issue: event.issue } } : state
  }

  if (event.type === "view.opened") {
    if (event.id !== current.link.id || current.view.status !== "closed") return state

    const view: View = {
      status: "open",
      attempt: state.nextAttempt,
      preview: { status: "loading" },
      edit: { status: "idle" },
    }

    return { nextAttempt: state.nextAttempt + 1, current: { ...current, view } }
  }

  const view = current.view

  if (view.status !== "open") return state

  switch (event.type) {
    case "view.closed": {
      if (view.attempt !== event.attempt) return state

      return { ...state, current: { ...current, view: { status: "closed" } } }
    }

    case "preview.ready":
    case "preview.failed": {
      if (view.attempt !== event.attempt || view.preview.status !== "loading") return state

      const preview: OpenView["preview"] =
        event.type === "preview.ready" ? { status: "ready", embed: event.embed } : { status: "failed" }

      return { ...state, current: { ...current, view: { ...view, preview } } }
    }

    case "edit.requested": {
      if (view.attempt !== event.view || view.edit.status !== "idle") return state

      const edit: OpenView["edit"] = { status: "checking", attempt: state.nextAttempt }

      return { nextAttempt: state.nextAttempt + 1, current: { ...current, view: { ...view, edit } } }
    }

    case "edit.finished": {
      if (view.edit.status !== "checking" || view.edit.attempt !== event.attempt) return state

      return { ...state, current: { ...current, view: { ...view, edit: { status: "idle", issue: event.issue } } } }
    }
  }
}

export function dashboardView(state: DashboardState, id: string) {
  const current = state.current?.link.id === id ? state.current : undefined
  const view = current?.view.status === "open" ? current.view : undefined

  return {
    attempt: view?.attempt,
    embed: view?.preview.status === "ready" ? view.preview.embed : undefined,
    previewFailed: view?.preview.status === "failed",
    editing: view?.edit.status === "checking",
    issue: (view?.edit.status === "idle" ? view.edit.issue : undefined) ?? current?.issue,
  }
}

export type DashboardStore = {
  state: () => DashboardState
  dispatch: (event: DashboardEvent) => DashboardState | undefined
}
