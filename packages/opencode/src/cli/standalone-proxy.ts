import { probeProxyUrl, resolveSystemProxy, type SystemProxyResult } from "@loginom-ai-agent/loginom-host/system-proxy"

const toastCodes = new Set([
  "read-failed",
  "timeout",
  "internal",
  "unreachable",
  "socks-only",
  "auth-required",
  "automatic-unsupported",
  "environment-socks",
  "routes-merged",
])

export async function applyCliSystemProxy() {
  const result = await resolveSystemProxy({
    environment: process.env,
    probe: (url) => probeProxyUrl(url, 1000),
  }).catch(() => undefined)
  const resolved =
    result ??
    ({
      state: "failed",
      summary: { source: "none", noProxy: "", skipped: [] },
      notices: [{ code: "internal" }],
    } satisfies SystemProxyResult)
  // A proxy that refuses connections at startup would fail every request: go direct and report it.
  const settled: SystemProxyResult =
    resolved.state === "applied" && resolved.notices.some((notice) => notice.code === "unreachable")
      ? { ...resolved, state: "direct", environment: undefined }
      : resolved
  if (settled.environment) Object.assign(process.env, settled.environment)
  const line = systemProxyNoticeLine(settled)
  if (line) process.stderr.write(`${line}\n`)
  return settled
}

export function systemProxyNoticeLine(result: SystemProxyResult) {
  const notice = result.notices.find((item) => toastCodes.has(item.code))
  if (!notice) return
  return `SYSTEM_PROXY_NOT_APPLIED: ${notice.code}${notice.detail ? ` ${notice.detail}` : ""}`
}

