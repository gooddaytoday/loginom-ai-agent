import type { Display, Rectangle } from "electron"

type WorkDisplay = Pick<Display, "id" | "bounds" | "workArea" | "scaleFactor">

export function windowLayout(current: WorkDisplay, displays: readonly WorkDisplay[], minimumWidth = 0) {
  const right = current.bounds.x + current.bounds.width
  const next = displays
    .filter(
      (display) =>
        display.id !== current.id &&
        display.bounds.x >= right &&
        display.bounds.y < current.bounds.y + current.bounds.height &&
        display.bounds.y + display.bounds.height > current.bounds.y,
    )
    .sort(
      (a, b) =>
        a.bounds.x - b.bounds.x || Math.abs(a.bounds.y - current.bounds.y) - Math.abs(b.bounds.y - current.bounds.y),
    )[0]
  // Electron and unforced Chromium both use global DIP, including on a mixed-DPI desktop.
  if (next) return { loginom: next.workArea }

  const area = current.workArea
  const width = Math.max(Math.floor(area.width / 2), minimumWidth)
  const app: Rectangle = { ...area, width }
  const loginom: Rectangle = { ...area, x: area.x + width, width: area.width - width }
  return { app, loginom }
}
