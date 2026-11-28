import { randomUUID } from "node:crypto"
import { hostException } from "./errors"

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
    {
      resolve(value: unknown): void
      reject(error: Error): void
      cleanup(): void
      observe?(value: unknown): void
      progress?(value: unknown): void
    }
  >()
  function close() {
    state.closed = true
    pending.forEach((request) => {
      request.cleanup()
      request.reject(new Error("LOGINOM_HOST_CLOSED"))
    })
    pending.clear()
  }
  port.onClose?.(close)
  port.on("message", ({ data }) => {
    if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") return
    const request = pending.get(data.id)
    if (!request) return
    if ("progress" in data) {
      request.progress?.(data.progress)
      return
    }
    pending.delete(data.id)
    request.cleanup()
    request.observe?.(data)
    if ("error" in data) {
      request.reject(hostException(data))
      return
    }
    request.resolve("result" in data ? data.result : undefined)
  })
  port.start()
  return {
    request(
      method: string,
      input: unknown,
      timeout = 180_000,
      observe?: (value: unknown) => void,
      signal?: AbortSignal,
      progress?: (value: unknown) => void,
    ) {
      if (state.closed) return Promise.reject(new Error("LOGINOM_HOST_CLOSED"))
      if (signal?.aborted) return Promise.reject(signal.reason)
      const id = randomUUID()
      return new Promise<unknown>((resolve, reject) => {
        const abort = () => cancel(signal?.reason)
        const timer = setTimeout(() => cancel(new Error("LOGINOM_HOST_TIMEOUT")), timeout)
        const cleanup = () => {
          clearTimeout(timer)
          signal?.removeEventListener("abort", abort)
        }
        function cancel(reason: unknown) {
          if (!pending.delete(id)) return
          cleanup()
          reject(reason)
          if (!signal) return
          try {
            port.postMessage({ cancel: id })
          } catch {
            close()
          }
        }
        pending.set(id, { resolve, reject, cleanup, observe, progress })
        signal?.addEventListener("abort", abort, { once: true })
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
