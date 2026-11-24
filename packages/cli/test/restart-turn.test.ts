import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ServiceConfig } from "../src/services/service-config"
import { isolatedEnv } from "./fixture/environment"

// Loginom AI Agent (B2.3c, В-100): a turn cut off by a crash of the background service or by its soft stop is not
// continued when the service starts again, as in 0.4; the user continues it. The real `serve --service` of the product
// (`server-process.ts`) with a stub OpenAI-compatible model whose first turn request never finishes, so the turn is in
// flight when the service ends. Turn requests carry tools; the title request does not.

type Message = { type: string; text?: string; outcome?: string; metadata?: Record<string, unknown> }

test.each([
  { end: "crash", continued: "prompt" },
  { end: "soft stop", continued: "synthetic" },
] as const)(
  "after a $end the service leaves the turn interrupted until a $continued continues it",
  async (input) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "loginom-restart-turn-"))
    const llm = model()
    const env = isolatedEnv(root, { LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify(provider(llm.url)) })
    const services: Bun.Subprocess[] = []
    try {
      const first = await start(root, env, services)
      const session = await first.call<{ id: string }>("POST", "/api/session", {
        location: { directory: root },
        model: { id: "test-model", providerID: "test" },
      })
      await first.call("POST", `/api/session/${session.id}/prompt`, { text: "Посчитай итоги" })
      await until(() => llm.turns.length === 1)

      if (input.end === "crash") first.owner.kill("SIGKILL")
      if (input.end === "soft stop") expect(await first.request("POST", "/api/experimental/service/stop")).toBe(202)
      // A killed process exits 137 on POSIX and 1 on Windows; the soft stop exits 0 everywhere (B2.3b).
      const exited = await first.owner.exited
      if (input.end === "soft stop") expect(exited).toBe(0)

      const second = await start(root, env, services)
      const outcome = async () => (await second.call<{ outcome?: string }>("GET", `/api/session/${session.id}`)).outcome
      // The start-up sweep runs beside the first requests; the interrupted marker is its answer.
      await until(async () => (await outcome()) !== undefined)
      expect(await outcome()).toBe("interrupted")
      expect(llm.turns.length).toBe(1)
      const left = await second.call<Message[]>("GET", `/api/session/${session.id}/context`)
      expect(left.filter((message) => message.metadata?.notice === "restart")).toEqual([])
      expect(left.at(-1)).toMatchObject({ type: "idle", outcome: "interrupted" })

      if (input.continued === "prompt")
        await second.call("POST", `/api/session/${session.id}/prompt`, { text: "Продолжи" })
      if (input.continued === "synthetic")
        await second.call("POST", `/api/session/${session.id}/synthetic`, { text: "Продолжи" })
      await until(async () => (await outcome()) === "succeeded")
      expect(llm.turns.length).toBe(2)
      expect(JSON.stringify(llm.turns[1])).toContain("Продолжи")
      const continued = await second.call<Message[]>("GET", `/api/session/${session.id}/context`)
      expect(JSON.stringify(continued)).toContain("Готово.")
      expect(await second.request("POST", "/api/experimental/service/stop")).toBe(202)
      expect(await second.owner.exited).toBe(0)
    } finally {
      for (const owner of services) owner.kill("SIGKILL")
      await Promise.all(services.map((owner) => owner.exited))
      await llm.server.stop(true)
      await fs.rm(root, { recursive: true, force: true })
    }
  },
  // Two cold starts of the service and three model turns, about 10 s locally.
  60_000,
)

async function start(root: string, env: Record<string, string | undefined>, services: Bun.Subprocess[]) {
  const owner = Bun.spawn(
    [process.execPath, path.join(import.meta.dir, "../src/index.ts"), "serve", "--service", "--port", "0"],
    { env, stderr: "pipe", stdout: "ignore" },
  )
  services.push(owner)
  const registration = path.join(root, "state", "loginom-ai-agent-dev", ServiceConfig.filename())
  const info = await until(async () => {
    const value: { url: string; pid: number; password: string } | undefined = await Bun.file(registration)
      .json()
      .catch(() => undefined)
    return value?.pid === owner.pid ? value : undefined
  })
  const headers = { authorization: "Basic " + btoa(`loginom-ai-agent:${info.password}`) }
  const request = (method: string, pathname: string, body?: unknown) =>
    fetch(new URL(pathname, info.url), {
      method,
      headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((response) => response.status)
  const call = async <A>(method: string, pathname: string, body?: unknown) => {
    const response = await fetch(new URL(pathname, info.url), {
      method,
      headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${pathname}: ${response.status} ${text}`)
    return (JSON.parse(text) as { data: A }).data
  }
  // The registration is written once the port is bound; requests are answered once the service is ready.
  await until(async () => (await request("GET", "/api/info")) === 200)
  return { owner, request, call }
}

// One OpenAI-compatible provider `test` with the model `test-model`, as in `cli-standalone.test.ts`.
function provider(url: string) {
  return {
    formatter: false,
    lsp: false,
    provider: {
      test: {
        name: "test",
        npm: "@ai-sdk/openai-compatible",
        options: { apiKey: "test-key", baseURL: url },
        models: { "test-model": { name: "Test Model", tool_call: true, limit: { context: 100_000, output: 10_000 } } },
      },
    },
  }
}

// A chat endpoint: the first turn request streams its first chunk and never ends; every other request answers.
function model() {
  const turns: unknown[] = []
  const chunk = (body: unknown) =>
    `data: ${JSON.stringify({ id: "stub", object: "chat.completion.chunk", created: 0, model: "test-model", ...(body as object) })}\n\n`
  const answer = (text: string) =>
    new Response(
      [
        chunk({ choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] }),
        chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
        chunk({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } }),
        "data: [DONE]\n\n",
      ].join(""),
      { headers: { "content-type": "text/event-stream" } },
    )
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(request) {
      if (!new URL(request.url).pathname.endsWith("/chat/completions"))
        return new Response("not found", { status: 404 })
      const body: { tools?: unknown[] } = await request.json()
      if (!Array.isArray(body.tools) || body.tools.length === 0) return answer("Итоги")
      turns.push(body)
      if (turns.length > 1) return answer("Готово.")
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              chunk({ choices: [{ index: 0, delta: { role: "assistant", content: "Считаю" }, finish_reason: null }] }),
            )
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      )
    },
  })
  return { server, turns, url: `http://127.0.0.1:${server.port}/v1` }
}

// Polls until `check` gives a value other than `undefined` or `false`, for up to 20 s.
async function until<A>(check: () => A | Promise<A>) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const value = await check()
    if (value !== undefined && value !== false) return value as Exclude<A, false | undefined>
    await Bun.sleep(50)
  }
  throw new Error("Timed out")
}
