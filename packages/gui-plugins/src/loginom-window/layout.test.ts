import { expect, test } from "bun:test"
import { windowLayout } from "./layout"

const area = { x: 0, y: 40, width: 1601, height: 860 }
const primary = { id: 1, bounds: { ...area, y: 0, height: 900 }, workArea: area, scaleFactor: 1 }
const right = {
  id: 2,
  bounds: { x: 1601, y: -200, width: 1280, height: 720 },
  workArea: { x: 1601, y: -170, width: 1280, height: 690 },
  scaleFactor: 1.5,
}
const left = { id: 3, bounds: { x: -1280, y: 0, width: 1280, height: 720 }, workArea: area, scaleFactor: 1 }

test("one display splits the work area below the system bar, including with a maximized app", () => {
  expect(windowLayout(primary, [primary])).toEqual({
    app: { x: 0, y: 40, width: 800, height: 860 },
    loginom: { x: 800, y: 40, width: 801, height: 860 },
  })
})

test("a right-hand display leaves the app in place and keeps the target's 150% DIP origin and size", () => {
  expect(windowLayout(primary, [left, primary, right])).toEqual({
    loginom: { x: 1601, y: -170, width: 1280, height: 690 },
  })
})

test("when the second display is on the left, split the current display using the app minimum", () => {
  expect(windowLayout(primary, [left, primary], 900)).toEqual({
    app: { x: 0, y: 40, width: 900, height: 860 },
    loginom: { x: 900, y: 40, width: 701, height: 860 },
  })
})
