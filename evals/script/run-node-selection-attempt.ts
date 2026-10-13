import path from "node:path"
import { cp, lstat, mkdir, mkdtemp, realpath, rename } from "node:fs/promises"
import { createHash } from "node:crypto"
import { parseArgs } from "node:util"
import { pathToFileURL } from "node:url"
import { Database } from "bun:sqlite"
import type { SelectionMode } from "../src/node-selection"
import { loadTasks, buildAgentPrompt } from "../src/task"
import { unzip } from "../src/artifact"
import { readNodeEvents, successful } from "../src/node-events"

export type SelectionPins = {
  runID: string
  phase: string
  resultsRoot: string
  workspaceRoot: string
  payload: string
  profile: string
  manifestSha256: string
  expectedSkillDigest: string
  model: string
  variant: string
  frozenModelsPath: string
  frozenModelsSha256: string
  deadlineSeconds: number
  graceSeconds: number
  connection: { url: string; username: string; folder: string }
  container: { id: string; name: string }
  storageDir: string
  tasks: Record<string, {
    directory: string; mode: SelectionMode; attempts: number[]
    promptSha256: string; inputHashes: Record<string, string>; oracleSha256: string
  }>
}

export function selectionAttempt(raw: unknown, taskID: string, number: number) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(taskID)) throw Error("SELECTION_TASK_INVALID")
  if (!record(raw) || !record(raw.tasks) || !record(raw.tasks[taskID])) throw Error("SELECTION_PINS_INVALID")
  const task = raw.tasks[taskID]
  if (!Array.isArray(task.attempts) || !Number.isSafeInteger(number) || !task.attempts.includes(number) || number < 1)
    throw Error("SELECTION_SLOT_INVALID")
  if (
    !identifier(raw.runID) || !identifier(raw.phase) ||
    ![raw.resultsRoot, raw.workspaceRoot, raw.payload, raw.profile, raw.frozenModelsPath, task.directory].every(absolute) ||
    ![raw.manifestSha256, raw.expectedSkillDigest, raw.frozenModelsSha256, task.promptSha256, task.oracleSha256].every(digest) ||
    typeof raw.model !== "string" || !/^[^\s/]+\/[^\s/]+$/.test(raw.model) ||
    typeof raw.variant !== "string" || !identifier(raw.variant) ||
    raw.deadlineSeconds !== 1800 || raw.graceSeconds !== 90 ||
    !record(raw.connection) || !record(raw.container) || !digest(raw.container.id) ||
    typeof raw.container.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(raw.container.name) ||
    typeof raw.connection.username !== "string" ||
    !raw.connection.username || [".", ".."].includes(raw.connection.username) ||
    /[\\/\x00-\x1f\x7f]/.test(raw.connection.username) || raw.connection.folder !== "/" + raw.connection.username ||
    raw.storageDir !== "/workdir/UserStorage" + raw.connection.folder ||
    typeof raw.connection.url !== "string" || !URL.canParse(raw.connection.url) ||
    !["http:", "https:"].includes(new URL(raw.connection.url).protocol) ||
    new URL(raw.connection.url).username || new URL(raw.connection.url).password ||
    typeof task.mode !== "string" || !["standard", "explicit-js", "capability-gap", "standard-recovery"].includes(task.mode) ||
    !record(task.inputHashes) || !Object.keys(task.inputHashes).length ||
    Object.entries(task.inputHashes).some(([name, hash]) => !relativeFile(name) || !digest(hash)) ||
    path.basename(String(task.directory)) !== taskID
  ) throw Error("SELECTION_PINS_INVALID")
  const pins = raw as SelectionPins
  const roots = [pins.resultsRoot, pins.workspaceRoot, pins.payload, pins.profile]
  if (roots.some((root, index) => roots.some((other, otherIndex) =>
    index !== otherIndex && (root === other || root.startsWith(other + path.sep))))) throw Error("SELECTION_PINS_INVALID")
  const prefix = `node-selection-${pins.runID}-${taskID}-${pins.phase}-${number}`
  return {
    pins, task: pins.tasks[taskID]!, taskID, number, prefix,
    directory: path.join(pins.resultsRoot, pins.phase, taskID, String(number)),
    workspace: path.join(pins.workspaceRoot, pins.runID, pins.phase, taskID, String(number)),
    packagePath: `${pins.connection.folder}/${prefix}.lgp`, resultName: `${prefix}.result.csv`,
  }
}

export async function reserveAttempt(plan: ReturnType<typeof selectionAttempt>) {
  await mkdir(path.dirname(plan.directory), { recursive: true, mode: 0o700 })
  await mkdir(plan.directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw Error("SELECTION_SLOT_EXISTS")
    throw error
  })
  await mkdir(plan.workspace, { recursive: true, mode: 0o700 })
  const workspace = await mkdtemp(path.join(plan.workspace, "inputs-"))
  await mkdir(path.join(plan.directory, "artifact/results"), { recursive: true, mode: 0o700 })
  return { ...plan, workspace }
}

export async function runSelectionAttempt(pinsFile: string, taskID: string, number: number) {
  if (!absolute(pinsFile)) throw Error("SELECTION_PINS_PATH_INVALID")
  const plan = selectionAttempt(await Bun.file(pinsFile).json() as unknown, taskID, number)
  await mkdir(path.join(plan.pins.resultsRoot, "incidents"), { recursive: true, mode: 0o700 })
  const evidence = await mkdtemp(path.join(plan.pins.resultsRoot, "incidents", `${plan.prefix}-`))
  const result: {
    exitCode: number; evidence: string; modelStarted: boolean | null; blocker: string | null
    sessionID: string | null; cliExitCode: number | null; cleanupConfirmed: boolean | null; mode: SelectionMode; taskID: string
    model: string; variant: string; expectedSkillDigest: string; binaryManifestSha256: string
    startedAt: string; finishedAt: string | null; cliStartedAt: string | null; cliFinishedAt: string | null
    timedOut: boolean; interruptSentAt: string | null
    packagePath: string | null; resultPath: string | null; policyStatus: string; oraclePassed: boolean | null
    calculationPassed: boolean; reviewStatus: string; collectionFailures: string[]
  } = {
    exitCode: 3, evidence, modelStarted: false, blocker: null, sessionID: null, cliExitCode: null, cleanupConfirmed: null,
    mode: plan.task.mode, taskID, model: plan.pins.model, variant: plan.pins.variant,
    expectedSkillDigest: plan.pins.expectedSkillDigest, binaryManifestSha256: plan.pins.manifestSha256,
    startedAt: new Date().toISOString(), finishedAt: null, cliStartedAt: null, cliFinishedAt: null,
    timedOut: false, interruptSentAt: null,
    packagePath: null, resultPath: null, policyStatus: "incomplete", oraclePassed: null,
    calculationPassed: false, reviewStatus: "pending", collectionFailures: [],
  }
  const save = () => Bun.write(path.join(result.evidence, "attempt.json"), JSON.stringify(result, null, 2) + "\n")
  await save()
  try {
    if (await exists(plan.directory)) throw Error("SELECTION_SLOT_EXISTS")
    if (await hashFile(path.join(plan.pins.payload, "cli-manifest.json")) !== plan.pins.manifestSha256)
      throw Error("SELECTION_MANIFEST_MISMATCH")
    if (await hashFile(plan.pins.frozenModelsPath) !== plan.pins.frozenModelsSha256)
      throw Error("SELECTION_MODELS_MISMATCH")
    if (await exists(path.join(plan.pins.profile, ".writer"))) throw Error("PROFILE_BUSY")
    const task = (await loadTasks(path.dirname(plan.task.directory), [taskID]))[0]!
    if (createHash("sha256").update(task.prompt).digest("hex") !== plan.task.promptSha256 ||
      JSON.stringify([...task.inputs].sort()) !== JSON.stringify(Object.keys(plan.task.inputHashes).sort()) ||
      await hashFile(path.join(task.dir, "oracle.csv")) !== plan.task.oracleSha256)
      throw Error("SELECTION_TASK_MISMATCH")
    for (const input of task.inputs) {
      if (await hashFile(path.join(task.dir, input)) !== plan.task.inputHashes[input]) throw Error("SELECTION_INPUT_MISMATCH")
    }
    const env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined &&
        !/^(LOGINOM_|EVAL_|JUDGE_|FAKE_CODEX_)/.test(key))) as Record<string, string>,
      LOGINOM_AI_AGENT_CLI_PROFILE: plan.pins.profile,
      LOGINOM_AI_AGENT_PURE: "1", LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG: "1",
      LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT: "1", LOGINOM_AI_AGENT_DISABLE_EXTERNAL_SKILLS: "1",
      LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_SKILLS: "1", LOGINOM_AI_AGENT_MODELS_PATH: plan.pins.frozenModelsPath,
    }
    const binary = path.join(plan.pins.payload, "bin/loginom-ai-agent-cli")
    const status = await management(binary, "status", evidence, env)
    if (!record(status) || status.url !== plan.pins.connection.url || status.username !== plan.pins.connection.username ||
      status.folder !== plan.pins.connection.folder || status.hasApiKey !== true || status.failure ||
      (Array.isArray(status.recoveries) && status.recoveries.length) ||
      !["ready", "starting"].includes(String(status.state))) throw Error("SELECTION_CONNECTION_MISMATCH")
    // A restored host may report starting before Help/browser readiness. Check explicitly.
    const checked = await management(binary, "check", evidence, env)
    if (!record(checked) || checked.ok !== true || !record(checked.help) || checked.help.state !== "ready" ||
      !record(checked.browser) || checked.browser.state !== "verified") throw Error("SELECTION_CONNECTION_NOT_READY")
    const module: unknown = await import(pathToFileURL(path.join(plan.pins.payload,
      "resources/loginom/runtime/client/lib/bundled-skill-manifest.mjs")).href)
    if (!record(module) || typeof module.verifyBundledSkills !== "function") throw Error("SELECTION_SKILL_VERIFIER_MISSING")
    const skills: unknown = await module.verifyBundledSkills(path.join(plan.pins.payload, "resources/loginom"))
    if (!Array.isArray(skills) || !skills.some((skill: unknown) => record(skill) &&
      skill.name === "loginom-automation" && skill.digest === plan.pins.expectedSkillDigest)) throw Error("SELECTION_SKILL_MISMATCH")
    const inspected = await command(["docker", "inspect", "--format",
      '{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}}}', plan.pins.container.id])
    const container: unknown = JSON.parse(inspected)
    if (!record(container) || container.id !== plan.pins.container.id || container.name !== "/" + plan.pins.container.name ||
      container.running !== true) throw Error("SELECTION_CONTAINER_MISMATCH")
    await command(["docker", "exec", plan.pins.container.id, "test", "-d", plan.pins.storageDir])
    const attempt = await reserveAttempt(plan)
    await Promise.all(["status.json", "status.stderr.txt", "check.json", "check.stderr.txt"].map((name) =>
      cp(path.join(evidence, name), path.join(attempt.directory, name))))
    result.evidence = attempt.directory
    await save()
    await Bun.write(path.join(evidence, "promoted.json"), JSON.stringify({ attempt: attempt.directory }) + "\n")
    await Bun.write(path.join(attempt.directory, "pins.json"), JSON.stringify(plan.pins, null, 2) + "\n")
    const inputs = await Promise.all(task.inputs.map(async (input) => {
      const target = path.join(attempt.workspace, path.basename(input))
      await cp(path.join(task.dir, input), target)
      return target
    }))
    await Bun.write(path.join(attempt.directory, "prompt.txt"), buildAgentPrompt(task.prompt, attempt.packagePath, attempt.resultName))
    result.cliStartedAt = new Date().toISOString()
    const child = Bun.spawn([binary, "run", "--headless", "--format", "json", "--model", plan.pins.model,
      "--variant", plan.pins.variant, "--command", "loginom-automation", "--dir", attempt.workspace,
      "--title", attempt.prefix, ...inputs.flatMap((input) => ["--file", input])], {
      cwd: attempt.workspace, env, detached: true,
      stdin: Bun.file(path.join(attempt.directory, "prompt.txt")),
      stdout: Bun.file(path.join(attempt.directory, "events.jsonl")),
      stderr: Bun.file(path.join(attempt.directory, "stderr.txt")),
    })
    result.modelStarted = null
    await Bun.write(path.join(attempt.directory, "cli.pid"), String(child.pid) + "\n")
    await save()
    const interrupted = Promise.withResolvers<null>()
    const timers: ReturnType<typeof setTimeout>[] = []
    const interrupt = (timeout = false) => {
      if (result.interruptSentAt) return
      result.timedOut = timeout
      result.interruptSentAt = new Date().toISOString()
      // The CLI owns cleanup; the supervisor never escalates or touches its writer.
      void save().finally(() => {
        child.kill("SIGINT")
        timers.push(setTimeout(() => interrupted.resolve(null), plan.pins.graceSeconds * 1000))
      }).catch(() => {})
    }
    const cancel = () => interrupt(false)
    process.on("SIGINT", cancel)
    timers.push(setTimeout(() => interrupt(true), plan.pins.deadlineSeconds * 1000))
    result.cliExitCode = await Promise.race([child.exited, interrupted.promise])
    timers.forEach(clearTimeout)
    process.off("SIGINT", cancel)
    if (result.cliExitCode === null) {
      child.unref()
      throw Error("CLI_EXIT_UNCONFIRMED")
    }
    result.cliFinishedAt = new Date().toISOString()
    await Bun.write(path.join(attempt.directory, "cli-exit-code.txt"), String(result.cliExitCode) + "\n")
    await save()
    const stderr = await Bun.file(path.join(attempt.directory, "stderr.txt")).text()
    if (result.cliExitCode === 3 && stderr.trim() === "PROFILE_BUSY") {
      // This exact bootstrap refusal proves the CLI never acquired the profile or dispatched a model.
      result.modelStarted = false
      const incident = path.join(evidence, "cli-rejected")
      await rename(attempt.directory, incident)
      result.evidence = incident
      throw Error("PROFILE_BUSY")
    }
    result.cleanupConfirmed = false
    result.cleanupConfirmed = !await exists(path.join(plan.pins.profile, ".writer")) &&
      !stderr.includes("LOGINOM_HOST_CLEANUP_FAILED")
    await save()
    const events: unknown[] = (await Bun.file(path.join(attempt.directory, "events.jsonl")).text())
      .split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown)
    const sessions = [...new Set(events.flatMap((event) => record(event) && typeof event.sessionID === "string" && event.sessionID ? [event.sessionID] : []))]
    if (events.length && sessions.length !== 1) throw Error("SELECTION_SESSION_INCOMPLETE")
    const snapshot = readSelectionSnapshot(path.join(plan.pins.profile, "data/loginom-ai-agent.db"), sessions[0] ?? "", {
      title: attempt.prefix, startedAt: Date.parse(result.cliStartedAt), finishedAt: Date.parse(result.cliFinishedAt),
    })
    result.sessionID = snapshot.sessionID
    result.modelStarted = selectionModelStarted(snapshot, result.cliExitCode)
    await Bun.write(path.join(attempt.directory, "parts.json"), JSON.stringify(snapshot, null, 2) + "\n")
    await save()
    const runtime = path.join(plan.pins.profile, "loginom/runtime")
    const chat = createHash("sha256").update(result.sessionID).digest("hex")
    const journals: { source: string; path: string; sha256: string }[] = []
    for await (const relative of new Bun.Glob(`generations/*/chats/${chat}/attempts/*/{execution-events.jsonl,session.json,terminal-close.jsonl}`).scan(runtime)) {
      const source = path.join(runtime, relative)
      if (!(await realpath(source)).startsWith((await realpath(runtime)) + path.sep) || !(await lstat(source)).isFile())
        throw Error("SELECTION_JOURNAL_PATH_INVALID")
      const destination = path.join(attempt.directory, "runtime", relative)
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
      await cp(source, destination)
      journals.push({ source, path: path.relative(attempt.directory, destination), sha256: await hashFile(destination) })
    }
    await Bun.write(path.join(attempt.directory, "runtime-journals.json"), JSON.stringify(journals, null, 2) + "\n")
    // A terminated CLI permits read-only diagnostics even if host cleanup remains unconfirmed.
    // Block before moving a model slot or accessing Loginom artifacts.
    if (!result.cleanupConfirmed) throw Error("SELECTION_CLEANUP_UNCONFIRMED")
    if (result.modelStarted === false) {
      const incident = path.join(evidence, "auth-rejected")
      await rename(attempt.directory, incident)
      result.evidence = incident
      throw Error("SELECTION_AUTH_REFRESH_FAILED")
    }
    if (result.modelStarted === null) throw Error("SELECTION_DISPATCH_UNCONFIRMED")
    const completeParts = await fullToolOutputs(snapshot.parts, plan.pins.profile, attempt.directory)
    const receipts = readSelectionAttemptReceipts(completeParts)
    if (receipts.failures.length) result.collectionFailures.push(...receipts.failures)
    const saves = receipts.calls.filter((call) => call.tool === "loginom_dock_action_run" && successful(call) &&
      ["package.save_checkpoint", "package.save_as"].includes(String(call.input.action_key)))
      .sort((a, b) => a.end - b.end)
    const saved: unknown = saves.at(-1)?.output.output
    if (record(saved) && (saved.save_completed === true || saved.reopened === true) &&
      record(saved.package_ref) && typeof saved.package_ref.path === "string") {
      const name = storageName(saved.package_ref.path, plan.pins.connection.folder, plan.prefix, ".lgp")
      await command(["docker", "cp", `${plan.pins.container.id}:${plan.pins.storageDir}/${name}`, path.join(attempt.directory, "artifact/package.lgp")])
      result.packagePath = saved.package_ref.path
      if (!(await unzip(path.join(attempt.directory, "artifact/package.lgp"), path.join(attempt.directory, "artifact/unpacked"))))
        result.collectionFailures.push("PACKAGE_XML_INVALID")
    } else result.collectionFailures.push("PACKAGE_RECEIPT_MISSING")
    const outputs = receipts.calls.filter((call) => successful(call)).flatMap((call) => {
      const receipt: unknown = call.output
      if (!record(receipt) || !record(receipt.execution) || receipt.execution.status !== "completed" || !record(receipt.output) ||
        !Array.isArray(receipt.output.file_artifacts)) return []
      return receipt.output.file_artifacts.filter((artifact: unknown): artifact is Record<string, unknown> => record(artifact) &&
        typeof artifact.destination === "string" && artifact.execution_id === (receipt.execution as Record<string, unknown>).execution_id && digest(artifact.sha256))
    })
    const destinations = [...new Set(outputs.map((file) => file.destination))]
    if (destinations.length === 1) {
      const file = outputs.at(-1)!
      const destination = String(file.destination)
      const name = storageName(destination, plan.pins.connection.folder, plan.prefix, ".result.csv")
      const local = path.join(attempt.directory, "artifact/results", name)
      await command(["docker", "cp", `${plan.pins.container.id}:${plan.pins.storageDir}/${name}`, local])
      if (await hashFile(local) !== file.sha256 || (await Bun.file(local).bytes()).length !== file.bytes)
        throw Error("SELECTION_RESULT_BYTES_MISMATCH")
      result.resultPath = destination
    } else result.collectionFailures.push("RESULT_RECEIPT_MISSING_OR_AMBIGUOUS")
    await save()
    const audit = Bun.spawn([process.execPath, path.join(import.meta.dir, "audit-node-selection.ts"), "--tasks", path.dirname(plan.task.directory),
      "--task", taskID, "--attempt", attempt.directory, "--mode", plan.task.mode], {
      cwd: path.resolve(import.meta.dir, ".."), stdout: Bun.file(path.join(attempt.directory, "audit.stdout.txt")),
      stderr: Bun.file(path.join(attempt.directory, "audit.stderr.txt")),
    })
    result.exitCode = await audit.exited
    const report: unknown = await Bun.file(path.join(attempt.directory, "selection-audit.json")).json()
    if (record(report)) {
      result.policyStatus = typeof report.policyStatus === "string" ? report.policyStatus : "incomplete"
      result.oraclePassed = typeof report.oraclePassed === "boolean" ? report.oraclePassed : null
      result.calculationPassed = report.calculationPassed === true && !result.collectionFailures.length
    }
    if (result.collectionFailures.length && result.exitCode === 0) result.exitCode = 2
  } catch (error) {
    const failure = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "SELECTION_COLLECTION_FAILED"
    if (result.cleanupConfirmed === false && failure !== "SELECTION_CLEANUP_UNCONFIRMED") result.collectionFailures.push(failure)
    result.blocker = result.cleanupConfirmed === false ? "SELECTION_CLEANUP_UNCONFIRMED" : failure
    result.exitCode = result.modelStarted === false || ["CLI_EXIT_UNCONFIRMED", "SELECTION_CLEANUP_UNCONFIRMED", "PROFILE_BUSY"].includes(result.blocker) ? 3 : 2
    if (result.blocker === "SELECTION_SLOT_EXISTS") result.exitCode = 2
  }
  result.exitCode = selectionExitCode(result)
  result.finishedAt = new Date().toISOString()
  await save()
  return result
}

export function readSelectionAttemptReceipts(parts: Record<string, unknown>[]) {
  return readNodeEvents(parts
    .filter((part) => typeof part.tool === "string" && part.tool.startsWith("loginom_dock_"))
    .map((part) => JSON.stringify({ type: "tool_use", part })).join("\n"))
}

export function selectionExitCode(result: { exitCode: number; cliExitCode: number | null; timedOut: boolean; cleanupConfirmed?: boolean | null }) {
  if (result.cleanupConfirmed === false) return 3
  return result.cliExitCode === 130 && !result.timedOut && result.exitCode !== 3 ? 130 : result.exitCode
}

export function selectionModelStarted(snapshot: ReturnType<typeof readSelectionSnapshot>, cliExitCode: number | null): boolean | null {
  const assistants = snapshot.messages.filter((message) => message.role === "assistant")
  if (snapshot.parts.some((part) => assistants.some((message) => message.id === part.messageID) &&
    ["step-start", "step-finish", "text", "reasoning", "tool"].includes(String(part.type)))) return true
  const users = snapshot.messages.filter((message) => message.role === "user")
  const assistant = assistants[0]
  if (cliExitCode !== 1 || snapshot.parentID !== null || snapshot.childSessionIDs.length ||
    snapshot.messages.length !== 2 || users.length !== 1 || assistants.length !== 1 || !assistant ||
    assistant.parentID !== users[0]!.id || assistant.providerID !== "openai" ||
    !record(assistant.error) || assistant.error.name !== "UnknownError" || !record(assistant.error.data) ||
    assistant.error.data.message !== "Token refresh failed: HTTP 401" ||
    !record(assistant.time) || typeof assistant.time.created !== "number" || typeof assistant.time.completed !== "number" ||
    assistant.time.completed < assistant.time.created || !record(assistant.tokens) || !record(assistant.tokens.cache) ||
    [assistant.tokens.input, assistant.tokens.output, assistant.tokens.reasoning, assistant.tokens.cache.read,
      assistant.tokens.cache.write].some((value) => value !== 0) || !snapshot.parts.length ||
    snapshot.parts.some((part) => part.messageID !== users[0]!.id)) return null
  // Observed pilot failure: OpenAI OAuth refresh is awaited before the inference fetch.
  // A durable assistant row is created earlier and does not prove dispatch on its own.
  return false
}

export function readSelectionSnapshot(filename: string, sessionID: string,
  fallback?: { title: string; startedAt: number; finishedAt: number }) {
  const database = new Database(filename, { readonly: true, strict: true })
  try {
    database.exec("PRAGMA query_only=ON; BEGIN")
    const matches = !sessionID && fallback ? database.query<{ id: string }, [string, number, number]>(
      "SELECT id FROM session WHERE title = ? AND parent_id IS NULL AND time_created >= ? AND time_created <= ?")
      .all(fallback.title, fallback.startedAt, fallback.finishedAt) : []
    if (!sessionID && matches.length !== 1) throw Error("SELECTION_SESSION_INCOMPLETE")
    const ownID = sessionID || matches[0]!.id
    const session = database.query<{ id: string; parent_id: string | null }, [string]>("SELECT id, parent_id FROM session WHERE id = ?").get(ownID)
    if (!session) throw Error("SELECTION_SESSION_MISSING")
    const children = database.query<{ id: string }, [string]>("SELECT id FROM session WHERE parent_id = ?").all(ownID)
    const messages = database.query<{ id: string; session_id: string; data: string }, [string]>(
      "SELECT id, session_id, data FROM message WHERE session_id = ? ORDER BY time_created, id").all(ownID)
    const parts = database.query<{ id: string; message_id: string; session_id: string; data: string }, [string]>(
      "SELECT id, message_id, session_id, data FROM part WHERE session_id = ? ORDER BY time_created, id").all(ownID)
    return { sessionID: ownID, parentID: session.parent_id, childSessionIDs: children.map((child) => child.id),
      messages: messages.map((row): Record<string, unknown> => ({ ...jsonRecord(row.data), id: row.id, sessionID: row.session_id })),
      parts: parts.map((row): Record<string, unknown> => ({ ...jsonRecord(row.data), id: row.id, messageID: row.message_id, sessionID: row.session_id })),
    }
  } finally { database.close() }
}

async function management(binary: string, action: "status" | "check", evidence: string, env: Record<string, string>) {
  const child = Bun.spawn([binary, "loginom", action, "--headless", "--format", "json"], {
    env, stdout: Bun.file(path.join(evidence, `${action}.json`)), stderr: Bun.file(path.join(evidence, `${action}.stderr.txt`)),
  })
  const expired = Promise.withResolvers<null>()
  const timer = setTimeout(() => expired.resolve(null), 240_000)
  const code = await Promise.race([child.exited, expired.promise])
  clearTimeout(timer)
  if (code === null) { child.unref(); throw Error("SELECTION_MANAGEMENT_EXIT_UNCONFIRMED") }
  if (code !== 0) throw Error(code === 3 ? "PROFILE_BUSY_OR_CONFLICT" : code === 4 ? "LOGINOM_RECOVERY_REQUIRED" : "SELECTION_MANAGEMENT_FAILED")
  return await Bun.file(path.join(evidence, `${action}.json`)).json() as unknown
}

async function command(argv: string[]) {
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" })
  const output = new Response(child.stdout).text()
  const errors = new Response(child.stderr).text()
  const code = await child.exited
  await errors
  if (code !== 0) throw Error("SELECTION_COPYOUT_UNAVAILABLE")
  return output
}

async function fullToolOutputs(parts: Record<string, unknown>[], profile: string, directory: string) {
  const outputs: { partID: string; source: string; path: string; sha256: string }[] = []
  const complete = await Promise.all(parts.map(async (part) => {
    if (part.type !== "tool" || typeof part.tool !== "string" || !part.tool.startsWith("loginom_") ||
      !record(part.state) || !record(part.state.metadata) || part.state.metadata.truncated !== true) return part
    const source = part.state.metadata.outputPath
    if (typeof source !== "string" || !absolute(source) || !(await realpath(source)).startsWith((await realpath(profile)) + path.sep))
      throw Error("SELECTION_TOOL_OUTPUT_UNAVAILABLE")
    const local = path.join(directory, "tool-output", createHash("sha256").update(String(part.id)).digest("hex") + ".txt")
    await mkdir(path.dirname(local), { recursive: true, mode: 0o700 })
    await cp(source, local)
    outputs.push({ partID: String(part.id), source, path: path.relative(directory, local), sha256: await hashFile(local) })
    return { ...part, state: { ...part.state, output: await Bun.file(local).text() } }
  }))
  await Bun.write(path.join(directory, "tool-outputs.json"), JSON.stringify(outputs, null, 2) + "\n")
  return complete
}

function storageName(value: string, folder: string, prefix: string, extension: string) {
  if (!value.startsWith(folder + "/")) throw Error("SELECTION_RECEIPT_PATH_INVALID")
  const name = value.slice(folder.length + 1)
  if (!relativeFile(name) || name.includes("/") || !name.startsWith(prefix + ".") || !name.endsWith(extension))
    throw Error("SELECTION_RECEIPT_PATH_INVALID")
  return name
}

async function hashFile(filename: string) {
  const hash = createHash("sha256")
  for await (const chunk of Bun.file(filename).stream()) hash.update(chunk)
  return hash.digest("hex")
}

async function exists(filename: string) {
  return lstat(filename).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false
    throw error
  })
}

function jsonRecord(source: string) {
  const value: unknown = JSON.parse(source)
  if (!record(value)) throw Error("SELECTION_RECORD_INVALID")
  return value
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)
}

function absolute(value: unknown): value is string {
  return typeof value === "string" && path.isAbsolute(value) && path.resolve(value) === value && value !== "/"
}

function relativeFile(value: string) {
  return !!value && !path.isAbsolute(value) && !value.includes("\\") && !value.split("/").some((part) => !part || part === "." || part === "..")
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

if (import.meta.main) {
  const main = async () => {
    const args = parseArgs({ options: { pins: { type: "string" }, task: { type: "string" }, attempt: { type: "string" } } }).values
    if (!args.pins || !args.task || !args.attempt || !/^[1-9][0-9]*$/.test(args.attempt)) throw Error("SELECTION_ARGUMENTS_INVALID")
    const result = await runSelectionAttempt(args.pins, args.task, Number(args.attempt))
    console.log(JSON.stringify({ evidence: result.evidence, exitCode: result.exitCode, modelStarted: result.modelStarted, blocker: result.blocker }))
    process.exitCode = result.exitCode
  }
  await main().catch((error: unknown) => {
    console.error(error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "SELECTION_ATTEMPT_FAILED")
    process.exitCode = 2
  })
}
