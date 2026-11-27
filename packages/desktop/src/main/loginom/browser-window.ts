import type { WindowBounds } from "@loginom-ai-agent/loginom-host/browser-window"
import type { OnBeforeSendHeadersListenerDetails } from "electron"
import { SidecarCredentials } from "../service/sidecar-credentials"

export function beside(app: WindowBounds, matching: WindowBounds, others: readonly WindowBounds[]): WindowBounds {
  const edge = app.x + app.width
  function fit(area: WindowBounds) {
    const x = Math.max(edge, area.x)
    const available = area.x + area.width - x
    const desired = Math.round(area.width * 0.45)
    if (available < Math.min(480, desired)) return
    return { x, y: area.y, width: Math.min(available, desired), height: area.height }
  }
  const same = fit(matching)
  if (same) return same

  const right = others
    .filter(
      (area) => area.x >= matching.x + matching.width && area.y < app.y + app.height && area.y + area.height > app.y,
    )
    .sort((first, second) => first.x - second.x)
  for (const area of right) {
    const bounds = fit(area)
    if (bounds) return bounds
  }

  const width = Math.max(1, Math.round(matching.width * 0.45))
  return { x: matching.x + matching.width - width, y: matching.y, width, height: matching.height }
}

export function placeForPrompt(data: SidecarCredentials.Data | undefined, details: OnBeforeSendHeadersListenerDetails) {
  if (!data || details.method !== "POST" || !details.webContents) return
  const url = new URL(details.url)
  if (url.origin !== data.url) return
  const prompt = /^\/api\/session\/(ses[\w-]{1,253})\/prompt$/.exec(url.pathname)
  if (!prompt) return

  const contents = details.webContents
  return import("electron").then(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.fromWebContents(contents)
    if (!window || window.isDestroyed()) return
    const bounds = window.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const others = screen
      .getAllDisplays()
      .filter((other) => other.id !== display.id)
      .map((other) => other.workArea)
    return sendPlacement(data, prompt[1], beside(bounds, display.workArea, others))
  })
}

export async function sendPlacement(data: SidecarCredentials.Data, sessionID: string, bounds: WindowBounds) {
  const url = new URL("/api/rpc/loginom.window/place", data.url)
  const authorization = SidecarCredentials.authorization(data, url.href)
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify({ input: { sessionID, bounds } }),
    redirect: "error",
    signal: AbortSignal.timeout(1500),
  })
  await response.body?.cancel()
}
