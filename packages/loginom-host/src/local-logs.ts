import { appendFileSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { createRedactor } from "../../loginom-runtime/client/lib/redact.mjs"

export const LOG_DAY_MS = 24 * 60 * 60 * 1000
export const SIDECAR_LOG_BYTES = 20 * 1024 * 1024
export const DESKTOP_LOG_BYTES = 100 * 1024 * 1024 - SIDECAR_LOG_BYTES
const FILE_BYTES = 5 * 1024 * 1024
const ENTRY_BYTES = 64 * 1024

export function retainedLogs(root: string, maxBytes: number, excluded: readonly string[] = [], scope: "desktop" | "service" = "desktop") {
  let used = 0
  const exclusions = excluded.map((path) => relative(root, path))

  function prune(keep?: string, incoming = 0) {
    const cutoff = Date.now() - 7 * LOG_DAY_MS
    const files: { path: string; size: number; mtimeMs: number }[] = []
    const directories: string[] = []
    const resolved = attempt(() => realpathSync(root))
    const walk = (dir: string) => {
      const entries = attempt(() => readdirSync(dir, { withFileTypes: true })) ?? []
      for (const entry of entries) {
        const path = join(dir, entry.name)
        if (resolved && exclusions.includes(relative(resolved, path))) continue
        if (scope === "desktop" && entry.isDirectory()) {
          walk(path)
          directories.push(path)
        } else if (entry.isFile() && (scope === "service" ? /^service-.+\.log$/.test(entry.name) : /\.(?:log|netlog)$/.test(entry.name))) {
          const info = attempt(() => lstatSync(path))
          if (info?.isFile()) files.push({ path, size: info.size, mtimeMs: info.mtimeMs })
        }
      }
    }
    if (resolved) walk(resolved)
    const kept = resolved && keep && join(resolved, relative(root, keep))

    used = files.reduce((sum, file) => sum + file.size, 0)
    for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
      if (file.path === kept || (file.mtimeMs >= cutoff && used + incoming <= maxBytes)) continue
      try {
        unlinkSync(file.path)
        used -= file.size
      } catch {
        // A file held open during export can be retried at the next cleanup.
      }
    }
    for (const dir of directories) attempt(() => rmdirSync(dir))
  }

  function append(target: string, line: string) {
    const text = Buffer.byteLength(line) <= ENTRY_BYTES ? `${line}\n` : "[oversized log entry omitted]\n"
    const size = Buffer.byteLength(text)
    attempt(() => {
      const info = lstatSync(target, { throwIfNoEntry: false })
      if (info && !info.isFile()) return
      const expired = info && info.mtimeMs < Date.now() - 7 * LOG_DAY_MS
      const rotate = info && info.size + size > FILE_BYTES
      if (expired) unlinkSync(target)
      else if (rotate) renameSync(target, target.replace(/\.log$/, ".old.log"))

      if (!info || expired || rotate || used + size > maxBytes) prune(target, size)
      if (used + size > maxBytes) return
      if (!info || expired || rotate) mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
      appendFileSync(target, text, { mode: 0o600 })
      used += size
    })
  }

  return { prune: () => prune(), append }
}

export function pruneLegacyLogs(roots: readonly string[]) {
  const cutoff = Date.now() - 7 * LOG_DAY_MS
  for (const root of roots) {
    for (const name of ["loginom-ai-agent.log", "loginom-ai-agent-local.log", "loginom-ai-agent-beta.log", "loginom-ai-agent-dev.log"]) {
      const path = join(root, name)
      const info = attempt(() => lstatSync(path))
      if (info?.isFile() && info.mtimeMs < cutoff) attempt(() => unlinkSync(path))
    }
  }
}

export function redactLogValues(values: unknown[], known: string[] = []): unknown[] {
  try {
    const data: unknown = JSON.parse(
      JSON.stringify(values, (key, value: unknown) => {
        if (key === "args") return "[redacted]"
        if (value instanceof Error)
          return { name: value.name, message: value.message, stack: value.stack, cause: value.cause }
        if (typeof value === "string")
          return value.replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
        return typeof value === "bigint" ? value.toString() : value
      }),
    )
    const cleaned = createRedactor(known).redact(data)
    if (Array.isArray(cleaned)) return cleaned
  } catch {
    // The original values may contain credentials or have an unsupported shape.
  }
  return ["[log entry omitted because redaction could not complete]"]
}

function attempt<T>(operation: () => T) {
  try {
    return operation()
  } catch {
    // Log maintenance must survive a concurrent rotation or a locked file.
    return undefined
  }
}
