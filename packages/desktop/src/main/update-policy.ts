import { Product } from "@loginom-ai-agent/product"

export function validateUpdate(
  info: { version: string; files: { url: string; sha512: string }[] },
  feed: string,
  channel: "prod" | "beta" | "dev",
) {
  const base = new URL(feed.endsWith("/") ? feed : feed + "/")
  if (channel === "dev" || !/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(info.version))
    throw Error("LOGINOM_UPDATE_CHANNEL_INVALID")
  if (info.version.includes("-beta.") !== (channel === "beta")) throw Error("LOGINOM_UPDATE_CHANNEL_INVALID")
  if (!info.files.length) throw Error("LOGINOM_UPDATE_FILES_MISSING")
  for (const file of info.files) {
    const url = new URL(file.url, base)
    const name = decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf("/") + 1))
    if (
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname) ||
      url.username ||
      url.password ||
      !name.startsWith(Product.slug + "-") ||
      !/^[A-Za-z0-9._-]+$/.test(name) ||
      !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)
    )
      throw Error("LOGINOM_UPDATE_TARGET_INVALID")
  }
}
