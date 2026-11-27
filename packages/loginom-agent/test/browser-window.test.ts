import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { windowHandlers } from "../src/browser-window"
import { ServiceHost } from "../src/host"

test("window RPC forwards the conversation and preserves distinct outcomes", async () => {
  const data = await mkdtemp(join(tmpdir(), "loginom-window-test-"))
  const calls: unknown[] = []
  const service = await ServiceHost.start({
    data,
    connect: async () => ({
      port: { postMessage() {}, on() {}, start() {} },
      async close() {},
      async request(method, input) {
        calls.push({ method, input })
        if (method === "window.place") return true
        return "focus-unconfirmed"
      },
    }),
  })
  const chat = { sessionID: "ses_other" }
  const placement = { sessionID: "ses_current", bounds: { x: 1280, y: -100, width: 720, height: 900 } }
  try {
    expect(await windowHandlers.place(placement)).toBe(true)
    expect(await windowHandlers.show(chat)).toBe("focus-unconfirmed")
    expect(calls).toEqual([
      { method: "window.place", input: placement },
      { method: "window.show", input: chat },
    ])
  } finally {
    await service.close()
    await rm(data, { recursive: true, force: true })
  }
  expect(await windowHandlers.show(chat)).toBe("no-window")
})
