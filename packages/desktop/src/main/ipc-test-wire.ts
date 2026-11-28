import { EventEmitter } from "node:events"
import type { MessageChannel } from "node:worker_threads"
import type { MessagePortMain, WebContents } from "electron"
import { Predicate } from "effect"
import type { RpcMessage } from "effect/rpc"

// SAFETY: this fixture uses the RPC wire format, not runtime tagged classes.
/* oxlint-disable anti-slop-effect/no-manual-tagged-construction -- see SAFETY above */
export function success<A>(value: A) {
  return { _tag: "Success", value } as const
}

// Speaks the wire format the way src/renderer/ipc-client.ts does: post a request, ack each chunk,
// and settle on the exit. The payload is posted as given so a test can send what omitUndefined drops.
export function call(port: MessageChannel["port2"], id: number, tag: string, payload: RpcMessage.RequestEncoded["payload"]) {
  const chunks: unknown[] = []

  return new Promise<{ chunks: unknown[]; exit: RpcMessage.ResponseExitEncoded["exit"] }>((resolve) => {
    const onMessage = (message: RpcMessage.FromServerEncoded) => {
      if (!("requestId" in message) || Number(message.requestId) !== id) return

      if (Predicate.isTagged(message, "Chunk")) {
        chunks.push(...message.values)
        port.postMessage({ _tag: "Ack", requestId: message.requestId } satisfies RpcMessage.AckEncoded)

        return
      }

      port.off("message", onMessage)
      resolve({ chunks, exit: message.exit })
    }

    port.on("message", onMessage)
    port.postMessage({ _tag: "Request", id, tag, payload, headers: [] })
  })
}

export function sender(id: number) {
  const events = new EventEmitter()

  // SAFETY: the transport reads only a sender's `id` and `isDestroyed`, and its `destroyed` event.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- see SAFETY above
  return {
    id,
    isDestroyed: () => false,
    once: events.once.bind(events),
    off: events.off.bind(events),
  } as unknown as WebContents
}

export function serverPort(port: MessageChannel["port1"]) {
  const listeners = new Map<(event: Electron.MessageEvent) => void, (data: Electron.MessageEvent["data"]) => void>()

  const fake = {
    on(event: string, listener: (event: Electron.MessageEvent) => void) {
      if (event !== "message") {
        port.on(event, listener)

        return
      }

      // SAFETY: the transport reads only the `data` of a message event.
      const wrapped = (data: Electron.MessageEvent["data"]) => listener({ data } as Electron.MessageEvent)
      listeners.set(listener, wrapped)
      port.on("message", wrapped)
    },
    off(event: string, listener: (event: Electron.MessageEvent) => void) {
      if (event !== "message") {
        port.off(event, listener)

        return
      }

      const wrapped = listeners.get(listener)

      if (wrapped) port.off("message", wrapped)
    },
    postMessage: port.postMessage.bind(port),
    start: port.start.bind(port),
    close: port.close.bind(port),
  }

  // SAFETY: the transport uses only these methods of a port.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- see SAFETY above
  return fake as unknown as MessagePortMain
}
