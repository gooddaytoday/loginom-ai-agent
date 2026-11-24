import path from "node:path"
import { realpath } from "node:fs/promises"
import { confirmedProfileArchive } from "./profile-archive"
import { browserRecoveryToolName, isBrowserRecoveryTool } from "../../packages/loginom-runtime/client/lib/browser-recovery.mjs"

type Row = Record<string, unknown>
const object = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {}
const id = (v: unknown) => typeof v === "string" && /^[\w.:-]{1,180}$/.test(v) ? v : null
const bool = (v: unknown) => typeof v === "boolean" ? v : null
const digest = (v: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(v).digest("hex")
function parse(text: unknown): Row {
  try { return typeof text === "string" ? object(JSON.parse(text)) : {} } catch { return {} }
}
type Source = { source: string; sha256: string; origin: "diagnostics" | "profile"; rows: ReturnType<typeof lines>; text?: { rows: ReturnType<typeof lines>; sha256: string } }
function lines(text: string, label: string, gaps: Set<string>) {
  return text.split(/\r?\n/).flatMap((line, i) => {
    if (!line.trim()) return []
    const row = parse(line)
    if (!Object.keys(row).length) { gaps.add(label + ":invalid-line"); return [] }
    return [{ ...row, line: i + 1 } as Row & { line: number }]
  })
}
async function nativeSources(dir: string, session: string, gaps: Set<string>, archive?: string) {
  const manifest = await Bun.file(path.join(dir, "diagnostics/manifest.json")).json().catch(() => null)
  const sources: Source[] = []
  const pattern = new RegExp("^loginom/runtime/generations/[\\w-]+/chats/" + digest(session) + "/attempts/[\\w-]+$")
  if (manifest?.version === 1 && Array.isArray(manifest.runtime_directories) && Array.isArray(manifest.files)) {
    for (const directory of new Set<string>(manifest.runtime_directories.filter((v: unknown) => typeof v === "string" && pattern.test(v)))) {
      const source = directory + "/execution-events.jsonl"
      const entries = manifest.files.filter((f: Row) => f?.source === source)
      const file = entries[0]
      if (entries.length !== 1 || !/^diagnostics\/\d+-execution-events\.jsonl$/.test(file.archive)) { gaps.add("native:manifest"); continue }
      const stored = path.join(dir, file.archive)
      const bytes = await realpath(stored).catch(() => null) === stored ? await Bun.file(stored).bytes().catch(() => null) : null
      if (!bytes || bytes.length !== file.bytes || digest(bytes) !== file.sha256) { gaps.add("native:digest"); continue }
      sources.push({ source, origin: "diagnostics", sha256: file.sha256, rows: lines(new TextDecoder().decode(bytes), "native", gaps) })
    }
  }
  if (archive) {
    const files = new Bun.Glob("loginom/runtime/generations/*/chats/" + digest(session) + "/attempts/*/execution-events.jsonl")
    const paths = await Array.fromAsync(files.scan({ cwd: archive, onlyFiles: true })).catch(() => { gaps.add("native:unreadable"); return [] })
    for (const source of paths) {
      const file = path.join(archive, source)
      if (await realpath(file).catch(() => null) !== file) { gaps.add("native:path"); continue }
      const bytes = await Bun.file(file).bytes().catch(() => null)
      if (!bytes) { gaps.add("native:unreadable"); continue }
      const rows = lines(new TextDecoder().decode(bytes), "native", gaps)
      const sidecar = path.join(path.dirname(file), "browser-recovery-text.jsonl")
      const text = await realpath(sidecar).catch(() => null) === sidecar ? await Bun.file(sidecar).bytes().catch(() => null) : null
      const previous = sources.findIndex(s => s.source === source)
      if (previous >= 0) sources.splice(previous, 1)
      sources.push({ source, origin: "profile", sha256: digest(bytes), rows,
        ...(text ? { text: { rows: lines(new TextDecoder().decode(text), "text", gaps), sha256: digest(text) } } : {}) })
    }
  }
  if (!sources.some(s => s.rows.length)) gaps.add("native:missing")
  return sources
}

type Profile = { profileDir: string; historyDir?: string }
export async function recoveryEpisode(dir: string, expected?: string | null, slot?: Profile) {
  const gaps = new Set<string>()
  const bytes = await Bun.file(path.join(dir, "events.jsonl")).bytes().catch(() => null)
  const events = lines(bytes ? new TextDecoder().decode(bytes) : "", "cli", gaps)
  const sessions = new Set(events.map(e => id(e.sessionID)).filter(s => s !== null))
  const session = expected ?? (sessions.size === 1 ? [...sessions][0] : null)
  if (!bytes || !events.length) gaps.add("cli:missing")
  if (!session || sessions.size !== 1 || !sessions.has(session)) gaps.add("cli:session")
  const cleanup = slot ? await Bun.file(path.join(dir, "cleanup.json")).json().catch(() => null) : null
  // Recovery of a failed cleanup can require mutable slot state. This offline reader uses only closed profiles.
  const archive = slot && cleanup && cleanup.processes?.status !== "failed"
    ? await confirmedProfileArchive(dir, slot.profileDir, slot.historyDir).catch(() => undefined) : undefined
  const sources = session ? await nativeSources(dir, session, gaps, archive).catch(() => { gaps.add("native:unreadable"); return [] }) : []
  const nativeRows = sources.flatMap(s => s.rows.filter(r => typeof r.phase === "string" && r.phase.startsWith("browser_recovery_")))
  const terminal = events.findLast(e => e.type === "step_finish" && e.sessionID === session)
  if (object(terminal?.part).reason !== "stop" || events.some(e => !e.type || (e.type === "tool_use" && (object(e.part).type !== "tool" ||
    !id(object(e.part).tool) || (object(e.part).sessionID && object(e.part).sessionID !== e.sessionID))))) gaps.add("cli:incomplete")
  const calls = events.flatMap(e => {
    const part = object(e.part), state = object(part.state)
    if (e.type !== "tool_use" || e.sessionID !== session || (part.sessionID && part.sessionID !== session)) return []
    const name = typeof part.tool === "string" && part.tool.startsWith("loginom_") ? part.tool.slice(8) : ""
    if (!isBrowserRecoveryTool(name)) return []
    const input = object(state.input), output = parse(state.output ?? state.error)
    const screenshots = object(state.metadata).screenshotFiles
    const files = name === "browser_take_screenshot" && Array.isArray(screenshots) ? screenshots.map(object).flatMap(f =>
      id(f.partID) && typeof f.sha256 === "string" && /^[a-f0-9]{64}$/.test(f.sha256) && typeof f.bytes === "number" &&
      Number.isSafeInteger(f.bytes) && f.bytes >= 0 && typeof f.mime === "string" && /^image\/(png|jpeg|webp|gif)$/.test(f.mime)
        ? [{ partID: id(f.partID), sha256: f.sha256, bytes: f.bytes, mime: f.mime }] : []) : null
    return [{ files, refused: state.status === "error" && typeof output.refused === "string" && !!output.refused, line: e.line, call: id(part.callID), message: id(part.messageID), tool: name, input, output,
      status: id(state.status), action: name === browserRecoveryToolName ? id(input.action) : null }]
  })
  const starts: number[] = []
  for (const [i, call] of calls.entries()) {
    if (call.action !== "start") continue
    const previous = calls[starts.at(-1) ?? -1]
    // A busy controller echoes the held operation in its refusal. This request started nothing.
    if (call.refused && previous && !previous.refused && call.output.operation_id === previous.input.operation_id &&
        ["handoff", "browser", "verify", "stopping"].includes(String(call.output.phase))) continue
    starts.push(i)
  }
  if (calls.length && starts[0] !== 0) gaps.add("cli:missing-start")
  const episodes = starts.map((i, index) => {
    const start = calls[i]!, operation = id(start.input.operation_id)
    const group = calls.slice(i, starts[index + 1]).filter(c => {
      const original = object(object(c.output.verification).original_operation)
      if (c.tool === browserRecoveryToolName && (!operation || (c.input.operation_id !== operation && !(c.refused && c.output.operation_id === operation)) ||
        (c.output.operation_id !== undefined && c.output.operation_id !== operation) || (original.operation_id !== undefined && original.operation_id !== operation))) {
        gaps.add("cli:operation")
        return false
      }
      return true
    })
    const candidates = sources.flatMap(source => source.rows.filter(r => r.phase === "browser_recovery_started" &&
      operation && r.operation_id === operation && id(r.attempt_id)).map(r => ({ source, attempt: id(r.attempt_id)! })))
    const match = !start.refused && candidates.length === 1 && starts.filter(k => !calls[k]!.refused && calls[k]!.input.operation_id === operation).length === 1 ? candidates[0] : undefined
    const rows = match?.source.rows.filter(r => r.operation_id === operation && r.attempt_id === match.attempt) ?? []
    const handoff = bool(rows.find(r => r.phase === "browser_recovery_handoff")?.stopped)
    if (!start.refused && start.output.phase === "browser" && handoff !== true) gaps.add("native:handoff")
    const nativeActions = rows.filter(r => r.phase === "browser_recovery_action")
    let nextAction = 0
    const actions = group.filter(c => c.tool !== browserRecoveryToolName).map(c => {
      // Admission refusals carry no phase. A post-dispatch refusal includes the controller view.
      const beforeDispatch = c.refused && c.output.phase === undefined
      const sha256 = digest(JSON.stringify(c.input)), r = beforeDispatch ? undefined : nativeActions[nextAction++]
      const linked = r?.tool === c.tool && r?.arguments_sha256 === sha256 ? r : undefined
      if (!linked && !beforeDispatch) gaps.add("native:action")
      const isError = bool(linked?.is_error), pageOk = bool(object(linked?.page).ok)
      const transportError = linked?.transport_error === null ? false : typeof linked?.transport_error === "string" ? true : null
      if (linked && (pageOk === null || transportError === null || (!transportError && isError === null))) gaps.add("native:action-outcome")
      const callsLeft = object(linked?.budget).calls_left
      const textRows = match?.source.text?.rows.filter(t => t.attempt_id === match.attempt && Number.isSafeInteger(callsLeft) &&
        t.calls_left === callsLeft && Array.isArray(t.text_blocks) && t.text_blocks.every(b => typeof b === "string")) ?? []
      const text = textRows.length === 1 ? { line: textRows[0]!.line, blocks: (textRows[0]!.text_blocks as string[]).length,
        sha256: match!.source.text!.sha256, source: path.join(path.dirname(match!.source.source), "browser-recovery-text.jsonl") } : null
      if (!text && object(linked?.page).ok === true && Array.isArray(linked?.content) && linked.content.some(b => object(b).type === "text")) gaps.add("text:missing")
      if (linked?.tool === "browser_take_screenshot" && Array.isArray(linked.content) &&
        linked.content.filter(b => object(b).type === "image").length > (c.files?.length ?? 0)) gaps.add("cli:screenshot-files")
      return { ...(c.files ? { files: c.files } : {}), refused: c.refused, call: c.call, message: c.message, line: c.line, tool: c.tool, sha256, nativeLine: linked?.line ?? null, text,
        isError, transportError, pageOk }
    })
    if (nativeActions.some(r => !actions.some(a => a.nativeLine === r.line))) gaps.add("cli:unmatched-action")
    const controls = group.filter(c => c.action).map(c => {
      const v = object(c.output.verification), original = object(v.original_operation), stopped = object(c.output.stopped)
      return { line: c.line, call: c.call, message: c.message, action: c.action, status: c.status, phase: id(c.output.phase),
        refused: c.refused, operation: id(c.input.operation_id), verification: id(v.status), uncertain: bool(v.uncertain),
        receipt: id(v.receipt_id), original: id(original.status), configuration: id(object(original.configuration).status),
        execution: id(object(original.execution).status), stopped: id(stopped.code), cleanup: id(object(stopped.cleanup).state) }
    })
    const finish = controls.findLast(c => c.verification)
    const stop = group.map(c => object(c.output.stopped)).findLast(s => id(s.code))
    const nativeStop = rows.findLast(r => r.phase === "browser_recovery_stopped")
    const nativeCode = id(nativeStop?.code), nativeCleanup = id(object(nativeStop?.cleanup).state)
    if (nativeStop && !nativeCode) gaps.add("native:stop-code")
    if (nativeStop && !nativeCleanup) gaps.add("native:stop-cleanup")
    if (stop && (!nativeStop || nativeStop.code !== stop.code || object(nativeStop.cleanup).state !== object(stop.cleanup).state)) gaps.add("native:stop")
    const verifiedRow = rows.findLast(r => r.phase === "browser_recovery_verified")
    const verified = id(verifiedRow?.status)
    const receipt = finish?.receipt && verifiedRow?.receipt_id === finish.receipt && match?.source.rows.some(r =>
      r.phase === "browser_recovery_receipt" && r.operation_id === operation && object(r.receipt).id === finish.receipt) ? finish.receipt : null
    if (finish && (verified !== finish.verification || !rows.some(r => r.phase === "browser_recovery_attested"))) gaps.add("native:verification")
    if (finish?.receipt && !receipt) gaps.add("native:receipt")
    const started = start.refused ? false : match || start.output.phase === "browser" ? true : null
    if (started && !nativeStop && !stop && !["continuable", "completed"].includes(finish?.verification ?? "")) gaps.add("episode:outcome")
    if (started === null || !start.refused && candidates.length && !match) gaps.add("native:start")
    return { operation, controls, started, nativeAttempt: match?.attempt ?? null, nativeSource: match?.source.source ?? null, handoff, actions,
      cliVerification: finish?.verification ?? null, stop: id(stop?.code), cleanup: id(object(stop?.cleanup).state),
      nativeStop: nativeCode, nativeCleanup, verified, receipt, original: finish?.original ?? null, configuration: finish?.configuration ?? null, execution: finish?.execution ?? null }
  })
  if (nativeRows.some(r => !episodes.some(ep => ep.operation === r.operation_id && (ep.nativeAttempt === r.attempt_id ||
    (r.phase === "browser_recovery_receipt" && ep.receipt && ep.receipt === object(r.receipt).id))))) gaps.add("cli:unmatched-native")
  const nativePhases = sources.length && ![...gaps].some(g => ["native:invalid-line", "native:manifest", "native:digest", "native:missing", "native:path", "native:unreadable"].includes(g))
    ? nativeRows.length : null
  return { session: session ?? null, cliSha256: bytes ? digest(bytes) : null, sources: sources.map(({ source, sha256, origin }) => ({ source, sha256, origin })),
    nativePhases, requested: starts.length ? true : [...gaps].some(g => g.startsWith("cli:")) ? null : false, episodes, gaps: [...gaps] }
}
