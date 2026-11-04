import fs from "node:fs/promises"
import path from "node:path"
import { verify } from "node:crypto"
import semver from "semver"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

declare const LOGINOM_AI_AGENT_UPDATE_FEED: string

// Only release builds can enable this; a runtime environment variable cannot redirect the feed.
const updateFeed = typeof LOGINOM_AI_AGENT_UPDATE_FEED === "string" ? LOGINOM_AI_AGENT_UPDATE_FEED : ""
const publicKeys = [
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAekkV+yIMJpDlzXoJAWpT9ifgHKbKe5PJdtGC8FjmJ2c=\n-----END PUBLIC KEY-----",
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAuVor7DX+ReBZ+tg8gXaygsXqxF+WKA9dijYEIDNHTtc=\n-----END PUBLIC KEY-----",
]
const day = 24 * 60 * 60 * 1000

// Runs alongside the command. The profile owner cancels and settles it before releasing its guard.
// Optional dependencies let tests use real signed HTTP responses without global mocks.
export async function notifyUpdate(input: {
  data: string
  config: string
  signal?: AbortSignal
  feed?: string
  current?: string
  env?: NodeJS.ProcessEnv
  isTTY?: boolean
  platform?: NodeJS.Platform
  arch?: string
  policyFile?: string
  publicKeys?: readonly string[]
  now?: number
  timeout?: number
  write?: (text: string) => void
}) {
  const env = input.env ?? process.env
  const feed = input.feed ?? updateFeed
  if (
    !feed ||
    !(input.isTTY ?? process.stderr.isTTY) ||
    input.signal?.aborted ||
    env.LOGINOM_AI_AGENT_NO_UPDATE_NOTIFIER === "1" ||
    [
      "CI",
      "CONTINUOUS_INTEGRATION",
      "BUILD_NUMBER",
      "RUN_ID",
      "GITHUB_ACTIONS",
      "GITLAB_CI",
      "TF_BUILD",
      "TEAMCITY_VERSION",
      "JENKINS_URL",
    ].some((name) => !!env[name] && !["0", "false"].includes(env[name]!.toLowerCase()))
  )
    return

  const controller = new AbortController()
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(input.timeout ?? 2500),
    ...(input.signal ? [input.signal] : []),
  ])
  try {
    const current = input.current ?? InstallationVersion
    if (!releaseVersion(current)) return
    const platform = input.platform ?? process.platform
    const policy = await readSettings(input.policyFile ?? updatePolicyPath(platform, env), signal)
    if (policy.updates === "off") return
    const config = await readSettings(path.join(input.config, "updates.json"), signal)
    const channel = policy.channel ?? config.channel ?? "stable"
    if (channel !== "stable" && channel !== "unstable") return
    const base = new URL(`${feed.replace(/\/+$/, "")}/${channel}/`)
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash)
      return

    const marker = path.join(input.data, "update-notifier.json")
    const previous = await readSettings(marker, signal).catch(() => ({ checkedAt: undefined }))
    const now = input.now ?? Date.now()
    if (typeof previous.checkedAt === "number" && now - previous.checkedAt < day) return
    signal.throwIfAborted()
    // Record attempts too: an offline machine must not retry on every invocation.
    // The standalone profile's writer guard serializes this read/write across processes.
    await fs.writeFile(marker, JSON.stringify({ checkedAt: now }), { mode: 0o600, signal })
    signal.throwIfAborted()
    // Bun fetch uses the same HTTP(S)_PROXY / NO_PROXY environment as the rest of the CLI.
    const [bytes, signature] = await Promise.all([
      readFeed(new URL("cli.json", base), signal, 64 * 1024),
      readFeed(new URL("cli.json.sig", base), signal, 1024),
    ])
    const encoded = signature.toString("utf8").trim()
    if (!/^[A-Za-z0-9+/]{86}==$/.test(encoded)) return
    if (!(input.publicKeys ?? publicKeys).some((key) => verify(null, bytes, key, Buffer.from(encoded, "base64"))))
      return

    const manifest: unknown = JSON.parse(bytes.toString("utf8"))
    if (!record(manifest) || !releaseVersion(manifest.version) || !releaseVersion(manifest.minSupportedVersion)) return
    if (semver.gt(manifest.minSupportedVersion, manifest.version) || !semver.gt(manifest.version, current)) return
    if (!record(manifest.downloads)) return
    const download = manifest.downloads[`${platform}-${input.arch ?? process.arch}`]
    if (
      !record(download) ||
      typeof download.url !== "string" ||
      /[\x00-\x1f\x7f-\x9f]/.test(download.url) ||
      typeof download.sha256 !== "string" ||
      !/^[a-fA-F0-9]{64}$/.test(download.sha256)
    )
      return
    const url = new URL(download.url, base)
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return
    signal.throwIfAborted()
    const warning = semver.lt(current, manifest.minSupportedVersion)
      ? "ВНИМАНИЕ: Эта версия больше не поддерживается сервером — обновитесь. "
      : ""
    const line = `${warning}Доступна версия ${manifest.version} — скачать: ${url.href}\n`
    if (input.write) input.write(line)
    else process.stderr.write(line)
  } catch {
    // Network, signature, policy, and storage failures never affect the command or its output.
  } finally {
    controller.abort()
  }
}

export function updatePolicyPath(platform: NodeJS.Platform, env: NodeJS.ProcessEnv) {
  if (platform === "win32")
    return path.win32.join(env.ProgramData ?? "C:\\ProgramData", "Loginom AI Agent", "policy.json")
  if (platform === "darwin") return "/Library/Application Support/Loginom AI Agent/policy.json"
  return "/etc/loginom-ai-agent/policy.json"
}

async function readSettings(file: string, signal: AbortSignal) {
  const text = await fs.readFile(file, { encoding: "utf8", signal }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "{}"
    throw error
  })
  const value: unknown = JSON.parse(text)
  if (!record(value)) throw new Error("Invalid update settings")
  return value
}

async function readFeed(url: URL, signal: AbortSignal, limit: number) {
  const response = await fetch(url, { signal, redirect: "error", headers: { "Cache-Control": "no-cache" } })
  if (!response.ok || !response.body) throw new Error("Update feed unavailable")
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = response.body.getReader()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.length
      if (size > limit) throw new Error("Update feed too large")
      chunks.push(chunk.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function releaseVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
    semver.valid(value) !== null
  )
}
