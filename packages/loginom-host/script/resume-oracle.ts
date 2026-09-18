import { Database } from "bun:sqlite"
import { randomUUID } from "node:crypto"
import { mkdtemp, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliOracleTransport } from "./cli-oracle-transport"

const original = process.argv[2]
const inverse = process.argv[3] === "--inverse"
if (process.argv[3] && !inverse) throw Error("RESUME_ORACLE_ARGUMENT_INVALID")
const executable = process.env.LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE
const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
if (!original || !executable || !configPath)
  throw Error("Provide original oracle root, TEST_CLI_EXECUTABLE and TEST_CONFIG")
const names = (await readdir(join(original, "cli"))).filter((name) => name.endsWith("-A"))
if (names.length !== 1) throw Error("RESUME_ORACLE_PROFILE_AMBIGUOUS")
const workspace = join(original, "cli", names[0])
const profile = join(workspace, "profile")
const saved = (await Bun.file(join(original, "saved-A.json")).json()) as { path: string }
const config = await Bun.file(configPath).json()
if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
const evidence = await mkdtemp(join(tmpdir(), "loginom-live-resume-"))
console.log(`Private resume evidence: ${evidence}`)
const db = new Database(join(profile, "data/loginom-ai-agent.db"), { readonly: true })
try {
  const sessions = db.query("select id from session").all() as { id: string }[]
  if (sessions.length !== 1) throw Error("RESUME_ORACLE_SESSION_AMBIGUOUS")
  const session = sessions[0].id
  for (const run of [
    { mode: "tui" as const, headed: !inverse, latest: false },
    { mode: "run" as const, headed: inverse, latest: true },
  ]) {
    const before = db.query("select id from part").all() as { id: string }[]
    const users = db.query("select id from message where json_extract(data, '$.role') = 'user'").all().length
    const child = await cliOracleTransport({
      executable,
      mode: run.mode,
      headed: run.headed,
      directory: join(evidence, run.mode),
      resume: {
        profile,
        workspace,
        session,
        latest: run.latest,
        prompt: "Reopen the previously saved package for inspection, then observe its roots. Do not change or save it.",
      },
      connection: {
        apiKey: config.api_key,
        password: "",
        url: config.loginom_url,
        username: config.workflow_profile.loginom_user,
      },
    })
    try {
      const prepared = (await child.request("call", {
        name: "dock_prepare",
        arguments: { intent: "open_package", package_path: saved.path, operation_id: `resume-${randomUUID()}` },
      })) as { result: { content: { text: string }[] } }
      const body = JSON.parse(prepared.result.content[0].text)
      if (!body.prepared || !body.workspace.authenticated || body.workspace.package_ref?.path !== saved.path)
        throw Error("RESUME_PREPARATION_FAILED")
      const observed = (await child.request("call", {
        name: "dock_workspace_observe",
        arguments: { scope: "roots" },
      })) as { result: { content: { text: string }[] } }
      const roots = JSON.parse(observed.result.content[0].text)
      if (
        roots.status !== "SUCCEEDED" ||
        !roots.output.authenticated ||
        roots.output.workflow_ref?.tab_tid !== body.workspace.workflow_ref.tab_tid
      )
        throw Error("RESUME_PACKAGE_MISMATCH")
      const output = JSON.stringify({ prepared: body, observed: roots })
      if (output.includes(config.api_key)) throw Error("SECRET_IN_RESUME_RESULT")
      await Bun.write(join(evidence, run.mode, "receipts.json"), output)
    } finally {
      await child.close()
    }
    const after = db.query("select id from session").all() as { id: string }[]
    if (after.length !== 1 || after[0].id !== session) throw Error("RESUME_SESSION_CHANGED")
    if (db.query("select id from message where json_extract(data, '$.role') = 'user'").all().length !== users + 1)
      throw Error("RESUME_USER_INPUT_MISSING")
    const ids = new Set(before.map((row) => row.id))
    const parts = (db.query("select id, data from part").all() as { id: string; data: string }[])
      .filter((row) => !ids.has(row.id))
      .map((row) => JSON.parse(row.data) as { type: string; tool?: string; state?: { status: string } })
      .filter((part) => part.type === "tool")
    if (
      parts.length !== 2 ||
      parts.some((part) => part.state?.status !== "completed") ||
      parts
        .map((part) => part.tool)
        .sort()
        .join(",") !== "loginom_dock_prepare,loginom_dock_workspace_observe"
    )
      throw Error("RESUME_FRESH_TOOLS_MISSING")
    console.log(JSON.stringify({ status: "PASS", ...run, session, freshTools: parts.length }))
  }
  await Bun.write(join(evidence, "summary.json"), JSON.stringify({ status: "PASS", session, original, executable }))
} finally {
  db.close()
}
