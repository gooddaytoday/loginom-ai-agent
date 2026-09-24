import type { SystemProxyStatus } from "@loginom-ai-agent/app/system-proxy"
import {
  directResult,
  failedResult,
  probeProxyUrl,
  readSystemProxy,
  resolveSystemProxy,
  type SystemProxyResult,
  type SystemProxySnapshot,
} from "@loginom-ai-agent/loginom-host/system-proxy"

export { loopbackNoProxy, sidecarEnvironment } from "./proxy-env"

export function formatSystemProxyLog(result: SystemProxyResult) {
  const target = result.summary.http ?? result.summary.https
  const notices = result.notices.map((notice) => notice.code).join(",")
  const suffix = notices ? ` ${notices}` : ""
  if (result.state === "applied" && target) return `system proxy: applied ${target}${suffix}`
  return `system proxy: ${result.state}${suffix}`
}

export type SystemProxyDetection = {
  result: Promise<SystemProxyResult>
  useChromium(resolveProxy: (url: string) => Promise<string>): void
  stop(): void
}

export function startSystemProxyDetection(input: {
  platform?: NodeJS.Platform
  environment?: NodeJS.ProcessEnv
  enabled?: boolean
  deadlineMs?: number
  timeoutMs?: number
  read?: () => Promise<SystemProxySnapshot | undefined>
} = {}): SystemProxyDetection {
  const environment = input.environment ?? {}
  const deadlineMs = input.deadlineMs ?? 8000
  const abort = new AbortController()
  let chromium: ((url: string) => Promise<string>) | undefined
  let release = () => undefined as void
  const chromiumReady = new Promise<void>((resolve) => {
    release = () => resolve()
  })
  const timer = setTimeout(release, deadlineMs)
  let capTimer: ReturnType<typeof setTimeout> | undefined
  const capped = new Promise<SystemProxyResult>((resolve) => {
    capTimer = setTimeout(() => resolve(failedResult("timeout")), input.timeoutMs ?? 10_000)
  })
  const skipped = input.enabled === false || disabled(environment)
  const emptySnapshot: SystemProxySnapshot = {}
  const readPromise = skipped
    ? Promise.resolve({ ok: true as const, snapshot: emptySnapshot })
    : loadSnapshot(input, abort.signal, deadlineMs)
  const result = Promise.race([detect(), capped]).finally(() => {
    clearTimeout(timer)
    if (capTimer) clearTimeout(capTimer)
  })
  return {
    result,
    useChromium(resolveProxy) {
      chromium = resolveProxy
      release()
    },
    stop() {
      clearTimeout(timer)
      if (capTimer) clearTimeout(capTimer)
      abort.abort()
      release()
    },
  }

  async function detect(): Promise<SystemProxyResult> {
    if (input.enabled === false || disabled(environment)) return { ...directResult(), state: "off" }
    try {
      await Promise.race([chromiumReady, aborted(abort.signal)])
      if (abort.signal.aborted) return directResult()
      const snapshot = await Promise.race([readPromise, aborted(abort.signal).then(() => "aborted" as const)])
      if (snapshot === "aborted" || abort.signal.aborted) return directResult()
      if (!snapshot.ok) return failedResult(snapshot.code)
      clearTimeout(timer)
      return await Promise.race([
        resolveSystemProxy({
          platform: input.platform,
          environment,
          enabled: input.enabled,
          deadlineMs,
          read: async () => snapshot.snapshot,
          chromium,
          probe: (url) => probeProxyUrl(url, 1000),
        }),
        aborted(abort.signal).then(() => directResult()),
      ])
    } catch {
      return failedResult("internal")
    }
  }
}

async function loadSnapshot(
  input: { platform?: NodeJS.Platform; environment?: NodeJS.ProcessEnv; read?: () => Promise<SystemProxySnapshot | undefined> },
  signal: AbortSignal,
  timeoutMs: number,
) {
  try {
    if (input.read) {
      const snapshot = await input.read()
      const empty: SystemProxySnapshot = {}
      return { ok: true as const, snapshot: snapshot ?? empty }
    }
    return await readSystemProxy({
      platform: input.platform,
      environment: input.environment,
      timeoutMs,
      signal,
    })
  } catch {
    return { ok: false as const, code: "read-failed" as const }
  }
}

function disabled(environment: NodeJS.ProcessEnv) {
  const flag = environment.LOGINOM_AI_AGENT_SYSTEM_PROXY
  if (typeof flag !== "string") return false
  return ["off", "0", "false"].includes(flag.trim().toLowerCase())
}

let latestStatus: SystemProxyStatus = { state: "direct", enabled: true, notices: [] }
const statusListeners = new Set<(status: SystemProxyStatus) => void>()

export function currentSystemProxyStatus() {
  return latestStatus
}

export function publishSystemProxyStatus(status: SystemProxyStatus) {
  latestStatus = status
  for (const listener of statusListeners) listener(status)
}

export function subscribeSystemProxyStatus(listener: (status: SystemProxyStatus) => void) {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

export function statusFromResult(result: SystemProxyResult, enabled: boolean): SystemProxyStatus {
  return {
    state: result.state,
    enabled,
    http: result.summary.http,
    https: result.summary.https,
    notices: result.notices,
  }
}

function aborted(signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve("aborted" as const)
  return new Promise<"aborted">((resolve) => {
    signal.addEventListener("abort", () => resolve("aborted"), { once: true })
  })
}
