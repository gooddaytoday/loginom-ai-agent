import type { BypassDialect } from "./types"

const LOOPBACK = ["localhost", "127.0.0.1", "::1", "[::1]"]

export type TranslatedBypass = {
  rules: string[]
  skipped: string[]
  approximated: string[]
  log: string[]
}

// Общий диалект NO_PROXY для Bun 1.3 и Node 24: точное имя и форма `.домен`.
// CIDR, диапазоны и маски IP не выражаются ни там, ни там — их пропускаем.
// `*vk.com` в Windows покрывает и `notvk.com`; наружу уходит только `vk.com,.vk.com`.
export function translateBypass(
  bypass: string[],
  dialect: BypassDialect,
  hostname: string,
  extra: string[] = [],
): TranslatedBypass {
  const rules: string[] = []
  const skipped: string[] = []
  const approximated: string[] = []
  const log: string[] = []
  const add = (value: string) => {
    const normalized = value.toLowerCase()
    if (!normalized || rules.includes(normalized)) return
    rules.push(normalized)
  }
  for (const raw of [...bypass, ...extra]) {
    const outcome = translateRule(raw.trim(), dialect, hostname)
    if (outcome.log) log.push(outcome.log)
    if (outcome.approximated) approximated.push(outcome.approximated)
    if (outcome.skipped) skipped.push(outcome.skipped)
    for (const rule of outcome.rules) add(rule)
  }
  for (const host of LOOPBACK) add(host)
  return { rules, skipped, approximated, log }
}

function translateRule(
  value: string,
  dialect: BypassDialect,
  hostname: string,
): { rules: string[]; skipped?: string; approximated?: string; log?: string } {
  if (!value) return { rules: [] }
  if (value === "*") return { rules: ["*"] }
  const token = value.toLowerCase()
  if (token === "<local>") return { rules: hostname ? [hostname.toLowerCase()] : [], approximated: "<local>" }
  if (token === "<-loopback>") return { rules: [], approximated: "<-loopback>" }
  const stripped = stripScheme(value)
  const subject = stripped.value
  const log = stripped.log
  if (subject.includes("/")) return { rules: [], skipped: value, log }
  if (subject.includes("*")) return wildcard(subject, value, log)
  if (subject.startsWith(".")) {
    const domain = subject.slice(1)
    if (!isDomain(domain)) return { rules: [], skipped: value, log }
    return { rules: [`.${domain.toLowerCase()}`], log }
  }
  const port = hostPort(subject)
  if (port) return { rules: ipv6Forms(port), log }
  if (isIpv4(subject)) return { rules: [subject], log }
  const ipv6 = ipv6Literal(subject)
  if (ipv6) return { rules: ipv6, log }
  if (!isDomain(subject)) return { rules: [], skipped: value, log }
  const domain = subject.toLowerCase()
  if (dialect === "gnome" || dialect === "kde") return { rules: [domain, `.${domain}`], log }
  return { rules: [domain], log }
}

function wildcard(subject: string, original: string, log?: string) {
  if (isIpv4Mask(subject)) return { rules: [], skipped: original, log }
  if (subject.startsWith("*.")) {
    const domain = subject.slice(2)
    if (!isDomain(domain)) return { rules: [], skipped: original, log }
    return { rules: [`.${domain.toLowerCase()}`], log }
  }
  if (subject.startsWith("*") && !subject.slice(1).includes("*")) {
    const domain = subject.slice(1)
    if (!isDomain(domain)) return { rules: [], skipped: original, log }
    const normalized = domain.toLowerCase()
    return { rules: [normalized, `.${normalized}`], log }
  }
  return { rules: [], skipped: original, log }
}

function stripScheme(value: string) {
  const match = /^(https?:\/\/)(.+)$/i.exec(value)
  if (!match) return { value }
  return { value: match[2], log: `scheme:${value}` }
}

function hostPort(value: string) {
  if (value.startsWith("[")) {
    const end = value.indexOf("]")
    if (end < 1) return undefined
    const host = value.slice(1, end)
    const rest = value.slice(end + 1)
    if (!rest.startsWith(":") || !validPort(rest.slice(1)) || !ipv6Literal(host)) return undefined
    return value.toLowerCase()
  }
  const colon = value.lastIndexOf(":")
  if (colon <= 0 || value.indexOf(":") !== colon) return undefined
  const host = value.slice(0, colon)
  const port = value.slice(colon + 1)
  if (!validPort(port) || (!isDomain(host) && !isIpv4(host))) return undefined
  return `${host.toLowerCase()}:${port}`
}

function ipv6Forms(value: string) {
  if (value.startsWith("[")) return [value.toLowerCase()]
  return [value.toLowerCase()]
}

function ipv6Literal(value: string) {
  const bare = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value
  if (!bare.includes(":") || !/^[a-f0-9:]+$/i.test(bare)) return undefined
  const bracket = `[${bare.toLowerCase()}]`
  return bare.toLowerCase() === bracket.slice(1, -1) ? [bare.toLowerCase(), bracket] : [bracket]
}

function isIpv4Mask(value: string) {
  const parts = value.split(".")
  if (parts.length < 2 || parts.length > 4) return false
  if (!parts.every((part) => part === "*" || /^\d{1,3}$/.test(part))) return false
  if (!parts.some((part) => part === "*")) return false
  return parts.every((part) => part === "*" || Number(part) <= 255)
}

function isIpv4(value: string) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return false
  return value.split(".").every((part) => Number(part) <= 255)
}

function isDomain(value: string) {
  return (
    value.length > 0 &&
    value.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i.test(value)
  )
}

function validPort(port: string) {
  if (!/^\d+$/.test(port)) return false
  const value = Number(port)
  return value >= 1 && value <= 65535
}

export function mergeNoProxy(rules: string[], environment: NodeJS.ProcessEnv) {
  const merged = [...rules]
  const existing = `${environment.NO_PROXY ?? ""} ${environment.no_proxy ?? ""}`
  for (const item of existing.split(/[\s,]+/)) {
    const normalized = item.trim().toLowerCase()
    if (!normalized || merged.includes(normalized)) continue
    merged.push(normalized)
  }
  return merged
}
