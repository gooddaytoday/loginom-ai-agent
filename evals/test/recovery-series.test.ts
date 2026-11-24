import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const write = (file: string, value: unknown) => Bun.write(file, JSON.stringify(value))
async function pilot() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "recovery-series-"))
  roots.push(dir)
  const run = path.join(dir, "batches", "one", "run"), commandId = crypto.randomUUID()
  const commandJournal = path.join(dir, `run-command-${commandId}.json`)
  const planned = { corpus: "regular", taskId: "double", round: 1 }
  await write(path.join(run, "config.json"), { only: ["double"], repeat: 1, commandJournal })
  const journal = { version: 2, kind: "unactivated-preparation", commandId, runDir: run, attempts: [
    { slotId: "slot-a", taskId: "request-preflight-slot-a", attempt: 1, purpose: "preflight" },
    { slotId: "slot-a", taskId: planned.taskId, attempt: 1, purpose: "measurement" },
  ] }
  await write(commandJournal, journal)
  return { dir, run, planned, commandJournal, journal }
}
async function audit(...args: string[]) {
  const proc = Bun.spawn([process.execPath, "--no-env-file", path.resolve(import.meta.dir, "../script/audit-recovery-series.ts"), ...args], { stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  if (code) throw Error(stderr)
  return JSON.parse(stdout)
}
test("standalone pilot separates measurement, preflight, CLI, judgement and cleanup", async () => {
  const f = await pilot()
  await write(path.join(f.run, "double/1/result.json"), { task_id: "double", slot_id: "slot-a", attempt: 1,
    status: "failed", exit_code: 1, pass: true, score: 100, judge_status: "scored", environment_cleanup: { status: "confirmed" } })
  const args = ["--run", f.run, "--purpose", "pilot", "--assignment", "pilot-ticket"]
  const report = await audit(...args)
  expect(report).toMatchObject({ purpose: "pilot", assignment: "pilot-ticket", planned: { pilot: 1, corpus: 0 }, preflights: 1,
    keys: [{ taskId: "double", round: 1, attempts: [{ commandId: f.journal.commandId,
      result: { status: "failed", exitCode: 1, pass: true, score: 100, judgeStatus: "scored", cleanup: "confirmed" } }] }] })
  await rm(f.commandJournal)
  const incomplete = await audit(...args)
  expect(incomplete.keys[0].attempts).toEqual([])
  expect(incomplete.gaps).toContainEqual(expect.objectContaining({ admission: "unconfirmed", result: expect.objectContaining({ pass: true, score: 100 }) }))
})

test("held-out ledger preserves planned, missing-result and retried attempts under the assigned key", async () => {
  const first = await pilot(), second = await pilot()
  const experiment = { family: "f", pair: "p", arm: "before", order: 2, condition: "delayed-list" }
  const key = { ...first.planned, experiment }
  const manifest = { id: "paired", seriesPurpose: "held-out", keys: [key, { ...key, round: 2 }] }
  const manifestFile = path.join(first.dir, "manifest.json"), journalFile = path.join(first.dir, "ledger.json")
  await write(manifestFile, manifest)
  const resultFile = path.join(second.run, "double/1/result.json")
  const initial = { task_id: "double", attempt: 1, slot_id: "slot-a", status: "infra_error", pass: null }
  await write(resultFile, { ...initial, status: "completed", pass: true, infra_retry: { initial } })
  await write(journalFile, { campaignId: "paired", manifestHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(manifest)).digest("hex"),
    batches: [first, second].map(f => ({ resultsDir: path.dirname(f.run), keys: [key] })),
    attempts: [{ key, resultFile, counted: true, pass: true, score: 95, cleanupConfirmed: false }] })
  const args = ["--manifest", manifestFile, "--journal", journalFile]
  const report = await audit(...args)
  expect(report).toMatchObject({ purpose: "held-out", preflights: 2,
    keys: [{ ...key, attempts: [{ commandId: first.journal.commandId, result: null },
      { commandId: second.journal.commandId, result: { status: "completed" }, initial: { status: "infra_error", recovery: { requested: null, gaps: expect.arrayContaining(["cli:missing"]) } },
        accounted: { counted: true, pass: true, score: 95, cleanupConfirmed: false } }] }, { round: 2, attempts: [] }] })
  const damaged = path.join(first.run, "double/1/result.json")
  await Bun.write(damaged, "{")
  const partial = await audit(...args)
  expect(partial.gaps).toContainEqual({ unreadableResult: damaged })
  expect(partial.keys[0].attempts).toMatchObject([{ result: null }, { result: { pass: true } }])
})

test("cold evidence binds to the saved package and keeps an unrelated verdict out of the pilot", async () => {
  const f = await pilot(), resultDir = path.join(f.run, "double/1"), cold = path.join(f.dir, "cold.json")
  const bytes = "synthetic package"
  await Bun.write(path.join(resultDir, "artifact/package.lgp"), bytes)
  await write(path.join(resultDir, "result.json"), { task_id: "double", attempt: 1, slot_id: "slot-a", pass: true })
  const evidence = { serverLgpSha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"), status: "UI_ALL_NODES_EXECUTED",
    allNodesExecuted: true, settingsApplied: false, saveRequested: false, serverLgpUnchanged: true }
  const args = ["--run", f.run, "--purpose", "pilot", "--assignment", "pilot-ticket", "--cold", cold]
  await write(cold, evidence)
  expect((await audit(...args)).keys[0].attempts[0].cold).toMatchObject({ ...evidence, uiCleanup: null })
  await write(cold, { ...evidence, serverLgpSha256: "1".repeat(64) })
  expect((await audit(...args)).keys[0].attempts[0]).toMatchObject({ result: { pass: true }, cold: { gap: "package-mismatch" } })
})

test("a missing journal is a gap and an old manifest does not relabel its retained verdict as corpus", async () => {
  const f = await pilot(), manifestFile = path.join(f.dir, "manifest.json"), journalFile = path.join(f.dir, "ledger.json")
  const manifest = { id: "old", keys: [f.planned] }, resultFile = path.join(f.run, "double/1/result.json")
  await write(manifestFile, manifest)
  await write(journalFile, { campaignId: "old", manifestHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(manifest)).digest("hex"),
    startedAttempts: 1, batches: [{ resultsDir: path.dirname(f.run), keys: [f.planned], startedAttempts: 1 }],
    attempts: [{ key: f.planned, resultFile, counted: true, pass: false, score: 53, cleanupConfirmed: true }] })
  await rm(f.commandJournal)
  const report = await audit("--manifest", manifestFile, "--journal", journalFile)
  expect(report).toMatchObject({ purpose: null, planned: { corpus: 0 }, keys: [{ attempts: [] }] })
  expect(report.gaps).toContainEqual({ missing: f.commandJournal })
  expect(report.gaps).toContainEqual(expect.objectContaining({ resultFile, accounted: { counted: true, pass: false, score: 53, cleanupConfirmed: true } }))
  await rm(path.join(f.run, "config.json"))
  expect((await audit("--manifest", manifestFile, "--journal", journalFile)).gaps).toContainEqual({ missing: path.join(f.run, "config.json") })
  await rm(f.run, { recursive: true })
  expect((await audit("--manifest", manifestFile, "--journal", journalFile)).gaps).toContainEqual({ missingNativeAdmissions: 1, source: journalFile })
  await rm(path.dirname(f.run), { recursive: true })
  expect((await audit("--manifest", manifestFile, "--journal", journalFile)).gaps).toContainEqual({ missing: path.dirname(f.run) })
})

const hash = (text: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(text).digest("hex")
const session = "synthetic-session", operation = "synthetic-operation"
const start = { action: "start", operation_id: operation }, finish = { ...start, action: "finish" }
const native = (phase: string, data = {}) => ({ phase: "browser_recovery_" + phase, operation_id: operation, attempt_id: "episode", ...data })
const tool = (id: string, name: string, input: object, output: object | string, status = "completed") => ({
  type: "tool_use", sessionID: session, part: { type: "tool", sessionID: session, callID: id, messageID: "message-" + id,
    tool: "loginom_" + name, state: { status, input, [status === "error" ? "error" : "output"]: typeof output === "string" ? output : JSON.stringify(output) } },
})
async function episode(cli: unknown[], records?: unknown[], prepare?: (dir: string, run: string) => Promise<void>) {
  const f = await pilot(), dir = path.join(f.run, "double/1")
  await write(path.join(dir, "result.json"), { task_id: "double", attempt: 1, slot_id: "slot-a", session_id: session,
    exit_code: 1, judge_status: "no_artifact", pass: false, score: 0, environment_cleanup: { status: "confirmed" } })
  const jsonl = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join("\n") + "\n"
  await Bun.write(path.join(dir, "events.jsonl"), jsonl([...cli, { type: "step_finish", sessionID: session, part: { reason: "stop" } }]))
  if (records) {
    const source = `loginom/runtime/generations/g/chats/${hash(session)}/attempts/r/execution-events.jsonl`
    const archive = "diagnostics/1-execution-events.jsonl", text = jsonl(records)
    await Bun.write(path.join(dir, archive), text)
    await write(path.join(dir, "diagnostics/manifest.json"), { version: 1, runtime_directories: [path.dirname(source)],
      files: [{ archive, source, bytes: Buffer.byteLength(text), sha256: hash(text) }] })
  }
  await prepare?.(dir, f.run)
  return (await audit("--run", f.run, "--purpose", "pilot", "--assignment", "ticket")).keys[0].attempts[0]
}
const control = "dock_browser_recovery"
const begin = tool("c1", control, start, { phase: "browser", operation_id: operation })
const opened = [native("started"), native("handoff", { stopped: true })]
test("continuable joins the executor receipt and three actions while the original operation remains FAILED", async () => {
  const names = ["browser_snapshot", "browser_click", "browser_find"]
  const verification = { status: "continuable", receipt_id: "receipt", original_operation: { operation_id: operation,
    status: "FAILED", configuration: { status: "unknown" }, execution: { status: "unknown" } } }
  const evidence = await episode([begin, ...names.map((name, i) => tool("a" + i, name, { depth: i }, {})),
    tool("c2", control, finish, { phase: "dock", operation_id: operation, verification })],
    [...opened, ...names.map((name, i) => native("action", { tool: name, arguments_sha256: hash(JSON.stringify({ depth: i })),
      page: { ok: true }, is_error: false, transport_error: null })), native("attested"),
    { phase: "browser_recovery_receipt", operation_id: operation, receipt: { id: "receipt" } },
    native("verified", { status: "continuable", receipt_id: "receipt" })])
  expect(evidence.recovery).toMatchObject({ gaps: [], episodes: [{ operation, nativeAttempt: "episode", handoff: true,
    verified: "continuable", receipt: "receipt", original: "FAILED", configuration: "unknown", execution: "unknown" }] })
  expect(evidence.recovery.episodes[0].actions.map((a: {nativeLine: number}) => a.nativeLine)).toEqual([3, 4, 5])
})

test("unresolved and stopped survive a missing native journal alongside the independent verdict", async () => {
  const stopped = { code: "model_stopped", cleanup: { state: "retained" } }
  const evidence = await episode([begin, tool("a1", "browser_snapshot", {}, {}), tool("a2", "browser_snapshot", { depth: 3 }, {}),
    tool("f", control, finish, { operation_id: operation, phase: "browser", verification: { status: "unresolved", uncertain: false } }),
    tool("s", control, { ...start, action: "stop" }, { operation_id: operation, phase: "stopped", stopped })])
  expect(evidence).toMatchObject({ result: { exitCode: 1, score: 0, pass: false, judgeStatus: "no_artifact", cleanup: "confirmed" },
    recovery: { gaps: expect.arrayContaining(["native:missing"]), episodes: [{ nativeAttempt: null, verified: null,
      cliVerification: "unresolved", stop: "model_stopped", cleanup: "retained", actions: [{ nativeLine: null }, { nativeLine: null }] }] } })
})

test("a recorded unknown browser effect and retained cleanup are complete evidence of a failed action", async () => {
  const stopped = { code: "browser_unavailable", cleanup: { state: "retained_uncertain" } }
  const evidence = await episode([begin, tool("act", "browser_click", {}, { phase: "stopped", stopped })], [...opened,
    native("action", { tool: "browser_click", arguments_sha256: hash("{}"), transport_error: "private transport text", is_error: null, page: { ok: true } }),
    native("stopped", stopped)])
  expect(evidence.recovery).toMatchObject({ requested: true, gaps: [], episodes: [{ nativeStop: "browser_unavailable", nativeCleanup: "retained_uncertain",
    actions: [{ nativeLine: 3, isError: null, transportError: true, pageOk: true }] }] })
  expect(JSON.stringify(evidence)).not.toContain("private transport text")
})

test("a refused start before handoff is an observed non-execution", async () => {
  const evidence = await episode([tool("c", control, start, { refused: "private reason" }, "error")], [{ phase: "session_open" }])
  expect(evidence.recovery).toMatchObject({ requested: true, gaps: [], episodes: [{ started: false, actions: [], handoff: null }] })
  expect(JSON.stringify(evidence)).not.toContain("private reason")
})

test("a confirmed native close after handoff explains a started episode without actions", async () => {
  const evidence = await episode([begin], [...opened, native("stopped", { code: "runtime_closed", cleanup: { state: "retained" } })])
  expect(evidence.recovery).toMatchObject({ gaps: [], episodes: [{ started: true, handoff: true, actions: [], nativeStop: "runtime_closed" }] })
  const interrupted = await episode([begin], opened)
  expect(interrupted.recovery).toMatchObject({ gaps: ["episode:outcome"], episodes: [{ started: true, handoff: true, actions: [], verified: null }] })
})

test("the observed ordinary run distinguishes zero recovery from unavailable evidence", async () => {
  const calls = [tool("ordinary", "dock_prepare", {}, {})]
  expect((await episode(calls, [{ phase: "prepared" }])).recovery).toMatchObject({ requested: false, nativePhases: 0, gaps: [], episodes: [] })
  expect((await episode(calls)).recovery).toMatchObject({ requested: false, nativePhases: null, gaps: ["native:missing"] })
  expect((await episode([{ broken: "evidence" }], [{ phase: "browser_recovery_handoff" }])).recovery)
    .toMatchObject({ requested: null, nativePhases: 1, gaps: expect.arrayContaining(["cli:unmatched-native"]) })
})

async function closedProfile(dir: string, run: string) {
  const profileDir = path.join(run, "profile"), archive = profileDir + ".history/closed"
  await mkdir(profileDir)
  await write(path.join(dir, "cleanup.json"), { profileDir, archive, processes: { status: "confirmed", capture_complete: true, unknownProcesses: [] },
    serverSessions: "confirmed", storageDeletionAllowed: true, nextAdmissionAllowed: true })
  const config = path.join(run, "config.json")
  await write(config, { ...await Bun.file(config).json(), profileDir })
  const attempt = path.join(archive, "loginom/runtime/generations/g/chats", hash(session), "attempts/r")
  return { attempt, archive }
}
test("the closed profile supplies the native source and links only this action's private text", async () => {
  const action = native("action", { tool: "browser_snapshot", arguments_sha256: hash("{}"), is_error: false, transport_error: null,
    page: { ok: true }, budget: { calls_left: 29 }, content: [{ type: "text", bytes: 7 }] })
  const evidence = await episode([begin, tool("act", "browser_snapshot", {}, {})], undefined, async (dir, run) => {
    const { attempt } = await closedProfile(dir, run)
    await Bun.write(path.join(attempt, "execution-events.jsonl"), [...opened, action, native("stopped", { code: "runtime_closed", cleanup: { state: "retained" } })]
      .map(r => JSON.stringify(r)).join("\n"))
    await Bun.write(path.join(attempt, "browser-recovery-text.jsonl"), [
      { attempt_id: "someone-else", calls_left: 29, text_blocks: ["private earlier text"] },
      { attempt_id: "episode", calls_left: 29, text_blocks: ["private"] }].map(r => JSON.stringify(r)).join("\n"))
  })
  expect(evidence.recovery).toMatchObject({ gaps: [], episodes: [{ actions: [{ nativeLine: 3, text: { line: 2, blocks: 1 } }] }] })
  expect(JSON.stringify(evidence)).not.toContain("private")
})

test("an unmatched native action and a mismatched executor receipt leave the CLI outcome intact", async () => {
  const evidence = await episode([begin, tool("f", control, finish, { operation_id: operation, phase: "dock",
    verification: { status: "completed", receipt_id: "claimed" } })], [...opened,
    native("action", { tool: "browser_find", arguments_sha256: hash("{}") }), native("attested"),
    { phase: "browser_recovery_receipt", operation_id: operation, receipt: { id: "another" } },
    native("verified", { status: "completed", receipt_id: "claimed" })])
  expect(evidence.recovery).toMatchObject({ gaps: expect.arrayContaining(["cli:unmatched-action", "native:receipt"]),
    episodes: [{ cliVerification: "completed", verified: "completed", receipt: null }] })
})

test("foreign finish cannot verify this operation even when its reported status matches", async () => {
  const evidence = await episode([begin, tool("finish", control, { action: "finish", operation_id: "other" },
    { operation_id: "other", verification: { status: "completed", original_operation: { operation_id: "other", status: "SUCCEEDED" } } })],
    [...opened, native("attested"), native("verified", { status: "completed" })])
  expect(evidence.recovery).toMatchObject({ gaps: expect.arrayContaining(["cli:operation"]),
    episodes: [{ cliVerification: null, original: null, verified: "completed" }] })
})

test("a truncated native action stays linked, with an explicit gap for its outcome", async () => {
  const evidence = await episode([begin, tool("act", "browser_click", {}, {})], [...opened,
    native("action", { tool: "browser_click", arguments_sha256: hash("{}") }),
    native("stopped", { code: "runtime_closed", cleanup: { state: "retained" } })])
  expect(evidence.recovery).toMatchObject({ gaps: ["native:action-outcome"], episodes: [{ actions: [
    { nativeLine: 3, pageOk: null, transportError: null, isError: null }] }] })
})

test("a screenshot links source file IDs and image digests without claiming provider delivery", async () => {
  const shot = tool("image-call", "browser_take_screenshot", {}, {})
  const image = { partID: "file-part", sha256: hash("pixels"), bytes: 6, mime: "image/png" }
  const evidence = await episode([begin, { ...shot, part: { ...shot.part, state: { ...shot.part.state, metadata: { screenshotFiles: [image] } } } }],
    [...opened, native("action", { tool: "browser_take_screenshot", arguments_sha256: hash("{}"), is_error: false, transport_error: null,
      page: { ok: true }, content: [{ type: "image", mime_type: "image/png", bytes: 6, sha256: hash("base64 text") }] }),
    native("stopped", { code: "runtime_closed", cleanup: { state: "retained" } })])
  expect(evidence.recovery).toMatchObject({ gaps: expect.arrayContaining(["screenshot:source-missing", "screenshot:attachment-missing", "screenshot:delivery-missing"]),
    episodes: [{ actions: [{ call: "image-call", files: [image] }] }] })
})

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR42mNgAAAAAgAB5Sfe/AAAAABJRU5ErkJggg==", "base64")
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AP7//2Q==", "base64")
const filename = "page-2026-01-02T03-04-05-006Z.png"
const original = { partID: "file-part", mime: "image/png", bytes: png.length, sha256: hash(png) }
const normalized = { mime: "image/jpeg", bytes: jpeg.length, sha256: hash(jpeg) }
const received = { sessionID: session, callID: "image-call", attemptID: "request-1", result: "error",
  responseObserved: true, outputPresent: true, images: [normalized] }
async function screenshot(receipts: unknown[], options: { source?: Uint8Array | null; filename?: string; metadata?: object; attachment?: object } = {}) {
  const name = options.filename ?? filename, source = options.source === undefined ? png : options.source
  const shot = tool(received.callID, "browser_take_screenshot", {}, {})
  const attachment = { type: "file", sessionID: session, messageID: shot.part.messageID, id: original.partID,
    mime: normalized.mime, url: "data:image/jpeg;base64," + jpeg.toString("base64"), ...options.attachment }
  const cli = { ...shot, part: { ...shot.part, state: { ...shot.part.state, attachments: [attachment], metadata: options.metadata ?? { screenshotFiles: [original] } } } }
  return (await episode([begin, cli], undefined, async (dir, run) => {
    const { archive, attempt } = await closedProfile(dir, run)
    const action = native("action", { tool: "browser_take_screenshot", arguments_sha256: hash("{}"), is_error: false, transport_error: null,
      page: { ok: true }, budget: { calls_left: 29 }, content: [{ type: "text" }, { type: "image" }] })
    await Bun.write(path.join(attempt, "execution-events.jsonl"), [...opened, action, native("stopped", { code: "runtime_closed", cleanup: { state: "retained" } })]
      .map(r => JSON.stringify(r)).join("\n"))
    await write(path.join(attempt, "browser-recovery-text.jsonl"), { attempt_id: "episode", calls_left: 29,
      text_blocks: [`### Result\n- [Screenshot of viewport](../../private-location/artifacts/${name})`] })
    if (source) await Bun.write(path.join(attempt, "artifacts", name), source)
    if (receipts.length) await Bun.write(path.join(archive, "data/browser-recovery-delivery.jsonl"), receipts.map(r => JSON.stringify(r)).join("\n"))
  })).recovery
}
test("a closed PNG is linked to the normalized JPEG in the observed HTTP error", async () => {
  const report = await screenshot([{ ...received, sessionID: "foreign" }, { ...received, callID: "other" }, received])
  expect(report).toMatchObject({ gaps: [], episodes: [{ actions: [{ call: "image-call", message: "message-image-call",
    files: [{ ...original, source: { filename, bytes: png.length, sha256: hash(png) }, normalized,
      delivery: [{ attemptID: received.attemptID, result: "error", responseObserved: true, outputPresent: true, images: [normalized], inclusion: "matched" }] }] }] }] })
  expect(JSON.stringify(report)).not.toMatch(/private-location|Screenshot of viewport|base64|data:image/)
})

test("SDK retries preserve observed omission, unknown input and a different delivered image", async () => {
  const report = await screenshot([received, { ...received, attemptID: "empty", images: [] },
    { ...received, attemptID: "disconnected", responseObserved: false, outputPresent: null, images: null },
    { ...received, attemptID: "opaque", images: [null] }, { ...received, attemptID: "other-bytes", result: "stream", images: [original] }])
  const delivery = report.episodes[0].actions[0].files[0].delivery
  expect(delivery.map((r: { attemptID: string; inclusion: string }) => [r.attemptID, r.inclusion])).toEqual([
    ["request-1", "matched"], ["empty", "absent"], ["disconnected", "unknown"], ["opaque", "unknown"], ["other-bytes", "mismatch"]])
  expect(report.gaps).toEqual(["screenshot:delivery-mismatch"])
})

test("an altered or missing PNG preserves the independently observed JPEG and request", async () => {
  for (const [source, gap] of [[Buffer.from("other image"), "screenshot:source-mismatch"], [null, "screenshot:source-missing"]] as const) {
    const report = await screenshot([received], { source })
    expect(report).toMatchObject({ gaps: [gap], episodes: [{ actions: [{ files: [{ normalized,
      source: source ? { filename, sha256: hash(source), bytes: source.length } : null, delivery: [{ inclusion: "matched" }] }] }] }] })
  }
  expect(await screenshot([])).toMatchObject({ gaps: ["screenshot:delivery-missing"], episodes: [{ actions: [{ files: [
    { source: { filename, sha256: original.sha256 }, normalized, delivery: [] }] }] }] })
})

test("a damaged or foreign attachment cannot prove inclusion of this normalized part", async () => {
  for (const fields of [{ url: "data:image/jpeg;base64,!" + jpeg.toString("base64") }, { messageID: "other-message" }, { id: "other-part" }]) {
    expect(await screenshot([received], { attachment: fields })).toMatchObject({ gaps: ["screenshot:attachment-missing"],
      episodes: [{ actions: [{ files: [{ source: { sha256: original.sha256 }, normalized: null,
        delivery: [{ images: [normalized], inclusion: "unknown" }] }] }] }] })
  }
})

test("a missing source digest preserves the independently bound attachment, PNG and delivery", async () => {
  for (const metadata of [{}, { screenshotFiles: [{ partID: original.partID }] }]) {
    expect(await screenshot([received], { metadata })).toMatchObject({ gaps: ["cli:screenshot-files"], episodes: [{ actions: [
      { files: [{ partID: original.partID, source: { sha256: original.sha256 }, normalized, delivery: [{ inclusion: "matched" }] }] }] }] })
  }
})

test("a WebP screenshot uses its original Playwright artifact", async () => {
  const source = Buffer.from("UklGRhoAAABXRUJQVlA4TA4AAAAvAAAAAAcQEf0PRET/Aw==", "base64")
  const name = filename.replace(".png", ".webp"), webp = { ...original, bytes: source.length, mime: "image/webp", sha256: hash(source) }
  const report = await screenshot([received], { source, filename: name, metadata: { screenshotFiles: [webp] } })
  expect(report).toMatchObject({ gaps: [], episodes: [{ actions: [{ files: [{ ...webp, source: { filename: name, sha256: webp.sha256 } }] }] }] })
})

test("a changed diagnostic file cannot supply a native conclusion", async () => {
  const evidence = await episode([begin], opened, async dir => {
    await Bun.write(path.join(dir, "diagnostics/1-execution-events.jsonl"), JSON.stringify(native("verified", { status: "completed" })))
  })
  expect(evidence).toMatchObject({ result: { score: 0, cleanup: "confirmed" }, recovery: {
    gaps: expect.arrayContaining(["native:digest"]), nativePhases: null, requested: true, episodes: [{ handoff: null, verified: null }] } })
})

async function controllerTrace(calls: [string, object][], failFirstClick = false) {
  const { createBrowserRecovery } = await import(path.resolve(import.meta.dir, "../../packages/loginom-runtime/client/lib/browser-recovery.mjs"))
  const records: Record<string, unknown>[] = [], cli = []
  let clicks = 0
  const controller = createBrowserRecovery({ enabled: true, gate: (run: () => Promise<unknown>) => run(),
    record: async (event: Record<string, unknown>) => { records.push(event); return event }, probe: () => ({ ok: true }),
    browser: { callTool: async ({ name }: { name: string }) => ({ isError: name === "browser_click" && ++clicks === 1 && failFirstClick, content: [] }) },
    executor: { browserRecoveryBasis: () => ({ step: { key: "synthetic-step" } }), browserRecoveryHandoff: () => ({ stopped: true }),
      stopBrowserRecovery: () => ({ state: "retained" }) } })
  for (const [name, input] of calls) {
    const reply = await controller.call(name, input)
    cli.push(tool("c" + (cli.length + 1), name, input, reply.content.map((b: { text: string }) => b.text).join("\n"), reply.isError ? "error" : "completed"))
  }
  await controller.close()
  return { cli, records }
}
const stop = { ...start, action: "stop" }
test("a second start refused by the active controller remains a request in its original episode", async () => {
  const t = await controllerTrace([[control, start], [control, start], ["browser_snapshot", {}], [control, stop]])
  expect(t.records.map(r => r.phase)).toEqual(["browser_recovery_started", "browser_recovery_handoff", "browser_recovery_action", "browser_recovery_stopped"])
  const { recovery } = await episode(t.cli, t.records)
  expect(recovery.gaps).toEqual([])
  expect(recovery.episodes).toMatchObject([{ started: true, nativeAttempt: t.records[0]!.attempt_id,
    controls: [{ call: "c1", refused: false }, { call: "c2", refused: true }, { call: "c4", stopped: "model_stopped" }],
    actions: [{ call: "c3", nativeLine: 3 }], nativeStop: "model_stopped" }])
})

test("a gesture refused before dispatch does not consume the following native action", async () => {
  const click = { target: "synthetic-button" }
  const t = await controllerTrace([[control, start], ["browser_click", click], ["browser_click", click],
    ["browser_snapshot", {}], ["browser_click", click], [control, stop]], true)
  expect(t.records.filter(r => r.phase === "browser_recovery_action").map(r => [r.tool, r.is_error])).toEqual([
    ["browser_click", true], ["browser_snapshot", false], ["browser_click", false]])
  const { recovery } = await episode(t.cli, t.records)
  expect(recovery.gaps).toEqual([])
  expect(recovery.episodes[0].actions).toMatchObject([
    { call: "c2", nativeLine: 3, isError: true, refused: false }, { call: "c3", nativeLine: null, refused: true },
    { call: "c4", nativeLine: 4, isError: false }, { call: "c5", nativeLine: 5, isError: false }])
})

test("a partial native close identifies each missing fact and retains its recorded counterpart", async () => {
  const t = await controllerTrace([[control, start]])
  const close = t.records.at(-1)!
  expect(close).toMatchObject({ phase: "browser_recovery_stopped", code: "runtime_closed", cleanup: { state: "retained" } })
  for (const [code, state] of [[null, "retained"], ["runtime_closed", null], [null, null]] as const) {
    const edited = { ...close, code: code ?? undefined, cleanup: { state: state ?? undefined } }
    const { recovery } = await episode(t.cli, [...t.records.slice(0, -1), edited])
    expect(recovery.gaps).toEqual([...(code ? [] : ["native:stop-code"]), ...(state ? [] : ["native:stop-cleanup"])])
    expect(recovery.episodes).toMatchObject([{ started: true, handoff: true, nativeStop: code, nativeCleanup: state }])
  }
})
