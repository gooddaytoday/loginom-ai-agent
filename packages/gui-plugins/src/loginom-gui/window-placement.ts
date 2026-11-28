import type { Rectangle } from "electron"
import type { Focus, WindowFeedback } from "./contract"
import { layout } from "./layout"
import { initial, pending, same, transition, type Plan, type State, type WindowSnapshot } from "./window/machine"
import type { Placement } from "./window-request"

type LayoutFeedback = typeof WindowFeedback.Type.layout

type ShowOptions = {
  sessionID: string
  current: () => WindowSnapshot | undefined
  place: (plan: Plan) => Promise<typeof Placement.Type | undefined>
  resize: (bounds: Rectangle, restoreStarted: () => void) => Promise<boolean>
}

export function windowPlacement() {
  let state: State = initial

  return {
    startup(current: WindowSnapshot) {
      state = transition(state, { type: "observed", current })

      return layout(current, "startup")
    },
    async show(options: ShowOptions): Promise<LayoutFeedback> {
      const before = options.current()

      if (!before) return

      const { sessionID } = options
      state = transition(state, { type: "observed", current: before, sessionID })

      if (state.type === "manual") return

      const plan = pending(state) ?? layout(before, "show")

      if (!plan) return

      const placed = await options.place(plan)
      const current = options.current()

      if (!current) return
      state = transition(state, { type: "observed", current })

      if (state.type === "manual") return

      if (placed === "moved") {
        state = transition(state, { type: "browser-moved" })

        return
      }

      if (placed === "workspace-unavailable") return

      if (placed !== "placed" || plan.kind !== "split") {
        if (pending(state)) return "split-incomplete"

        if (placed === undefined || placed === "layout-unavailable") return "layout-unavailable"

        return
      }

      if (!same(before, current)) return "split-incomplete"

      state = transition(state, { type: "browser-placed", sessionID, plan })

      if (!pending(state)) return "split-incomplete"

      const resized = await options
        .resize(plan.app, () => {
          state = transition(state, { type: "restore-started" })
        })
        .catch(() => false)

      const after = options.current()

      if (after) state = transition(state, { type: resized ? "resized" : "observed", current: after })

      if (!resized && pending(state)) return "split-incomplete"
    },
  }
}

export function windowFeedback(focus: typeof Focus.Type, layout: LayoutFeedback): typeof WindowFeedback.Type {
  if (focus === "workspace-unavailable") return { focus }

  if (layout === "split-incomplete" || (layout && (focus === "focused" || focus === "manual"))) return { focus, layout }

  return { focus }
}
