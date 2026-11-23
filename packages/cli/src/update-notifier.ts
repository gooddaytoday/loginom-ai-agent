export * as UpdateNotifier from "./update-notifier"

import fs from "node:fs/promises"
import path from "node:path"
import { Product } from "@loginom-ai-agent/product"
import { verifyUpdateSignature } from "@loginom-ai-agent/product/update-signature"
import { LOGINOM_AI_AGENT_VERSION } from "./version"

// Loginom AI Agent (B2.7d): the update notice of the product CLI, as in 0.4 (`v0.4.0:packages/opencode/src/cli/
// update-notifier.ts`). It asks only the product feed of the build (`Product.updateFeed`, the define
// `LOGINOM_AI_AGENT_UPDATE_FEED`); without one it is silent and asks nobody, and a runtime environment variable cannot
// redirect it. The machine `policy.json` turns notices off (`updates`) and picks the channel; `feedUrl` belongs to
// Desktop's updater, as in 0.4. It never installs anything: `upgrade` refuses (`services/product-updater.ts`).
// Nothing here may import `@opencode/util/global`: the entry calls this right after applying the profile.

const day = 24 * 60 * 60 * 1000

// Runs alongside the command and ends with the process. Optional dependencies let tests use real signed HTTP responses
// without global mocks.
export async function notify(input: {
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
  request?: (url: URL, init: RequestInit) => Promise<Response>
}) {
  const env = input.env ?? process.env
  const feed = input.feed ?? Product.updateFeed
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
    const current = input.current ?? LOGINOM_AI_AGENT_VERSION
    if (!releaseVersion(current)) return
    const platform = input.platform ?? process.platform
    const policy = await readSettings(input.policyFile ?? policyPath(platform, env), signal)
    if (policy.updates === "off") return
    const config = await readSettings(path.join(input.config, "updates.json"), signal)
    const channel = policy.channel ?? config.channel ?? "stable"
    if (channel !== "stable" && channel !== "unstable") return
    const base = new URL(`${feed.replace(/\/+$/, "")}/${channel}/`)
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return

    const marker = path.join(input.data, "update-notifier.json")
    const previous = await readSettings(marker, signal).catch(() => ({ checkedAt: undefined }))
    const now = input.now ?? Date.now()
    if (typeof previous.checkedAt === "number" && now - previous.checkedAt < day) return
    signal.throwIfAborted()
    // Record attempts too: an offline machine must not retry on every invocation.
    await fs.writeFile(marker, JSON.stringify({ checkedAt: now }), { mode: 0o600, signal })
    signal.throwIfAborted()
    // Bun fetch uses the same HTTP(S)_PROXY / NO_PROXY environment as the rest of the CLI.
    const [bytes, signature] = await Promise.all([
      readFeed(new URL("cli.json", base), signal, 64 * 1024, input.request),
      readFeed(new URL("cli.json.sig", base), signal, 1024, input.request),
    ])
    if (!verifyUpdateSignature(bytes, signature.toString("utf8"), input.publicKeys)) return

    const manifest: unknown = JSON.parse(bytes.toString("utf8"))
    if (!record(manifest) || !releaseVersion(manifest.version) || !releaseVersion(manifest.minSupportedVersion)) return
    if (Bun.semver.order(manifest.minSupportedVersion, manifest.version) > 0) return
    if (Bun.semver.order(manifest.version, current) <= 0) return
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
    if (url.protocol !== "https:" || url.username || url.password) return
    signal.throwIfAborted()
    const warning =
      Bun.semver.order(current, manifest.minSupportedVersion) < 0
        ? "ВНИМАНИЕ: Эта версия больше не поддерживается сервером — обновитесь. "
        : ""
    const line = `${warning}Доступна версия ${manifest.version} — скачать: ${url.href}\n`
    if (input.write) return input.write(line)
    // The CLI ends its streams before it exits; a notice that comes after that is dropped.
    if (!process.stderr.writableEnded) process.stderr.write(line)
  } catch {
    // Network, signature, policy, and storage failures never affect the command or its output.
  } finally {
    controller.abort()
  }
}

export function policyPath(platform: NodeJS.Platform, env: NodeJS.ProcessEnv) {
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

async function readFeed(
  url: URL,
  signal: AbortSignal,
  limit: number,
  request: (url: URL, init: RequestInit) => Promise<Response> = fetch,
) {
  const response = await request(url, { signal, redirect: "error", headers: { "Cache-Control": "no-cache" } })
  if (!response.ok || !response.body) throw new Error("Update feed unavailable")
  const chunks: Uint8Array[] = []
  const state = { size: 0 }
  const reader = response.body.getReader()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      state.size += chunk.value.length
      if (state.size > limit) throw new Error("Update feed too large")
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

// A release `X.Y.Z` whose parts are exact integers, as `semver.valid` required in 0.4.
function releaseVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
    value.split(".").every((part) => Number.isSafeInteger(Number(part)))
  )
}
