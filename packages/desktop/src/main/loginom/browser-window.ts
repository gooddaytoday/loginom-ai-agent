import { once } from "node:events"
import { PlacementStatus, WindowStatus, type WindowBounds } from "@loginom-ai-agent/loginom-host/browser-window"
import { Schema } from "effect"
import type { BrowserWindow } from "electron"
import { SidecarCredentials } from "../service/sidecar-credentials"

type Snapshot = {
  app: WindowBounds
  matching: WindowBounds
  others: readonly WindowBounds[]
  maximized: boolean
  fullscreen: boolean
}

export function layout({ app, matching, others, maximized, fullscreen }: Snapshot, maySplit: boolean) {
  const edge = app.x + app.width
  function fit(area: WindowBounds) {
    const x = Math.max(edge, area.x)
    const available = area.x + area.width - x
    const desired = Math.round(area.width * 0.45)
    if (available < Math.min(480, desired)) return
    return { x, y: area.y, width: Math.min(available, desired), height: area.height }
  }

  for (const area of [
    matching,
    ...others
      .filter(
        (area) =>
          area.x + area.width > matching.x + matching.width &&
          area.y < app.y + app.height &&
          area.y + area.height > app.y,
      )
      .sort((first, second) => first.x - second.x),
  ]) {
    const browser = fit(area)
    if (browser) return { kind: "beside", browser } as const
  }

  if (!maySplit || others.length || matching.width < 2 || (!maximized && !fullscreen)) return
  const left = Math.floor(matching.width / 2)
  return {
    kind: "split",
    app: { ...matching, width: left },
    browser: { ...matching, x: matching.x + left, width: matching.width - left },
  } as const
}

const equal = (first: WindowBounds, second: WindowBounds, tolerance = 0) =>
  Math.abs(first.x - second.x) <= tolerance &&
  Math.abs(first.y - second.y) <= tolerance &&
  Math.abs(first.width - second.width) <= tolerance &&
  Math.abs(first.height - second.height) <= tolerance

type Presentation = {
  window: object
  sessionID: string
  supported: boolean
  snapshot(): Snapshot | undefined
  placeApp(bounds: WindowBounds): Promise<boolean>
  placeBrowser(bounds: WindowBounds): Promise<typeof PlacementStatus.Type>
  showBrowser(): Promise<typeof WindowStatus.Type>
}

export function createWindowPresenter() {
  const shown = new Map<string, "layout-unavailable" | "ready">()
  const presentedWindows = new WeakSet<object>()
  let pending = Promise.resolve()

  async function present(input: Presentation) {
    const before = input.snapshot()
    if (!before) return "no-window"
    const previous = shown.get(input.sessionID)
    let unavailable = previous === "layout-unavailable" || !input.supported
    if (!previous && input.supported) {
      const plan = layout(before, !presentedWindows.has(input.window))
      if (plan) {
        const placed = await input.placeBrowser(plan.browser)
        if (placed === "no-window") return "no-window"
        unavailable = placed !== "placed"
        if (placed === "placed" && plan.kind === "split") {
          const current = input.snapshot()
          unavailable =
            !current ||
            !equal(before.app, current.app) ||
            !equal(before.matching, current.matching) ||
            before.maximized !== current.maximized ||
            before.fullscreen !== current.fullscreen ||
            !(await input.placeApp(plan.app))
        }
      } else {
        unavailable = true
      }
    }
    const status = await input.showBrowser()
    if (status === "no-window") return status
    presentedWindows.add(input.window)
    shown.set(input.sessionID, unavailable ? "layout-unavailable" : "ready")
    return unavailable ? "layout-unavailable" : status
  }

  return (input: Presentation) => {
    const result = pending.then(() => present(input))
    pending = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

const presentWindow = createWindowPresenter()
const decodeReply = Schema.decodeUnknownSync(Schema.Struct({ output: Schema.Unknown }))

async function call(data: SidecarCredentials.Data, method: "place" | "show", input: unknown) {
  const url = new URL(`/api/rpc/loginom.window/${method}`, data.url)
  const authorization = SidecarCredentials.authorization(data, url.href)
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify({ input }),
    redirect: "error",
    signal: AbortSignal.timeout(3500),
  })
  if (!response.ok) {
    await response.body?.cancel()
    return
  }
  return decodeReply(await response.json()).output
}

export async function showLoginomWindow(window: BrowserWindow, sessionID: string) {
  const data = SidecarCredentials.get()
  if (!data) return "no-window"
  const { app, screen } = await import("electron")
  const wayland =
    process.platform === "linux" &&
    (app.commandLine.getSwitchValue("ozone-platform") === "wayland" ||
      (!!process.env.WAYLAND_DISPLAY && (process.env.XDG_SESSION_TYPE === "wayland" || !process.env.DISPLAY)))
  return presentWindow({
    window,
    sessionID,
    supported: !wayland,
    snapshot() {
      if (window.isDestroyed()) return
      const app = window.getBounds()
      const display = screen.getDisplayMatching(app)
      return {
        app,
        matching: display.workArea,
        others: screen
          .getAllDisplays()
          .filter((other) => other.id !== display.id)
          .map((other) => other.workArea),
        maximized: window.isMaximized(),
        fullscreen: window.isFullScreen(),
      }
    },
    async placeApp(bounds) {
      try {
        if (window.isFullScreen()) {
          const left = once(window, "leave-full-screen", { signal: AbortSignal.timeout(2000) })
          window.setFullScreen(false)
          await left
        }
        if (window.isMaximized()) {
          const restored = once(window, "unmaximize", { signal: AbortSignal.timeout(1500) })
          window.unmaximize()
          await restored
        }
        if (window.isDestroyed()) return false
        window.setBounds(bounds)
        return equal(window.getBounds(), bounds, 1)
      } catch {
        return false
      }
    },
    placeBrowser: (bounds) =>
      call(data, "place", { sessionID, bounds }).then(
        (result) => (Schema.is(PlacementStatus)(result) ? result : "layout-unavailable"),
        () => "layout-unavailable",
      ),
    showBrowser: () =>
      call(data, "show", { sessionID }).then(
        (result) => (Schema.is(WindowStatus)(result) ? result : "no-window"),
        () => "no-window",
      ),
  })
}
