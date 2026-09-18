import path from "node:path"

const [command, sub] = Bun.argv.slice(2)
const fixtures = path.join(import.meta.dir, "fake")

if (command === "loginom") {
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
process.exit((await exit.exists()) ? Number((await exit.text()).trim()) : 0)
