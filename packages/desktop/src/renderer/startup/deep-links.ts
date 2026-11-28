import { deliverBuiltinDeepLink } from "@opencode/plugin/gui/builtin"
import { Predicate } from "effect"
import type { ElectronAPI } from "../api-types"

const deepLinkEvent = "opencode:deep-link"

// Main sends each link to one renderer at a time and forgets it once acknowledged, so a reload or a new window
// never handles it again.
export function startDeepLinks(api: Pick<ElectronAPI, "onDeepLink" | "readyDeepLinks" | "acknowledgeDeepLinks">) {
  api.onDeepLink((delivery) => {
    emitDeepLinks(delivery.urls.filter(Predicate.isString))

    for (const payload of delivery.urls) {
      if (!Predicate.isString(payload)) deliverBuiltinDeepLink(payload)
    }

    api.acknowledgeDeepLinks(delivery.attempt)
  })

  api.readyDeepLinks()
}

function emitDeepLinks(urls: string[]) {
  if (urls.length === 0) return

  window.__OPENCODE__ ??= {}
  window.__OPENCODE__.deepLinks = [...(window.__OPENCODE__.deepLinks ?? []), ...urls]
  window.dispatchEvent(new CustomEvent(deepLinkEvent, { detail: { urls } }))
}
