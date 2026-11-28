import { Product } from "@loginom-ai-agent/product"
import { readFileSync } from "node:fs"
import {
  UPDATE_PUBLIC_KEYS,
  parseUpdateS3Config,
  verifyUpdateSignature,
  presignUpdateGet,
  type UpdateS3Config,
} from "@loginom-ai-agent/product/update-signature"
import { parseUpdateInfo, resolveFiles } from "electron-updater/out/providers/Provider.js"
import { GenericProvider } from "electron-updater/out/providers/GenericProvider.js"
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider.js"
import type { EventEmitter } from "node:events"
import type { UpdateInfo } from "electron-updater"
import type { AppUpdater } from "electron-updater"

type UpdateChannel = "stable" | "unstable"
declare const LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY: string | null
export const updateKeys =
  typeof LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY !== "undefined" && LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY
    ? [LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY]
    : UPDATE_PUBLIC_KEYS
type UpdateAdminPolicy = { updates?: "on" | "off"; channel?: UpdateChannel; feedUrl?: string }

function updateSettings(feed: string | null, preference: unknown, policy: UpdateAdminPolicy = {}) {
  const channel = policy.channel ?? (preference === "unstable" ? "unstable" : "stable")
  const base = policy.feedUrl ?? feed
  const url = base ? new URL(base.endsWith("/") ? base : base + "/") : undefined
  if (url && (url.protocol !== "https:" || url.username || url.password || url.search || url.hash))
    throw Error("LOGINOM_UPDATE_FEED_INVALID")
  return {
    channel,
    feed: url ? new URL(channel + "/", url).href : undefined,
  }
}

function parseUpdateAdminPolicy(value: unknown): UpdateAdminPolicy {
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
  const result: UpdateAdminPolicy = { updates, channel, feedUrl }
  updateSettings(null, "stable", result)
  return result
}

export function readUpdateSettings(input: {
  policyPath: string
  s3Path: string
  feed: string | null
  github: typeof Product.updateGithub
  preference: unknown
}) {
  let policy: UpdateAdminPolicy = {}
  try {
    policy = parseUpdateAdminPolicy(JSON.parse(readFileSync(input.policyPath, "utf8")))
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw Error("LOGINOM_UPDATE_POLICY_INVALID")
  }
  if (policy.updates === "off") return updateSources(null, null, input.preference, policy)
  let s3: UpdateS3Config | null = null
  if (!policy.feedUrl) {
    try {
      s3 = parseUpdateS3Config(JSON.parse(readFileSync(input.s3Path, "utf8")))
    } catch {
      s3 = null
    }
  }
  return updateSources(input.feed, input.github, input.preference, policy, s3)
}

export function updatePolicyPath(platform: NodeJS.Platform, programData = "C:\\ProgramData") {
  if (platform === "win32") return programData.replace(/[\\/]$/, "") + "\\Loginom AI Agent\\policy.json"
  if (platform === "darwin") return "/Library/Application Support/Loginom AI Agent/policy.json"
  return "/etc/loginom-ai-agent/policy.json"
}

export function updateMode(platform: NodeJS.Platform, appImage?: string) {
  return platform === "win32" || (platform === "linux" && Boolean(appImage)) ? "automatic" : "notify"
}

export type UpdateSource =
  | { kind: "github"; api: string; download: string; channel: UpdateChannel }
  | { kind: "generic"; feed: string }
  | { kind: "s3"; feed: string; config: UpdateS3Config | null }

function updateSources(
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
            api: clean(github.api).replace(/\/+$/, ""),
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
export class UpdateHttpError extends Error {
  readonly statusCode: number
  constructor(statusCode: number) {
    super("LOGINOM_UPDATE_FEED_HTTP_" + statusCode)
    this.statusCode = statusCode
  }
}

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
  return /^(?:E(?:CONNRESET|CONNREFUSED|CONNABORTED|TIMEDOUT|NOTFOUND|AI_AGAIN|HOSTUNREACH|NETUNREACH)|ERR_(?:NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|CONNECTION_(?:CLOSED|RESET|REFUSED|ABORTED|FAILED|TIMED_OUT)|TIMED_OUT|NETWORK_CHANGED|INTERNET_DISCONNECTED|ADDRESS_UNREACHABLE|EMPTY_RESPONSE|HTTP2_PROTOCOL_ERROR|TUNNEL_CONNECTION_FAILED|PROXY_CONNECTION_FAILED|SOCKS_CONNECTION_FAILED))$/.test(
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
            : new UpdateHttpError(response.statusCode),
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

type SelectedUpdate = {
  source: UpdateSource["kind"]
  feed: string
  signed: SignedUpdateInfo
  url(file: string, signed?: boolean): string
}

export async function loadSignedUpdate(input: {
  sources: readonly UpdateSource[]
  read(url: string, timeout?: number): Promise<Buffer>
  file: string
  currentVersion: string
  keys?: readonly string[]
}): Promise<SelectedUpdate | undefined> {
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
      let feed: string
      if (source.kind === "github") {
        if (!release || compareUpdateVersions(release.tag_name.slice(1), input.currentVersion) <= 0) return undefined
        feed = new URL(encodeURIComponent(release.tag_name) + "/", source.download).href
      } else {
        feed = source.feed
      }
      // Sequential reads ensure an invalid primary signature is never hidden by
      // a racing transport error. Every request has a total wall-clock deadline.
      const raw = await read(updateAssetUrl(source, feed, input.file))
      const signature = await read(updateAssetUrl(source, feed, input.file + ".sig"))
      const signed = verifyUpdateManifest(raw, signature.toString("utf8"), feed, input.keys)
      if (release && release.tag_name !== "v" + signed.version) throw Error("LOGINOM_UPDATE_RELEASE_MISMATCH")
      // An older signed feed (an S3 mirror behind GitHub, or an installed
      // pre-release) means no update, as on GitHub; downgrades stay disabled.
      if (compareUpdateVersions(signed.version, input.currentVersion) < 0) return undefined
      return {
        source: source.kind,
        feed,
        signed,
        url: (file, signed) => updateAssetUrl(source, feed, file, signed),
      }
    } catch (error) {
      if (source.kind === "github" && error instanceof UpdateHttpError && error.statusCode === 404) return undefined
      if (!(error instanceof UpdateTransportError)) throw error
      failures.push(source.kind + ": " + error.message)
    }
  }
  throw Error("LOGINOM_UPDATE_SOURCES_UNAVAILABLE (" + failures.join("; ") + ")")
}

/** Resolve flat GitHub assets or immutable release paths in the configured update feed. */
export function updateAssetUrl(source: UpdateSource, feed: string, file: string, signed = true) {
  if (source.kind === "github") return new URL(file.slice(file.lastIndexOf("/") + 1), feed).href

  const target = new URL(file.startsWith("releases/") ? "../" + file : file, feed)
  if (source.kind !== "s3" || !signed) return target.href
  if (!source.config) throw Error("LOGINOM_UPDATE_S3_CONFIG_UNAVAILABLE")
  const url = presignUpdateGet(source.config, target.pathname.slice(1))
  if (new URL(url).origin !== target.origin) throw Error("LOGINOM_UPDATE_S3_TARGET_INVALID")
  return url
}

export function updateNotificationLink(selected: SelectedUpdate, file: string) {
  const url = selected.url(file, false)
  return {
    url,
    resolve: (requested: string) => {
      if (requested !== url) throw Error("LOGINOM_UPDATE_TARGET_INVALID")
      return selected.url(file)
    },
  }
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
  const api = source.api.replace(/\/+$/, "")
  const latest = await (async () => {
    try {
      const release: unknown = JSON.parse((await read(api + "/latest")).toString("utf8"))
      if (!valid(release) || release.prerelease) throw Error("LOGINOM_UPDATE_RELEASE_INVALID")
      return release
    } catch (error) {
      if (error instanceof UpdateHttpError && error.statusCode === 404) return undefined
      throw error
    }
  })()
  if (source.channel === "stable") return latest
  // Keep release-list responses comfortably below the metadata byte limit.
  for (let page = 1; page <= 10; page++) {
    const releases: unknown = JSON.parse((await read(api + `?per_page=5&page=${page}`)).toString("utf8"))
    if (!Array.isArray(releases)) throw Error("LOGINOM_UPDATE_RELEASE_INVALID")
    const release = releases.filter(valid).find((item) => item.prerelease)
    if (release)
      return !latest || compareUpdateVersions(release.tag_name.slice(1), latest.tag_name.slice(1)) > 0
        ? release
        : latest
    if (releases.length < 5) break
  }
  return latest
}

function configureSignedUpdate(
  updater: Pick<AppUpdater, "setFeedURL" | "allowDowngrade">,
  selected: SelectedUpdate,
  preferArm64 = false,
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
    override async getLatestVersion() {
      // Keep approval evidence independent of the updater's mutable UpdateInfo.
      return structuredClone(selected.signed)
    }
    override resolveFiles(info: UpdateInfo) {
      matchUpdateManifest(selected.signed, info)
      const native = preferArm64 ? info.files.filter((file) => file.url.includes("arm64")) : []
      return resolveFiles(native.length ? { ...info, files: native } : info, new URL(selected.feed), selected.url)
    }
  }
  updater.setFeedURL({ provider: "custom", updateProvider: SignedProvider, url: selected.feed })
  updater.allowDowngrade = false
}

export function downloadTarget(updater: unknown): unknown {
  if (!updater || typeof updater !== "object" || !("updateInfoAndProvider" in updater)) return undefined
  const target: unknown = updater.updateInfoAndProvider
  if (target && typeof target === "object" && "info" in target) return target.info
}

export async function checkAutomaticUpdate(updater: AppUpdater, selected: SelectedUpdate, preferArm64: boolean) {
  configureSignedUpdate(updater, selected, preferArm64)
  const result = await updater.checkForUpdates()
  if (!result?.isUpdateAvailable) return undefined
  matchUpdateManifest(selected.signed, result.updateInfo)
  if (downloadTarget(updater) !== result.updateInfo) throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")
  return { info: result.updateInfo, selected }
}

export async function downloadSignedUpdate(
  updater: AppUpdater,
  selected: SelectedUpdate,
  fallback: () => Promise<SelectedUpdate | undefined>,
  preferArm64 = false,
) {
  updater.allowDowngrade = false
  try {
    return await updater.downloadUpdate()
  } catch (error) {
    if (selected.source !== "github" || !isUpdateTransportError(error)) throw error
    const next = await fallback()
    if (!next) throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")
    // A download fallback cannot silently replace the version already shown in
    // the UI. It needs the same signed target, rollout and minimum version.
    matchUpdateManifest(selected.signed, next.signed)
    if (!(await checkAutomaticUpdate(updater, next, preferArm64))) throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")
    try {
      return await updater.downloadUpdate()
    } catch (error) {
      if (!isUpdateTransportError(error)) throw error
      throw Error("LOGINOM_UPDATE_SOURCES_UNAVAILABLE (github; generic download)")
    }
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

type SignedUpdateInfo = UpdateInfo & { minSupportedVersion: string; stagingPercentage?: number }

// Verify the exact response bytes before YAML parsing; either pinned key may sign a release.
function verifyUpdateManifest(
  raw: Buffer,
  signature: string,
  feed: string,
  keys: readonly string[] = updateKeys,
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
  validateUpdate(info, feed)
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

function validateUpdate(info: { files: { url: string; sha512: string }[] }, feed: string) {
  const base = new URL(feed.endsWith("/") ? feed : feed + "/")
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
