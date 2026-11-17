// S4 (Linux, source build): data created by the fork's current v1 backend (v040) is migrated by the OpenCode 2 server.
// 1) run the fork's v1 CLI once against the scripted model to create a profile with one session;
// 2) copy its database to where the v2 server expects it; 3) start v2 and read sessions/messages; 4) restart v2 and
// confirm the migration is idempotent.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { client, report, SPIKE } from "./env"
import { script, startMock } from "./mock-llm"

const ROOT = path.resolve(SPIKE, "..", "..")
const run = path.join(SPIKE, ".run", "s4")
rmSync(run, { recursive: true, force: true })
const v1 = path.join(run, "v1")
const project = path.join(run, "project")
mkdirSync(project, { recursive: true })
const mock = startMock(47221, path.join(run, "llm.jsonl"))
const results: Record<string, unknown> = {}

const xdg = (base: string) => ({
  HOME: path.join(base, "home"),
  XDG_DATA_HOME: path.join(base, "data"),
  XDG_CONFIG_HOME: path.join(base, "config"),
  XDG_STATE_HOME: path.join(base, "state"),
  XDG_CACHE_HOME: path.join(base, "cache"),
})
try {
  const v1Config = {
    model: "spike/spike-model",
    provider: { spike: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://127.0.0.1:47221/v1", apiKey: "spike" }, models: { "spike-model": { name: "Spike", tool_call: true } } } },
  }
  const v1Run = Bun.spawnSync(["bun", "run", "src/index.ts", "run", "--format", "json", script([{ text: "answer from v1" }], "hello from v1")], {
    cwd: path.join(ROOT, "packages", "opencode"),
    env: { ...process.env, ...xdg(v1), LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify(v1Config), LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: "1", PWD: project },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  })
  results.v1Run = { exit: v1Run.exitCode, stdout: v1Run.stdout.toString().slice(-600), stderr: v1Run.stderr.toString().slice(-600) }
  const dataRoot = path.join(v1, "data")
  const v1Files = existsSync(dataRoot) ? readdirSync(dataRoot, { recursive: true }).map(String).filter((file) => file.endsWith(".db")) : []
  results.v1Databases = v1Files
} finally {
  mock.stop(true)
}

// v2 reads the copied fork database in place (OPENCODE_DB); the fork's identity rename would make this its default.
const copy = path.join(run, "v2-opencode.db")
const source = path.join(v1, "data", "loginom-ai-agent", "loginom-ai-agent.db")
if (!existsSync(source)) {
  report("S4", "NOT RUN", { ...results, reason: "v1 profile was not created" })
  process.exit(0)
}
cpSync(source, copy)
const { makeEnv } = await import("./env")
const observe = async (env: Awaited<ReturnType<typeof makeEnv>>) => {
  const api = client(env.port, project)
  let status: unknown
  for (let i = 0; i < 60; i++) {
    status = (await api.call("GET", "/api/experimental/migration/v1")).body
    if (JSON.stringify(status).includes("completed")) break
    await Bun.sleep(500)
  }
  const sessions = (await api.call("GET", "/api/session")).body?.data ?? []
  const first = sessions[0]?.id
  const messages = first ? (await api.messages(first)).body?.data ?? [] : []
  return { status, sessions: sessions.map((s: { id: string; title: string }) => `${s.id} ${s.title}`), messageTypes: messages.map((m: { type: string }) => m.type) }
}
const v2 = await makeEnv("s4-v2", { port: 47230, plugins: [], extraEnv: { OPENCODE_DB: copy } })
try {
  results.firstStart = await observe(v2)
  v2.server().kill("SIGTERM")
  await v2.server().exited
  await v2.restart()
  results.secondStart = await observe(v2)
} finally {
  v2.stop()
}
const r = results as any
const v1Session = "ses_" // any migrated session id
const pass =
  r.firstStart.sessions.some((s: string) => s.startsWith(v1Session)) &&
  JSON.stringify(r.firstStart.sessions) === JSON.stringify(r.secondStart.sessions) &&
  r.firstStart.messageTypes.includes("user")
report("S4", pass ? "PARTIAL" : "FAIL", results)
