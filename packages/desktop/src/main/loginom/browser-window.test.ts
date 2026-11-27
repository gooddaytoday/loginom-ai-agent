import { expect, test } from "bun:test"
import type { WindowBounds } from "@loginom-ai-agent/loginom-host/browser-window"
import { createWindowPresenter, layout } from "./browser-window"

const main = { x: -1601, y: 40, width: 1601, height: 860 }
const leftHalf = { x: -1601, y: 40, width: 800, height: 860 }
const rightHalf = { x: -801, y: 40, width: 801, height: 860 }
const right = { x: 0, y: -120, width: 1200, height: 920 }

test("splits an odd-width single monitor in DIP without losing a column", () => {
  expect(layout({ app: main, matching: main, others: [], maximized: true, fullscreen: false }, true)).toEqual({
    kind: "split",
    app: leftHalf,
    browser: rightHalf,
  })
})

test.each([
  ["right of the app on the same display", leftHalf, [], { x: -801, y: 40, width: 720, height: 860 }],
  ["on the next display", main, [right], { x: 0, y: -120, width: 540, height: 920 }],
] as const)("uses free room %s without moving Desktop", (_name, app, others, browser) => {
  expect(layout({ app, matching: main, others, maximized: false, fullscreen: false }, true)).toEqual({
    kind: "beside",
    browser,
  })
})

test("first explicit Show splits; subsequent clicks keep both manually changed windows", async () => {
  const present = createWindowPresenter()
  const state = { app: main, browser: right, maximized: true, visible: false, focused: 0 }
  const chat = {
    window: {},
    sessionID: "ses_current",
    supported: true,
    snapshot: () => ({ app: state.app, matching: main, others: [], maximized: state.maximized, fullscreen: false }),
    async placeApp(bounds: WindowBounds) {
      state.app = bounds
      state.maximized = false
      return true
    },
    async placeBrowser(bounds: WindowBounds) {
      if (!state.visible) return "no-window" as const
      state.browser = bounds
      return "placed" as const
    },
    async showBrowser() {
      state.focused += 1
      return "focused" as const
    },
  }
  expect(await present(chat)).toBe("no-window")
  expect(state.app).toEqual(main)
  state.visible = true
  expect(await present(chat)).toBe("focused")
  expect(state.app).toEqual(leftHalf)
  expect(state.browser).toEqual(rightHalf)
  state.app = { ...main, width: 1100 }
  state.browser = { ...rightHalf, y: 60, width: 600 }
  const edited = structuredClone(state)
  expect(await present(chat)).toBe("focused")
  expect(state).toEqual({ ...edited, focused: 2 })
  expect(
    await present({
      ...chat,
      sessionID: "ses_second",
      snapshot: () => ({
        app: main,
        matching: main,
        others: [],
        maximized: true,
        fullscreen: false,
      }),
    }),
  ).toBe("layout-unavailable")
  expect(state.app).toEqual(edited.app)
})

test.each([true, false])(
  "a compositor refusal or Wayland never shrinks Desktop (layout attempted: %s)",
  async (supported) => {
    const present = createWindowPresenter()
    let placement = 0
    const result = await present({
      window: {},
      sessionID: "ses_current",
      supported,
      snapshot: () => ({ app: main, matching: main, others: [], maximized: true, fullscreen: false }),
      async placeApp() {
        throw Error("must not resize Desktop")
      },
      async placeBrowser() {
        placement += 1
        return "layout-unavailable"
      },
      async showBrowser() {
        return "focused"
      },
    })
    expect(result).toBe("layout-unavailable")
    expect(placement).toBe(supported ? 1 : 0)
  },
)
