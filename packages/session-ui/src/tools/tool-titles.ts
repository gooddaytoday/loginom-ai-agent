// Titles and placement for tools registered by the product (group labels, error cards, grouping). Kept apart from
// tool-renderer so tool-error-card and timeline/projection can read it without importing the renderer.
// Registration bumps a signal, so a plugin that registers after the first render still repaints open sessions.
import { createSignal } from "solid-js"

const titles = new Map<string, () => string>()

const separate = new Set<string>()

const [revision, setRevision] = createSignal(0)

export const toolRevision = revision

export function markToolsChanged() {
  setRevision((value) => value + 1)
}

export function setToolTitle(name: string, title: () => string) {
  titles.set(name, title)
}

export function toolTitleFor(name: string) {
  revision()

  return titles.get(name)?.()
}

/** A separate tool is never folded into a tool group; presets that hide tools still hide it. */
export function setToolSeparate(name: string) {
  separate.add(name)
}

export function toolSeparate(name: string) {
  revision()

  return separate.has(name)
}
