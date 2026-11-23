import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { NetworkMode } from "../src/network-mode"
import { isolatedEnv } from "./fixture/environment"
import { scriptedModel } from "./fixture/product-run"

// Loginom AI Agent (B2.8, U4): the product's defaults reach the server the CLI starts without Desktop's environment.
// Each case starts `serve` without the product's switches in the environment (no `LOGINOM_AI_AGENT_DISABLE_*`, no
// inline config) and with every proxy variable pointing to a stub that records connections, so a request off loopback
// is seen, not made. The network mode is the `network` key of the global config. «Только этот компьютер» repeats S6 of
// the spike: start, session, a turn with a scripted model that calls `todowrite`, exit. No case reaches a real model:
// OpenCode's free model is a local server listed by a catalog file in its place.
const cli = path.join(import.meta.dir, "..")
const password = "network-mode-test"
const roots: string[] = []

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe("network mode in the global config", () => {
  test("is online without a value and device for any other value or a broken file", async () => {
    const config = await temporary("cli-network-read-")
    const write = (name: string, text: string) => Bun.write(path.join(config, name), text)
    expect(await NetworkMode.read(config)).toBe("online")
    await write("loginom-ai-agent.json", JSON.stringify({ model: "stub/stub-model" }))
    expect(await NetworkMode.read(config)).toBe("online")
    await write("loginom-ai-agent.json", JSON.stringify({ network: "device" }))
    expect(await NetworkMode.read(config)).toBe("device")
    await write("loginom-ai-agent.jsonc", `{\n  // «Интернет»\n  "network": "online",\n}\n`)
    expect(await NetworkMode.read(config)).toBe("online")
    await write("loginom-ai-agent.jsonc", JSON.stringify({ network: "intranet" }))
    expect(await NetworkMode.read(config)).toBe("device")
    await write("loginom-ai-agent.json", JSON.stringify({ network: "online" }))
    await write("loginom-ai-agent.jsonc", `{ "network": "online"`)
    expect(await NetworkMode.read(config)).toBe("device")
  })
})

describe("product defaults of the server", () => {
  test("never reads .claude skills, without the variable", async () => {
    const root = await temporary("cli-network-claude-")
    const project = path.join(root, "project")
    const skill = (directory: string, name: string) =>
      Bun.write(
        path.join(directory, name, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${name} skill.\n---\n\n${name}\n`,
      )
    await skill(path.join(root, ".claude", "skills"), "home-claude")
    await skill(path.join(project, ".claude", "skills"), "project-claude")
    // `.agents` is read by the same plugin: its skill shows the roots were scanned.
    await skill(path.join(root, ".agents", "skills"), "home-agents")
    const result = await serve(root, async (call) => {
      await active(call, project)
      return (await call("GET", `/api/skill?location[directory]=${encodeURIComponent(project)}`)).data as {
        id: string
      }[]
    })
    const ids = result.value.map((item) => item.id)
    expect(ids).toContain("home-agents")
    expect(ids).not.toContain("home-claude")
    expect(ids).not.toContain("project-claude")
  }, 60_000)

  test("«Только этот компьютер» repeats S6 without a request off loopback", async () => {
    const root = await temporary("cli-network-device-")
    const project = path.join(root, "project")
    const model = scriptedModel([
      { tools: [{ name: "todowrite", input: { todos: [{ content: "check", status: "pending", priority: "low" }] } }] },
      { text: "done" },
    ])
    await Bun.write(path.join(root, "config", "loginom-ai-agent.json"), JSON.stringify({ network: "device" }))
    // A project cannot open the network the global config closed.
    await Bun.write(
      path.join(project, ".loginom-ai-agent", "loginom-ai-agent.json"),
      JSON.stringify({ network: "online", model: "stub/stub-model", providers: stub(model.url) }),
    )
    try {
      const result = await serve(root, async (call) => {
        await active(call, project)
        const models = (await call("GET", `/api/model?location[directory]=${encodeURIComponent(project)}`)).data as {
          providerID: string
        }[]
        const session = (await call("POST", "/api/session", { location: { directory: project } })).data.id as string
        await call("POST", `/api/session/${session}/prompt`, { text: "Make a todo list" })
        await call("POST", `/api/experimental/session/${session}/wait`, {})
        // The catalog refresh starts with the server; S6 idled through its next cycles.
        await Bun.sleep(2_000)
        return models.map((item) => item.providerID)
      })
      expect(result.requests).toEqual([])
      expect(result.value).toContain("stub")
      expect(result.value).not.toContain("opencode")
      // The turn ran: the tool's result came back to the model in the next request.
      expect(model.requests.length).toBeGreaterThanOrEqual(2)
      expect(JSON.stringify(model.requests.at(-1)?.messages)).toContain("todowrite")
    } finally {
      await model.server.stop(true)
    }
  }, 60_000)

  test("«Интернет» by default asks the model catalog and answers with OpenCode's free model", async () => {
    const free = await freeModel()
    try {
      const result = await freeTurn(free, {})
      expect(result.requests).toContain("CONNECT models.opencode.ai:443 HTTP/1.1")
      expect(result.value.models).toContain("big-pickle")
      // The free route signs in as `public`, not with a configured key.
      expect(free.authorizations).not.toHaveLength(0)
      expect(free.authorizations.every((value) => value === "Bearer public")).toBe(true)
      expect(result.value.messages).toContain("Free model answer")
    } finally {
      await free.server.stop(true)
    }
  }, 60_000)

  test("«Только этот компьютер» offers no free model from the same catalog", async () => {
    const free = await freeModel()
    try {
      const result = await freeTurn(free, { network: "device" })
      expect(result.requests).toEqual([])
      expect(result.value.models).not.toContain("big-pickle")
      expect(free.authorizations).toEqual([])
      expect(result.value.messages).not.toContain("Free model answer")
    } finally {
      await free.server.stop(true)
    }
  }, 60_000)
})

// A model-less turn in a project whose catalog file lists only OpenCode's free model at `free`.
async function freeTurn(free: Awaited<ReturnType<typeof freeModel>>, config: Record<string, unknown>) {
  const root = await temporary("cli-network-free-")
  const project = path.join(root, "project")
  await fs.mkdir(project)
  await Bun.write(path.join(root, "config", "loginom-ai-agent.json"), JSON.stringify(config))
  const catalog = path.join(root, "catalog.json")
  await Bun.write(catalog, JSON.stringify(free.catalog))
  return serve(
    root,
    async (call) => {
      await active(call, project)
      const models = (await call("GET", `/api/model?location[directory]=${encodeURIComponent(project)}`)).data as {
        id: string
      }[]
      const session = (await call("POST", "/api/session", { location: { directory: project } })).data.id as string
      await call("POST", `/api/session/${session}/prompt`, { text: "Say hello" })
      await call("POST", `/api/experimental/session/${session}/wait`, {})
      const messages = await call("GET", `/api/session/${session}/message`)
      return { models: models.map((item) => item.id), messages: JSON.stringify(messages) }
    },
    { LOGINOM_AI_AGENT_MODELS_PATH: catalog },
  )
}

// OpenCode's free model as a local OpenAI-compatible server, and a catalog naming it as models.dev would.
async function freeModel() {
  const authorizations: (string | null)[] = []
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      if (!new URL(request.url).pathname.endsWith("/chat/completions"))
        return new Response("not found", { status: 404 })
      authorizations.push(request.headers.get("authorization"))
      const chunk = (body: unknown) => `data: ${JSON.stringify(body)}\n\n`
      const base = { id: "free", object: "chat.completion.chunk", created: 0, model: "big-pickle" }
      return new Response(
        [
          chunk({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "Free model answer" } }] }),
          chunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
          "data: [DONE]\n\n",
        ].join(""),
        { headers: { "content-type": "text/event-stream" } },
      )
    },
  })
  const catalog = {
    opencode: {
      id: "opencode",
      name: "OpenCode",
      env: ["OPENCODE_API_KEY"],
      models: {
        "big-pickle": {
          id: "big-pickle",
          type: "chat",
          name: "Big Pickle",
          release_date: "2025-10-17",
          modalities: { input: ["text"], output: ["text"] },
          capabilities: { tools: { supported: true }, reasoning: { supported: false } },
          cost: { text: { input: { price: 0 }, output: { price: 0 } } },
          api: {
            "chat-completions": {
              base_url: `http://127.0.0.1:${server.port}/v1`,
              sdk: { opencodeai: "@opencode/ai/providers/openai-compatible" },
            },
          },
        },
      },
    },
  }
  return { server, authorizations, catalog }
}

function stub(url: string) {
  return {
    stub: {
      name: "Stub provider",
      package: "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: url },
      models: {
        "stub-model": { name: "Stub model", capabilities: { tools: true, input: ["text"], output: ["text"] } },
      },
    },
  }
}

type Call = ReturnType<typeof api>

// `serve --port 0` in an isolated home with a recording proxy stub; `run` drives it, then the server stops.
async function serve<A>(
  root: string,
  run: (call: Call) => Promise<A>,
  overrides: Record<string, string | undefined> = {},
) {
  const requests: string[] = []
  const proxy = net.createServer((socket) =>
    socket.once("data", (chunk) => {
      requests.push(chunk.toString("latin1").split("\r\n")[0]!)
      socket.destroy()
    }),
  )
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve))
  const address = `http://127.0.0.1:${(proxy.address() as net.AddressInfo).port}`
  const child = Bun.spawn([process.execPath, path.join(cli, "src/index.ts"), "serve", "--port", "0"], {
    // The CLI entry needs the preload from this package's bunfig.toml.
    cwd: cli,
    env: isolatedEnv(root, {
      LOGINOM_AI_AGENT_CONFIG_CONTENT: undefined,
      LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: undefined,
      LOGINOM_AI_AGENT_DISABLE_FREE_MODELS: undefined,
      LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE: undefined,
      LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_SKILLS: undefined,
      LOGINOM_AI_AGENT_MODELS_URL: undefined,
      LOGINOM_AI_AGENT_MODELS_PATH: undefined,
      LOGINOM_AI_AGENT_PASSWORD: password,
      OPENCODE_API_KEY: undefined,
      HTTPS_PROXY: address,
      HTTP_PROXY: address,
      ALL_PROXY: address,
      https_proxy: address,
      http_proxy: address,
      all_proxy: address,
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
      ...overrides,
    }),
    stdout: "pipe",
    stderr: "pipe",
  })
  try {
    const value = await run(api(await listening(child)))
    return { value, requests }
  } finally {
    child.kill("SIGTERM")
    await child.exited
    await new Promise((resolve) => proxy.close(resolve))
  }
}

// A cold Location lists its skills and models before the product plugin settles; it activates last.
async function active(call: Call, project: string) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const plugins = (await call("GET", `/api/plugin?location[directory]=${encodeURIComponent(project)}`)).data as {
      id?: string
      state: { status: string }
    }[]
    if (plugins.some((plugin) => plugin.id === "loginom.product" && plugin.state.status === "active")) return
    await Bun.sleep(50)
  }
  throw new Error("the product plugin did not activate")
}

async function listening(child: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  const stderr = new Response(child.stderr).text()
  const decoder = new TextDecoder()
  const output = { text: "" }
  for await (const chunk of child.stdout) {
    output.text += decoder.decode(chunk)
    const url = /server listening on (http:\/\/\S+)/.exec(output.text)?.[1]
    if (url) return url
  }
  throw new Error(`serve exited with ${await child.exited}: ${await stderr}`)
}

function api(base: string) {
  return async (method: string, route: string, body?: unknown) => {
    const response = await fetch(new URL(route, base), {
      method,
      headers: {
        authorization: `Basic ${btoa(`loginom-ai-agent:${password}`)}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${text}`)
    return text ? JSON.parse(text) : undefined
  }
}

async function temporary(prefix: string) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)))
  roots.push(root)
  return root
}
