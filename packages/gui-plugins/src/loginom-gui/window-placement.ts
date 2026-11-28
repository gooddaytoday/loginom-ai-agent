import type { Rectangle } from "electron"
import type { Focus, WindowFeedback } from "./contract"
import { equal, layout, type Snapshot } from "./layout"

type Plan = NonNullable<ReturnType<typeof layout>>
type Split = Extract<Plan, { kind: "split" }>
type WindowSnapshot = Snapshot & { restored: Rectangle }
type LayoutFeedback = typeof WindowFeedback.Type.layout
export type PlacementStatus = "placed" | "unchanged" | "layout-unavailable" | "starting" | "no-window"

function same(before: Snapshot, after: Snapshot) {
  return equal(before.app, after.app) && before.display.id === after.display.id &&
    equal(before.display.workArea, after.display.workArea) && before.display.scaleFactor === after.display.scaleFactor &&
    before.others.length === after.others.length && before.maximized === after.maximized && before.fullscreen === after.fullscreen
}

function restored(before: WindowSnapshot, after: WindowSnapshot) {
  return (before.maximized || before.fullscreen) &&
    same({ ...before, app: before.restored, maximized: false, fullscreen: false }, after)
}

export function windowPlacement() {
  let baseline: WindowSnapshot | undefined
  let moved = false
  let split: { sessionID: string; plan: Split } | undefined

  function observe(current: WindowSnapshot, allowRestore = false) {
    if (baseline && !same(baseline, current)) {
      if (allowRestore && restored(baseline, current)) baseline = current
      else moved = true
    }
    baseline ??= current
  }

  return {
    startup(current: WindowSnapshot) {
      observe(current)
      return layout(current, "startup")
    },
    async show(options: {
      sessionID: string
      current: () => WindowSnapshot | undefined
      place: (plan: Plan) => Promise<PlacementStatus | undefined>
      resize: (bounds: Rectangle) => Promise<boolean>
    }): Promise<LayoutFeedback> {
      const before = options.current()
      if (!before) return
      if (split?.sessionID !== options.sessionID) split = undefined
      observe(before, !!split)
      if (moved) split = undefined
      if (moved) return
      const plan = split?.plan ?? layout(before, "show")
      if (!plan) return

      const placed = await options.place(plan)
      if (placed !== "placed" || plan.kind !== "split") {
        if (split) return "split-incomplete"
        if (placed === undefined || placed === "layout-unavailable") return "layout-unavailable"
        return
      }

      split = { sessionID: options.sessionID, plan }
      const current = options.current()
      if (!current || !same(before, current)) return "split-incomplete"
      const resized = await options.resize(plan.app).catch(() => false)
      const after = options.current()
      if (after && (resized || restored(before, after))) baseline = after
      if (!resized) return "split-incomplete"
      split = undefined
    },
  }
}

export function windowFeedback(focus: typeof Focus.Type, layout: LayoutFeedback): typeof WindowFeedback.Type {
  return layout === "split-incomplete" || (layout && focus === "focused") ? { focus, layout } : { focus }
}
