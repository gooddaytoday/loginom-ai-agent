// Scripted OpenAI-compatible chat model for the spike. The user prompt carries the script:
//   SPIKE-SCRIPT:<base64 of JSON array of steps>
// A step is { tool, input } (one tool call) or { text } (final answer) or { hang: ms } (stall before answering).
// The step index is the number of assistant turns since the last scripted user message, so the model is stateless.
// Requests without tools (titles, summaries) get a short text. Every request is appended to the log as JSON.
import { appendFileSync } from "node:fs"

type Step = { tool: string; input: unknown } | { text: string } | { hang: number }

export function script(steps: Step[], note = "") {
  return `${note}\nSPIKE-SCRIPT:${Buffer.from(JSON.stringify(steps)).toString("base64")}`
}

type ChatMessage = { role: string; content?: unknown; tool_calls?: unknown[] }

function text(content: unknown) {
  if (typeof content === "string") return content
  if (Array.isArray(content)) return content.map((part) => (part as { text?: string }).text ?? "").join("")
  return ""
}

function nextStep(messages: ChatMessage[]): Step | undefined {
  const index = messages.findLastIndex((message) => message.role === "user" && text(message.content).includes("SPIKE-SCRIPT:"))
  if (index === -1) return undefined
  const encoded = /SPIKE-SCRIPT:([A-Za-z0-9+/=]+)/.exec(text(messages[index].content))![1]
  const steps = JSON.parse(Buffer.from(encoded, "base64").toString()) as Step[]
  const done = messages.slice(index + 1).filter((message) => message.role === "assistant").length
  return steps[done] ?? { text: "done" }
}

function chunk(delta: unknown, finish: string | null = null) {
  const body = { id: "spike", object: "chat.completion.chunk", created: 0, model: "spike", choices: [{ index: 0, delta, finish_reason: finish }] }
  return `data: ${JSON.stringify(body)}\n\n`
}

export function startMock(port: number, logFile: string) {
  let calls = 0
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (request.method === "GET" && url.pathname.endsWith("/models"))
        return Response.json({ object: "list", data: [{ id: "spike-model", object: "model" }] })
      if (!url.pathname.endsWith("/chat/completions")) return new Response("not found", { status: 404 })
      const body = (await request.json()) as { messages: ChatMessage[]; tools?: { function: { name: string } }[] }
      const tools = (body.tools ?? []).map((tool) => tool.function.name)
      const step = tools.length === 0 ? { text: "Spike title" } : (nextStep(body.messages) ?? { text: "no script" })
      appendFileSync(logFile, JSON.stringify({ t: Date.now(), n: ++calls, tools, step, system: body.messages.filter((m) => m.role === "system").map((m) => text(m.content)).join("\n") }) + "\n")
      const stream = new ReadableStream({
        async start(controller) {
          const send = (value: string) => controller.enqueue(new TextEncoder().encode(value))
          if ("hang" in step) await Bun.sleep(step.hang)
          if ("tool" in step) {
            send(chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call_${calls}`, type: "function", function: { name: step.tool, arguments: JSON.stringify(step.input ?? {}) } }] }))
            send(chunk({}, "tool_calls"))
          }
          if (!("tool" in step)) {
            send(chunk({ role: "assistant", content: "text" in step ? step.text : "after hang" }))
            send(chunk({}, "stop"))
          }
          send(`data: ${JSON.stringify({ id: "spike", object: "chat.completion.chunk", created: 0, model: "spike", choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`)
          send("data: [DONE]\n\n")
          controller.close()
        },
      })
      return new Response(stream, { headers: { "content-type": "text/event-stream" } })
    },
  })
}
