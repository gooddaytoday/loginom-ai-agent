export type UpdateChannel = "stable" | "unstable"
export type UpdateAdminPolicy = { updates?: "on" | "off"; channel?: UpdateChannel; feedUrl?: string }

export function parseUpdateFeed(value: string) {
  const url = new URL(value.endsWith("/") ? value : value + "/")
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw Error("LOGINOM_UPDATE_FEED_INVALID")
  return url
}

export function parseUpdateAdminPolicy(value: unknown): UpdateAdminPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("LOGINOM_UPDATE_POLICY_INVALID")
  const updates = "updates" in value ? value.updates : undefined
  const channel = "channel" in value ? value.channel : undefined
  const feedUrl = "feedUrl" in value ? value.feedUrl : undefined
  if (
    (updates !== undefined && updates !== "on" && updates !== "off") ||
    (channel !== undefined && channel !== "stable" && channel !== "unstable") ||
    (feedUrl !== undefined && (typeof feedUrl !== "string" || !feedUrl.trim()))
  )
    throw Error("LOGINOM_UPDATE_POLICY_INVALID")
  if (feedUrl !== undefined) parseUpdateFeed(feedUrl)
  return { updates, channel, feedUrl }
}
