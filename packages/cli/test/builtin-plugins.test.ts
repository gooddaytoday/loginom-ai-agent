import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isolatedEnv } from "./fixture/environment"

// The product server the CLI starts loads built-in server plugins only (В-80, stage B2.1): a plugin package from config
// is listed as failed and never imported, while the product plugin and OpenCode's own provider plugins are active.
// Providers still connect the OpenCode 2 way (В-82): an API key saved through the API reaches the provider.
const cli = path.join(import.meta.dir, "..")
const password = "builtin-plugins-test"
const key = "sk-loginom-builtin-plugins"

test("the product server rejects config plugin packages and connects a provider with an API key", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loginom-builtin-plugins-"))
  const project = path.join(root, "project")
  const external = path.join(root, "third-party")
  const marker = path.join(root, "third-party.log")
  const authorizations: (string | null)[] = []
  const provider = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (request) => complete(request, authorizations) })
  await Bun.write(
    path.join(external, "index.ts"),
    `import { appendFileSync } from "node:fs"
appendFileSync(${JSON.stringify(marker)}, "imported\\n")
export default { id: "third-party.plugin", async setup() { appendFileSync(${JSON.stringify(marker)}, "setup\\n") } }
`,
  )
  await Bun.write(
    path.join(project, ".loginom-ai-agent", "loginom-ai-agent.json"),
    JSON.stringify({
      model: "stub/stub-model",
      providers: {
        stub: {
          name: "Stub provider",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: `http://127.0.0.1:${provider.port}/v1` },
          models: {
            "stub-model": { name: "Stub model", capabilities: { tools: true, input: ["text"], output: ["text"] } },
          },
        },
      },
      plugins: [external, "third-party-npm-plugin"],
    }),
  )
  const child = Bun.spawn([process.execPath, path.join(cli, "src/index.ts"), "serve", "--port", "0"], {
    // The CLI entry needs the preload from this package's bunfig.toml.
    cwd: cli,
    env: isolatedEnv(root, { LOGINOM_AI_AGENT_CONFIG_CONTENT: undefined, LOGINOM_AI_AGENT_PASSWORD: password }),
    stdout: "pipe",
    stderr: "pipe",
  })
  try {
    const call = api(await listening(child), project)
    // A one-shot client waits for a cold Location's plugins itself. One generation lists every plugin and failure, and
    // the product plugin activates last.
    const plugins = await until(async () => {
      const listed = (await call("GET", `/api/plugin?location[directory]=${encodeURIComponent(project)}`)).data as {
        id?: string
        source: Record<string, string>
        state: { status: string; error?: string }
      }[]
      return listed.some((plugin) => plugin.id === "loginom.product") ? listed : undefined
    })
    const rejected = { status: "failed", error: "Plugin packages are disabled: only built-in plugins load" }
    expect(plugins.find((plugin) => plugin.source.type === "local")).toMatchObject({
      source: { type: "local", path: external },
      state: rejected,
    })
    expect(plugins.find((plugin) => plugin.source.type === "package")).toMatchObject({
      source: { type: "package", target: "third-party-npm-plugin" },
      state: rejected,
    })
    expect(await Bun.file(marker).exists()).toBe(false)
    const active = plugins.filter((plugin) => plugin.state.status === "active").map((plugin) => plugin.id)
    expect(active).toContain("loginom.product")
    expect(active).toEqual(expect.arrayContaining(["opencode.provider.openai", "opencode.models.dev"]))

    await call("POST", `/api/integration/stub/connect/key`, { key, location: { directory: project } })
    const session = (await call("POST", "/api/session", { location: { directory: project } })).data.id as string
    await call("POST", `/api/session/${session}/prompt`, { text: "Say hello" })
    await call("POST", `/api/experimental/session/${session}/wait`, {})
    expect(authorizations.length).toBeGreaterThan(0)
    expect(authorizations.every((authorization) => authorization === `Bearer ${key}`)).toBe(true)
  } finally {
    child.kill("SIGTERM")
    await child.exited
    await provider.stop(true)
    await fs.rm(root, { recursive: true, force: true })
  }
}, 60_000)

async function until<A>(read: () => Promise<A | undefined>, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (true) {
    const value = await read()
    if (value !== undefined) return value
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition")
    await Bun.sleep(50)
  }
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

function api(base: string, directory: string) {
  return async (method: string, route: string, body?: unknown) => {
    const response = await fetch(new URL(route, base), {
      method,
      headers: {
        authorization: `Basic ${btoa(`opencode:${password}`)}`,
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

// An OpenAI-compatible chat endpoint that records the credential each request carries and streams a short answer.
function complete(request: Request, authorizations: (string | null)[]) {
  if (!new URL(request.url).pathname.endsWith("/chat/completions")) return new Response("not found", { status: 404 })
  authorizations.push(request.headers.get("authorization"))
  const chunk = (body: unknown) => `data: ${JSON.stringify(body)}\n\n`
  const base = { id: "stub", object: "chat.completion.chunk", created: 0, model: "stub-model" }
  return new Response(
    [
      chunk({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "Hello" }, finish_reason: null }] }),
      chunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
      chunk({ ...base, choices: [], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } }),
      "data: [DONE]\n\n",
    ].join(""),
    { headers: { "content-type": "text/event-stream" } },
  )
}
