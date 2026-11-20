import { connectFrame, isMessage, isTwoFieldMessage, sandboxFrame } from "./frame"

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
        if (isTwoFieldMessage(data) && data.type === "probe" && typeof data.ok === "boolean") done(data.ok)
      }
    }
    addEventListener("message", listen)
    container.append(frame)
  })
}
