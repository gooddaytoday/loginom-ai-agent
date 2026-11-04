import { Product } from "@loginom-ai-agent/product"
import { verify } from "node:crypto"
import { parseUpdateInfo } from "electron-updater/out/providers/Provider"
import type { UpdateInfo } from "electron-updater"
import type { AppUpdater } from "electron-updater/out/AppUpdater"
import type { ProxyConfig } from "electron"

export type UpdateChannel = "stable" | "unstable"
export type UpdateAdminPolicy = { updates?: "on" | "off"; channel?: UpdateChannel; feedUrl?: string }

export const updatePublicKeys = [
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAekkV+yIMJpDlzXoJAWpT9ifgHKbKe5PJdtGC8FjmJ2c=\n-----END PUBLIC KEY-----",
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAuVor7DX+ReBZ+tg8gXaygsXqxF+WKA9dijYEIDNHTtc=\n-----END PUBLIC KEY-----",
] as const

export function updateSettings(feed: string | null, preference: unknown, policy: UpdateAdminPolicy = {}) {
  const channel = policy.channel ?? (preference === "unstable" ? "unstable" : "stable")
  const base = policy.feedUrl ?? feed
  const url = base ? new URL(base.endsWith("/") ? base : base + "/") : undefined
  if (url && (url.protocol !== "https:" || url.username || url.password || url.search || url.hash))
    throw Error("LOGINOM_UPDATE_FEED_INVALID")
  return {
    enabled: policy.updates !== "off" && Boolean(url),
    channel,
    feed: url ? new URL(channel + "/", url).href : undefined,
    managed: Object.keys(policy).length > 0,
    channelLocked: policy.channel !== undefined || policy.updates === "off",
  }
}

export function parseUpdateAdminPolicy(value: unknown): UpdateAdminPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("LOGINOM_UPDATE_POLICY_INVALID")
  const policy = value as UpdateAdminPolicy
  if (
    (policy.updates !== undefined && !["on", "off"].includes(policy.updates)) ||
    (policy.channel !== undefined && !["stable", "unstable"].includes(policy.channel)) ||
    (policy.feedUrl !== undefined && typeof policy.feedUrl !== "string")
  )
    throw Error("LOGINOM_UPDATE_POLICY_INVALID")
  const result = { ...policy }
  updateSettings(null, "stable", result)
  return result
}

export function updatePolicyPath(platform: NodeJS.Platform, programData = "C:\\ProgramData") {
  if (platform === "win32") return programData.replace(/[\\/]$/, "") + "\\Loginom AI Agent\\policy.json"
  if (platform === "darwin") return "/Library/Application Support/Loginom AI Agent/policy.json"
  return "/etc/loginom-ai-agent/policy.json"
}

export function updateMode(platform: NodeJS.Platform, appImage?: string) {
  return platform === "win32" || (platform === "linux" && Boolean(appImage)) ? "automatic" : "notify"
}

export function configureUpdateFeed(updater: Pick<AppUpdater, "setFeedURL" | "allowDowngrade">, feed?: string) {
  // GenericProvider uses latest[-mac|-linux]; folder selection carries the channel.
  // Do not call the AppUpdater.channel setter, which enables downgrades in 6.8.9.
  if (feed) updater.setFeedURL({ provider: "generic", url: feed, channel: "latest" })
  updater.allowDowngrade = false
}

export function updateProxyOptions(environment: NodeJS.ProcessEnv, useSystem: boolean) {
  const all = environment.ALL_PROXY || environment.all_proxy
  const entries = [
    ["http", environment.HTTP_PROXY || environment.http_proxy || all],
    [
      "https",
      environment.HTTPS_PROXY || environment.https_proxy || environment.HTTP_PROXY || environment.http_proxy || all,
    ],
  ].flatMap(([scheme, value]) => {
    if (!value?.trim()) return []
    const url = new URL(value.trim())
    if (!["http:", "https:", "socks4:", "socks5:"].includes(url.protocol)) throw Error("LOGINOM_UPDATE_PROXY_INVALID")
    return [{ scheme, url }]
  })
  const config: ProxyConfig = entries.length
    ? {
        mode: "fixed_servers",
        proxyRules: entries.map(({ scheme, url }) => `${scheme}=${url.protocol}//${url.host}`).join(";"),
        proxyBypassRules: (environment.NO_PROXY || environment.no_proxy || "localhost,127.0.0.1,::1").replaceAll(
          ",",
          ";",
        ),
      }
    : { mode: useSystem ? "system" : "direct" }
  return {
    config,
    credentials: entries
      .filter(({ url }) => url.username || url.password)
      .map(({ url }) => ({
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port: Number(url.port || (url.protocol === "https:" ? 443 : url.protocol.startsWith("socks") ? 1080 : 80)),
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      })),
  }
}

export function compareUpdateVersions(left: string, right: string) {
  if (![left, right].every((version) => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)))
    throw Error("LOGINOM_UPDATE_VERSION_INVALID")
  const a = left.split(".").map(Number)
  const b = right.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1
  }
  return 0
}

export type SignedUpdateInfo = UpdateInfo & { minSupportedVersion: string; stagingPercentage?: number }

// Verify the exact response bytes before YAML parsing; either pinned key may sign a release.
export function verifyUpdateManifest(
  raw: Buffer,
  signature: string,
  feed: string,
  keys: readonly string[] = updatePublicKeys,
): SignedUpdateInfo {
  const encoded = signature.trim()
  if (
    !/^[A-Za-z0-9+/]{86}==$/.test(encoded) ||
    !keys.some((key) => verify(null, raw, key, Buffer.from(encoded, "base64")))
  )
    throw Error("LOGINOM_UPDATE_SIGNATURE_INVALID")
  const info = parseUpdateInfo(raw.toString("utf8"), "latest.yml", new URL(feed)) as SignedUpdateInfo
  compareUpdateVersions(info.version, info.minSupportedVersion)
  if (
    info.stagingPercentage !== undefined &&
    (!Number.isFinite(info.stagingPercentage) || info.stagingPercentage < 0 || info.stagingPercentage > 100)
  )
    throw Error("LOGINOM_UPDATE_STAGING_INVALID")
  // Preserve all existing origin, product filename and SHA-512 checks.
  validateUpdate(info, feed, "prod")
  const paths = [info.path, ...info.files.map((file) => file.url)]
  if (
    paths.some(
      (path) =>
        typeof path !== "string" ||
        !path.startsWith(info.version + "/") ||
        path.slice(info.version.length + 1).includes("/") ||
        path.includes("\\") ||
        path.includes("%") ||
        path.includes("?") ||
        path.includes("#"),
    )
  )
    throw Error("LOGINOM_UPDATE_TARGET_INVALID")
  if (info.sha512 !== undefined && !info.files.some((file) => file.url === info.path && file.sha512 === info.sha512))
    throw Error("LOGINOM_UPDATE_TARGET_INVALID")
  // NSIS web packages are outside this signed feed contract.
  if ("packages" in info) throw Error("LOGINOM_UPDATE_TARGET_INVALID")
  return info
}

export function matchUpdateManifest(signed: SignedUpdateInfo, info: UpdateInfo) {
  if (
    "packages" in info ||
    JSON.stringify([
      signed.version,
      signed.path,
      signed.sha512,
      signed.files,
      signed.minSupportedVersion,
      signed.stagingPercentage,
    ]) !==
      JSON.stringify([
        info.version,
        info.path,
        info.sha512,
        info.files,
        (info as SignedUpdateInfo).minSupportedVersion,
        info.stagingPercentage,
      ])
  )
    throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")
}

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
