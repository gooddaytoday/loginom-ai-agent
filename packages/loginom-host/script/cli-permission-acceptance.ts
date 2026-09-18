import { Database } from "bun:sqlite"
import { mkdtemp, readdir } from "node:fs/promises"
import { join } from "node:path"
import { oracleProvider } from "./oracle-provider"

if (process.platform !== "linux") throw Error("LINUX_ONLY_TEST")
const executable = process.env.LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE
const restart = process.argv[2] === "--restart"
const always = process.argv[2] === "--tui-always"
const onceScope = process.argv[2] === "--tui-once-scope"
const allow = process.argv[2] === "--tui-allow" || onceScope || always
const tui = process.argv[2] === "--tui" || allow
const savedPath = process.argv[3]
if (allow && !savedPath?.startsWith("/")) throw Error("PERMISSION_SAVED_PACKAGE_REQUIRED")
if (restart && !savedPath?.startsWith("/")) throw Error("PERMISSION_PROFILE_REQUIRED")
if (process.argv[2] && !tui && !restart) throw Error("PERMISSION_ARGUMENT_INVALID")
const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
if (!executable || !configPath) throw Error("PRIVATE_TEST_INPUTS_REQUIRED")
const config = await Bun.file(configPath).json()
if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
const directory = await mkdtemp("/tmp/loginom-cli-permission-")
console.log(`Private permission evidence: ${directory}`)
const workspace = restart ? savedPath : directory
const profile = join(workspace, "profile")
const previous = restart
  ? (() => {
      const db = new Database(join(profile, "data/loginom-ai-agent.db"), { readonly: true })
      try {
        const sessions = db.query("select id from session").all() as { id: string }[]
        if (sessions.length !== 1) throw Error("PERMISSION_SESSION_AMBIGUOUS")
        const parts = (db.query("select data from part order by time_created, id").all() as { data: string }[]).map(
          (row) => JSON.parse(row.data),
        )
        const tool = parts.find(
          (part) => part.type === "tool" && part.tool === "loginom_dock_prepare" && part.state.status === "completed",
        )
        if (!tool) throw Error("PERMISSION_PRIOR_APPROVAL_MISSING")
        return { session: sessions[0].id, input: tool.state.input }
      } finally {
        db.close()
      }
    })()
  : undefined
const env = { ...process.env, LOGINOM_AI_AGENT_CLI_PROFILE: profile, LOGINOM_AI_AGENT_PURE: "1" }
if (!restart) {
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
  if ((await setup.exited) !== 0) throw Error("PERMISSION_SETUP_FAILED")
}
const provider = oracleProvider({
  directory,
  apiKey: config.api_key,
  onFinish() {
    if (tui) child.stdin.write("finish\n")
  },
})
await Bun.write(
  join(profile, "config/loginom-ai-agent.json"),
  JSON.stringify({ ...provider.config, permission: { "loginom_*": "ask" } }),
)
// No skip-permissions flag and no interactive stdin: approval must not be invented.
const child = Bun.spawn(
  tui
    ? [
        "python3",
        join(import.meta.dir, "tui-oracle.py"),
        executable,
        directory,
        directory,
        "--headless",
        JSON.stringify({ permission: always ? "always" : allow ? "once" : true }),
      ]
    : [
        executable,
        "run",
        "--headless",
        "--format",
        "json",
        "--dir",
        workspace,
        ...(restart ? ["--continue"] : []),
        "--model",
        "test/test-model",
        "--",
        "Prepare Loginom only if permission allows it.",
      ],
  { env, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
)
if (!tui) child.stdin.end()
const stdout = new Response(child.stdout).text()
const stderr = new Response(child.stderr).text()
void child.exited.then(() => provider.exited())
const timer = setTimeout(() => child.kill("SIGINT"), 120000)
try {
  await provider
    .request("call", {
      name: "dock_prepare",
      arguments: {
        ...previous?.input,
        operation_id: "permission-prepare-restart",
        ...(allow ? { intent: "open_package", package_path: savedPath } : {}),
      },
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "CLI_ORACLE_EXITED") throw error
    })
  if (onceScope || always) {
    child.stdin.write("reject-next\n")
    const deadline = Date.now() + 3000
    while (!(await Bun.file(join(directory, "permission-next-ready")).exists()) && Date.now() < deadline)
      await Bun.sleep(50)
    if (!(await Bun.file(join(directory, "permission-next-ready")).exists())) throw Error("PERMISSION_DRIVER_NOT_READY")
    await provider
      .request("call", {
        name: "dock_prepare",
        arguments: { intent: "open_package", package_path: savedPath, operation_id: "permission-second" },
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "CLI_ORACLE_EXITED") throw error
      })
  }
  provider.finish()
  const code = await child.exited
  const output = await stdout
  const errors = await stderr
  if (output.includes(config.api_key) || errors.includes(config.api_key)) throw Error("SECRET_IN_PERMISSION_OUTPUT")
  const events = tui
    ? []
    : output
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
  const tools = tui
    ? (() => {
        const db = new Database(join(profile, "data/loginom-ai-agent.db"), { readonly: true })
        try {
          return (db.query("select data from part order by time_created, id").all() as { data: string }[])
            .map((row) => ({ part: JSON.parse(row.data) }))
            .filter((row) => row.part.type === "tool")
        } finally {
          db.close()
        }
      })()
    : events.filter((event) => event.type === "tool_use")
  const guarded = (await readdir(profile)).includes(".writer")
  const terminal = tui ? await Bun.file(join(directory, "tui-exit.json")).json() : undefined
  const rejected = tui
    ? terminal.permission_rejected === true && terminal.forced === false
    : events.some((event) => event.type === "error" && event.error?.name === "CLI_PERMISSION_REJECTED")
  const result = {
    tui,
    restart,
    session: previous?.session,
    allow,
    onceScope,
    always,
    alwaysConfirmed: terminal?.always_confirmed === true,
    approved: terminal?.permission_approved === true,
    code,
    guarded,
    rejected,
    tools: tools.map((event) => ({ tool: event.part.tool, status: event.part.state.status })),
  }
  await Bun.write(join(directory, tui ? "terminal.txt" : "events.jsonl"), output)
  await Bun.write(join(directory, "stderr.txt"), errors)
  await Bun.write(join(directory, "summary.json"), JSON.stringify(result))
  if (
    code !== (tui ? 0 : 1) ||
    guarded ||
    (allow
      ? terminal.permission_approved !== true || terminal.forced !== false || (onceScope ? !rejected : rejected)
      : !rejected) ||
    tools.length !== (onceScope || always ? 2 : 1) ||
    tools[0].part.tool !== "loginom_dock_prepare" ||
    tools[0].part.state.status !== (allow ? "completed" : "error")
  )
    throw Error("PERMISSION_ACCEPTANCE_FAILED")
  if (onceScope && (tools[1].part.tool !== "loginom_dock_prepare" || tools[1].part.state.status !== "error"))
    throw Error("PERMISSION_ONCE_SCOPE_FAILED")
  if (
    always &&
    (terminal.always_confirmed !== true ||
      tools[1].part.tool !== "loginom_dock_prepare" ||
      tools[1].part.state.status !== "completed")
  )
    throw Error("PERMISSION_ALWAYS_FAILED")
  if (allow) {
    for (const tool of tools.filter((event) => event.part.state.status === "completed")) {
      const receipt = JSON.parse(tool.part.state.output.split("\n\n")[0])
      if (!receipt.prepared || receipt.workspace?.package_ref?.path !== savedPath)
        throw Error("PERMISSION_PREPARE_FAILED")
    }
  }
  if (previous && tools[0].part.sessionID !== previous.session) throw Error("PERMISSION_RESUME_SESSION_CHANGED")
  console.log(JSON.stringify({ status: "PASS", ...result }))
} finally {
  clearTimeout(timer)
  if (child.exitCode === null) child.kill("SIGINT")
  provider.stop()
}
