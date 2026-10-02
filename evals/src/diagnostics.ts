import path from "node:path"
import { constants } from "node:fs"
import { lstat, mkdir, open, realpath } from "node:fs/promises"

const sensitive = /(?:password|passwd|secret|token|cookie|authorization|api.?key|private.?key)/i
const forbidden = /^(?:argv|args|environment|environ|auth|config|browser_profile|browserProfile|reasoning|system_prompt|developer_prompt|binary|base64)$/i
const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex")

/** Whitelist execution journals only. Source directories are a supervisor receipt,
 * never a recursive copy of the profile. Failure leaves every source intact.
 */
export async function archiveDiagnostics(profile: string, directories: string[], out: string, secrets: string[] = []) {
  const canonical = await realpath(profile)
  const known = new Set(secrets.filter(Boolean))
  const sources = await Promise.all([...new Set(directories)].sort().map(async (directory) => {
    const relative = path.relative(canonical, directory)
    if (!/^loginom\/runtime\/generations\/[^/]+\/chats\/[^/]+\/attempts\/[^/]+$/.test(relative) ||
      await realpath(directory) !== directory || !(await lstat(directory)).isDirectory())
      throw Error("Diagnostic runtime ownership path differs")
    const file = path.join(directory, "execution-events.jsonl")
    const info = await lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw Error("Cannot inspect execution journal")
    })
    if (!info) return undefined
    if (!info.isFile() || info.isSymbolicLink()) throw Error("Execution journal is not a regular private file")
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const current = await handle.stat()
      if (current.dev !== info.dev || current.ino !== info.ino) throw Error("Execution journal identity changed")
      const records: unknown[] = (await handle.readFile("utf8")).split("\n").filter((line) => line.trim()).map((line) => {
        try { return JSON.parse(line) } catch { throw Error("Invalid execution journal record") }
      })
      records.forEach((record) => prime(record, known))
      return { source: path.join(relative, "execution-events.jsonl"), records }
    } finally { await handle.close() }
  }))
  await mkdir(path.join(out, "diagnostics"), { recursive: true, mode: 0o700 })
  const files = []
  for (const [index, source] of sources.filter((entry) => entry !== undefined).entries()) {
    const text = source.records.map((record) => JSON.stringify(clean(record, known))).join("\n") + "\n"
    const archive = `diagnostics/${index + 1}-execution-events.jsonl`
    const handle = await open(path.join(out, archive), "wx", 0o600)
    try { await handle.writeFile(text); await handle.sync() } finally { await handle.close() }
    if (hash(await Bun.file(path.join(out, archive)).text()) !== hash(text)) throw Error("Diagnostic archive read-back differs")
    files.push({ source: source.source, archive, bytes: Buffer.byteLength(text), sha256: hash(text) })
  }
  const manifest = { version: 1, runtime_directories: directories.map((directory) => path.relative(canonical, directory)), files }
  const handle = await open(path.join(out, "diagnostics/manifest.json"), "wx", 0o600)
  try { await handle.writeFile(JSON.stringify(manifest, null, 2)); await handle.sync() } finally { await handle.close() }
  if (JSON.stringify(await Bun.file(path.join(out, "diagnostics/manifest.json")).json()) !== JSON.stringify(manifest))
    throw Error("Diagnostic manifest read-back differs")
  return manifest
}

function prime(value: unknown, known: Set<string>, depth = 0) {
  if (depth > 40) throw Error("Diagnostic nesting limit")
  if (typeof value === "string" && /^[\s]*[\[{]/.test(value)) {
    try { prime(JSON.parse(value), known, depth + 1) } catch (error) { if (!(error instanceof SyntaxError)) throw error }
  }
  if (!value || typeof value !== "object") return
  for (const [key, item] of Object.entries(value)) {
    if (sensitive.test(key) && typeof item === "string" && item) known.add(item)
    if (!forbidden.test(key)) prime(item, known, depth + 1)
  }
}

function clean(value: unknown, known: Set<string>, depth = 0): unknown {
  if (depth > 40) throw Error("Diagnostic nesting limit")
  if (typeof value === "string") {
    if (/^[\s]*[\[{]/.test(value)) {
      try { return JSON.stringify(clean(JSON.parse(value), known, depth + 1)) }
      catch (error) { if (!(error instanceof SyntaxError)) throw error }
    }
    return [...known].sort((a, b) => b.length - a.length).reduce((text, secret) =>
      [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)].reduce((current, variant) =>
        current.replaceAll(variant, "[redacted]"), text), value)
      .replace(/\b(?:Bearer|Basic)\s+[^\s"']+/gi, "[redacted]")
      .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,})\b/g, "[redacted]")
      .replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
        try { const url = new URL(raw); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.href }
        catch { return "[URL omitted]" }
      })
  }
  if (Array.isArray(value)) return value.map((item) => clean(item, known, depth + 1))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !forbidden.test(key)).map(([key, item]) =>
    [key, sensitive.test(key) ? "[redacted]" : clean(item, known, depth + 1)]))
}
