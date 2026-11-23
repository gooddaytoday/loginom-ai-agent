import type { PendingDeepLinks } from "../preload/types"

export const protocolUrls = (argv: string[]) => argv.filter((arg) => arg.startsWith("loginom-ai-agent://"))

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
