import path from "node:path"
import { spawn } from "node:child_process"
import { mkdir, rm } from "node:fs/promises"

const [command, sub] = Bun.argv.slice(2)
const fixtures = path.join(import.meta.dir, "fake")
const transition = process.env.EVAL_TASK_ID?.match(/^a-(process|archive|ready)-(no-artifact|failed|timeout|completed)$/)
const infraRetry = command === "run" && process.env.EVAL_TASK_ID === "infra-retry-success"
const launch = infraRetry ? await (async () => {
  const file = Bun.file(path.join(Bun.argv[Bun.argv.indexOf("--dir") + 1]!, "fake-launches.json"))
  const count = await file.json().catch(() => 0) as number
  await Bun.write(file, JSON.stringify(count + 1))
  if (count === 0) {
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
if (command === "run" && process.env.EVAL_TASK_ID === "a-cleanup-failure") process.env.EVAL_FAKE_CHANGED_WRITER = "1"
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
  const next =
    sub === "setup" && stateFile
      ? { state: "ready", hasApiKey: true }
      : sub === "recover"
        ? { ...view, recoveries: [] }
        : view
  if (stateFile && (sub === "recover" || sub === "setup")) await Bun.write(stateFile, JSON.stringify(next))
  process.stdout.write(JSON.stringify(next) + "\n")
  process.exit(0)
}

if (process.env.EVAL_FAKE_SLEEP_MS) await Bun.sleep(Number(process.env.EVAL_FAKE_SLEEP_MS))
const id = infraRetry ? launch === 1 ? "host-timeout" : "group-sum-qty"
  : transition ? ({ failed: "transition-failed", completed: "group-sum-qty" }[transition[2]!] ?? "default")
  : process.env.EVAL_TASK_ID?.match(/^a-exit[23]$/) ? "stop-case" : process.env.EVAL_TASK_ID ?? "default"
const events = Bun.file(path.join(fixtures, `${id}.jsonl`))
const chosen = (await events.exists()) ? events : Bun.file(path.join(fixtures, "default.jsonl"))
process.stdout.write(await chosen.text())
if (process.env.EVAL_FAKE_HANG_AFTER_EVENTS) {
  process.on("SIGINT", () => {})
  await Bun.sleep(120_000)
}
const exit = Bun.file(path.join(fixtures, `${id}.exit`))
const stderr = Bun.file(path.join(fixtures, `${id}.stderr`))
if (await stderr.exists()) process.stderr.write(await stderr.text())
process.exit(process.env.EVAL_TASK_ID === "a-exit3" ? 3 : (await exit.exists()) ? Number((await exit.text()).trim()) : 0)
