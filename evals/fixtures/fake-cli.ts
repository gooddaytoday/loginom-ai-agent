import path from "node:path"
import { spawn } from "node:child_process"

const [command, sub] = Bun.argv.slice(2)
const fixtures = path.join(import.meta.dir, "fake")

if (process.env.EVAL_FAKE_ARGS_FILE) await Bun.write(process.env.EVAL_FAKE_ARGS_FILE, JSON.stringify(Bun.argv.slice(2)))

if (process.env.EVAL_FAKE_CHANGED_WRITER) {
  const writer = path.join(process.env.LOGINOM_AI_AGENT_CLI_PROFILE!, ".writer", "owner")
  await Bun.write(writer, "original")
  await Bun.sleep(300)
  await Bun.write(writer, "replacement")
  await Bun.sleep(300)
}

if (process.env.EVAL_FAKE_ORPHAN_PID_FILE) {
  const delayed = process.env.EVAL_FAKE_CHILD_DELAY_MS
  const child = spawn(process.execPath, ["-e", delayed
    ? `process.on('SIGTERM', () => {}); process.stdout.write('ready'); setTimeout(() => process.exit(0), ${Number(delayed)})`
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
  const stateFile = process.env.EVAL_FAKE_STATE_FILE
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
const id = process.env.EVAL_TASK_ID ?? "default"
const events = Bun.file(path.join(fixtures, `${id}.jsonl`))
const chosen = (await events.exists()) ? events : Bun.file(path.join(fixtures, "default.jsonl"))
process.stdout.write(await chosen.text())
const exit = Bun.file(path.join(fixtures, `${id}.exit`))
const stderr = Bun.file(path.join(fixtures, `${id}.stderr`))
if (await stderr.exists()) process.stderr.write(await stderr.text())
process.exit((await exit.exists()) ? Number((await exit.text()).trim()) : 0)
