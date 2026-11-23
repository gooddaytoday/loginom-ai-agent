// Loginom AI Agent (B2.7a4): the product CLI entry from source in its own HOME, XDG directories and CLI profile, with
// an OpenAI-compatible model that follows a script. `test/cli-run.test.ts` runs `run` this way; the same runs recorded
// the event streams in `evals/fixtures/events/cli-run/` that `evals` and `run-check.py` are checked against.
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { CliProfile } from "../../src/profile"
import { isolatedEnv } from "./environment"

export const cli = path.join(import.meta.dir, "../..")

/** One reply of the model: text, tool calls, an HTTP failure, or no answer at all. */
export type Step =
  | { text: string }
  | { tools: { name: string; input: Record<string, unknown> }[] }
  | { status: number; body: string }
  | { hang: true }

/** A Dock-style receipt the model can fetch from `<url>/receipt`: a tool's output that is one JSON object. */
export const receipt = { operation_id: "fixture-operation", status: "SUCCEEDED" }

/**
 * Replies to each step of the agent with the next step of the script, then with "Done.", and records every request
 * body. A request without tools generates the session title; it gets a title and leaves the script alone.
 */
export function scriptedModel(steps: Step[]) {
  const requests: { tools?: unknown; messages?: unknown }[] = []
  // Every request, the session title's too.
  const hits = { count: 0 }
  const requested = Promise.withResolvers<void>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname.endsWith("/receipt")) return Response.json(receipt)
      if (!new URL(request.url).pathname.endsWith("/chat/completions"))
        return new Response("not found", { status: 404 })
      const body = (await request.json()) as { tools?: unknown[]; messages?: unknown }
      hits.count++
      const title = !body.tools?.length
      if (!title) requests.push(body)
      if (!title) requested.resolve()
      const step = title ? { text: "Fixture title" } : (steps.shift() ?? { text: "Done." })
      const origin = new URL(request.url).origin
      if ("hang" in step) return new Promise<Response>(() => {})
      if ("status" in step) return new Response(step.body, { status: step.status })
      const chunk = (body: unknown) => `data: ${JSON.stringify(body)}\n\n`
      const base = { id: `stub-${requests.length}`, object: "chat.completion.chunk", created: 0, model: "test-model" }
      const delta =
        "text" in step
          ? { role: "assistant", content: step.text }
          : {
              role: "assistant",
              tool_calls: step.tools.map((tool, index) => ({
                index,
                id: `call_${requests.length}_${index}`,
                type: "function",
                // `{server}` in an input is this server's origin, which the script cannot know in advance.
                function: { name: tool.name, arguments: JSON.stringify(tool.input).replaceAll("{server}", origin) },
              })),
            }
      return new Response(
        [
          chunk({ ...base, choices: [{ index: 0, delta, finish_reason: null }] }),
          chunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "text" in step ? "stop" : "tool_calls" }] }),
          chunk({ ...base, choices: [], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }),
          "data: [DONE]\n\n",
        ].join(""),
        { headers: { "content-type": "text/event-stream" } },
      )
    },
  })
  return { server, requests, hits, requested: requested.promise, url: `http://127.0.0.1:${server.port}/v1` }
}

/** A root with a CLI profile whose config names the model `test/test-model` at `url`, and a project directory. */
export async function productRoot(url: string, config: Record<string, unknown> = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-cli-run-")))
  const project = path.join(root, "project")
  await fs.mkdir(project)
  const profile = await productProfile(path.join(root, "profile"), url, config)
  return { root, project, profile }
}

/** Opens the CLI profile at `root` and names the model `test/test-model` at `url` in its config. */
export async function productProfile(root: string, url: string, config: Record<string, unknown> = {}) {
  const profile = CliProfile.apply({ LOGINOM_AI_AGENT_CLI_PROFILE: root })
  await Bun.write(
    path.join(profile.config, "loginom-ai-agent.json"),
    JSON.stringify({
      formatter: false,
      lsp: false,
      provider: {
        test: {
          name: "test",
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL: url, ["api" + "Key"]: "test-key" },
          models: {
            "test-model": { name: "Test Model", tool_call: true, limit: { context: 100_000, output: 10_000 } },
          },
        },
      },
      ...config,
    }),
  )
  return profile
}

/** Starts the product CLI entry; the caller reads its output and exit. */
export function spawnProduct(root: string, args: string[], overrides: Record<string, string | undefined> = {}) {
  return Bun.spawn([process.execPath, path.join(cli, "src/loginom-cli.ts"), ...args], {
    // The CLI entry needs the preload from this package's bunfig.toml.
    cwd: cli,
    env: isolatedEnv(root, {
      LOGINOM_AI_AGENT_CLI_ROOT: undefined,
      LOGINOM_AI_AGENT_CLI_PROFILE: path.join(root, "profile"),
      // A parent's PWD names another directory, as it does for `evals` and `run-check.py`, which set only the cwd.
      PWD: cli,
      ...overrides,
    }),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
}

export async function product(root: string, args: string[], overrides: Record<string, string | undefined> = {}) {
  const child = spawnProduct(root, args, overrides)
  return finished(child)
}

export async function finished(child: ReturnType<typeof spawnProduct>) {
  const timer = setTimeout(() => child.kill("SIGKILL"), 50_000)
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { code, stdout, stderr, events: lines(stdout) }
  } finally {
    clearTimeout(timer)
  }
}

function lines(stdout: string) {
  return stdout
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}
