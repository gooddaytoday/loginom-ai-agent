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

// B2.7a3b: what the diagnostics archive of an OpenCode 2 profile carries. A provider key saved the OpenCode 2 way, through
// `integration.connect.key`, and a prompt that quotes it and a marker: the chat comes from the session tables of
// OpenCode 2 with the prompt, as in 0.4; the key is replaced everywhere; the CLI log keeps no command line.
// The archive is read with the system `unzip`, which a Windows runner may lack.
test.skipIf(!Bun.which("unzip"))(
  "diagnostics export carries the chat of the profile, and none of its saved keys or command lines",
  async () => {
    const root = await temporary()
    const project = path.join(root, "project")
    await fs.mkdir(project)
    const key = "fixture-saved-provider-value"
    const marker = "fixture-prompt-marker"
    const password = "cli-standalone-diagnostics"
    const llm = model("Ответ: 4.")
    try {
      const profile = CliProfile.apply({ LOGINOM_AI_AGENT_CLI_PROFILE: path.join(root, "profile") })
      await Bun.write(
        path.join(profile.config, "loginom-ai-agent.json"),
        JSON.stringify({
          model: "stub/stub-model",
          providers: {
            stub: {
              name: "Stub provider",
              package: "@opencode/ai/providers/openai-compatible",
              settings: { baseURL: llm.url },
              models: {
                "stub-model": { name: "Stub model", capabilities: { tools: true, input: ["text"], output: ["text"] } },
              },
            },
          },
        }),
      )
      const server = Bun.spawn([process.execPath, path.join(cli, "src/loginom-cli.ts"), "serve", "--port", "0"], {
        cwd: cli,
        env: environment(root, { LOGINOM_AI_AGENT_PASSWORD: password }),
        stdout: "pipe",
        stderr: "pipe",
      })
      try {
        const call = api(await listening(server), project, password)
        // A one-shot client waits for the plugins of a cold Location itself; the product plugin activates last.
        await until(async () =>
          (
            (await call("GET", `/api/plugin?location[directory]=${encodeURIComponent(project)}`)).data as {
              id?: string
            }[]
          ).some((plugin) => plugin.id === "loginom.product")
            ? true
            : undefined,
        )
        await call("POST", "/api/integration/stub/connect/key", { key, location: { directory: project } })
      } finally {
        server.kill("SIGTERM")
        await server.exited
      }
      const run = await product(root, ["run", "--format", "json", `${marker}: is ${key} the right value?`], {
        PWD: project,
      })
      expect({ code: run.code, stderr: run.stderr }).toEqual({ code: 0, stderr: "" })
      expect(llm.authorizations).toContain(`Bearer ${key}`)
      const sessionID = JSON.parse(run.stdout.trim().split("\n")[0]).sessionID

      const output = path.join(root, "diagnostics.zip")
      const exported = await product(root, ["diagnostics", "export", "--output", output])
      expect({ code: exported.code, stdout: exported.stdout }).toEqual({ code: 0, stdout: output + "\n" })
      const files = Bun.spawnSync(["unzip", "-Z1", output]).stdout.toString().trim().split("\n")
      const entry = (name: string) => Bun.spawnSync(["unzip", "-p", output, name]).stdout.toString()
      expect(JSON.parse(entry("manifest.json"))).toMatchObject({ knownSecrets: "ok", chat: "included" })
      const chat = JSON.parse(entry("chat/session.json"))
      expect(chat.info.id).toBe(sessionID)
      expect(JSON.stringify(chat)).toContain(marker)
      expect(JSON.stringify(chat)).toContain("Ответ: 4.")
      const log = files
        .filter((name) => name.startsWith("cli/"))
        .map(entry)
        .join("\n")
      expect(log).toContain('message="cli starting"')
      expect(log).not.toContain("args=")
      expect(log).not.toContain(marker)
      for (const name of files) expect(entry(name)).not.toContain(key)
      // The log on disk, which the archive masks, holds neither the saved key nor the prompt that quotes it.
      const logs = path.join(root, "profile", "data", "log")
      for (const name of await fs.readdir(logs)) {
        const text = await fs.readFile(path.join(logs, name), "utf8")
        expect({ name, key: text.includes(key), marker: text.includes(marker) }).toEqual({
          name,
          key: false,
          marker: false,
        })
      }
    } finally {
      await llm.server.stop(true)
    }
  },
  90_000,
)

// The log of the profile on disk keeps no command line, as in 0.4: OpenCode 2 wrote each one, with the values of `--answer`
// (B2.7a3b). An unknown flag fails the command while its flags are parsed, before any server, and logs the failure too.
test("the CLI log on disk keeps no command line, of a command or of its failure", async () => {
  const root = await temporary()
  const key = "fixture-cli-log-answer-value"
  const result = await product(root, ["auth", "login", "--answer", `key=${key}`, "--unknown-flag"])
  expect({ code: result.code, unrecognized: result.stderr.includes("Unrecognized flag") }).toEqual({
    code: 1,
    unrecognized: true,
  })
  const logs = path.join(root, "profile", "data", "log")
  const log = (
    await Promise.all((await fs.readdir(logs)).map((name) => fs.readFile(path.join(logs, name), "utf8")))
  ).join("\n")
  expect(log).toContain('message="cli starting"')
  expect(log).toContain('message="cli process failed"')
  expect(log).not.toContain(key)
  expect(log).not.toContain("args=")
}, 60_000)

// The product CLI is removed by the installer of its archive (B2.7a8). OpenCode's `uninstall` would remove the profile's
// cache and leave the installed copy behind (B2.7a9).
test("uninstall refuses, names the archive's uninstaller and removes nothing", async () => {
  const root = await temporary()
  expect((await product(root, ["debug", "paths"])).code).toBe(0)
  const keep = path.join(root, "profile", "cache", "keep")
  await fs.writeFile(keep, "")
  for (const args of [
    ["uninstall", "--force"],
    ["--print-logs", "uninstall", "-f"],
    ["uninstall", "--dry-run"],
  ]) {
    const result = await product(root, args)
    expect({ args, code: result.code }).toEqual({ args, code: 1 })
    expect(result.stdout).toContain("loginom-ai-agent-cli is removed by the installer of its archive.")
    expect(result.stdout).toContain(
      `then run ${process.platform === "win32" ? "uninstall.cmd" : "./uninstall.sh"} from the extracted archive`,
    )
    expect(result.stdout).not.toContain("Installation method")
    expect(await Bun.file(keep).exists()).toBe(true)
  }
}, 60_000)

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

// A chat endpoint that records each request body and credential and streams `answer`.
function model(answer: string) {
  const requests: { tools?: unknown }[] = []
  const authorizations: (string | null)[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (!new URL(request.url).pathname.endsWith("/chat/completions"))
        return new Response("not found", { status: 404 })
      requests.push(await request.json())
      authorizations.push(request.headers.get("authorization"))
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
  return { server, requests, authorizations, url: `http://127.0.0.1:${server.port}/v1` }
}

function names(tools: unknown) {
  return (tools as { function?: { name?: string } }[]).map((tool) => tool.function?.name)
}

async function listening(child: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  const decoder = new TextDecoder()
  const output = { text: "" }
  for await (const chunk of child.stdout) {
    output.text += decoder.decode(chunk)
    const url = /server listening on (http:\/\/\S+)/.exec(output.text)?.[1]
    if (url) return url
  }
  throw new Error(`server did not start: ${output.text}${await new Response(child.stderr).text()}`)
}

function api(base: string, directory: string, password: string) {
  return async (method: string, route: string, body?: unknown) => {
    const response = await fetch(new URL(route, base), {
      method,
      headers: {
        authorization: `Basic ${btoa(`loginom-ai-agent:${password}`)}`,
        "content-type": "application/json",
        "x-opencode-directory": encodeURIComponent(directory),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${text}`)
    return text ? JSON.parse(text) : undefined
  }
}

async function until<A>(read: () => Promise<A | undefined>, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (true) {
    const value = await read()
    if (value !== undefined) return value
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition")
    await Bun.sleep(50)
  }
}
