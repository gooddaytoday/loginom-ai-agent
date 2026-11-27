import { appendFileSync, lstatSync, mkdirSync, readdirSync, renameSync, rmdirSync, unlinkSync } from "node:fs"
import { dirname, join } from "node:path"
import { createRedactor } from "../../loginom-runtime/client/lib/redact.mjs"

export const LOG_DAY_MS = 24 * 60 * 60 * 1000
export const SIDECAR_LOG_BYTES = 20 * 1024 * 1024
export const DESKTOP_LOG_BYTES = 100 * 1024 * 1024 - SIDECAR_LOG_BYTES
const FILE_BYTES = 5 * 1024 * 1024
const ENTRY_BYTES = 64 * 1024

export function retainedLogs(root: string, maxBytes: number, excluded: readonly string[] = []) {
  let used = 0

  function prune(keep?: string, incoming = 0) {
    const cutoff = Date.now() - 7 * LOG_DAY_MS
    const files: { path: string; size: number; mtimeMs: number }[] = []
    const directories: string[] = []
    const walk = (dir: string) => {
      const entries = attempt(() => readdirSync(dir, { withFileTypes: true })) ?? []
      for (const entry of entries) {
        const path = join(dir, entry.name)
        if (excluded.includes(path)) continue
        if (entry.isDirectory()) {
          walk(path)
          directories.push(path)
        } else if (entry.isFile() && /\.(?:log|netlog)$/.test(entry.name)) {
          const info = attempt(() => lstatSync(path))
          if (info?.isFile()) files.push({ path, size: info.size, mtimeMs: info.mtimeMs })
        }
      }
    }
    if (attempt(() => lstatSync(root))?.isDirectory()) walk(root)

    used = files.reduce((sum, file) => sum + file.size, 0)
    for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
      if (file.path === keep || (file.mtimeMs >= cutoff && used + incoming <= maxBytes)) continue
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
