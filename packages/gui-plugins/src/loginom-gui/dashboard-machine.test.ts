import { expect, test } from "bun:test"
import { Schema } from "effect"
import { DashboardTarget } from "./contract"
import { dashboardView, transitionDashboard, type DashboardState } from "./dashboard-machine"

const decodeTarget = Schema.decodeUnknownSync(DashboardTarget)

const orders = decodeTarget({ id: "orders", directory: "/data/orders", action: "edit", nodeName: "Orders" })

const stock = decodeTarget({ id: "stock", directory: "/data/stock", action: "edit", nodeName: "Stock" })

const initial: DashboardState = { nextAttempt: 1 }

test("a failure belongs to the link it came from", () => {
  const selected = transitionDashboard(initial, { type: "link.opened", link: orders })
  const foreign = transitionDashboard(selected, { type: "link.failed", id: stock.id, issue: "dashboardSnapshotGone" })

  expect(dashboardView(foreign, orders.id).issue).toBeUndefined()

  const matching = transitionDashboard(foreign, { type: "link.failed", id: orders.id, issue: "dashboardSnapshotGone" })

  expect(dashboardView(matching, orders.id).issue).toBe("dashboardSnapshotGone")
})

test("switching targets discards late preview and edit results", () => {
  const selected = transitionDashboard(initial, { type: "link.opened", link: orders })
  const opening = transitionDashboard(selected, { type: "view.opened", id: orders.id })
  const editing = transitionDashboard(opening, { type: "edit.requested", view: 1 })

  expect(dashboardView(editing, orders.id).editing).toBe(true)
  expect(transitionDashboard(editing, { type: "edit.requested", view: 1 })).toBe(editing)

  const switched = transitionDashboard(editing, { type: "link.opened", link: stock })
  const next = transitionDashboard(switched, { type: "view.opened", id: stock.id })
  const oldPreview = transitionDashboard(next, { type: "preview.ready", attempt: 1, embed: "old" })
  const oldEdit = transitionDashboard(oldPreview, { type: "edit.finished", attempt: 2, issue: "dashboardOpenFailed" })
  const oldClose = transitionDashboard(oldEdit, { type: "view.closed", attempt: 1 })

  expect(dashboardView(oldClose, stock.id)).toMatchObject({ embed: undefined, editing: false, issue: undefined })

  const shown = transitionDashboard(oldClose, { type: "preview.ready", attempt: 3, embed: "current" })

  expect(dashboardView(shown, stock.id).embed).toBe("current")
})

test("an unsuccessful view can close and reopen the same target with a new attempt", () => {
  const selected = transitionDashboard(initial, { type: "link.opened", link: orders })
  const opening = transitionDashboard(selected, { type: "view.opened", id: orders.id })
  const failed = transitionDashboard(opening, { type: "preview.failed", attempt: 1 })

  expect(dashboardView(failed, orders.id).previewFailed).toBe(true)

  const checking = transitionDashboard(failed, { type: "edit.requested", view: 1 })
  const closed = transitionDashboard(checking, { type: "view.closed", attempt: 1 })
  const reopened = transitionDashboard(closed, { type: "view.opened", id: orders.id })
  const stale = transitionDashboard(reopened, { type: "edit.finished", attempt: 2, issue: "dashboardSnapshotGone" })

  expect(dashboardView(stale, orders.id)).toMatchObject({ previewFailed: false, issue: undefined })

  const retry = transitionDashboard(stale, { type: "edit.requested", view: 3 })
  const done = transitionDashboard(retry, { type: "edit.finished", attempt: 4, issue: "dashboardSnapshotGone" })

  expect(dashboardView(done, orders.id)).toMatchObject({ editing: false, issue: "dashboardSnapshotGone" })
})
