import { Product } from "@loginom-ai-agent/product"

/**
 * Loginom AI Agent (B4.12, UPDATE-01): whether an update the product feed offers is a build of this product, as 0.4's
 * `validateUpdate` checked. Every file must lie under the feed and be named after the product (`Product.artifactName`),
 * so a feed that lists an OpenCode build (`opencode-desktop-*`) or a file on another host is never installed.
 */
export function isProductBuild(files: readonly { readonly url: string }[], feed: string) {
  const base = new URL(feed.endsWith("/") ? feed : `${feed}/`)

  return (
    files.length > 0 &&
    files.every((file) => {
      if (!URL.canParse(file.url, base)) return false
      const url = new URL(file.url, base)
      const name = url.pathname.slice(url.pathname.lastIndexOf("/") + 1)

      return url.origin === base.origin && url.pathname.startsWith(base.pathname) && name.startsWith(`${Product.slug}-`)
    })
  )
}
