import path from "node:path"
import { spawn } from "node:child_process"
import { appendFile, chmod, mkdir, rm, rmdir } from "node:fs/promises"

const [command, sub] = Bun.argv.slice(2)
if (command === "providers" && sub === "status" && process.env.EVAL_FAKE_SHARED_AUTH_RECEIPT) {
  if (process.env.EVAL_FAKE_SHARED_AUTH_CALLS_FILE)
    await appendFile(process.env.EVAL_FAKE_SHARED_AUTH_CALLS_FILE, JSON.stringify({ args: Bun.argv.slice(2),
      sharedDir: process.env.LOGINOM_AI_AGENT_SHARED_AUTH_DIR, httpOnly: process.env.LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS }) + "\n", { mode: 0o600 })
  const text = await Bun.file(process.env.EVAL_FAKE_SHARED_AUTH_RECEIPT).text()
  process.stdout.write(text + "\n")
  await Bun.sleep(400)
  process.exit(Number(process.env.EVAL_FAKE_SHARED_AUTH_EXIT ?? "0"))
}
const fixtures = path.join(import.meta.dir, "fake")
const packageFixture = command === "run" && Bun.argv.some((arg, index) => Bun.argv[index - 1] === "--file" && path.basename(arg) === "parallel-package.json")
const collision = command === "run" ? Bun.argv.find((arg, index) => Bun.argv[index - 1] === "--file" && path.basename(arg) === "node-output-collision.json") : undefined
if (collision) {
  const input = await Bun.file(collision).json() as { resultsDir: string }
  const workdir = Bun.argv[Bun.argv.indexOf("--dir") + 1]!
  await mkdir(path.join(input.resultsDir, path.basename(path.dirname(path.dirname(workdir))), process.env.EVAL_TASK_ID!,
    path.basename(workdir), "native-crosstable.json"), { recursive: true, mode: 0o700 })
}
if (command === "run" && Bun.argv.some((arg, index) => Bun.argv[index - 1] === "--file" && path.basename(arg) === "parallel-native.json")) {
  const state = await Bun.file(process.env.EVAL_FAKE_STATE_FILE!).json() as { username: string }
  await Bun.write(path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE!, "loginom/runtime/generations/1/chats/same-session/attempts/same-attempt/execution-events.jsonl"),
    JSON.stringify({ operation_id: "same-operation", recorded_at: new Date().toISOString(), phase: "node_observation_completed",
      outcome: { status: "SUCCEEDED", output: { node_crosstable: { verified: true, inventory_complete: true,
        node_context: { verified: true, document_id: "same-document", workflow_id: "same-workflow", node_id: "same-node" },
        input_fields: [{ name: state.username, functions: 1 }] } } } }) + "\n")
  await Bun.sleep(300)
}
const transition = process.env.EVAL_TASK_ID?.match(/^a-(process|archive|ready)-(no-artifact|failed|timeout|completed)$/)
const infraRetry = command === "run" && (process.env.EVAL_TASK_ID?.startsWith("infra-retry-") || process.env.EVAL_TASK_ID === "parallel-infra-retry")
const launch = infraRetry ? await (async () => {
  const file = Bun.file(path.join(Bun.argv[Bun.argv.indexOf("--dir") + 1]!, "fake-launches.json"))
  const count = await file.json().catch(() => 0) as number
  await Bun.write(file, JSON.stringify(count + 1))
  if (count === 0 && process.env.EVAL_TASK_ID === "infra-retry-cleanup-failure") process.env.EVAL_FAKE_CHANGED_WRITER = "1"
  if (count === 0 && process.env.EVAL_TASK_ID !== "infra-retry-cleanup-failure") {
    process.env.EVAL_FAKE_RUNTIME_EVENTS = '{"phase":"AMBIGUOUS"}\n'
    process.env.EVAL_FAKE_STALE_WRITER = "1"
  }
  if (count > 0 && await Bun.file(path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE!, ".writer/owner")).exists()) {
    process.stderr.write("PROFILE_BUSY\n")
    process.exit(3)
  }
  return count + 1
})() : undefined

if (process.env.EVAL_FAKE_ARGS_FILE) await Bun.write(process.env.EVAL_FAKE_ARGS_FILE, JSON.stringify(Bun.argv.slice(2)))
if (command === "run" && ["a-cleanup-failure", "parallel-cleanup-failure"].includes(process.env.EVAL_TASK_ID ?? "")) process.env.EVAL_FAKE_CHANGED_WRITER = "1"
if (command === "run" && transition) {
  if (transition[1] === "process") process.env.EVAL_FAKE_CHANGED_WRITER = "1"
  if (transition[1] === "archive" || transition[1] === "ready") {
    process.env.EVAL_FAKE_RUNTIME_EVENTS = transition[1] === "archive" ? "invalid journal\n" : '{"phase":"AMBIGUOUS"}\n'
    await Bun.write(path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE!, "fixture-cleanup-state.json"),
      JSON.stringify(transition[1] === "archive" ? { state: "ready", hasApiKey: true, recoveries: ["pending"] } : { state: "unconfigured" }))
  }
  if (transition[2] === "timeout") process.env.EVAL_FAKE_HANG_AFTER_EVENTS = "1"
}

if (process.env.EVAL_FAKE_CHANGED_WRITER) {
  const writer = path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE!, ".writer", "owner")
  await Bun.write(writer, "original")
  await Bun.sleep(300)
  await Bun.write(writer, "replacement")
  await Bun.sleep(300)
}
if (command === "run" && process.env.EVAL_FAKE_RUNTIME_EVENTS) {
  const directory = path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE!, "loginom/runtime/generations/1/chats/fake/attempts", crypto.randomUUID())
  await Bun.write(path.join(directory, "execution-events.jsonl"), process.env.EVAL_FAKE_RUNTIME_EVENTS)
  if (process.env.EVAL_FAKE_STALE_WRITER) await Bun.write(path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE!, ".writer/owner"), "own-writer")
  await Bun.sleep(400)
}
if (command === "run" && process.env.EVAL_FAKE_BROWSER_BUNDLE) {
  const validation = process.env.EVAL_FAKE_VALIDATION === "1"
  const directory = path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE!, `loginom/${validation ? "validation" : "runtime"}/generations/1/chats/fake/attempts`, crypto.randomUUID())
  if (validation) await mkdir(directory, { recursive: true })
  if (!validation) await Bun.write(path.join(directory, "execution-events.jsonl"), JSON.stringify({ phase: "AMBIGUOUS" }) + "\n")
  const child = spawn(path.join(process.env.EVAL_FAKE_BROWSER_BUNDLE, "chrome"), [...(process.env.EVAL_FAKE_BROWSER_SCRIPT ? [process.env.EVAL_FAKE_BROWSER_SCRIPT] : []), `--user-data-dir=${process.env.EVAL_FAKE_BROWSER_DATA_DIR ?? `${directory}/browser-profile`}`],
    { detached: true, stdio: "ignore", env: { PATH: process.env.PATH ?? "", EVAL_FAKE_BROWSER_CLEAR_TITLE: process.env.EVAL_FAKE_BROWSER_CLEAR_TITLE ?? "",
      EVAL_FAKE_BROWSER_HELPER_PID_FILE: process.env.EVAL_FAKE_BROWSER_HELPER_PID_FILE ?? "", EVAL_FAKE_BROWSER_HELPER_DETACHED: process.env.EVAL_FAKE_BROWSER_HELPER_DETACHED ?? "" } })
  await Bun.write(process.env.EVAL_FAKE_BROWSER_PID_FILE!, String(child.pid))
  await Bun.sleep(400)
  if (validation) await rm(directory, { recursive: true })
  await Bun.sleep(500)
}

if (process.env.EVAL_FAKE_ORPHAN_PID_FILE) {
  const delayed = process.env.EVAL_FAKE_CHILD_DELAY_MS
  const child = spawn(process.execPath, ["-e", delayed
    ? `process.on('SIGINT', () => {}); process.on('SIGTERM', () => {}); process.stdout.write('ready'); setTimeout(() => process.exit(0), ${Number(delayed)})`
    : "setInterval(() => {}, 1000)"], {
    detached: process.env.EVAL_FAKE_DETACHED_CHILD === "1",
    env: { PATH: process.env.PATH ?? "" }, stdio: ["ignore", "pipe", "ignore"],
  })
  if (delayed) await new Promise((resolve) => child.stdout!.once("data", resolve))
  await Bun.write(process.env.EVAL_FAKE_ORPHAN_PID_FILE, String(child.pid))
}
if (process.env.EVAL_FAKE_EXIT_DELAY_MS) await Bun.sleep(Number(process.env.EVAL_FAKE_EXIT_DELAY_MS))

if (command === "loginom") {
  if (process.env.EVAL_FAKE_MANAGEMENT_ENV_FILE)
    await appendFile(process.env.EVAL_FAKE_MANAGEMENT_ENV_FILE, JSON.stringify({ sub,
      httpOnly: process.env.LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS ?? null,
      passwordPresent: process.env.LOGINOM_PASSWORD !== undefined }) + "\n")
  if (process.env.EVAL_FAKE_MANAGEMENT_CALLS_FILE)
    await appendFile(process.env.EVAL_FAKE_MANAGEMENT_CALLS_FILE, JSON.stringify(Bun.argv.slice(2)) + "\n")
  if (sub === "check" && process.env.EVAL_FAKE_CHECK_FILE) {
    const check = await Bun.file(process.env.EVAL_FAKE_CHECK_FILE).json()
    if (check.pendingRecovery) await Bun.write(path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE!, "loginom/recovery/operation.json"), '{"id":"pending-check"}')
    process.stdout.write(JSON.stringify(check.receipt) + "\n")
    process.exit(check.exitCode ?? 0)
  }
  if (process.env.EVAL_FAKE_ENFORCE_WRITER && await Bun.file(path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE!, ".writer", "owner")).exists()) {
    process.stderr.write("PROFILE_BUSY\n")
    process.exit(3)
  }
  // Management-команды: состояние читается из файла, recover снимает recoveries.
  const transitionState = path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE!, "fixture-cleanup-state.json")
  const stateFile = process.env.EVAL_FAKE_STATE_FILE ?? (await Bun.file(transitionState).exists() ? transitionState : undefined)
  const view = stateFile
    ? ((await Bun.file(stateFile).json()) as Record<string, unknown>)
    : { state: "ready", hasApiKey: true, revision: 1, generation: 1 }
  if (sub === "setup" && process.env.LOGINOM_AI_AGENT_CLI_PROFILE) {
    await Bun.write(
      path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE, "cli-profile.json"),
      JSON.stringify({ format: "loginom-cli", version: 1, channel: "dev" }),
    )
    await Bun.write(path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE, "setup-called"), "1")
  }
  const candidate = sub === "setup" && Bun.argv.includes("--stdin-json") ? await Bun.stdin.json() as Record<string, unknown> : undefined
  const setup = sub === "setup" && process.env.EVAL_FAKE_SETUP_FILE
    ? await Bun.file(process.env.EVAL_FAKE_SETUP_FILE).json() as { reply: unknown; state: unknown } : undefined
  const next =
    sub === "setup" && stateFile
      ? setup?.state ?? { state: "ready", hasApiKey: true, ...(candidate ? { url: candidate.url, username: candidate.username } : {}) }
      : sub === "recover"
        ? process.env.EVAL_FAKE_RECOVERY_PERSISTS ? view : { ...view, recoveries: [] }
        : view
  if (stateFile && (sub === "recover" || sub === "setup")) await Bun.write(stateFile, JSON.stringify(next))
  process.stdout.write(JSON.stringify(setup?.reply ?? next) + "\n")
  process.exit(0)
}

if (command === "run" && /^parallel-/.test(process.env.EVAL_TASK_ID ?? "")) {
  const startedAt = Date.now()
  const profile = process.env.LOGINOM_AI_AGENT_CLI_PROFILE!
  const workdir = Bun.argv[Bun.argv.indexOf("--dir") + 1]!
  await Bun.write(path.join(profile, "data/loginom-ai-agent.db"), JSON.stringify({ task: process.env.EVAL_TASK_ID, workdir, profile, launch: launch ?? 1 }))
  await Bun.write(path.join(profile, "data/loginom-ai-agent.db-wal"), "fixture WAL")
  await Bun.write(path.join(profile, "data/loginom-ai-agent.db-shm"), "fixture SHM")
  await Bun.sleep(process.env.EVAL_TASK_ID === "parallel-slow" ? 3_000 : packageFixture ? 300 : 20)
  await Bun.write(path.join(workdir, "parallel-trace.json"), JSON.stringify({ pid: process.pid, profile, startedAt, finishedAt: Date.now() }))
}

if (process.env.EVAL_FAKE_SLEEP_MS) await Bun.sleep(Number(process.env.EVAL_FAKE_SLEEP_MS))
if (command === "run" && process.env.EVAL_TASK_ID === "parallel-storage-leftover") {
  const workdir = Bun.argv[Bun.argv.indexOf("--dir") + 1]!
  const name = `eval-${path.basename(path.dirname(path.dirname(workdir)))}-${process.env.EVAL_TASK_ID}-${path.basename(workdir)}.extra`
  await Bun.write(path.join(process.env.EVAL_FAKE_SLOT_STORAGE!, name), "owned leftover")
}
if (command === "run" && process.env.EVAL_TASK_ID === "parallel-storage-missing") await rmdir(process.env.EVAL_FAKE_SLOT_STORAGE!)
const orphanFile = command === "run" ? Bun.argv.find((arg, index) => Bun.argv[index - 1] === "--file" && path.basename(arg) === "fake-storage-export.json") : undefined
const orphanFixture = orphanFile ? await Bun.file(orphanFile).json() as { storage: string; readonly?: boolean } : undefined
const orphanStorage = process.env.EVAL_FAKE_ORPHAN_STORAGE ?? orphanFixture?.storage
if (command === "run" && orphanStorage) {
  const name = Bun.argv.at(-1)?.match(/назови его `([^`]+)`/)?.[1]
  if (!name || path.basename(name) !== name) throw Error("Fixture result filename required")
  await Bun.write(path.join(orphanStorage, name), "Region,A,B\nN,7.5,7\nS,3,2\n")
  if (orphanFixture?.readonly) await chmod(orphanStorage, 0o500)
}
const retryOutcomes: Record<string, string> = {
  "parallel-infra-retry": "default", "infra-retry-twice": "host-timeout", "infra-retry-no-artifact": "default",
  "infra-retry-failed": "transition-failed", "infra-retry-harness-error": "stop-case",
}
const id = infraRetry ? launch === 1 ? "host-timeout" : retryOutcomes[process.env.EVAL_TASK_ID!] ?? "group-sum-qty"
  : transition ? ({ failed: "transition-failed", completed: "group-sum-qty" }[transition[2]!] ?? "default")
  : process.env.EVAL_TASK_ID === "parallel-a-stop" ? "stop-case"
  : process.env.EVAL_TASK_ID?.match(/^a-exit[23]$/) ? "stop-case" : process.env.EVAL_TASK_ID ?? "default"
const events = Bun.file(path.join(fixtures, `${id}.jsonl`))
const chosen = (await events.exists()) ? events : Bun.file(path.join(fixtures, "default.jsonl"))
process.stdout.write(await chosen.text())
if (packageFixture) {
  const packagePath = Bun.argv.at(-1)?.match(/Сохрани готовый пакет как `([^`]+)`/)?.[1]
  if (!packagePath || !process.env.EVAL_FAKE_SLOT_STORAGE) throw Error("Fixture package destination required")
  await Bun.write(path.join(process.env.EVAL_FAKE_SLOT_STORAGE, path.basename(packagePath)),
    Bun.file(path.join(import.meta.dir, "storage/fixture-group-sum-qty.lgp")))
  process.stdout.write(JSON.stringify({ type: "tool_use", sessionID: "ses_fixture03", part: { type: "tool", tool: "loginom_dock_action_run",
    state: { status: "completed", input: { action_key: "package.save_as" }, output: JSON.stringify({ package_ref: { path: packagePath } }) } } }) + "\n")
}
if (process.env.EVAL_FAKE_HANG_AFTER_EVENTS) {
  process.on("SIGINT", () => {})
  await Bun.sleep(120_000)
}
const exit = Bun.file(path.join(fixtures, `${id}.exit`))
const stderr = Bun.file(path.join(fixtures, `${id}.stderr`))
if (await stderr.exists()) process.stderr.write(await stderr.text())
process.exit(process.env.EVAL_TASK_ID === "a-exit3" ? 3 : (await exit.exists()) ? Number((await exit.text()).trim()) : 0)
