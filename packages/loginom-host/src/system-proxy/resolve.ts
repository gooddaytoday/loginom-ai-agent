import { hostname } from "node:os"

import { proxyHostPort } from "./address"
import { translateBypass } from "./bypass"
import { appliedResult, explicitProxy, systemProxyDisabled } from "./environment"
import { parseGnomeSettings } from "./gnome"
import { parseKdeSettings } from "./kde"
import { parseMacosSettings } from "./macos"
import { parseChromiumResolution, proxyFromPacScript } from "./pac"
import { readSystemProxy, type SystemProxySnapshot } from "./readers"
import {
  directResult,
  emptySettings,
  failedResult,
  MODEL_PROXY_URLS,
  type BypassDialect,
  type SystemProxyNotice,
  type SystemProxyResult,
  type SystemProxySettings,
} from "./types"
import { parseWindowsSettings } from "./windows"

export type ChromiumResolution = { url: string; resolution: string }

export type ProxyProbe = (url: string) => Promise<"http" | "other" | "closed" | "timeout">

export type ResolveSystemProxyInput = {
  platform?: NodeJS.Platform
  enabled?: boolean
  environment?: NodeJS.ProcessEnv
  hostname?: string
  deadlineMs?: number
  windows?: unknown
  macos?: string
  gnome?: string
  kde?: string
  pacScript?: string
  chromium?: ChromiumResolution[] | ((url: string) => Promise<string>)
  urls?: string[]
  probe?: ProxyProbe
  read?: () => Promise<SystemProxySnapshot | undefined>
}

export async function resolveSystemProxy(input: ResolveSystemProxyInput = {}): Promise<SystemProxyResult> {
  try {
    return await resolveSystemProxyUnsafe(input)
  } catch {
    return failedResult("internal")
  }
}

async function resolveSystemProxyUnsafe(input: ResolveSystemProxyInput): Promise<SystemProxyResult> {
  const platform = input.platform ?? process.platform
  const environment = input.environment ?? {}
  if (systemProxyDisabled(environment, input.enabled))
    return { state: "off", summary: { source: "none", noProxy: "", skipped: [] }, notices: [] }
  const explicit = explicitProxy(environment)
  if (explicit?.kind === "socks")
    return {
      state: "environment",
      summary: { source: "environment", noProxy: environment.NO_PROXY ?? "", skipped: [] },
      notices: [{ code: "environment-socks" }],
    }
  if (explicit)
    return {
      state: "environment",
      summary: {
        source: "environment",
        http: proxyHostPort(explicit.value.startsWith("http") ? explicit.value : `http://${explicit.value}`),
        noProxy: environment.NO_PROXY ?? environment.no_proxy ?? "",
        skipped: [],
      },
      notices: [],
    }

  const loaded = await loadSettings(input)
  if (loaded.ok === false) return failedResult(loaded.code)
  if (loaded.settings?.invalid && !input.chromium) return failedResult("internal")
  const settings = settingsFor(loaded.settings, input)
  if (!settings) return directResult()
  const pac = input.pacScript ? proxyFromPacScript(input.pacScript) : undefined
  if (pac?.http) {
    settings.http = pac.http
    settings.https = pac.http
    settings.mode = "manual"
  } else if (pac?.socks && !settings.http && !settings.https) settings.socks = pac.socks
  else if (pac?.ambiguous && !settings.http && !settings.https) settings.issues.push({ code: "automatic-unsupported" })

  const chromium = await chromiumView(input)
  if (chromium.failed) settings.issues.push({ code: "internal" })
  const directHosts = chromium.directHosts
  if (chromium.http) {
    settings.http = chromium.http
    settings.https = chromium.https || chromium.http
    settings.mode = "manual"
  }

  if (!settings.http && !settings.https && settings.socks) {
    const mixed = input.probe ? await probeSafe(input.probe, settings.socks) : "other"
    if (mixed === "http") {
      settings.http = settings.socks
      settings.https = settings.socks
    } else
      return {
        state: "direct",
        summary: { source: settings.source, noProxy: "", skipped: [] },
        notices: dedupe([...settings.issues, { code: "socks-only", detail: proxyHostPort(settings.socks) }]),
      }
  }

  if (!settings.http && !settings.https) {
    const notices = [...settings.issues]
    const windowsDefault = settings.source === "windows" && settings.automatic && !settings.pacUrl
    if (
      !windowsDefault &&
      (settings.automatic || settings.mode === "pac" || settings.pacUrl) &&
      !notices.some((notice) => notice.code === "automatic-unsupported")
    )
      notices.push({ code: "automatic-unsupported" })
    if (windowsDefault) return directResult()
    if (notices.length === 0) return directResult()
    return {
      state: notices.some((notice) => notice.code === "internal") ? "failed" : "direct",
      summary: { source: settings.source, noProxy: "", skipped: [] },
      notices: dedupe(notices),
    }
  }

  const name = machineName(environment, input.hostname)
  const extra = [...directHosts]
  if (settings.simpleHostnames) extra.push("<local>")
  const bypass = settings.reversedExceptions ? [] : settings.bypass
  const translated = translateBypass(bypass, settings.dialect, name, extra)
  const notices: SystemProxyNotice[] = [...settings.issues]
  if (settings.reversedExceptions) notices.push({ code: "approximated", detail: "reversed" })
  if (translated.skipped.length) notices.push({ code: "rules-skipped", detail: translated.skipped.join(",") })
  if (translated.approximated.length)
    notices.push({ code: "approximated", detail: translated.approximated.join(",") })
  if (settings.authRequired) notices.push({ code: "auth-required" })
  if (input.probe && settings.http) {
    const status = await probeSafe(input.probe, settings.http)
    if (status === "closed" || status === "timeout")
      notices.push({ code: "unreachable", detail: proxyHostPort(settings.http) })
  }
  const source = chromium.http ? "chromium" : settings.source
  return appliedResult({
    platform,
    environment,
    source,
    http: settings.http,
    https: settings.https,
    noProxy: translated.rules,
    skipped: translated.skipped,
    notices: dedupe(notices),
  })
}

function settingsFor(settings: SystemProxySettings | undefined, input: ResolveSystemProxyInput) {
  if (settings?.invalid) {
    if (!input.chromium) return undefined
    const blank = blankSettings(input)
    blank.issues.push({ code: "internal" })
    return blank
  }
  if (settings) return settings
  if (!input.chromium) return undefined
  return blankSettings(input)
}

function blankSettings(input: ResolveSystemProxyInput) {
  const source = preferredSource(input.platform ?? process.platform, input.environment ?? {})
  const dialect: BypassDialect =
    source === "windows" ? "windows" : source === "macos" ? "macos" : source === "kde" ? "kde" : "gnome"
  return emptySettings(source, dialect)
}

async function loadSettings(
  input: ResolveSystemProxyInput,
): Promise<{ ok: true; settings?: SystemProxySettings } | { ok: false; code: "read-failed" | "timeout" }> {
  const injected = injectedSettings(input)
  if (injected) return { ok: true, settings: injected }
  if (input.read) return loadRead(input.read, input)
  const read = await deadline(
    readSystemProxy({ platform: input.platform, environment: input.environment, timeoutMs: input.deadlineMs }),
    input.deadlineMs ?? 8000,
  )
  if (read.ok === false) return { ok: false, code: read.reason === "timeout" ? "timeout" : "read-failed" }
  if (!read.value.ok) return { ok: false, code: read.value.code }
  return { ok: true, settings: snapshotSettings(read.value.snapshot, input) }
}

async function loadRead(read: () => Promise<SystemProxySnapshot | undefined>, input: ResolveSystemProxyInput) {
  let reading: Promise<SystemProxySnapshot | undefined>
  try {
    reading = Promise.resolve(read())
  } catch {
    return { ok: false as const, code: "read-failed" as const }
  }
  const waited = await deadline(reading, input.deadlineMs ?? 8000)
  if (waited.ok === false) return { ok: false as const, code: waited.reason === "timeout" ? ("timeout" as const) : ("read-failed" as const) }
  if (!waited.value) return { ok: true as const }
  return { ok: true as const, settings: snapshotSettings(waited.value, input) }
}

function injectedSettings(input: ResolveSystemProxyInput) {
  const parsed = [
    input.windows !== undefined ? parseWindowsSettings(input.windows) : undefined,
    input.macos !== undefined ? parseMacosSettings(input.macos) : undefined,
    input.gnome !== undefined ? parseGnomeSettings(input.gnome) : undefined,
    input.kde !== undefined ? parseKdeSettings(input.kde) : undefined,
  ].filter((settings): settings is SystemProxySettings => settings !== undefined)
  if (!parsed.length) return undefined
  const preferred = preferredSource(input.platform ?? process.platform, input.environment ?? {})
  return parsed.find((settings) => settings.source === preferred) ?? parsed[0]
}

function snapshotSettings(snapshot: SystemProxySnapshot, input: ResolveSystemProxyInput) {
  return injectedSettings({
    ...input,
    windows: snapshot.windows,
    macos: snapshot.macos,
    gnome: snapshot.gnome,
    kde: snapshot.kde,
    pacScript: input.pacScript,
  })
}

async function deadline<T>(work: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work.then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const, reason: "error" as const }),
      ),
      new Promise<{ ok: false; reason: "timeout" }>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function chromiumView(input: ResolveSystemProxyInput) {
  if (!input.chromium) return { directHosts: [] as string[], http: "", https: "", failed: false }
  try {
    const rows = Array.isArray(input.chromium)
      ? input.chromium
      : await Promise.all(
          (input.urls ?? MODEL_PROXY_URLS).map(async (url) => ({
            url,
            resolution: await (input.chromium as (url: string) => Promise<string>)(url),
          })),
        )
    const directHosts: string[] = []
    let http = ""
    let https = ""
    for (const row of rows) {
      const parsed = parseChromiumResolution(row.resolution)
      if (parsed.direct) {
        const host = hostOf(row.url)
        if (host) directHosts.push(host)
        continue
      }
      if (parsed.http && !http) http = parsed.http
      if (parsed.http && !https) https = parsed.http
    }
    return { directHosts, http, https, failed: false }
  } catch {
    return { directHosts: [] as string[], http: "", https: "", failed: true }
  }
}

async function probeSafe(probe: ProxyProbe, url: string) {
  try {
    return await probe(url)
  } catch {
    return "other" as const
  }
}

function machineName(environment: NodeJS.ProcessEnv, explicit?: string) {
  const value = explicit || environment.COMPUTERNAME || environment.HOSTNAME || safeHostname()
  if (!value || !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(value)) return ""
  return value
}

function safeHostname() {
  try {
    return hostname()
  } catch {
    return ""
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

function preferredSource(platform: NodeJS.Platform, environment: NodeJS.ProcessEnv) {
  if (platform === "win32") return "windows"
  if (platform === "darwin") return "macos"
  const desktop = (environment.XDG_CURRENT_DESKTOP ?? "").toLowerCase()
  if (desktop.includes("kde")) return "kde"
  return "gnome"
}

function dedupe(notices: SystemProxyNotice[]) {
  const seen = new Set<string>()
  return notices.filter((notice) => {
    if (seen.has(notice.code)) return false
    seen.add(notice.code)
    return true
  })
}
