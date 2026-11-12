import type { DashboardState } from "../sdk/loginom"

export const ALLOW =
  "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; " +
  "display-capture 'none'; fullscreen 'none'; payment 'none'; publickey-credentials-get 'none'; " +
  "identity-credentials-get 'none'; usb 'none'; serial 'none'; hid 'none'; bluetooth 'none'"

export function isMessage(data: unknown, type: string) {
  if (typeof data !== "object" || data === null || Array.isArray(data) || Object.keys(data).length !== 2) return false
  const message = data as Record<string, unknown>
  return message.type === type && message.version === 1
}

export function sandboxFrame(src: string) {
  const frame = document.createElement("iframe")
  frame.setAttribute("sandbox", "allow-scripts")
  frame.referrerPolicy = "no-referrer"
  frame.allow = ALLOW
  frame.src = src
  return frame
}

export function mountDashboard(frame: HTMLIFrameElement, handlers: { close(): void; silent(): void }) {
  let port: MessagePort | undefined
  let last: (DashboardState & { type: "state" }) | undefined
  let loads = 0
  let count = 0
  let since = 0
  const timer = setTimeout(() => {
    stop()
    handlers.silent()
  }, 10_000)
  function stop(reason?: string) {
    if (reason) console.warn("Dashboard closed: " + reason)
    clearTimeout(timer)
    removeEventListener("message", listen)
    port?.close()
  }
  const close = (reason?: string) => {
    stop(reason)
    handlers.close()
  }
  function admit() {
    const now = performance.now()
    if (now - since > 1000) {
      since = now
      count = 0
    }
    if (++count > 50) {
      close("message flood")
      return false
    }
    return true
  }
  function listen(event: MessageEvent) {
    if (event.source !== frame.contentWindow || !admit()) return
    if (isMessage(event.data, "loginom-dashboard/close")) return close()
    if (!isMessage(event.data, "loginom-dashboard/ready")) return
    if (port) return close("second ready")
    clearTimeout(timer)
    const channel = new MessageChannel()
    port = channel.port1
    // Consume reverse messages so the port cannot retain an unbounded disabled queue.
    port.onmessage = admit
    frame.contentWindow!.postMessage({ type: "loginom-dashboard/init", version: 1 }, "*", [channel.port2])
    if (last) port.postMessage(last)
  }
  // The first load may come before or after the first ready; any later document is foreign.
  frame.addEventListener("load", () => {
    if (++loads > 1) close("frame navigated")
  })
  addEventListener("message", listen)
  return {
    send(state: DashboardState & { type: "state" }) {
      last = state
      port?.postMessage(state)
    },
    stop,
  }
}
