import { Product } from "@loginom-ai-agent/product"
import {
  UPDATE_PUBLIC_KEYS,
  verifyUpdateSignature,
  presignUpdateGet,
  type UpdateS3Config,
} from "@loginom-ai-agent/product/update-signature"
import { parseUpdateInfo } from "electron-updater/out/providers/Provider.js"
import { resolveFiles } from "electron-updater/out/providers/Provider.js"
import { GenericProvider } from "electron-updater/out/providers/GenericProvider.js"
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider.js"
import type { EventEmitter } from "node:events"
import type { UpdateInfo } from "electron-updater"
import type { AppUpdater } from "electron-updater/out/AppUpdater"
import type { ProxyConfig } from "electron"

export type UpdateChannel = "stable" | "unstable"
export type UpdateAdminPolicy = { updates?: "on" | "off"; channel?: UpdateChannel; feedUrl?: string }

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

export type UpdateSource =
  | { kind: "github"; api: string; download: string; channel: UpdateChannel }
  | { kind: "generic"; feed: string }
  | { kind: "s3"; feed: string; config: UpdateS3Config | null }

export function updateSources(
  feed: string | null,
  github: { api: string; download: string } | null,
  preference: unknown,
  policy: UpdateAdminPolicy = {},
  s3?: UpdateS3Config | null,
) {
  const builtIn = feed || (github && s3 ? new URL(presignUpdateGet(s3, "probe")).origin + "/" : null)
  const settings = updateSettings(builtIn, preference, policy)
  const clean = (value: string) => {
    const url = new URL(value.endsWith("/") ? value : value + "/")
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw Error("LOGINOM_UPDATE_FEED_INVALID")
    return url.href
  }
  const sources: UpdateSource[] = [
    ...(github && policy.feedUrl === undefined
      ? [
          {
            kind: "github" as const,
            api: clean(github.api),
            download: clean(github.download),
            channel: settings.channel,
          },
        ]
      : []),
    ...(settings.feed
      ? [
          policy.feedUrl !== undefined || s3 === undefined
            ? { kind: "generic" as const, feed: settings.feed }
            : { kind: "s3" as const, feed: settings.feed, config: s3 },
        ]
      : []),
  ]
  return { ...settings, enabled: policy.updates !== "off" && sources.length > 0, sources }
}

// Only transport failures carry this type. Parsing, signature, TLS trust and
// target validation errors must never select another source.
export class UpdateTransportError extends Error {}

export function isUpdateTransportError(error: unknown) {
  if (error instanceof UpdateTransportError) return true
  if (!(error instanceof Error)) return false
  const failure = error as Error & { code?: string; statusCode?: number }
  // builder-util-runtime 9.7.0 download errors are plain Errors (unlike
  // metadata HttpError). Match only its exact status/timeout message shapes.
  if (failure.message === "Request timed out") return true
  const downloadStatus = /^Cannot download "https?:\/\/[^"\r\n]+", status (\d{3}):/.exec(failure.message)
  if (downloadStatus) return [403, 429].includes(Number(downloadStatus[1])) || /^5\d\d$/.test(downloadStatus[1])
  if (failure.statusCode !== undefined)
    return [403, 429].includes(failure.statusCode) || (failure.statusCode >= 500 && failure.statusCode <= 599)
  const code = failure.code ?? failure.message.replace(/^.*net::/, "").split(/[ :]/)[0]
  return /^(?:E(?:CONNRESET|CONNREFUSED|CONNABORTED|TIMEDOUT|NOTFOUND|AI_AGAIN|HOSTUNREACH|NETUNREACH)|ERR_(?:NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|CONNECTION_(?:CLOSED|RESET|REFUSED|ABORTED|FAILED|TIMED_OUT)|TIMED_OUT|NETWORK_CHANGED|INTERNET_DISCONNECTED|ADDRESS_UNREACHABLE|EMPTY_RESPONSE|HTTP2_PROTOCOL_ERROR))$/.test(
    code,
  )
}

type UpdateRequest = Pick<EventEmitter, "on"> & {
  setHeader(name: string, value: string): void
  abort(): void
  end(): void
}

export function readUpdateBytes(url: string, request: (url: string) => UpdateRequest, timeout = 30_000) {
  return new Promise<Buffer>((resolve, reject) => {
    const req = request(url)
    let settled = false
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
      req.abort()
    }
    const timer = setTimeout(() => fail(new UpdateTransportError("LOGINOM_UPDATE_FEED_TIMEOUT")), timeout)
    req.setHeader("Cache-Control", "no-cache")
    req.setHeader("User-Agent", Product.slug)
    const networkError = (error: Error & { code?: string }) => {
      fail(isUpdateTransportError(error) ? new UpdateTransportError("LOGINOM_UPDATE_FEED_NETWORK") : error)
    }
    req.on("error", networkError)
    req.on("response", (response: Pick<EventEmitter, "on"> & { statusCode: number }) => {
      if (response.statusCode !== 200) {
        const message = "LOGINOM_UPDATE_FEED_HTTP_" + response.statusCode
        fail(
          [403, 429].includes(response.statusCode) || (response.statusCode >= 500 && response.statusCode <= 599)
            ? new UpdateTransportError(message)
            : Error(message),
        )
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > 2 * 1024 * 1024) return fail(Error("LOGINOM_UPDATE_MANIFEST_TOO_LARGE"))
        chunks.push(chunk)
      })
      response.on("error", networkError)
      response.on("aborted", () => fail(new UpdateTransportError("LOGINOM_UPDATE_FEED_CONNECTION_CLOSED")))
      response.on("end", () => {
        settled = true
        clearTimeout(timer)
        resolve(Buffer.concat(chunks))
      })
    })
    req.end()
  })
}

export type SelectedUpdate = {
  source: UpdateSource["kind"]
  feed: string
  signed: SignedUpdateInfo
  url(file: string): string
}

export async function loadSignedUpdate(input: {
  sources: UpdateSource[]
  read(url: string, timeout?: number): Promise<Buffer>
  file: string
  currentVersion: string
  keys?: readonly string[]
}): Promise<SelectedUpdate> {
  const failures: string[] = []
  for (const source of input.sources) {
    try {
      const deadline = Date.now() + 30_000
      const read = (url: string) => {
        const remaining = deadline - Date.now()
        if (remaining <= 0) throw new UpdateTransportError("LOGINOM_UPDATE_FEED_TIMEOUT")
        return input.read(url, remaining)
      }
      const release = source.kind === "github" ? await githubUpdateRelease(source, read) : undefined
      const feed = release
        ? new URL(encodeURIComponent(release.tag_name) + "/", source.kind === "github" ? source.download : "").href
        : (source as { feed: string }).feed
      const transport = (url: string) => {
        if (source.kind !== "s3") return url
        if (!source.config) throw Error("LOGINOM_UPDATE_S3_CONFIG_UNAVAILABLE")
        const original = new URL(url)
        const signed = presignUpdateGet(source.config, original.pathname.slice(1))
        if (new URL(signed).origin !== original.origin) throw Error("LOGINOM_UPDATE_S3_TARGET_INVALID")
        return signed
      }
      // Sequential reads ensure an invalid primary signature is never hidden by
      // a racing transport error. Every request has a total wall-clock deadline.
      const raw = await read(transport(new URL(input.file, feed).href))
      const signature = await read(transport(new URL(input.file + ".sig", feed).href))
      const signed = verifyUpdateManifest(raw, signature.toString("utf8"), feed, input.keys)
      if (release && release.tag_name !== "v" + signed.version) throw Error("LOGINOM_UPDATE_RELEASE_MISMATCH")
      if (compareUpdateVersions(signed.version, input.currentVersion) < 0) throw Error("LOGINOM_UPDATE_VERSION_OLDER")
      return {
        source: source.kind,
        feed,
        signed,
        url: (file) =>
          source.kind === "github"
            ? new URL(file.slice(file.lastIndexOf("/") + 1), feed).href
            : transport(new URL(file.startsWith("releases/") ? "../" + file : file, feed).href),
      }
    } catch (error) {
      if (!(error instanceof UpdateTransportError)) throw error
      failures.push(source.kind + ": " + error.message)
    }
  }
  throw Error("LOGINOM_UPDATE_SOURCES_UNAVAILABLE (" + failures.join("; ") + ")")
}

async function githubUpdateRelease(
  source: Extract<UpdateSource, { kind: "github" }>,
  read: (url: string) => Promise<Buffer>,
) {
  type Release = { tag_name: string; draft: boolean; prerelease: boolean }
  const valid = (value: unknown): value is Release =>
    Boolean(
      value &&
        typeof value === "object" &&
        "tag_name" in value &&
        typeof value.tag_name === "string" &&
        /^v\d+\.\d+\.\d+$/.test(value.tag_name) &&
        "draft" in value &&
        value.draft === false &&
        "prerelease" in value &&
        typeof value.prerelease === "boolean",
    )
  if (source.channel === "stable") {
    const release: unknown = JSON.parse((await read(new URL("latest", source.api).href)).toString("utf8"))
    if (!valid(release) || release.prerelease) throw Error("LOGINOM_UPDATE_RELEASE_INVALID")
    return release
  }
  // A bounded scan avoids treating stable releases as unstable or hanging on a
  // repository with no prereleases. Invalid API data is a hard configuration error.
  for (let page = 1; page <= 10; page++) {
    const releases: unknown = JSON.parse((await read(source.api + `?per_page=100&page=${page}`)).toString("utf8"))
    if (!Array.isArray(releases)) throw Error("LOGINOM_UPDATE_RELEASE_INVALID")
    const release = releases.filter(valid).find((item) => item.prerelease)
    if (release) return release
    if (releases.length < 100) break
  }
  throw Error("LOGINOM_UPDATE_RELEASE_UNAVAILABLE")
}

export function configureSignedUpdate(
  updater: Pick<AppUpdater, "setFeedURL" | "allowDowngrade">,
  selected: SelectedUpdate,
) {
  // Use electron-updater's supported custom-provider hook, based on GenericProvider.
  // It consumes the verified snapshot without a second unsigned metadata request.
  // Only URL resolution differs for flat GitHub assets and the S3 releases tree.
  class SignedProvider extends GenericProvider {
    constructor(_options: unknown, updater: AppUpdater, runtime: ProviderRuntimeOptions) {
      super({ provider: "generic", url: selected.feed, useMultipleRangeRequest: false }, updater, {
        ...runtime,
        isUseMultipleRangeRequest: false,
      })
    }
    async getLatestVersion() {
      // Keep approval evidence independent of the updater's mutable UpdateInfo.
      return structuredClone(selected.signed)
    }
    resolveFiles(info: UpdateInfo) {
      matchUpdateManifest(selected.signed, info)
      return resolveFiles(info, new URL(selected.feed), selected.url)
    }
  }
  updater.setFeedURL({ provider: "custom", updateProvider: SignedProvider, url: selected.feed })
  updater.allowDowngrade = false
}

export async function downloadSignedUpdate(
  updater: AppUpdater,
  selected: SelectedUpdate,
  fallback: () => Promise<SelectedUpdate>,
) {
  updater.allowDowngrade = false
  try {
    return await updater.downloadUpdate()
  } catch (error) {
    if (selected.source !== "github" || !isUpdateTransportError(error)) throw error
    const next = await fallback()
    // A download fallback cannot silently replace the version already shown in
    // the UI. It needs the same signed target, rollout and minimum version.
    matchUpdateManifest(selected.signed, next.signed)
    configureSignedUpdate(updater, next)
    const result = await updater.checkForUpdates()
    const target = (updater as unknown as { updateInfoAndProvider?: { info: UpdateInfo } }).updateInfoAndProvider?.info
    if (!result?.isUpdateAvailable || target !== result.updateInfo) throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")
    matchUpdateManifest(next.signed, result.updateInfo)
    try {
      return await updater.downloadUpdate()
    } catch (error) {
      if (!isUpdateTransportError(error)) throw error
      throw Error("LOGINOM_UPDATE_SOURCES_UNAVAILABLE (github; generic download)")
    }
  }
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
  keys: readonly string[] = UPDATE_PUBLIC_KEYS,
): SignedUpdateInfo {
  if (!verifyUpdateSignature(raw, signature, keys)) throw Error("LOGINOM_UPDATE_SIGNATURE_INVALID")
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
        !(path.startsWith(info.version + "/") || path.startsWith("releases/" + info.version + "/")) ||
        path.replace(/^(?:releases\/)?[^/]+\//, "").includes("/") ||
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
