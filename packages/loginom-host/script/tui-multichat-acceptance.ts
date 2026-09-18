import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { mkdtemp, readdir } from "node:fs/promises"
import { join } from "node:path"
import { oracleProvider } from "./oracle-provider"

const executable = process.env.LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE
const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
if (!executable || !configPath) throw Error("PRIVATE_TEST_INPUTS_REQUIRED")
const config = await Bun.file(configPath).json()
if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
const directory = await mkdtemp("/tmp/loginom-tui-multichat-")
console.log(`Private acceptance evidence: ${directory}`)
const profile = join(directory, "profile")
const env = { ...process.env, LOGINOM_AI_AGENT_CLI_PROFILE: profile, LOGINOM_AI_AGENT_PURE: "1" }
const setup = Bun.spawn([executable, "loginom", "setup", "--stdin-json", "--format", "json"], {
  env,
  stdin: new Blob([
    JSON.stringify({
      apiKey: config.api_key,
      password: "",
      username: config.workflow_profile.loginom_user,
      url: config.loginom_url,
    }),
  ]),
  stdout: "ignore",
  stderr: "ignore",
})
if ((await setup.exited) !== 0) throw Error("SETUP_FAILED")
const finish = { pending: Promise.withResolvers<void>() }
const provider = oracleProvider({
  directory,
  apiKey: config.api_key,
  onFinish() {
    finish.pending.resolve()
  },
})
await Bun.write(join(profile, "config/loginom-ai-agent.json"), JSON.stringify(provider.config))
const csv = ["amount\n10\n20\n25\n", "amount\n40\n60\n1\n"]
await Bun.write(join(directory, "sales.csv"), csv[0])
const child = Bun.spawn(
  ["python3", join(import.meta.dir, "tui-oracle.py"), executable, directory, directory, "--headless"],
  { env, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
)
const stdout = new Response(child.stdout).text()
const stderr = new Response(child.stderr).text()
void child.exited.then(() => provider.exited())
const timeout = setTimeout(() => child.kill("SIGTERM"), 420000)
const results: { session: string; artifact: string; source: string; sha256: string }[] = []
try {
  for (const index of [0, 1]) {
    const prepared = await call("dock_prepare", { intent: "new_draft", operation_id: `prepare-${index}` })
    const artifact = prepared.input_artifacts?.[0]
    if (
      !prepared.prepared ||
      !prepared.workspace?.authenticated ||
      prepared.input_artifacts.length !== 1 ||
      artifact.sha256 !== createHash("sha256").update(csv[index]).digest("hex")
    )
      throw Error("INPUT_ISOLATION_FAILED")
    const delivered = await call("dock_artifact_deliver", {
      operation_id: `deliver-${index}`,
      artifact_id: artifact.artifact_id,
      upload_grant_id: artifact.upload.grant_id,
      budget_ms: 90000,
    })
    if (
      delivered.status !== "SUCCEEDED" ||
      !delivered.output?.upload_completion_verified ||
      delivered.output.sha256 !== artifact.sha256
    )
      throw Error("DELIVERY_FAILED")
    results.push({
      session: prepared.sessionId,
      artifact: artifact.artifact_id,
      source: artifact.upload.destination,
      sha256: artifact.sha256,
    })
    if (child.exitCode !== null || !(await readdir(profile)).includes(".writer")) throw Error("TUI_OWNER_LOST")
    provider.finish()
    await finish.pending.promise
    finish.pending = Promise.withResolvers<void>()
    if (index === 0) {
      await Bun.write(join(directory, "sales.csv"), csv[1])
      child.stdin.write("next-chat\n")
    }
  }
  child.stdin.write("finish\n")
  const code = await child.exited
  const output = await stdout
  const errors = await stderr
  if (output.includes(config.api_key) || errors.includes(config.api_key)) throw Error("SECRET_IN_OUTPUT")
  await Bun.write(join(directory, "terminal.txt"), output)
  await Bun.write(join(directory, "stderr.txt"), errors)
  const terminal = await Bun.file(join(directory, "tui-exit.json")).json()
  if (code !== 0 || terminal.forced || terminal.submitted_chats !== 2 || (await readdir(profile)).includes(".writer"))
    throw Error("TUI_CLEANUP_FAILED")
  for (const field of ["session", "artifact", "source", "sha256"] as const)
    if (!results[0][field] || results[0][field] === results[1][field]) throw Error(`COLLISION_${field}`)
  const db = new Database(join(profile, "data/loginom-ai-agent.db"), { readonly: true })
  try {
    const sessions = db.query("select id from session").all() as { id: string }[]
    const tools = (db.query("select session_id, data from part").all() as { session_id: string; data: string }[])
      .map((row) => ({ session: row.session_id, part: JSON.parse(row.data) }))
      .filter((row) => row.part.type === "tool")
    if (sessions.length !== 2 || tools.length !== 4 || tools.some((row) => row.part.state.status !== "completed"))
      throw Error("TRANSCRIPT_INVALID")
    if (sessions.some((session) => tools.filter((tool) => tool.session === session.id).length !== 2))
      throw Error("TRANSCRIPT_CROSS_CHAT")
  } finally {
    db.close()
  }
  const summary = { status: "PASS", oneTuiProcess: true, chats: results, code, guarded: false, forced: terminal.forced }
  await Bun.write(join(directory, "summary.json"), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary))
} finally {
  clearTimeout(timeout)
  if (child.exitCode === null) {
    child.kill("SIGTERM")
    await child.exited
  }
  provider.stop()
  const output = await stdout
  const errors = await stderr
  if (output.includes(config.api_key) || errors.includes(config.api_key)) throw Error("SECRET_IN_OUTPUT")
  await Bun.write(join(directory, "terminal.txt"), output)
  await Bun.write(join(directory, "stderr.txt"), errors)
}
async function call(name: string, args: Record<string, unknown>) {
  const envelope = (await provider.request("call", { name, arguments: args })) as {
    result: { content: { text: string }[] }
  }
  const text = envelope.result.content[0].text
  if (text.includes(config.api_key)) throw Error("SECRET_IN_REPLY")
  return JSON.parse(text)
}
