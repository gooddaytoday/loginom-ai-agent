import { expect, test } from "bun:test"
import { initialModelStopAction, modelStopActionView, transitionModelStopAction } from "./model-stop-machine"

const start = { type: "started" } as const

test("claims one action at a time and clears the error on retry", () => {
  const first = transitionModelStopAction(initialModelStopAction, start)
  expect(modelStopActionView(first)).toEqual({ busy: true, failed: false })
  expect(transitionModelStopAction(first, start)).toBe(first)

  const failed = transitionModelStopAction(first, { type: "failed", attempt: 1 })
  expect(modelStopActionView(failed)).toEqual({ busy: false, failed: true })

  const retry = transitionModelStopAction(failed, start)
  expect(modelStopActionView(retry)).toEqual({ busy: true, failed: false })
  expect(transitionModelStopAction(retry, { type: "succeeded", attempt: 1 })).toBe(retry)
  expect(modelStopActionView(transitionModelStopAction(retry, { type: "succeeded", attempt: 2 }))).toEqual({
    busy: false,
    failed: false,
  })
})

test("ignores completion and new actions after disposal", () => {
  const running = transitionModelStopAction(initialModelStopAction, start)
  const disposed = transitionModelStopAction(running, { type: "disposed" })
  expect(transitionModelStopAction(disposed, { type: "failed", attempt: 1 })).toBe(disposed)
  expect(transitionModelStopAction(disposed, start)).toBe(disposed)
})
