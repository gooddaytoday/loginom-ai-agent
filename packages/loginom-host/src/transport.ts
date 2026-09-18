import { randomUUID } from "node:crypto"
import { hostError } from "./errors"

export type Port = {
  postMessage(value: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
  start(): void
  onClose?(listener: () => void): void
}
export function transport(port: Port) {
  const state = { closed: false }
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >()
  function close() {
    state.closed = true
    pending.forEach((request) => {
      clearTimeout(request.timer)
      request.reject(new Error("LOGINOM_HOST_CLOSED"))
    })
    pending.clear()
  }
  port.onClose?.(close)
  port.on("message", ({ data }) => {
    if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") return
    const request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id)
    clearTimeout(request.timer)
    if ("error" in data) {
      request.reject(new Error(hostError(data.error)))
      return
    }
    request.resolve("result" in data ? data.result : undefined)
  })
  port.start()
  return {
    request(method: string, input: unknown, timeout = 180_000) {
      if (state.closed) return Promise.reject(new Error("LOGINOM_HOST_CLOSED"))
      const id = randomUUID()
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error("LOGINOM_HOST_TIMEOUT"))
        }, timeout)
        pending.set(id, { resolve, reject, timer })
        try {
          port.postMessage({ id, method, input })
        } catch {
          close()
        }
      })
    },
    close,
  }
}
