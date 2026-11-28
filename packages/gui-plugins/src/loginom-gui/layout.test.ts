import { expect, test } from "bun:test"
import { chromiumBounds, layout, type Snapshot } from "./layout"

const first = { id: 1, workArea: { x: 0, y: 40, width: 1601, height: 860 }, scaleFactor: 1 }

const second = { id: 2, workArea: { x: 1601, y: -120, width: 1200, height: 920 }, scaleFactor: 1.25 }

const full: Snapshot = {
  app: first.workArea,
  display: first,
  others: [],
  maximized: true,
  fullscreen: false,
  minimumWidth: 480,
}

test("startup overlays the right 45% without resizing Desktop; explicit Show splits the display", () => {
  expect(layout(full, "startup")).toEqual({
    kind: "overlay",
    target: first,
    browser: { x: 881, y: 40, width: 720, height: 860 },
  })
  expect(layout(full, "show")).toEqual({
    kind: "split",
    target: first,
    app: { x: 0, y: 40, width: 800, height: 860 },
    browser: { x: 800, y: 40, width: 801, height: 860 },
  })
  expect(layout({ ...full, minimumWidth: 900 }, "show")).toBeUndefined()
})

test("both modes prefer the monitor on the right, or take free space on the same monitor", () => {
  for (const mode of ["startup", "show"] as const) {
    expect(layout({ ...full, others: [second] }, mode)).toEqual({
      kind: "beside",
      target: second,
      browser: { x: 1601, y: -120, width: 540, height: 920 },
    })
    expect(layout({ ...full, app: { ...full.app, width: 800 }, maximized: false }, mode)).toEqual({
      kind: "beside",
      target: first,
      browser: { x: 800, y: 40, width: 720, height: 860 },
    })
  }
})

test("Linux converts to physical bounds at 2x and 1.25x without a rounding gap", () => {
  const bounds = { x: 1601, y: -119, width: 541, height: 920 }

  const notWindows = () => {
    throw Error("Windows converter must not run on Linux")
  }

  expect(chromiumBounds(bounds, { ...second, scaleFactor: 2 }, "linux", notWindows)).toEqual({
    x: 3202,
    y: -238,
    width: 1082,
    height: 1840,
  })
  expect(chromiumBounds(bounds, second, "linux", notWindows)).toEqual({ x: 2001, y: -149, width: 677, height: 1150 })
})

test("Windows uses Electron's target-monitor conversion, not a global multiplier", () => {
  const bounds = { x: 1601, y: -120, width: 540, height: 920 }
  const physical = { x: 3202, y: -150, width: 675, height: 1150 }
  expect(
    chromiumBounds(bounds, second, "win32", (input) => {
      expect(input).toEqual(bounds)

      return physical
    }),
  ).toEqual(physical)
})
