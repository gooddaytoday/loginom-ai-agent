export type SystemProxyStatus = {
  state: "off" | "environment" | "direct" | "applied" | "failed"
  enabled: boolean
  http?: string
  https?: string
  notices: { code: string; detail?: string }[]
}

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

export function proxyToastKey(code: string) {
  if (!toastCodes.has(code)) return
  return `systemProxy.notice.${code}`
}
