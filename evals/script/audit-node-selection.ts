import path from "node:path"
import { realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { parseArgs } from "node:util"
import { inspectSelection, inspectSelectionHistory, inspectSelectionRuntime, inspectSelectionProvenance, inspectSelectionReview, inspectSelectionJavaScriptIdentity, readSelectionReceipt } from "../src/node-selection"
import type { SelectionMode, SelectionRuntime } from "../src/node-selection"
import { inspectSelectionGraph } from "../src/node-selection-graph"
import { readNodeXml } from "../src/node-xml"
import { checkOracle } from "../src/oracle"
import { loadTasks } from "../src/task"

async function main() {
  const args = parseArgs({ options: {
    tasks: { type: "string" }, task: { type: "string" }, attempt: { type: "string" }, mode: { type: "string" },
  } }).values
  if (!args.tasks || !args.task || !args.attempt || !selectionMode(args.mode)) throw Error("AUDIT_ARGUMENTS_INVALID")
  const task = (await loadTasks(args.tasks, [args.task]))[0]!
  const directory = path.resolve(args.attempt)
  const failures: string[] = []
  const snapshot = await json(path.join(directory, "parts.json"))
  const attempt = await json(path.join(directory, "attempt.json"))
  const pins = await json(path.join(directory, "pins.json"))
  const events = await jsonLines(path.join(directory, "events.jsonl"), failures)
  const history = inspectSelectionHistory({ snapshot, events })
  const original = record(snapshot) && Array.isArray(snapshot.parts) ? snapshot.parts : []
  const parts = await completeOutputs(directory, original, failures)
  const runtime = await runtimeFiles(directory, record(snapshot) ? snapshot.sessionID : undefined, failures)
  const settlement = inspectSelectionRuntime({ parts, runtime })
  const provenance = inspectSelectionProvenance({ snapshot: record(snapshot) ? { ...snapshot, parts } : snapshot, runtime,
    model: record(pins) ? pins.model : undefined, variant: record(pins) ? pins.variant : undefined,
    expectedSkillDigest: record(pins) ? pins.expectedSkillDigest : undefined,
  })
  if (!record(attempt) || !record(pins) || attempt.sessionID !== (record(snapshot) ? snapshot.sessionID : undefined)
    || attempt.taskID !== args.task || attempt.mode !== args.mode || !Number.isInteger(attempt.cliExitCode)
    || !["model", "variant", "expectedSkillDigest"].every((key) => attempt[key] === pins[key])
    || !digest(pins.manifestSha256) || attempt.binaryManifestSha256 !== pins.manifestSha256
    || !Array.isArray(attempt.collectionFailures)) failures.push("ATTEMPT_PINS_INVALID")
  const artifactDir = path.join(directory, "artifact")
  const exists = await Bun.file(path.join(artifactDir, "package.lgp")).exists()
  const xml = exists ? await readNodeXml(artifactDir).catch(() => ({ invalid: "XML_READ_FAILED" })) : null
  const selection = inspectSelection({ mode: args.mode, parts,
    nodeTypes: xml && !("invalid" in xml) ? xml.nodes.map((node) => node.type) : null,
  })
  if (!exists) failures.push("PACKAGE_MISSING")
  if (xml && "invalid" in xml) failures.push("PACKAGE_XML_INVALID")
  const receipts = parts.filter(record).filter((part) => part.type === "tool").map((part) => ({ part, value: readSelectionReceipt(part) }))
  const applied = receipts.flatMap(({ part }) => {
    if (part.tool !== "loginom_dock_node_apply" || !record(part.state) || !record(part.state.input)) return []
    const request = part.state.input
    const value = receipts.filter((item) => item.part.sessionID === part.sessionID && record(item.value)
      && item.value.operation_id === request.operation_id && record(item.part.state) && item.part.state.status === "completed").at(-1)?.value
    if (!record(value) || value.status !== "SUCCEEDED" || value.cleanup_complete !== true || !record(value.execution)
      || value.execution.status !== "completed" || !record(value.node) || !record(request.target)
      || value.node.document_id !== request.document_id || !record(request.workflow_ref)
      || value.node.workflow_id !== request.workflow_ref.workflow_id || typeof value.node.node_id !== "string") return []
    return [{ request, value, node: value.node, type: request.target.type }]
  })
  const pinnedTask: unknown = record(pins) && record(pins.tasks) ? pins.tasks[args.task] : undefined
  const hashes = record(pinnedTask) && record(pinnedTask.inputHashes) ? Object.values(pinnedTask.inputHashes) : []
  const delivered = receipts.flatMap(({ part, value }) => {
    if (part.tool !== "loginom_dock_artifact_deliver" || !record(part.state) || !record(part.state.input)
      || !record(value) || value.status !== "SUCCEEDED" || value.cleanup_complete !== true || !record(value.output)) return []
    const output = value.output
    if (output.upload_completion_verified !== true || !hashes.includes(output.sha256)) return []
    return [{ artifactID: part.state.input.artifact_id, output }]
  })
  const imports = applied.filter((call) => call.type === "imports.text" && record(call.request.parameters)
    && record(call.request.parameters.source) && delivered.some((delivery) => {
      const source = record(call.request.parameters) && record(call.request.parameters.source) ? call.request.parameters.source : undefined
      const configuration = record(call.value.configuration) ? call.value.configuration : undefined
      const readback = record(configuration?.readback) ? configuration.readback : undefined
      return source?.artifact_id === delivery.artifactID && source?.upload_operation_id === delivery.output.upload_operation_id
        && record(readback?.source) && readback.source.source_path === delivery.output.destination
    })).map((call) => String(call.node.node_id))
  const graph = xml && !("invalid" in xml) ? inspectSelectionGraph(xml, "standard", imports) : { complete: false, failures: [] }
  const roleGraph = xml && !("invalid" in xml) ? inspectSelectionGraph(xml, args.mode, imports) : { complete: false, failures: [] }
  const oracle = await checkOracle(task, artifactDir)
  const oracleSha256 = task.oracle ? await hash(path.join(task.dir, task.oracle)) : null
  if (oracle.passed === null) failures.push("ORACLE_MISSING")
  if (!record(pinnedTask) || !digest(pinnedTask.oracleSha256) || oracleSha256 !== pinnedTask.oracleSha256)
    failures.push("ORACLE_PIN_MISMATCH")
  const saved = receipts.some(({ part, value }) => part.tool === "loginom_dock_action_run" && record(part.state)
    && record(part.state.input) && ["package.save_as", "package.save_checkpoint"].includes(String(part.state.input.action_key))
    && record(value) && value.status === "SUCCEEDED" && value.cleanup_complete === true && record(value.output)
    && (value.output.save_completed === true || value.output.reopened === true) && record(value.output.package_ref)
    && record(attempt) && value.output.package_ref.path === attempt.packagePath)
  if (!saved) failures.push("PACKAGE_RECEIPT_MISSING")
  const exports = applied.flatMap((call) => call.type === "exports.text" && record(call.value.output)
    && Array.isArray(call.value.output.file_artifacts) ? call.value.output.file_artifacts.filter(record).filter((file) =>
      record(attempt) && file.destination === attempt.resultPath && record(call.value.execution)
      && file.execution_id === call.value.execution.execution_id) : [])
  const output = exports.at(-1)
  const resultName = record(attempt) && typeof attempt.resultPath === "string" ? path.basename(attempt.resultPath) : undefined
  const resultFile = resultName ? path.join(artifactDir, "results", resultName) : undefined
  const resultVerified = !!output && digest(output.sha256) && !!resultFile && await Bun.file(resultFile).exists()
    && await hash(resultFile) === output.sha256 && (await Bun.file(resultFile).bytes()).length === output.bytes
  if (!resultVerified) failures.push("RESULT_RECEIPT_UNVERIFIED")
  const allowed = args.mode === "explicit-js" || args.mode === "capability-gap"
  if (allowed && (!xml || "invalid" in xml || !inspectSelectionJavaScriptIdentity({ parts,
    nodeIDs: xml.nodes.filter((node) => ["TBGCodeModelComponentEngine", "TBGJavaScriptEngine"].includes(node.type)).map((node) => node.id),
    exportNode: applied.filter((call) => call.type === "exports.text").at(-1)?.node,
  }))) failures.push("JAVASCRIPT_IDENTITY_UNVERIFIED")
  const packageSha256 = exists ? await hash(path.join(artifactDir, "package.lgp")) : null
  const review = await json(path.join(directory, "graph-review.json"))
  const reviewed = inspectSelectionReview({ review, mode: args.mode, sessionID: record(snapshot) ? snapshot.sessionID : undefined, packageSha256 })
  const reviewFiles = record(review) && Array.isArray(review.evidence) ? await Promise.all(review.evidence.map(async (file) => {
    if (typeof file !== "string") return false
    const resolved = await realpath(path.join(directory, file)).catch(() => null)
    return !!resolved && resolved.startsWith(await realpath(directory) + path.sep) && await Bun.file(resolved).exists()
  })) : []
  const reviewStatus = reviewed.reviewStatus === "not-required" ? "not-required"
    : reviewFiles.length && reviewFiles.every(Boolean) ? reviewed.reviewStatus : "pending"
  const evidenceFailures = [...history.failures, ...settlement.failures, ...provenance.failures,
    ...selection.failures.filter((failure) => !failure.startsWith("JAVASCRIPT_")),
    ...failures.filter((failure) => !["PACKAGE_MISSING", "PACKAGE_RECEIPT_MISSING", "RESULT_RECEIPT_UNVERIFIED", "ORACLE_MISSING"].includes(failure))]
  const policyStatus = !provenance.identityVerified ? "incomplete"
    : selection.failures.includes("JAVASCRIPT_NOT_ALLOWED") ? "failed"
    : evidenceFailures.length ? "incomplete"
    : allowed && (selection.failures.length || !roleGraph.complete) ? "incomplete" : "passed"
  const calculationPassed = history.historyComplete && settlement.runtimeSettled && provenance.identityVerified
    && !evidenceFailures.length && record(attempt) && attempt.cliExitCode === 0 && graph.complete && saved
    && resultVerified && oracle.passed === true && Array.isArray(attempt.collectionFailures) && !attempt.collectionFailures.length
  const result = { auditStage: "complete", taskID: args.task, mode: args.mode, ...selection,
    policyStatus, oraclePassed: oracle.passed, oracleError: oracle.error, oracleSha256, calculationPassed,
    historyComplete: history.historyComplete, runtimeSettled: settlement.runtimeSettled,
    identityVerified: provenance.identityVerified, graphComplete: graph.complete, packageSha256, reviewStatus,
    failures: [...new Set([...failures, ...evidenceFailures, ...selection.failures, ...graph.failures, ...roleGraph.failures])],
  }
  await Bun.write(path.join(directory, "selection-audit.json"), JSON.stringify(result, null, 2) + "\n")
  process.exitCode = policyStatus === "failed" || reviewStatus === "failed" || (!evidenceFailures.length && resultVerified && oracle.passed === false)
    ? 1 : policyStatus === "passed" && calculationPassed && ["passed", "not-required"].includes(reviewStatus) ? 0 : 2
}

async function completeOutputs(directory: string, parts: unknown[], failures: string[]) {
  const manifest = await json(path.join(directory, "tool-outputs.json"))
  if (!Array.isArray(manifest)) failures.push("TOOL_OUTPUT_MANIFEST_INVALID")
  return Promise.all(parts.map(async (part) => {
    if (!record(part) || !record(part.state) || !record(part.state.metadata) || part.state.metadata.truncated !== true) return part
    const entries = Array.isArray(manifest) ? manifest.filter((entry) => record(entry) && entry.partID === part.id) : []
    const entry: unknown = entries.length === 1 ? entries[0] : undefined
    if (!record(entry) || entry.source !== part.state.metadata.outputPath) { failures.push("TOOL_OUTPUT_UNAVAILABLE"); return part }
    const content = await manifestedFile(directory, entry)
    if (content === null) { failures.push("TOOL_OUTPUT_UNAVAILABLE"); return part }
    return { ...part, state: { ...part.state, [part.state.status === "error" ? "error" : "output"]: content,
      metadata: { ...part.state.metadata, truncated: false } } }
  }))
}

async function runtimeFiles(directory: string, sessionID: unknown, failures: string[]) {
  const manifest = await json(path.join(directory, "runtime-journals.json"))
  const runtime: SelectionRuntime[] = []
  if (!Array.isArray(manifest) || typeof sessionID !== "string") { failures.push("RUNTIME_MANIFEST_INVALID"); return runtime }
  const groups = new Map<string, Record<string, string>>()
  const seen = new Set<string>()
  const chat = createHash("sha256").update(sessionID).digest("hex")
  for (const entry of manifest) {
    if (!record(entry) || typeof entry.path !== "string" || seen.has(entry.path)
      || !new RegExp(`^runtime/generations/[^/]+/chats/${chat}/attempts/[^/]+/(session\\.json|execution-events\\.jsonl|terminal-close\\.jsonl)$`).test(entry.path)) {
      failures.push("RUNTIME_MANIFEST_INVALID"); continue
    }
    seen.add(entry.path)
    const content = await manifestedFile(directory, entry)
    if (content === null) { failures.push("RUNTIME_FILE_UNVERIFIED"); continue }
    const parent = path.dirname(entry.path)
    const files = groups.get(parent) ?? {}
    files[path.basename(entry.path)] = content
    groups.set(parent, files)
  }
  for (const [relative, files] of groups) {
    if (!files["session.json"] || !files["execution-events.jsonl"]) { failures.push("RUNTIME_FILE_MISSING"); continue }
    const session = parseJSON(files["session.json"])
    const events = parseLines(files["execution-events.jsonl"], failures)
    if (!record(session)) failures.push("RUNTIME_SESSION_INVALID")
    if (files["terminal-close.jsonl"]) parseLines(files["terminal-close.jsonl"], failures)
    runtime.push({ path: relative, session, events })
  }
  return runtime
}

async function manifestedFile(directory: string, entry: Record<string, unknown>) {
  if (typeof entry.path !== "string" || path.isAbsolute(entry.path) || entry.path.split(/[\\/]/).some((part) => !part || part === "." || part === "..")
    || !digest(entry.sha256)) return null
  const file = path.join(directory, entry.path)
  const resolved = await realpath(file).catch(() => null)
  if (!resolved || !resolved.startsWith(await realpath(directory) + path.sep) || await hash(file) !== entry.sha256) return null
  return Bun.file(file).text()
}
async function hash(file: string) { return createHash("sha256").update(await Bun.file(file).bytes()).digest("hex") }
async function json(file: string): Promise<unknown> { return Bun.file(file).json().catch(() => null) }
function parseJSON(text: string): unknown { try { return JSON.parse(text) as unknown } catch { return null } }
function parseLines(text: string, failures: string[]) {
  const values = text.split(/\r?\n/).filter((line) => line.trim()).map(parseJSON)
  if (values.some((value) => !record(value))) failures.push("EVENTS_INVALID")
  return values
}
async function jsonLines(file: string, failures: string[]) {
  const text = await Bun.file(file).text().catch(() => null)
  if (text === null) { failures.push("EVENTS_MISSING"); return [] }
  return parseLines(text, failures)
}
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) }
function selectionMode(value: unknown): value is SelectionMode { return typeof value === "string" && ["standard", "explicit-js", "capability-gap", "standard-recovery"].includes(value) }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
await main().catch(() => { console.error("NODE_SELECTION_AUDIT_FAILED"); process.exitCode = 2 })
