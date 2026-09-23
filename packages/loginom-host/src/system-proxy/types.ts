export const systemProxyNoticeCodes = [
  "read-failed",
  "timeout",
  "internal",
  "unreachable",
  "socks-only",
  "auth-required",
  "automatic-unsupported",
  "environment-socks",
  "rules-skipped",
  "approximated",
] as const

export type SystemProxyNoticeCode = (typeof systemProxyNoticeCodes)[number]

export type SystemProxyNotice = {
  code: SystemProxyNoticeCode
  detail?: string
}

export type SystemProxyState = "off" | "environment" | "direct" | "applied" | "failed"

export type SystemProxySource = "windows" | "macos" | "gnome" | "kde" | "chromium" | "environment" | "none"

export type BypassDialect = "windows" | "macos" | "gnome" | "kde"

export type SystemProxySummary = {
  http?: string
  https?: string
  source: SystemProxySource
  noProxy: string
  skipped: string[]
}

export type SystemProxyResult = {
  state: SystemProxyState
  environment?: Record<string, string>
  summary: SystemProxySummary
  notices: SystemProxyNotice[]
}

export type SystemProxySettings = {
  source: Exclude<SystemProxySource, "chromium" | "environment" | "none">
  mode: "direct" | "manual" | "automatic" | "pac"
  http: string
  https: string
  socks: string
  pacUrl: string
  bypass: string[]
  dialect: BypassDialect
  authRequired: boolean
  simpleHostnames: boolean
  reversedExceptions: boolean
  automatic: boolean
  invalid: boolean
  scopedIgnored: boolean
  issues: SystemProxyNotice[]
  log: string[]
}

export const MODEL_PROXY_URLS = [
  "https://api.openai.com/v1/models",
  "https://auth.openai.com/oauth/token",
  "https://chatgpt.com/",
  "https://api.anthropic.com/v1/messages",
  "https://generativelanguage.googleapis.com/",
  "https://openrouter.ai/api/v1/models",
  "https://github.com/",
]

export function emptySettings(
  source: SystemProxySettings["source"],
  dialect: BypassDialect,
): SystemProxySettings {
  return {
    source,
    mode: "direct",
    http: "",
    https: "",
    socks: "",
    pacUrl: "",
    bypass: [],
    dialect,
    authRequired: false,
    simpleHostnames: false,
    reversedExceptions: false,
    automatic: false,
    invalid: false,
    scopedIgnored: false,
    issues: [],
    log: [],
  }
}

export function invalidSettings(source: SystemProxySettings["source"], dialect: BypassDialect): SystemProxySettings {
  return { ...emptySettings(source, dialect), invalid: true, issues: [{ code: "internal" }] }
}

export function directResult(notices: SystemProxyNotice[] = []): SystemProxyResult {
  return {
    state: "direct",
    summary: { source: "none", noProxy: "", skipped: [] },
    notices,
  }
}

export function failedResult(code: "read-failed" | "timeout" | "internal", detail?: string): SystemProxyResult {
  return {
    state: "failed",
    summary: { source: "none", noProxy: "", skipped: [] },
    notices: [{ code, ...(detail ? { detail } : {}) }],
  }
}
