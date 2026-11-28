import { Product } from "@loginom-ai-agent/product"
import { readFileSync } from "node:fs"
import {
  UPDATE_PUBLIC_KEYS,
  parseUpdateS3Config,
  presignUpdateGet,
  type UpdateS3Config,
} from "@loginom-ai-agent/product/update-signature"
import type { EventEmitter } from "node:events"
import { Predicate, Schema } from "effect"

type UpdateChannel = "stable" | "unstable"

declare const LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY: string | null

export const updateKeys =
  typeof LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY !== "undefined" && LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY
    ? [LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY]
    : UPDATE_PUBLIC_KEYS

const UpdateAdminPolicy = Schema.Struct({
  updates: Schema.optionalKey(Schema.Literals(["on", "off"])),
  channel: Schema.optionalKey(Schema.Literals(["stable", "unstable"])),
  feedUrl: Schema.optionalKey(Schema.String.check(Schema.isPattern(/\S/))),
})

type UpdateAdminPolicy = typeof UpdateAdminPolicy.Type

function updateSettings(feed: string | null, preference: UpdateChannel | null | undefined, policy: UpdateAdminPolicy = {}) {
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

export function readUpdateSettings(input: {
  policyPath: string
  s3Path: string
  feed: string | null
  github: typeof Product.updateGithub
  preference: UpdateChannel | null | undefined
}) {
  let policy: UpdateAdminPolicy = {}

  try {
    policy = Schema.decodeUnknownSync(UpdateAdminPolicy)(JSON.parse(readFileSync(input.policyPath, "utf8")))
    updateSettings(null, "stable", policy)
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

export type UpdateSource =
  | { kind: "github"; api: string; download: string; channel: UpdateChannel }
  | { kind: "generic"; feed: string }
  | { kind: "s3"; feed: string; config: UpdateS3Config | null }

function updateSources(
  feed: string | null,
  github: { api: string; download: string } | null,
  preference: UpdateChannel | null | undefined,
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

export function isUpdateTransportError(error: Error) {
  if (error instanceof UpdateTransportError) return true

  // builder-util-runtime 9.7.0 download errors are plain Errors (unlike
  // metadata HttpError). Match only its exact status/timeout message shapes.
  if (error.message === "Request timed out") return true
  const downloadStatus = /^Cannot download "https?:\/\/[^"\r\n]+", status (\d{3}):/.exec(error.message)

  if (downloadStatus) return [403, 429].includes(Number(downloadStatus[1])) || /^5\d\d$/.test(downloadStatus[1])
  const status = "statusCode" in error ? error.statusCode : undefined

  if (Predicate.isNumber(status)) return [403, 429].includes(status) || (status >= 500 && status <= 599)

  const code = "code" in error && Predicate.isString(error.code)
    ? error.code
    : error.message.replace(/^.*net::/, "").split(/[ :]/)[0]

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
