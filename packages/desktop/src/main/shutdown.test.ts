import { expect, test } from "bun:test"
import { createQuitHandler } from "./shutdown"

test("quit waits for cleanup, coalesces repeated requests and admits the final quit", async () => {
  const calls: string[] = []
  const cleanup = Promise.withResolvers<void>()
  const quit = Promise.withResolvers<void>()
  const handler = createQuitHandler({
    markQuitting: () => { calls.push("mark") },
    stop: async () => { calls.push("stop"); await cleanup.promise; calls.push("stopped") },
    quit: () => { calls.push("quit"); quit.resolve() },
    onError: () => { calls.push("error") },
  })
  const event = { preventDefault: () => { calls.push("prevent") } }
  handler(event)
  handler(event)
  await Promise.resolve()
  expect(calls).toEqual(["mark", "prevent", "mark", "prevent", "stop"])
  cleanup.resolve()
  await quit.promise
  handler(event)
  expect(calls).toEqual(["mark", "prevent", "mark", "prevent", "stop", "stopped", "quit", "mark"])
})

test("cleanup failure is reported before the final quit", async () => {
  const calls: unknown[] = []
  const failure = new Error("cleanup failed")
  const quit = Promise.withResolvers<void>()
  createQuitHandler({
    markQuitting() {},
    stop: async () => { throw failure },
    quit: () => { calls.push("quit"); quit.resolve() },
    onError: (error) => { calls.push(error) },
  })({ preventDefault() {} })
  await quit.promise
  expect(calls).toEqual([failure, "quit"])
})
