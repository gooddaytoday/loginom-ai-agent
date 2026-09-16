import { randomUUID } from "node:crypto"

export type Port = {
  postMessage(value: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
  start(): void
}
export function transport(port: Port) {
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >()
  port.on("message", ({ data }) => {
    if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") return
    const request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id)
    clearTimeout(request.timer)
    if ("error" in data) {
      request.reject(new Error("LOGINOM_HOST_REQUEST_FAILED"))
      return
    }
    request.resolve("result" in data ? data.result : undefined)
  })
  port.start()
  return {
    request(method: string, input: unknown, timeout = 180_000) {
      const id = randomUUID()
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error("LOGINOM_HOST_TIMEOUT"))
        }, timeout)
        pending.set(id, { resolve, reject, timer })
        port.postMessage({ id, method, input })
      })
    },
    close() {
      pending.forEach((request) => {
        clearTimeout(request.timer)
        request.reject(new Error("LOGINOM_HOST_CLOSED"))
      })
      pending.clear()
    },
  }
}
