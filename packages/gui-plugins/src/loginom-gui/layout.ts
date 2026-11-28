import type { Rectangle } from "electron"

type Display = { id: number; workArea: Rectangle; scaleFactor: number }

export type Snapshot = {
  app: Rectangle
  display: Display
  others: readonly Display[]
  maximized: boolean
  fullscreen: boolean
  minimumWidth: number
}

export function layout(snapshot: Snapshot, mode: "startup" | "show") {
  const { app, display, others, maximized, fullscreen, minimumWidth } = snapshot
  const area = display.workArea
  const edge = app.x + app.width

  const right = others
    .filter(
      ({ workArea }) =>
        workArea.x >= area.x + area.width && workArea.y < app.y + app.height && workArea.y + workArea.height > app.y,
    )
    .sort((first, second) => first.workArea.x - second.workArea.x)

  for (const target of [...right, display]) {
    const available = target.workArea.x + target.workArea.width - Math.max(edge, target.workArea.x)
    const desired = Math.round(target.workArea.width * 0.45)

    if (available < Math.min(480, desired) || desired < 1) continue

    return {
      kind: "beside",
      target,
      browser: { ...target.workArea, x: Math.max(edge, target.workArea.x), width: Math.min(available, desired) },
    } as const
  }

  if (mode === "startup") {
    const width = Math.max(1, Math.round(area.width * 0.45))

    return { kind: "overlay", target: display, browser: { ...area, x: area.x + area.width - width, width } } as const
  }

  const width = Math.floor(area.width / 2)

  if (others.length || (!maximized && !fullscreen) || width < Math.max(minimumWidth, 1)) return

  return {
    kind: "split",
    target: display,
    app: { ...area, width },
    browser: { ...area, x: area.x + width, width: area.width - width },
  } as const
}

export function chromiumBounds(
  bounds: Rectangle,
  target: Display,
  platform: NodeJS.Platform,
  dipToScreen: (bounds: Rectangle) => Rectangle,
) {
  if (platform === "win32") return dipToScreen(bounds)

  if (platform !== "linux") return bounds
  const scale = target.scaleFactor

  return {
    x: Math.round(bounds.x * scale),
    y: Math.round(bounds.y * scale),
    width: Math.round((bounds.x + bounds.width) * scale) - Math.round(bounds.x * scale),
    height: Math.round((bounds.y + bounds.height) * scale) - Math.round(bounds.y * scale),
  }
}

export function equal(first: Rectangle, second: Rectangle, tolerance = 0) {
  return (
    Math.abs(first.x - second.x) <= tolerance &&
    Math.abs(first.y - second.y) <= tolerance &&
    Math.abs(first.width - second.width) <= tolerance &&
    Math.abs(first.height - second.height) <= tolerance
  )
}
