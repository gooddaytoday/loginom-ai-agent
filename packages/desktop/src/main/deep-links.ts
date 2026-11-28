import type { PendingDeepLinks } from "../preload/types"

// Windows passes loginom-ai-agent://dashboard?… to the app as loginom-ai-agent://dashboard/?…
export const protocolUrls = (argv: string[]) =>
  argv
    .filter((arg) => arg.startsWith("loginom-ai-agent://"))
    .map((url) => url.replace(/^loginom-ai-agent:\/\/dashboard\/\?/, "loginom-ai-agent://dashboard?"))

export function createDeepLinkQueue(argv: string[]) {
  const urls = protocolUrls(argv)
  let startup: PendingDeepLinks = {
    urls,
    coldDashboard: urls.find((url) => url.startsWith("loginom-ai-agent://dashboard?")),
  }
  const pending = new WeakMap<object, PendingDeepLinks>()
  return {
    add(window: object | undefined, urls: string[]) {
      const links = window ? (pending.get(window) ?? { urls: [] }) : startup
      links.urls.push(...urls)
      if (window) pending.set(window, links)
      // The window restored for queued links is a new renderer, as on a cold start.
      if (!window) links.coldDashboard ??= urls.find((url) => url.startsWith("loginom-ai-agent://dashboard?"))
    },
    restore(window: object) {
      pending.set(window, startup)
      startup = { urls: [] }
    },
    take(window: object) {
      const links = pending.get(window) ?? { urls: [] }
      pending.delete(window)
      return links
    },
  }
}
