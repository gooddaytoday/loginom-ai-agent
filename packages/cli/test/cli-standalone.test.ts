import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { CliProfile } from "../src/profile"
import { isolatedEnv } from "./fixture/environment"

// The product CLI around its profile (B2.7a3): the cases of 0.4 `test/cli/standalone{,-preflight}.test.ts`
// (`a080f7725c:packages/opencode`) that still apply to OpenCode 2. Each process runs the product CLI entry from source
// with its own HOME and XDG directories and inherits a Desktop service's settings, as a CLI started from a Desktop
// terminal does. The cases left behind, and why, are in the migration log (B2.7a3).
const cli = path.join(import.meta.dir, "..")
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

test("help and version create neither the profile nor Desktop storage", async () => {
  const root = await temporary()
  for (const args of [["--help"], ["--version"], ["-h"], ["-v"], ["run", "--help"]]) {
    const result = await product(root, args)
    expect({ args, code: result.code, stderr: result.stderr }).toEqual({ args, code: 0, stderr: "" })
    expect(result.stdout.length).toBeGreaterThan(0)
    // No profile, no channel directory of Desktop, no log anywhere.
    expect(await fs.readdir(root)).toEqual([])
  }
})

test("the profile selector alone does not move Desktop's paths", async () => {
  const root = await temporary()
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      "const { Global } = await import('@opencode/util/global'); console.log(Global.Path.data)",
    ],
    { cwd: cli, env: environment(root), stdout: "pipe", stderr: "pipe" },
  )
  expect(await child.exited).toBe(0)
  expect((await new Response(child.stdout).text()).trim()).toBe(path.join(root, "data", "loginom-ai-agent-dev"))
  expect(await fs.readdir(root)).not.toContain("profile")
})

test("a command that opens the profile uses its paths, never Desktop's", async () => {
  const root = await temporary()
  const result = await product(root, ["debug", "paths"])
  expect(result.code).toBe(0)
  const paths = Object.fromEntries(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => line.split(/\s+/)),
  )
  const profile = path.join(root, "profile")
  expect(paths).toMatchObject({
    data: path.join(profile, "data"),
    config: path.join(profile, "config"),
    tmp: path.join(profile, "cache", "tmp"),
    db: path.join(profile, "data", "loginom-ai-agent.db"),
  })
  expect(await fs.readdir(profile)).not.toContain(".writer")
})

test("diagnostics export runs while a server holds the profile, with or without --headless", async () => {
  const root = await temporary()
  const profile = path.join(root, "profile")
  // A command that opens the profile writes the CLI log, which the archive carries.
  expect((await product(root, ["debug", "paths"])).code).toBe(0)
  const latch = await CliProfile.take(profile, false)
  try {
    for (const [index, flags] of [[], ["--headless"], ["--no-headless"]].entries()) {
      const output = path.join(root, `diagnostics-${index}.zip`)
      const result = await product(root, [...flags, "diagnostics", "export", "--no-chat", "--output", output])
      expect({ flags, code: result.code, stdout: result.stdout, busy: result.stderr.includes("PROFILE_BUSY") }).toEqual(
        {
          flags,
          code: 0,
          stdout: output + "\n",
          busy: false,
        },
      )
      const archive = Buffer.from(await fs.readFile(output))
      expect(archive.includes("manifest.json")).toBe(true)
      expect(archive.includes("cli/loginom-ai-agent-local.log")).toBe(true)
      // The writer keeps its latch.
      expect(await fs.readdir(path.join(profile, ".writer"))).toEqual(["owner"])
    }
  } finally {
    await latch.release()
  }
}, 60_000)

// 0.4 ran `providers` (`auth`) and `models` in process without Loginom (`standalone-models.ts`); OpenCode 2 runs them
// through a server of the profile, here a private one.
test("auth and models work in the profile without a Loginom connection and see only its providers", async () => {
  const root = await temporary()
  const profile = CliProfile.apply({ LOGINOM_AI_AGENT_CLI_PROFILE: path.join(root, "profile") })
  await Bun.write(path.join(profile.config, "loginom-ai-agent.json"), JSON.stringify(provider("test")))
  // The providers of Desktop's config directory and of the config its service passes on stay out of the profile.
  await Bun.write(path.join(root, "config", "loginom-ai-agent.json"), JSON.stringify(provider("desktop")))
  const inherited = { LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify(provider("inherited")) }
  const auth = await product(root, ["auth", "list", "--standalone"], inherited)
  expect({ code: auth.code, stderr: auth.stderr }).toEqual({ code: 0, stderr: "" })
  const models = await product(root, ["models", "--standalone"], inherited)
  expect({ code: models.code, stderr: models.stderr }).toEqual({ code: 0, stderr: "" })
  expect(models.stdout.split("\n")).toContain("test/test-model")
  expect(models.stdout).not.toContain("desktop/")
  expect(models.stdout).not.toContain("inherited/")
  // The private server released the profile and started no Loginom runtime.
  expect(await fs.readdir(profile.root)).not.toContain(".writer")
  expect(await fs.readdir(profile.loginom)).not.toContain("runtime")
}, 60_000)

test.each([false, true])(
  "an ordinary run without a Loginom connection gets its answer and releases the profile (auto=%s)",
  async (auto) => {
    const root = await temporary()
    const project = path.join(root, "project")
    await fs.mkdir(project)
    const llm = model("Ответ: 4.")
    try {
      const profile = CliProfile.apply({ LOGINOM_AI_AGENT_CLI_PROFILE: path.join(root, "profile") })
      await Bun.write(path.join(profile.config, "loginom-ai-agent.json"), JSON.stringify(provider("test", llm.url)))
      const result = await product(
        root,
        [
          "run",
          "--format",
          "json",
          "--model",
          "test/test-model",
          ...(auto ? ["--dangerously-skip-permissions"] : []),
          "Сколько будет 2 + 2?",
        ],
        { PWD: project },
      )
      expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: "" })
      const events = result.stdout
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(events.find((event) => event.type === "text")?.part.text).toBe("Ответ: 4.")
      expect(events.filter((event) => event.type === "error")).toEqual([])
      const offered = llm.requests.filter((body) => Array.isArray(body.tools) && body.tools.length > 0)
      expect(offered.length).toBeGreaterThan(0)
      for (const body of offered) expect(names(body.tools)).toContain("skill")
      expect(await fs.readdir(profile.root)).not.toContain(".writer")
      // No Loginom runtime or knowledge service was started for an ordinary answer.
      for (const name of ["runtime", "knowledge"]) expect(await fs.readdir(profile.loginom)).not.toContain(name)
    } finally {
      await llm.server.stop(true)
    }
  },
  60_000,
)

async function temporary() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-cli-standalone-")))
  roots.push(root)
  return root
}

// A terminal of Desktop: its service's identity, port, config directory and database, and a profile for the CLI.
function environment(root: string, overrides: Record<string, string | undefined> = {}) {
  return isolatedEnv(root, {
    LOGINOM_AI_AGENT_CLI_ROOT: undefined,
    LOGINOM_AI_AGENT_CLI_PROFILE: path.join(root, "profile"),
    LOGINOM_AI_AGENT_SERVICE_IDENTITY: "desktop",
    LOGINOM_DOCK_HOME: path.join(root, "dock"),
    ...overrides,
  })
}

async function product(root: string, args: string[], overrides: Record<string, string | undefined> = {}) {
  const child = Bun.spawn([process.execPath, path.join(cli, "src/loginom-cli.ts"), ...args], {
    // The CLI entry needs the preload from this package's bunfig.toml.
    cwd: cli,
    env: environment(root, overrides),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const timer = setTimeout(() => child.kill("SIGKILL"), 50_000)
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { code, stdout, stderr }
  } finally {
    clearTimeout(timer)
  }
}

// One OpenAI-compatible provider `id` with the model `test-model`, as 0.4 `test/lib/test-provider.ts`.
function provider(id: string, url = "http://127.0.0.1:1/v1") {
  return {
    formatter: false,
    lsp: false,
    provider: {
      [id]: {
        name: id,
        npm: "@ai-sdk/openai-compatible",
        options: { apiKey: "test-key", baseURL: url },
        models: { "test-model": { name: "Test Model", tool_call: true, limit: { context: 100_000, output: 10_000 } } },
      },
    },
  }
}

// A chat endpoint that records each request body and streams `answer`.
function model(answer: string) {
  const requests: { tools?: unknown }[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (!new URL(request.url).pathname.endsWith("/chat/completions"))
        return new Response("not found", { status: 404 })
      requests.push(await request.json())
      const chunk = (body: unknown) => `data: ${JSON.stringify(body)}\n\n`
      const base = { id: "stub", object: "chat.completion.chunk", created: 0, model: "test-model" }
      return new Response(
        [
          chunk({
            ...base,
            choices: [{ index: 0, delta: { role: "assistant", content: answer }, finish_reason: null }],
          }),
          chunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
          chunk({ ...base, choices: [], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } }),
          "data: [DONE]\n\n",
        ].join(""),
        { headers: { "content-type": "text/event-stream" } },
      )
    },
  })
  return { server, requests, url: `http://127.0.0.1:${server.port}/v1` }
}

function names(tools: unknown) {
  return (tools as { function?: { name?: string } }[]).map((tool) => tool.function?.name)
}
