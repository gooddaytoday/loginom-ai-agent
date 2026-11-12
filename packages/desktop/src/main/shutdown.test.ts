import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { closeWindows, createQuitHandler } from "./shutdown"

test("quit destroys an unresponsive window before stopping the backend", async () => {
  const calls: string[] = []
  const quit = Promise.withResolvers<void>()
  const win = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    close: () => {
      calls.push("close")
    },
    // Do not emit closed: forced cleanup must finish even without that event.
    destroy: () => {
      calls.push("destroy")
    },
  })
  const handler = createQuitHandler({
    markQuitting() {},
    closeWindows: () => closeWindows([win]),
    stop: async () => {
      calls.push("stop")
    },
    quit: () => {
      calls.push("quit")
      quit.resolve()
    },
    onError: (error) => {
      throw error
    },
  })
  handler({ preventDefault() {} })
  await quit.promise
  expect(calls).toEqual(["close", "destroy", "stop", "quit"])
  expect(win.listenerCount("closed")).toBe(0)
})

test("responsive windows close immediately without being destroyed", async () => {
  const calls: string[] = []
  const win = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    close: () => {
      calls.push("close")
      win.emit("closed")
    },
    destroy: () => {
      calls.push("destroy")
    },
  })
  await closeWindows([win])
  expect(calls).toEqual(["close"])
  expect(win.listenerCount("closed")).toBe(0)
})

test("already destroyed windows do not delay quit", async () => {
  const calls: string[] = []
  const win = Object.assign(new EventEmitter(), {
    isDestroyed: () => true,
    close: () => {
      calls.push("close")
    },
    destroy: () => {
      calls.push("destroy")
    },
  })
  await closeWindows([win])
  expect(calls).toEqual([])
  expect(win.listenerCount("closed")).toBe(0)
})

test("quit waits for cleanup, coalesces repeated requests and admits the final quit", async () => {
  const calls: string[] = []
  const cleanup = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const quit = Promise.withResolvers<void>()
  const handler = createQuitHandler({
    markQuitting: () => {
      calls.push("mark")
    },
    closeWindows: async () => {
      calls.push("close")
    },
    stop: async () => {
      calls.push("stop")
      started.resolve()
      await cleanup.promise
      calls.push("stopped")
    },
    quit: () => {
      calls.push("quit")
      quit.resolve()
    },
    onError: () => {
      calls.push("error")
    },
  })
  const event = {
    preventDefault: () => {
      calls.push("prevent")
    },
  }
  handler(event)
  handler(event)
  await started.promise
  expect(calls).toEqual(["mark", "prevent", "mark", "prevent", "close", "stop"])
  cleanup.resolve()
  await quit.promise
  handler(event)
  expect(calls).toEqual(["mark", "prevent", "mark", "prevent", "close", "stop", "stopped", "quit", "mark"])
})

test("cleanup failure is reported before the final quit", async () => {
  const calls: unknown[] = []
  const failure = new Error("cleanup failed")
  const quit = Promise.withResolvers<void>()
  createQuitHandler({
    markQuitting() {},
    closeWindows: async () => {},
    stop: async () => {
      throw failure
    },
    quit: () => {
      calls.push("quit")
      quit.resolve()
    },
    onError: (error) => {
      calls.push(error)
    },
  })({ preventDefault() {} })
  await quit.promise
  expect(calls).toEqual([failure, "quit"])
})

test("quit flushes drafts and closes renderers before stopping their backend", async () => {
  const calls: string[] = []
  const app = new EventEmitter()
  const closed = Promise.withResolvers<void>()
  const quit = Promise.withResolvers<void>()
  app.on(
    "before-quit",
    createQuitHandler({
      markQuitting: () => {
        calls.push("mark")
      },
      closeWindows: async () => {
        calls.push("close")
        await closed.promise
        calls.push("closed")
      },
      stop: async () => {
        calls.push("stop")
      },
      quit: () => {
        calls.push("quit")
        quit.resolve()
      },
      onError: (error) => {
        throw error
      },
    }),
  )
  // Registered after the quit handler, just like registerIpcHandlers in main.
  app.on("before-quit", () => {
    calls.push("drafts.flush")
  })
  const event = {
    preventDefault: () => {
      calls.push("prevent")
    },
  }
  app.emit("before-quit", event)
  expect(calls).toEqual(["mark", "prevent", "drafts.flush"])
  await Promise.resolve()
  expect(calls).toEqual(["mark", "prevent", "drafts.flush", "close"])
  // Closing the last window on Windows requests quit again. It must not stop
  // the backend while another renderer is still closing.
  app.emit("before-quit", event)
  closed.resolve()
  await quit.promise
  expect(calls).toEqual([
    "mark",
    "prevent",
    "drafts.flush",
    "close",
    "mark",
    "prevent",
    "drafts.flush",
    "closed",
    "stop",
    "quit",
  ])
})
