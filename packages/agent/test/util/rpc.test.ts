import { expect, test } from "bun:test"
import { Rpc } from "../../src/util/rpc"
import type { rpc } from "./fixtures/rpc-worker"
import { EventEmitter } from "node:events"
import { parentLoginomBridge } from "../../src/cli/tui/loginom-bridge"

test("worker RPC reports bounded failures and explicit disconnect rejects pending requests", async () => {
  const worker = new Worker(new URL("./fixtures/rpc-worker.ts", import.meta.url))
  const client = Rpc.client<typeof rpc>(worker)
  try {
    expect(await client.call("echo", "hello")).toBe("hello")
    await expect(client.call("fail", undefined)).rejects.toThrow("RPC_REQUEST_FAILED")
    const pending = client.call("wait", undefined)
    client.close()
    await expect(pending).rejects.toThrow("RPC_CLOSED")
    await expect(client.call("echo", "late")).rejects.toThrow("RPC_CLOSED")
  } finally {
    client.close()
    await worker.terminate()
  }
})

test("Loginom worker bridge round-trips requests and propagates host disconnect explicitly", async () => {
  const worker = new Worker(new URL("./fixtures/rpc-worker.ts", import.meta.url))
  const client = Rpc.client<typeof rpc>(worker)
  const events = new EventEmitter()
  const bridge = parentLoginomBridge(
    {
      postMessage(data) {
        if (!data || typeof data !== "object" || !("id" in data) || !("input" in data)) throw new Error("Invalid frame")
        if (data.input === "hold") {
          events.emit("close")
          return
        }
        events.emit("message", { data: { id: data.id, result: data.input } })
      },
      on: (event, listener) => {
        events.on(event, listener)
      },
      onClose: (listener) => {
        events.on("close", listener)
      },
      start() {},
    },
    {
      send: (input) => client.call("loginomReply", input),
      subscribe: (listener) => client.on("loginom.request", listener),
    },
  )
  try {
    expect(await client.call("hostRequest", "hello")).toBe("hello")
    expect(await client.call("hostRequest", "hold")).toBe("LOGINOM_HOST_CLOSED")
    expect(await client.call("hostRequest", "late")).toBe("LOGINOM_HOST_CLOSED")
  } finally {
    bridge.close()
    client.close()
    await worker.terminate()
  }
})
