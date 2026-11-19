import { connectFrame, isMessage, sandboxFrame } from "./frame"

export function probe(appOrigin: string, container: HTMLElement) {
  return new Promise<boolean | null>((resolve) => {
    const frame = sandboxFrame(appOrigin + "/_probe/")
    frame.hidden = true
    let port: MessagePort | undefined
    const done = (result: boolean | null) => {
      clearTimeout(timer)
      removeEventListener("message", listen)
      port?.close()
      frame.remove()
      resolve(result)
    }
    const timer = setTimeout(() => done(null), 5_000)
    function listen(event: MessageEvent) {
      if (event.source !== frame.contentWindow || !isMessage(event.data, "loginom-dashboard/ready")) return
      removeEventListener("message", listen)
      port = connectFrame(frame)
      port.onmessage = (answer) => {
        const data: unknown = answer.data
        if (typeof data !== "object" || data === null || Array.isArray(data) || Object.keys(data).length !== 2) return
        const reply = data as Record<string, unknown>
        if (reply.type === "probe" && typeof reply.ok === "boolean") done(reply.ok)
      }
    }
    addEventListener("message", listen)
    container.append(frame)
  })
}
