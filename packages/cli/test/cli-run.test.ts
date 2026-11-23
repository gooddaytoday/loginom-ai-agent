import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { isolatedEnv } from "./fixture/environment"
import { cli, finished, product, productRoot, receipt, scriptedModel, spawnProduct } from "./fixture/product-run"

// Loginom AI Agent (B2.7a4): `run --headless --format json` of the product CLI on OpenCode 2, from source, with a model
// that follows a script. The cases of 0.4 `test/cli/standalone{,-preflight,-file-errors}.test.ts`
// (`a080f7725c:packages/opencode`) that belong to `run`, the exit codes of design §10 and the event stream that `evals`
// and `scripts/node-acceptance/run-check.py` read. The streams the consumers are checked against are recorded here:
// `UPDATE_EVENT_FIXTURES=1` writes them to `evals/fixtures/events/cli-run/`; otherwise each run must keep their shape.
const fixtures = path.join(cli, "..", "..", "evals", "fixtures", "events", "cli-run")
const roots: string[] = []
const servers: { stop: (force: boolean) => unknown }[] = []
afterEach(async () => {
  servers.splice(0).forEach((server) => server.stop(true))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

test("the arguments of run-check.py: one session, busy to idle, the project of --dir and the attached file", async () => {
  const llm = model([
    { tools: [{ name: "read", input: { path: "note.txt" } }] },
    { tools: [{ name: "webfetch", input: { url: "{server}/receipt", format: "text" } }] },
    { text: "Ответ: 4." },
  ])
  const { project } = await root(llm.url)
  await Bun.write(path.join(project, "note.txt"), "note in the project")
  await Bun.write(path.join(project, "data.csv"), "a,b\n1,2\n")
  // As `run-check.py` builds it; the parent's PWD names another directory.
  const result = await product(roots.at(-1)!, [
    "run",
    "--headless",
    "--format",
    "json",
    "--dir",
    project,
    "--model",
    "test/test-model",
    "--variant",
    "medium",
    "--dangerously-skip-permissions",
    "--file",
    path.join(project, "data.csv"),
    "--",
    "Сколько будет 2 + 2?",
  ])
  expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: "" })
  expect(result.events.length).toBe(result.stdout.trim().split("\n").length)
  expect(new Set(result.events.map((event) => event.sessionID)).size).toBe(1)
  const statuses = result.events.filter((event) => event.type === "session.status").map((event) => event.status.type)
  expect([statuses[0], statuses.at(-1)]).toEqual(["busy", "idle"])
  const tools = result.events.filter((event) => event.type === "tool_use").map((event) => event.part)
  expect(tools.map((part) => [part.tool, part.state.status])).toEqual([
    ["read", "completed"],
    ["webfetch", "completed"],
  ])
  expect(tools[0].state.output).toContain("note in the project")
  expect(JSON.parse(tools[1].state.output)).toEqual(receipt)
  expect(result.events.filter((event) => event.type === "text").at(-1)?.part.text).toBe("Ответ: 4.")
  // The product attaches the file, so a Dock run admits it, instead of inlining it into the prompt.
  expect(JSON.stringify(llm.requests[0]?.messages)).toContain("Attached file: data.csv")
  expect(JSON.stringify(llm.requests[0]?.messages)).not.toContain('<file name=\\"data.csv\\">')
  await keepsShape("success", result)
}, 60_000)

test("the arguments of evals: a tool failure the run does not correct ends with CLI_TOOL_FAILED and exit code 1", async () => {
  const llm = model([{ tools: [{ name: "read", input: { path: "missing.txt" } }] }, { text: "Файла нет." }])
  const { project } = await root(llm.url)
  await Bun.write(path.join(project, "input.csv"), "a\n1\n")
  // As `evals/src/cli.ts` (`runAgent`) builds it.
  const result = await product(roots.at(-1)!, [
    "run",
    "--headless",
    "--format",
    "json",
    "--model",
    "test/test-model",
    "--variant",
    "default",
    "--title",
    "eval-fixture",
    "--file",
    path.join(project, "input.csv"),
    "--dir",
    project,
    "--",
    "Прочитай missing.txt",
  ])
  expect(result.code).toBe(1)
  expect(result.events.at(-1)).toMatchObject({
    type: "error",
    error: { type: "CLI_TOOL_FAILED", name: "CLI_TOOL_FAILED", data: { message: "CLI_TOOL_FAILED" } },
  })
  expect(result.events.at(-2)).toMatchObject({ type: "session.status", status: { type: "idle" } })
  await keepsShape("tool-failed", result)
}, 60_000)

test("without --dangerously-skip-permissions a permission request is declined: exit code 1, CLI_PERMISSION_REJECTED", async () => {
  const llm = model([{ tools: [{ name: "write", input: { path: "a.txt", content: "x" } }] }, { text: "Не записал." }])
  const { project } = await root(llm.url)
  const result = await product(roots.at(-1)!, run(project))
  expect(result.code).toBe(1)
  expect(result.events.filter((event) => event.type === "error").map((event) => event.error.name)).toEqual([
    "CLI_PERMISSION_REJECTED",
  ])
  expect(await fs.exists(path.join(project, "a.txt"))).toBe(false)
  await keepsShape("permission-rejected", result)
}, 60_000)

// B2.7 plan: the flag answers the questions of B2.6, nothing else. A configuration policy stands in for the
// administrator's deny (B2.6c); the terminal is off by the product's default (B2.6a). What is checked is only whether
// each call ran, not its error or what the turn does next (B2.6b changes that).
test("--dangerously-skip-permissions answers questions but lifts neither a deny nor codemode: false", async () => {
  const llm = model([
    {
      tools: [
        { name: "write", input: { path: "allowed.txt", content: "x" } },
        { name: "write", input: { path: "blocked.txt", content: "x" } },
      ],
    },
    // `write` is a direct tool (`codemode: false`), so CodeMode cannot reach it.
    {
      tools: [{ name: "execute", input: { code: "return await tools.write({ path: 'codemode.txt', content: 'x' })" } }],
    },
    { tools: [{ name: "shell", input: { command: "touch shell.txt" } }] },
    { text: "Готово." },
  ])
  const { project } = await root(llm.url, {
    policies: [{ action: "tool.use", resource: "edit:*blocked*", effect: "deny" }],
  })
  const result = await product(roots.at(-1)!, run(project, "--dangerously-skip-permissions"))
  expect(result.events.filter((event) => event.type === "tool_use").map((event) => event.part.tool)).toEqual([
    "write",
    "write",
    "execute",
    "shell",
  ])
  expect(await fs.readdir(project)).toEqual(["allowed.txt"])
  expect(result.code).not.toBe(0)
}, 60_000)

test("a provider failure ends the run with 0.4's provider error and exit code 1", async () => {
  const llm = model([
    { status: 401, body: JSON.stringify({ error: { message: "bad key", type: "invalid_request_error" } }) },
  ])
  const { project } = await root(llm.url)
  const result = await product(roots.at(-1)!, run(project))
  expect(result.code).toBe(1)
  expect(result.events.at(-1)).toMatchObject({
    type: "error",
    error: { type: "provider.auth", name: "ProviderAuthError", data: { message: "bad key", statusCode: 401 } },
  })
  await keepsShape("provider-auth", result)
}, 60_000)

// A signal sent to a process on Windows ends it at once, so the cancellation path exists only on POSIX.
const signals = process.platform !== "win32"

// 0.4 `standalone` «Ctrl+C during provider metadata fetch drains cleanup and releases the writer», for `run`.
test.if(signals)(
  "Ctrl+C while the model answers cancels the run: exit code 130, CLI_CANCELLED, the profile is released",
  async () => {
    const llm = model([{ hang: true }])
    const { project, profile } = await root(llm.url)
    const child = spawnProduct(roots.at(-1)!, run(project))
    const output = finished(child)
    await Promise.race([
      llm.requested,
      child.exited.then(() => {
        throw new Error("run exited before the model was asked")
      }),
    ])
    child.kill("SIGINT")
    const result = await output
    expect(result.code).toBe(130)
    expect(result.events.map((event) => event.type).at(-1)).toBe("error")
    expect(result.events.at(-1).error).toMatchObject({ type: "CLI_CANCELLED", name: "CLI_CANCELLED" })
    expect(result.events.filter((event) => event.type === "session.status").map((event) => event.status.type)).toEqual([
      "busy",
      "idle",
    ])
    expect(await fs.readdir(profile.root)).not.toContain(".writer")
    // When the step starts before the interruption depends on timing; the statuses and errors do not.
    await keepsShape("cancelled", result, ["session.status", "error"])
    // The private server is gone with its latch: the next run on the profile is not refused.
    const next = await product(roots.at(-1)!, run(project))
    expect({ code: next.code, busy: next.stdout.includes("PROFILE_BUSY") }).toEqual({ code: 0, busy: false })
  },
  90_000,
)

// 0.4 `standalone` «bootstrap carries an early signal into stdin admission…»: without a message, `run` reads its prompt
// from stdin, and a pipe that never closes must not hold the run or its private server after Ctrl+C.
test.if(signals)(
  "Ctrl+C while run waits for its prompt on stdin exits with 130 and releases the profile",
  async () => {
    const llm = model([])
    const { project, profile } = await root(llm.url)
    const child = Bun.spawn([process.execPath, path.join(cli, "src/loginom-cli.ts"), ...run(project).slice(0, -2)], {
      cwd: cli,
      env: isolatedEnv(roots.at(-1)!, {
        LOGINOM_AI_AGENT_CLI_ROOT: undefined,
        LOGINOM_AI_AGENT_CLI_PROFILE: profile.root,
      }),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
    // The private server holds the latch, then reports ready, and the run turns to stdin; nothing it prints marks that turn.
    await until(
      () => fs.exists(path.join(profile.root, ".writer", "owner")),
      () => child.exitCode !== null,
    )
    await Bun.sleep(2_000)
    child.kill("SIGINT")
    // A run stuck on stdin runs into the 10 s shutdown deadline instead and exits with 1, its private server still up.
    expect(await child.exited).toBe(130)
    await output
    expect(await fs.readdir(profile.root)).not.toContain(".writer")
    expect(llm.requests).toEqual([])
  },
  60_000,
)

// 0.4 `standalone-file-errors`: a file `run` cannot attach is refused before the model. OpenCode 2 refuses it with its
// own text, not 0.4's `LOGINOM_FILE_*` codes; root reads a file without permissions, so `denied` needs another user.
test.each(["missing", "directory", ...(process.getuid?.() === 0 ? [] : ["denied"])])(
  "run --file refuses a file it cannot attach before the model: %s",
  async (mode) => {
    const llm = model([{ text: "Не должен отвечать." }])
    const { project, profile } = await root(llm.url)
    const file = path.join(project, "input.csv")
    if (mode === "directory") await fs.mkdir(file)
    if (mode === "denied") {
      await Bun.write(file, "private")
      await fs.chmod(file, 0)
    }
    const result = await product(roots.at(-1)!, run(project, "--file", file))
    expect(result.code).toBe(1)
    expect(result.events.map((event) => event.type)).toEqual(["error"])
    expect(result.stderr).toContain("input.csv")
    expect(llm.requests).toEqual([])
    expect(await fs.readdir(profile.root)).not.toContain(".writer")
  },
  60_000,
)

test("--headless and --no-headless together are invalid arguments: exit code 2 before the profile opens", async () => {
  const llm = model([])
  const { project, profile } = await root(llm.url)
  const result = await product(roots.at(-1)!, run(project, "--headless", "--no-headless"))
  expect(result.code).toBe(2)
  expect(result.stdout).toBe("")
  expect(result.stderr).toStartWith("CLI_ARGUMENT_INVALID")
  expect(await fs.readdir(profile.root)).not.toContain(".writer")
})

async function until(ready: () => Promise<boolean>, failed: () => boolean, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (!(await ready())) {
    if (failed() || Date.now() >= deadline) throw new Error("Timed out waiting for condition")
    await Bun.sleep(50)
  }
}

function model(steps: Parameters<typeof scriptedModel>[0]) {
  const llm = scriptedModel(steps)
  servers.push(llm.server)
  return llm
}

async function root(url: string, config?: Record<string, unknown>) {
  const created = await productRoot(url, config)
  roots.push(created.root)
  return created
}

function run(project: string, ...flags: string[]) {
  return [
    "run",
    "--format",
    "json",
    "--title",
    "fixture",
    "--model",
    "test/test-model",
    "--dir",
    project,
    ...flags,
    "--",
    "hi",
  ]
}

// The recorded stream of `name` keeps its events (of `types`, if given) in order, with the same fields and the same
// types, statuses and names, and the same exit code.
async function keepsShape(name: string, result: Awaited<ReturnType<typeof product>>, types?: string[]) {
  const file = path.join(fixtures, `${name}.jsonl`)
  if (process.env.UPDATE_EVENT_FIXTURES) {
    await fs.mkdir(fixtures, { recursive: true })
    await Bun.write(file, result.stdout)
    await Bun.write(path.join(fixtures, `${name}.exit`), `${result.code}\n`)
    return
  }
  const recorded = (await Bun.file(file).text())
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
  const kept = (events: { type: string }[]) =>
    events.filter((event) => !types || types.includes(event.type)).map((event) => shape(event))
  expect(Number((await Bun.file(path.join(fixtures, `${name}.exit`)).text()).trim())).toBe(result.code)
  expect(kept(result.events)).toEqual(kept(recorded))
}

function shape(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return [...new Set(value.map((item) => JSON.stringify(shape(item))))].sort()
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, item]) => [name, shape(item, name)]),
    )
  return ["type", "status", "tool", "name", "reason"].includes(key) ? value : typeof value
}
