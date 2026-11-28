import { expect, test } from "bun:test"
import { windowFeedback, windowPlacement } from "./window-placement"

const area = { x: 0, y: 0, width: 1600, height: 900 }
const restored = { x: 60, y: 80, width: 950, height: 700 }
const left = { ...area, width: 800 }
const right = { ...left, x: 800 }
const full = { app: area, restored, display: { id: 1, workArea: area, scaleFactor: 1 },
  others: [], maximized: true, fullscreen: false, minimumWidth: 480 }

test.each([false, true])("retries only the incomplete Desktop half (restored after first click: %s)", async (unmaximized) => {
  const placement = windowPlacement()
  let desktop = full
  let browser = { ...area, x: 880, width: 720 }
  const options: Parameters<typeof placement.show>[0] = {
    sessionID: "conversation",
    current: () => desktop,
    async place(plan) {
      browser = plan.browser
      return "placed"
    },
    async resize(bounds) {
      desktop = { ...desktop, app: bounds, maximized: false }
      return true
    },
  }
  const first = await placement.show({ ...options, async resize() {
    if (unmaximized) desktop = { ...desktop, app: restored, maximized: false }
    return false
  } })
  expect(windowFeedback("focused", first)).toEqual({ focus: "focused", layout: "split-incomplete" })
  expect(windowFeedback("taskbar", first)).toEqual({ focus: "taskbar", layout: "split-incomplete" })
  expect(browser).toEqual(right)
  expect(desktop.app).toEqual(unmaximized ? restored : area)

  expect(await placement.show(options)).toBeUndefined()
  expect(desktop.app).toEqual(left)
  expect(browser).toEqual(right)
})

test("does not complete a split after the user has moved one of the windows", async () => {
  const placement = windowPlacement()
  let desktop = full
  let browserMoved = false
  const options: Parameters<typeof placement.show>[0] = {
    sessionID: "conversation",
    current: () => desktop,
    async place() { return browserMoved ? "unchanged" : "placed" },
    async resize(bounds) {
      desktop = { ...desktop, app: bounds, maximized: false }
      return true
    },
  }
  expect(await placement.show({ ...options, resize: async () => false })).toBe("split-incomplete")
  browserMoved = true
  expect(await placement.show(options)).toBe("split-incomplete")
  expect(desktop.app).toEqual(area)

  desktop = { ...full, app: { ...restored, x: 120 }, maximized: false }
  browserMoved = false
  expect(await placement.show(options)).toBeUndefined()
  expect(desktop.app).toEqual({ ...restored, x: 120 })
})
