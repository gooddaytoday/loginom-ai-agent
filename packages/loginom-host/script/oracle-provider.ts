import { join } from "node:path"
import { randomUUID } from "node:crypto"

export const oraclePrompt =
  "Import the attached sales.csv, aggregate its numeric values, save the package, and close it."

// Shared scripted provider for manual Desktop/TUI/run acceptance, not a model-quality test.
export function oracleProvider(options: { directory: string; apiKey: string; onFinish?(): void }) {
  const invocation = randomUUID()
  type Action = { id: string; name: string; args: Record<string, unknown> } | { finish: true }
  const state: {
    sequence: number
    captured: boolean
    next: ReturnType<typeof Promise.withResolvers<Action>>
    pending?: { id: string; resolve(value: unknown): void; reject(error: Error): void }
    stopped: boolean
  } = { sequence: 0, captured: false, next: Promise.withResolvers<Action>(), stopped: false }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 255,
    async fetch(request) {
      const body = (await request.json()) as {
        messages: { role: string; content: unknown; tool_call_id?: string }[]
        tools?: { function?: { name?: string } }[]
      }
      const title = JSON.stringify(body.messages).includes("Generate a title for this conversation")
      if (!title && !state.captured) {
        const contract = JSON.stringify({
          system: body.messages.filter((message) => message.role === "system"),
          tools: body.tools?.filter((tool) => tool.function?.name?.startsWith("loginom_")),
        })
        if (contract.includes(options.apiKey)) throw Error("SECRET_IN_ORACLE_CONTRACT")
        await Bun.write(join(options.directory, "model-contract.json"), contract)
        state.captured = true
      }
      const previous = body.messages.findLast(
        (message) => message.role === "tool" && message.tool_call_id === state.pending?.id,
      )
      if (previous && state.pending) {
        if (typeof previous.content !== "string") throw Error("CLI_ORACLE_TOOL_CONTENT_INVALID")
        state.pending.resolve({ result: { content: [{ type: "text", text: previous.content.split("\n\n")[0] }] } })
        state.pending = undefined
      }
      const action = title ? ({ finish: true } as const) : await state.next.promise
      if (!title) state.next = Promise.withResolvers<Action>()
      if (!("finish" in action) && !body.tools?.some((tool) => tool.function?.name === action.name)) {
        await Bun.write(
          join(options.directory, "missing-tool.json"),
          JSON.stringify({ requested: action.name, advertised: body.tools?.map((tool) => tool.function?.name).sort() }),
        )
        state.pending?.reject(Error("CLI_ORACLE_TOOL_NOT_ADVERTISED"))
        return new Response("missing tool", { status: 500 })
      }
      const delta =
        "finish" in action
          ? { content: title ? "CLI acceptance" : "CLI oracle completed" }
          : {
              tool_calls: [
                {
                  index: 0,
                  id: action.id,
                  type: "function",
                  function: { name: action.name, arguments: JSON.stringify(action.args) },
                },
              ],
            }
      const chunks = [
        { id: "cli-oracle", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] },
        {
          id: "cli-oracle",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: {}, finish_reason: "finish" in action ? "stop" : "tool-calls" }],
        },
      ]
      if (!title && "finish" in action) options.onFinish?.()
      return new Response(
        chunks.map((chunk) => "data: " + JSON.stringify(chunk) + "\n\n").join("") + "data: [DONE]\n\n",
        {
          headers: { "Content-Type": "text/event-stream" },
        },
      )
    },
  })
  return {
    config: {
      formatter: false,
      lsp: false,
      provider: {
        test: {
          name: "Acceptance",
          id: "test",
          env: [],
          npm: "@ai-sdk/openai-compatible",
          models: {
            "test-model": {
              id: "test-model",
              name: "Scripted oracle",
              attachment: false,
              reasoning: false,
              temperature: false,
              tool_call: true,
              release_date: "2025-01-01",
              limit: { context: 1000000, output: 10000 },
              cost: { input: 0, output: 0 },
              options: {},
            },
          },
          options: { apiKey: "fixture-key", baseURL: `http://127.0.0.1:${server.port}/v1` },
        },
      },
    },
    async request(operation: string, input?: unknown) {
      // Each interface admits the original attachment, never the test's synthetic admit call.
      if (operation === "admit") return { admittedByInterface: true }
      if (
        operation !== "call" ||
        !input ||
        typeof input !== "object" ||
        !("name" in input) ||
        typeof input.name !== "string" ||
        !("arguments" in input)
      )
        throw Error("CLI_ORACLE_REQUEST_INVALID")
      if (state.stopped || state.pending) throw Error("CLI_ORACLE_NOT_AVAILABLE")
      const result = Promise.withResolvers<unknown>()
      const id = `oracle_${invocation}_${++state.sequence}`
      state.pending = { id, resolve: result.resolve, reject: result.reject }
      state.next.resolve({ id, name: "loginom_" + input.name, args: input.arguments as Record<string, unknown> })
      return result.promise
    },
    finish() {
      state.next.resolve({ finish: true })
    },
    exited() {
      state.stopped = true
      state.pending?.reject(Error("CLI_ORACLE_EXITED"))
    },
    stop() {
      server.stop(true)
    },
  }
}
