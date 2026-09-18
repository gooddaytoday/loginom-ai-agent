import { EventEmitter } from "node:events"
import type { Port } from "@loginom-ai-agent/loginom-host/transport"

export function workerLoginomBridge(send: (data: unknown) => void) {
  const events = new EventEmitter()
  const state = { closed: false }
  const port: Port = {
    postMessage(data) {
      if (state.closed) throw new Error("LOGINOM_HOST_CLOSED")
      send(data)
    },
    on: (event, listener) => {
      events.on(event, listener)
    },
    onClose(listener) {
      if (state.closed) {
        listener()
        return
      }
      events.on("close", listener)
    },
    start() {},
  }
  return {
    port,
    receive(input: { data?: unknown; closed?: boolean }) {
      if (state.closed) return
      if (input.closed) {
        state.closed = true
        events.emit("close")
        return
      }
      events.emit("message", { data: input.data })
    },
  }
}

export function parentLoginomBridge(
  port: Port,
  worker: {
    send(input: { data?: unknown; closed?: boolean }): Promise<unknown>
    subscribe(listener: (data: unknown) => void): () => void
  },
) {
  const state = { closed: false }
  const unsubscribe = worker.subscribe((data) => {
    if (state.closed) return
    try {
      port.postMessage(data)
    } catch {
      close()
    }
  })
  function close() {
    if (state.closed) return
    state.closed = true
    unsubscribe()
    void worker.send({ closed: true }).catch(() => {})
  }
  port.on("message", ({ data }) => {
    if (!state.closed) void worker.send({ data }).catch(close)
  })
  port.onClose?.(close)
  return { close }
}
