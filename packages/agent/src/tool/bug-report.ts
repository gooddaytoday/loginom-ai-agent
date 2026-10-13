import { createHash } from "node:crypto"
import { homedir } from "node:os"
import { basename, extname, isAbsolute, join, relative } from "node:path"
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js"
import { Effect, Option, Schema } from "effect"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { Global } from "@loginom-ai-agent/core/global"
import { SessionV1 } from "@loginom-ai-agent/core/v1/session"
import { productChannel, Product } from "@loginom-ai-agent/product"
import { productSkillsDirectory } from "@loginom-ai-agent/product/skills"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { assertExternalDirectoryEffect } from "./external-directory"
import { Tool } from "./tool"

const MAX_LOG_BYTES = 1024 * 1024
const MAX_READ_BYTES = 8 * 1024 * 1024
const MAX_TOOL_OUTPUT = 32 * 1024
const MAX_FINDINGS = 200
const PREVIEW_LINES = 20
const PREVIEW_BYTES = 4 * 1024
const DEFAULT_HOURS = 24
const COPIED_EXTENSIONS = new Set([".log", ".jsonl", ".txt"])
// Network captures and crash dumps can contain cookies and are large; list them instead of copying.
const LISTED_EXTENSIONS = new Set([".netlog", ".dmp", ".heapsnapshot"])
const HEADINGS = [
  "# Отчёт о проблеме",
  "## Что произошло",
  "## Что ожидалось",
  "## Шаги",
  "## Окружение",
  "## Где смотреть",
  "## Гипотеза",
  "## Что приложено",
]

export const Parameters = Schema.Union([
  Schema.Struct({
    operation: Schema.Literal("collect"),
    hours: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 168 }))),
  }),
  Schema.Struct({
    operation: Schema.Literal("pack"),
    include: Schema.optional(
      Schema.Struct({
        chat: Schema.optional(Schema.Boolean),
        logs: Schema.optional(Schema.Boolean),
      }),
    ),
  }),
])

type Params = Schema.Schema.Type<typeof Parameters>
type History = Schema.Schema.Type<typeof SessionV1.WithParts>

export const BugReportTool = Tool.define(
  "bug_report_run",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const sessions = yield* Session.Service
    const flags = yield* RuntimeFlags.Service

    return {
      description:
        "Collect a redacted chat export, recent logs and a problem-report skeleton, or pack them into a zip. Use only after the bug-report skill is loaded and only when the user asked to report a problem or request.",
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const session = yield* sessions.get(ctx.sessionID)
          const directory = yield* fs.realPath(session.directory)
          const messages = yield* sessions.messages({ sessionID: ctx.sessionID })
          if (params.operation === "pack") return yield* pack(fs, ctx, session, directory, params.include)
          return yield* collect(fs, ctx, flags, session, messages, directory, params.hours ?? DEFAULT_HOURS)
        }).pipe(Effect.orDie),
    }
  }),
)

const collect = Effect.fn("BugReport.collect")(function* (
  fs: FSUtil.Interface,
  ctx: Tool.Context,
  flags: RuntimeFlags.Info,
  session: Session.Info,
  messages: History[],
  directory: string,
  hours: number,
) {
  const instance = yield* InstanceState.context
  const work = join(directory, ".work", "bug-report", stamp() + "-" + session.id.slice(-8))
  const desktop = process.env.LOGINOM_AI_AGENT_DESKTOP_LOG_ROOT
  const roots = yield* logRoots(fs, Global.Path.log, desktop || undefined)
  if (roots.length)
    yield* Effect.forEach(roots, (root) => assertExternalDirectoryEffect(ctx, root.path, { kind: "directory" }))
  if (roots.length)
    yield* ctx.ask({
      permission: "read",
      patterns: roots.map((root) => relativePath(instance.worktree, root.path) + "/*"),
      always: roots.map((root) => relativePath(instance.worktree, root.path) + "/*"),
      metadata: { filepath: roots[0].path },
    })
  yield* ctx.ask({
    permission: "edit",
    patterns: [relativePath(instance.worktree, work) + "/*"],
    always: [relativePath(instance.worktree, work) + "/*"],
    metadata: { filepath: work },
  })
  const state = { count: 0 }
  const chat = scrub(exportChat(session, messages), state)
  const logs = join(work, "logs")
  const collected = yield* Effect.forEach(roots, (root) =>
    readRoot(fs, root, Date.now() - hours * 60 * 60 * 1000, state),
  )
  const environment = scrub(environmentOf(flags, session, messages), state)
  const index = {
    generated: new Date().toISOString(),
    sessionID: session.id,
    windowHours: hours,
    sources: collected.map((item) => item.source),
    chatErrors: chatErrors(messages),
    logFindings: collected.flatMap((item) => item.findings).slice(0, MAX_FINDINGS),
    crashNotes: collected.flatMap((item) => item.crashNotes).slice(0, MAX_FINDINGS),
    omitted: collected.flatMap((item) => item.omitted),
    truncated: collected.flatMap((item) => item.truncated),
  }
  const redactedIndex = scrub(index, state)
  const template = yield* reportTemplate(fs, flags.loginomResources)
  yield* fs.makeDirectory(join(work, "logs"), { recursive: true })
  const chatFile = chatName(session.id)
  yield* fs.writeFileString(join(work, chatFile), JSON.stringify(chat, null, 2))
  yield* fs.writeFileString(join(work, "environment.json"), JSON.stringify(environment, null, 2))
  yield* fs.writeFileString(
    join(work, "index.json"),
    JSON.stringify({ ...record(redactedIndex), redactions: state.count }, null, 2),
  )
  yield* fs.writeFileString(join(work, "report.md"), template)
  yield* Effect.forEach(collected.flatMap((item) => item.files), (file) =>
    Effect.gen(function* () {
      const output = join(logs, file.name)
      yield* fs.makeDirectory(join(output, ".."), { recursive: true })
      yield* fs.writeFileString(output, file.text)
    }),
  )
  const files = yield* inventory(fs, work)
  return {
    title: "Материалы: collect",
    output: JSON.stringify({
      directory: work,
      report: join(work, "report.md"),
      chat: join(work, chatFile),
      index: join(work, "index.json"),
      environment: join(work, "environment.json"),
      logs,
      redactions: state.count,
      files,
    }),
    metadata: { truncated: false },
  }
})

const pack = Effect.fn("BugReport.pack")(function* (
  fs: FSUtil.Interface,
  ctx: Tool.Context,
  session: Session.Info,
  directory: string,
  include: { chat?: boolean; logs?: boolean } | undefined,
) {
  const instance = yield* InstanceState.context
  const work = yield* latestWork(fs, directory, session.id.slice(-8))
  const reportPath = join(work, "report.md")
  yield* ctx.ask({
    permission: "read",
    patterns: [relativePath(instance.worktree, reportPath)],
    always: ["*"],
    metadata: { filepath: reportPath },
  })
  const report = yield* fs.readFileString(reportPath).pipe(
    Effect.catch(() => Effect.die(Error("BUG_REPORT_NOT_COLLECTED: сначала выполните collect."))),
  )
  if (/PLACEHOLDER_[A-Z0-9_]+/.test(report) || HEADINGS.some((heading) => !report.split("\n").includes(heading)))
    return yield* Effect.die(Error("BUG_REPORT_INCOMPLETE: заполните report.md и уберите PLACEHOLDER_*."))
  const index = record(yield* fs.readJson(join(work, "index.json")))
  const folder = basename(work)
  const suffix = "-" + session.id.slice(-8)
  const mark = folder.endsWith(suffix) ? folder.slice(0, -suffix.length) : stamp()
  const output = yield* availableZip(fs, directory, mark)
  const chat = include?.chat !== false
  const logs = include?.logs !== false
  yield* ctx.ask({
    permission: "edit",
    patterns: [relativePath(instance.worktree, output)],
    always: [relativePath(instance.worktree, output)],
    metadata: { filepath: output },
  })
  const encoder = new TextEncoder()
  const entries = [
    { name: "report.md", data: encoder.encode(report) },
    { name: "environment.json", data: yield* fs.readFile(join(work, "environment.json")) },
    { name: "index.json", data: yield* fs.readFile(join(work, "index.json")) },
    ...(chat ? [{ name: chatName(session.id), data: yield* fs.readFile(join(work, chatName(session.id))) }] : []),
    ...(logs ? yield* logEntries(fs, join(work, "logs")) : []),
  ]
  const manifest = encoder.encode(
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        sessionID: session.id,
        redactions: typeof index.redactions === "number" ? index.redactions : 0,
        include: { chat, logs },
        files: entries.map((entry) => ({ name: entry.name, bytes: entry.data.byteLength })),
      },
      null,
      2,
    ),
  )
  const zipped = [...entries, { name: "manifest.json", data: manifest }]
  const bytes = yield* zipBytes(zipped)
  yield* fs.writeFile(output, bytes)
  return {
    title: "Архив: pack",
    output: JSON.stringify({
      output,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      redactions: typeof index.redactions === "number" ? index.redactions : 0,
      files: zipped.map((entry) => entry.name),
    }),
    metadata: { truncated: false },
  }
})

const logRoots = Effect.fn("BugReport.logRoots")(function* (fs: FSUtil.Interface, profile: string, desktop?: string) {
  const candidates = [
    { name: "profile", path: profile },
    ...(desktop ? [{ name: "desktop", path: desktop }] : []),
  ]
  const seen = new Set<string>()
  const roots: { name: string; path: string }[] = []
  for (const candidate of candidates) {
    if (!(yield* fs.existsSafe(candidate.path))) continue
    const path = yield* fs.realPath(candidate.path).pipe(Effect.catch(() => Effect.succeed(candidate.path)))
    if (seen.has(path)) continue
    seen.add(path)
    roots.push({ name: candidate.name, path })
  }
  return roots
})

const readRoot = Effect.fn("BugReport.readRoot")(function* (
  fs: FSUtil.Interface,
  root: { name: string; path: string },
  cutoff: number,
  state: { count: number },
) {
  const files: { name: string; text: string }[] = []
  const findings: { file: string; line: number; level: string; time?: string; excerpt: string }[] = []
  const crashNotes: { file: string; line: number; time?: string; excerpt: string }[] = []
  const omitted: { path: string; reason: string; bytes?: number }[] = []
  const truncated: { file: string; lineOffset: number; bytes: number }[] = []
  const pending = [root.path]
  while (pending.length > 0) {
    const dir = pending.shift()
    if (!dir) continue
    const entries = yield* fs.readDirectoryEntries(dir).pipe(Effect.orElseSucceed(() => []))
    for (const entry of entries) {
      if (!entry.name || entry.name === "." || entry.name === ".." || entry.name.includes("/") || entry.name.includes("\\"))
        continue
      const absolute = join(dir, entry.name)
      if (entry.type === "directory") {
        pending.push(absolute)
        continue
      }
      if (entry.type !== "file") continue
      const info = yield* fs.stat(absolute).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!info || info.type !== "File") continue
      const modified = Option.getOrElse(info.mtime, () => new Date(0)).getTime()
      if (modified < cutoff) continue
      const extension = extname(entry.name).toLowerCase()
      const archive = "logs/" + root.name + "/" + relative(root.path, absolute).replaceAll("\\", "/")
      if (isAbsolute(archive) || archive.includes("../")) continue
      const bytes = Number(info.size)
      if (LISTED_EXTENSIONS.has(extension)) {
        omitted.push({ path: replaceHome(absolute), reason: extension.slice(1), bytes })
        continue
      }
      if (!COPIED_EXTENSIONS.has(extension)) continue
      if (bytes > MAX_READ_BYTES) {
        omitted.push({ path: replaceHome(absolute), reason: "oversize", bytes })
        continue
      }
      const text = yield* fs.readFileString(absolute).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (text === undefined) {
        omitted.push({ path: replaceHome(absolute), reason: "unreadable", bytes })
        continue
      }
      const redacted = redact(text, state).text
      const lines = redacted.split("\n")
      const crash = basename(absolute).toLowerCase() === "crash.log"
      lines.forEach((line, index) => {
        const level = levelOf(line)
        const time = timeOf(line)
        const excerpt = cap(line, 240)
        if (level && findings.length < MAX_FINDINGS)
          findings.push({ file: archive, line: index + 1, level, ...(time ? { time } : {}), excerpt })
        if (crash && /previous session|ended unexpectedly/i.test(line) && crashNotes.length < MAX_FINDINGS)
          crashNotes.push({ file: archive, line: index + 1, ...(time ? { time } : {}), excerpt })
      })
      const tail = tailText(redacted, MAX_LOG_BYTES)
      if (tail.lineOffset > 0) truncated.push({ file: archive, lineOffset: tail.lineOffset, bytes: Buffer.byteLength(tail.text) })
      files.push({ name: archive.slice("logs/".length), text: tail.text })
    }
  }
  return {
    source: { name: root.name, path: replaceHome(root.path), files: files.length, omitted: omitted.length },
    files,
    findings,
    crashNotes,
    omitted,
    truncated,
  }
})

const logEntries = Effect.fn("BugReport.logEntries")(function* (fs: FSUtil.Interface, dir: string) {
  if (!(yield* fs.existsSafe(dir))) return []
  const files = (yield* fs.glob("**/*", { cwd: dir, dot: true, symlink: false })).toSorted()
  return yield* Effect.forEach(files, (file) =>
    Effect.gen(function* () {
      const absolute = join(dir, file)
      if ((yield* fs.stat(absolute)).type !== "File") return []
      return [{ name: "logs/" + file.replaceAll("\\", "/"), data: yield* fs.readFile(absolute) }]
    }),
  ).pipe(Effect.map((items) => items.flat()))
})

const latestWork = Effect.fn("BugReport.latestWork")(function* (fs: FSUtil.Interface, directory: string, suffix: string) {
  const root = join(directory, ".work", "bug-report")
  const entries = yield* fs.readDirectoryEntries(root).pipe(Effect.orElseSucceed(() => []))
  const names = entries
    .filter((entry) => entry.type === "directory" && entry.name.endsWith("-" + suffix))
    .map((entry) => entry.name)
    .toSorted()
  const name = names.at(-1)
  if (!name) return yield* Effect.die(Error("BUG_REPORT_NOT_COLLECTED: сначала выполните collect."))
  return join(root, name)
})

const availableZip = Effect.fn("BugReport.availableZip")(function* (fs: FSUtil.Interface, directory: string, mark: string) {
  const names = new Set(yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed(() => [])))
  let index = 1
  const base = "loginom-bug-report-" + mark
  while (names.has(base + (index > 1 ? "-" + index : "") + ".zip")) index++
  return join(directory, base + (index > 1 ? "-" + index : "") + ".zip")
})

const reportTemplate = Effect.fn("BugReport.reportTemplate")(function* (fs: FSUtil.Interface, resources?: string) {
  const bundled = resources ? join(resources, "skills/bug-report/references/report-template.md") : undefined
  const source = join(productSkillsDirectory, "bug-report/references/report-template.md")
  const path = bundled && (yield* fs.existsSafe(bundled)) ? bundled : source
  return yield* fs
    .readFileString(path)
    .pipe(Effect.catch(() => Effect.die(Error("BUG_REPORT_TEMPLATE_MISSING: переустановите приложение."))))
})

const inventory = Effect.fn("BugReport.inventory")(function* (fs: FSUtil.Interface, work: string) {
  const files = (yield* fs.glob("**/*", { cwd: work, dot: true, symlink: false })).toSorted()
  return yield* Effect.forEach(files, (file) =>
    Effect.gen(function* () {
      const info = yield* fs.stat(join(work, file))
      if (info.type !== "File") return []
      return [{ name: file.replaceAll("\\", "/"), bytes: Number(info.size) }]
    }),
  ).pipe(Effect.map((items) => items.flat()))
})

function zipBytes(entries: { name: string; data: Uint8Array }[]) {
  return Effect.promise(async () => {
    const writer = new ZipWriter(new BlobWriter("application/zip"))
    for (const entry of entries) {
      await writer.add(entry.name, new BlobReader(new Blob([new Uint8Array(entry.data)])))
    }
    const zip = await writer.close()
    return new Uint8Array(await zip.arrayBuffer())
  })
}

function exportChat(session: Session.Info, messages: History[]) {
  return JSON.parse(JSON.stringify({ info: session, messages }))
}

function environmentOf(flags: RuntimeFlags.Info, session: Session.Info, messages: History[]) {
  const assistant = messages.findLast((message) => message.info.role === "assistant")
  const model =
    assistant?.info.role === "assistant"
      ? { providerID: assistant.info.providerID, modelID: assistant.info.modelID }
      : session.model
        ? { providerID: session.model.providerID, modelID: session.model.id }
        : undefined
  return {
    product: Product.name,
    channel: productChannel(process.env.LOGINOM_AI_AGENT_CHANNEL),
    client: flags.client,
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    bun: process.versions.bun,
    sessionVersion: session.version,
    model,
    resourcesPresent: Boolean(flags.loginomResources),
  }
}

function chatErrors(messages: History[]) {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.type !== "tool" || part.state.status !== "error") return []
      return [
        {
          messageID: message.info.id,
          partID: part.id,
          callID: part.callID,
          tool: part.tool,
          time: part.state.time.end,
          code: /[A-Z][A-Z0-9_]{2,}/.exec(part.state.error)?.[0] ?? cap(part.state.error.split("\n")[0] ?? "error", 160),
        },
      ]
    }),
  )
}

function chatName(sessionID: string) {
  return sessionID + ".json"
}

function scrub(value: unknown, state: { count: number }, key?: string): unknown {
  if (isFilePart(value)) return scrubFile(value, state)
  if (typeof value === "string") {
    const limited = key === "output" ? cap(value, MAX_TOOL_OUTPUT) : value
    return redact(replaceHome(limited), state).text
  }
  if (Array.isArray(value)) return value.map((item) => scrub(item, state))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, scrub(item, state, name)]))
}

function isFilePart(value: unknown): value is Record<string, unknown> & { url: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.type === "file" && typeof record.url === "string"
}

function scrubFile(part: Record<string, unknown> & { url: string }, state: { count: number }) {
  const described = describeData(part.url)
  const scrubbed = Object.fromEntries(
    Object.entries(part)
      .filter(([name]) => name !== "url" && name !== "preview")
      .map(([name, item]) => [name, scrub(item, state, name)]),
  )
  if (!described) return { ...scrubbed, url: redact(replaceHome(part.url), state).text }
  if (described.text === undefined) return { ...scrubbed, url: described.marker }
  return {
    ...scrubbed,
    url: described.marker,
    preview: redact(replaceHome(previewText(described.text)), state).text,
  }
}

function describeData(url: string) {
  if (!url.startsWith("data:")) return undefined
  const comma = url.indexOf(",")
  const header = comma < 0 ? url.slice("data:".length) : url.slice("data:".length, comma)
  const mime = header.split(";")[0] || "application/octet-stream"
  const body = comma < 0 ? "" : url.slice(comma + 1)
  const base64 = header.includes("base64")
  const bytes = base64 ? Math.floor(body.replace(/\s/g, "").length * 0.75) : Buffer.byteLength(body)
  const marker = `omitted:data;mime=${mime};bytes=${bytes}`
  if (!mime.startsWith("text/")) return { marker }
  const text = base64 ? Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8") : percentText(body)
  return { marker, text }
}

function percentText(body: string) {
  if (/%(?![0-9A-Fa-f]{2})/.test(body)) return body
  return decodeURIComponent(body)
}

function previewText(text: string) {
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const chunks: string[] = []
  let bytes = 0
  for (const line of stripped.split("\n").slice(0, PREVIEW_LINES)) {
    const separator = chunks.length ? 1 : 0
    const size = Buffer.byteLength(line)
    if (bytes + separator + size <= PREVIEW_BYTES) {
      chunks.push(line)
      bytes += separator + size
      continue
    }
    const room = PREVIEW_BYTES - bytes - separator
    if (room > 0) chunks.push(cutBytes(line, room))
    break
  }
  return chunks.join("\n")
}

function cutBytes(text: string, max: number) {
  let bytes = 0
  let end = 0
  for (const char of text) {
    const size = Buffer.byteLength(char)
    if (bytes + size > max) break
    bytes += size
    end += char.length
  }
  return text.slice(0, end)
}

function replaceHome(text: string) {
  const home = homedir()
  if (home.length < 3) return text
  const values = [...new Set([home, home.replaceAll("\\", "/")])]
  return values.reduce(
    (result, value) => result.replace(new RegExp(escapeRegExp(value), process.platform === "win32" ? "gi" : "g"), "<HOME>"),
    text,
  )
}

function redact(text: string, state: { count: number }) {
  const rules: { pattern: RegExp; replace: (match: string, ...groups: string[]) => string }[] = [
    {
      pattern: /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi,
      replace: (_match, scheme: string) => {
        state.count++
        return scheme + "[redacted]@"
      },
    },
    {
      pattern: /(?:authorization\s*[:=]\s*)?bearer\s+[A-Za-z0-9._~+/=-]+/gi,
      replace: () => {
        state.count++
        return "[redacted]"
      },
    },
    {
      pattern: /\bsk-[A-Za-z0-9_-]{8,}\b/g,
      replace: () => {
        state.count++
        return "[redacted]"
      },
    },
    {
      pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      replace: () => {
        state.count++
        return "[redacted]"
      },
    },
    {
      pattern:
        /(^|[^A-Za-z0-9])(host_context_token|api_key|api-key|password|passwd|secret|cookie|token)(\s*["']?\s*[:=]\s*["']?)([^"'\s,}&]+)/gi,
      replace: (match, prefix: string, key: string, separator: string, value: string) => {
        if (value === "[redacted]") return match
        state.count++
        return prefix + key + separator + "[redacted]"
      },
    },
  ]
  const next = rules.reduce((result, rule) => result.replace(rule.pattern, rule.replace), text)
  return { text: next, count: state.count }
}

function tailText(text: string, max: number) {
  if (Buffer.byteLength(text) <= max) return { text, lineOffset: 0 }
  const lines = text.split("\n")
  const kept: string[] = []
  let bytes = 0
  for (let index = lines.length - 1; index >= 0; index--) {
    const next = Buffer.byteLength(lines[index]!) + (kept.length ? 1 : 0)
    if (bytes + next > max && kept.length) break
    if (next > max && !kept.length) {
      kept.push(tailBytes(lines[index]!, max))
      break
    }
    kept.push(lines[index]!)
    bytes += next
  }
  kept.reverse()
  return { text: kept.join("\n"), lineOffset: lines.length - kept.length }
}

function tailBytes(text: string, max: number) {
  let start = Math.max(0, text.length - max)
  while (start < text.length && Buffer.byteLength(text.slice(start)) > max) start++
  return text.slice(start)
}

function levelOf(line: string) {
  if (/\blevel=Error\b/.test(line) || /\[error\]/i.test(line)) return "error"
  if (/\blevel=Warn(?:ing)?\b/.test(line) || /\[warn(?:ing)?\]/i.test(line)) return "warn"
}

function timeOf(line: string) {
  return /timestamp=([^\s]+)/.exec(line)?.[1] ?? /^\[([^\]]+)\]/.exec(line)?.[1]
}

function cap(text: string, max: number) {
  if (Buffer.byteLength(text) <= max) return text
  let end = Math.min(text.length, max)
  while (end > 0 && Buffer.byteLength(text.slice(0, end)) > max) end = Math.floor(end * 0.9)
  return text.slice(0, end) + "\n[truncated]"
}

function relativePath(worktree: string, path: string) {
  return relative(worktree, path).replaceAll("\\", "/") || "."
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, (fraction) => fraction.slice(1, 4))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}
