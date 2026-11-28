import type { Rectangle } from "electron"
import { equal, layout, type Snapshot } from "../layout"

export type Plan = NonNullable<ReturnType<typeof layout>>

type Split = Extract<Plan, { kind: "split" }>

export type WindowSnapshot = Snapshot & { restored: Rectangle }

export type State =
  | { type: "unobserved" }
  | { type: "manual" }
  | { type: "tracking"; baseline: WindowSnapshot }
  | { type: "split" | "restoring"; baseline: WindowSnapshot; sessionID: string; plan: Split }

type Event =
  | { type: "observed"; current: WindowSnapshot; sessionID?: string }
  | { type: "browser-placed"; sessionID: string; plan: Split }
  | { type: "browser-moved" }
  | { type: "restore-started" }
  | { type: "resized"; current: WindowSnapshot }

export const initial: State = { type: "unobserved" }

export function same(before: Snapshot, after: Snapshot) {
  return (
    equal(before.app, after.app) &&
    before.display.id === after.display.id &&
    equal(before.display.workArea, after.display.workArea) &&
    before.display.scaleFactor === after.display.scaleFactor &&
    before.others.length === after.others.length &&
    before.maximized === after.maximized &&
    before.fullscreen === after.fullscreen
  )
}

export function pending(state: State) {
  return state.type === "split" || state.type === "restoring" ? state.plan : undefined
}

export function transition(state: State, event: Event): State {
  if (state.type === "manual") return state

  switch (event.type) {
    case "observed": {
      const { current, sessionID } = event

      if (state.type === "unobserved") return { type: "tracking", baseline: current }

      const baseline = state.baseline

      if (!same(baseline, current)) {
        const restored = { ...baseline, app: baseline.restored, maximized: false, fullscreen: false }

        if (state.type !== "restoring" || !same(restored, current)) return { type: "manual" }

        state = { ...state, type: "split", baseline: current }
      }

      if ("sessionID" in state && sessionID !== undefined && sessionID !== state.sessionID) {
        return { type: "tracking", baseline: current }
      }

      return state
    }

    case "browser-placed":
      if (state.type !== "tracking") return state

      return { type: "split", sessionID: event.sessionID, plan: event.plan, baseline: state.baseline }
    case "browser-moved":
      return "sessionID" in state ? { type: "tracking", baseline: state.baseline } : state
    case "restore-started":
      return state.type === "split" ? { ...state, type: "restoring" } : state
    case "resized":
      return { type: "tracking", baseline: event.current }
  }
}
