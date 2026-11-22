// Creates a Loginom AI Agent 0.3.9 / 0.4.x profile database for the `migrate` tests by running that release's own CLI
// (backend v1) against a scripted OpenAI-compatible model, as spike S4 did.
//   bun generate.ts <fork checkout> <output .sql>
// The checkout is `git worktree add --detach <dir> a080f7725c` (0.4.x) or `v0.3.9`, after `bun install --frozen-lockfile`.
// The profile lives under a fixed neutral root so the database holds no machine-specific paths.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { legacyDirectories, recorded } from "./restore"

const [checkout, output] = process.argv.slice(2)
if (!checkout || !output) throw new Error("usage: bun generate.ts <fork checkout> <output .sql>")
const root = recorded
rmSync(root, { recursive: true, force: true })
const { project, repo } = legacyDirectories(root)
writeFileSync(path.join(project, "notes.txt"), "Fixture attachment: three rows of sample data.\n")

type Step = { tool: string; input: unknown } | { text: string }
const script = (steps: Step[], note: string) =>
  `${note}\nFIXTURE-SCRIPT:${Buffer.from(JSON.stringify(steps)).toString("base64")}`
const text = (content: unknown) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => (part as { text?: string }).text ?? "").join("")
      : ""
const chunk = (delta: unknown, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`

let calls = 0
const model = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname.endsWith("/models"))
      return Response.json({ object: "list", data: [{ id: "fixture-model", object: "model" }] })
    const body = (await request.json()) as { messages: { role: string; content?: unknown }[]; tools?: unknown[] }
    const index = body.messages.findLastIndex((m) => m.role === "user" && text(m.content).includes("FIXTURE-SCRIPT:"))
    const steps: Step[] =
      index < 0
        ? []
        : JSON.parse(
            Buffer.from(
              /FIXTURE-SCRIPT:([A-Za-z0-9+/=]+)/.exec(text(body.messages[index].content))![1],
              "base64",
            ).toString(),
          )
    const done = body.messages.slice(index + 1).filter((m) => m.role === "assistant").length
    const step: Step = !body.tools?.length ? { text: "Fixture title" } : (steps[done] ?? { text: "done" })
    calls++
    return new Response(
      [
        "tool" in step
          ? chunk({
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: `call_${calls}`,
                  type: "function",
                  function: { name: step.tool, arguments: JSON.stringify(step.input) },
                },
              ],
            }) + chunk({}, "tool_calls")
          : chunk({ role: "assistant", content: step.text }) + chunk({}, "stop"),
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 0, model: "fixture", choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`,
        "data: [DONE]\n\n",
      ].join(""),
      { headers: { "content-type": "text/event-stream" } },
    )
  },
})

const env = {
  PATH: process.env.PATH,
  HOME: path.join(root, "home"),
  XDG_DATA_HOME: path.join(root, "data"),
  XDG_CONFIG_HOME: path.join(root, "config"),
  XDG_STATE_HOME: path.join(root, "state"),
  XDG_CACHE_HOME: path.join(root, "cache"),
  TMPDIR: path.join(root, "tmp"),
  PWD: project,
  LOGINOM_AI_AGENT_CHANNEL: "prod",
  LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: "1",
  LOGINOM_AI_AGENT_DISABLE_AUTOUPDATE: "1",
  LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify({
    model: "fixture/fixture-model",
    provider: {
      fixture: {
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL: `http://127.0.0.1:${model.port}/v1`, apiKey: "fixture" },
        models: { "fixture-model": { name: "Fixture", tool_call: true } },
      },
    },
  }),
}
mkdirSync(env.TMPDIR, { recursive: true })

// The model answers from this process, so the CLI runs asynchronously.
const run = async (args: string[], directory = project) => {
  const child = Bun.spawn(["bun", "run", "src/index.ts", "run", "--format", "json", "--dir", directory, ...args], {
    cwd: path.join(checkout, "packages", "opencode"),
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`fork CLI exited ${code}\n${stdout.slice(-2000)}\n${stderr.slice(-2000)}`)
  return stdout
}

try {
  await run([script([{ text: "Hello! The answer is 42." }], "First session: what is the answer?")])
  await run([script([{ text: "Continued: still 42." }], "Second turn in the first session.")].concat(["--continue"]))
  await run([
    "--file",
    path.join(project, "notes.txt"),
    "--",
    script(
      [
        { tool: "read", input: { filePath: path.join(project, "notes.txt") } },
        { text: "The attachment has three rows." },
      ],
      "Second session: summarize the attached notes.",
    ),
  ])
  // A client attached to a running backend sends the file itself (a data: URL), as Desktop does.
  const port = 47000 + Math.floor(Math.random() * 1000)
  const server = Bun.spawn(["bun", "run", "src/index.ts", "serve", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: path.join(checkout, "packages", "opencode"),
    env: { ...env, LOGINOM_AI_AGENT_SERVER_PASSWORD: "fixture" },
    stdout: "pipe",
    stderr: "pipe",
  })
  try {
    for (let i = 0; i < 100; i++) {
      if (
        await fetch(`http://127.0.0.1:${port}/`).then(
          () => true,
          () => false,
        )
      )
        break
      await Bun.sleep(200)
    }
    await run([
      "--attach",
      `http://127.0.0.1:${port}`,
      "--password",
      "fixture",
      "--file",
      path.join(project, "notes.txt"),
      "--",
      script([{ text: "The attached notes have one line." }], "Third session: what is in the attached file?"),
    ])
  } finally {
    server.kill()
    await server.exited
  }
  // In a git repository 0.4 keeps the session under the project of its root commit, not under global.
  await run([script([{ text: "Answer from the repository." }], "Fourth session: in a git repository.")], repo)
} finally {
  model.stop(true)
}

// The fixture is a SQL dump, so review and the secret scanner see every row. Tests restore it with bun:sqlite.
const source = path.join(root, "data", "loginom-ai-agent", "loginom-ai-agent.db")
if (!existsSync(source)) throw new Error(`no profile database at ${source}`)
const { Database } = await import("bun:sqlite")
const db = new Database(source, { readonly: true })
const objects = db
  .query<
    { type: string; name: string; sql: string },
    []
  >("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type = 'table' DESC, rowid")
  .all()
const rows = objects
  .filter((item) => item.type === "table")
  .flatMap((table) => {
    const columns = db.query<{ name: string }, [string]>("SELECT name FROM pragma_table_info(?)").all(table.name)
    const values = columns.map((column) => `quote("${column.name}")`).join(" || ',' || ")
    return db
      .query<{ line: string }, []>(
        `SELECT 'INSERT INTO "${table.name}" VALUES(' || ${values} || ');' AS line FROM "${table.name}" ORDER BY rowid`,
      )
      .all()
      .map((row) => row.line)
  })
db.close()
mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(
  output,
  [
    "PRAGMA foreign_keys=OFF;",
    "BEGIN;",
    ...objects.filter((item) => item.type === "table").map((item) => `${item.sql};`),
    ...rows,
    ...objects.filter((item) => item.type !== "table").map((item) => `${item.sql};`),
    "COMMIT;",
    "",
  ].join("\n"),
)
console.log(`wrote ${output}`)
