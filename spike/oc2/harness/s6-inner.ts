// S6 scenario, run inside a network namespace with only loopback: start, warm, one chat with a tool call, then idle.
// Usage: bun s6-inner.ts <stock|target> <port> <idleSeconds> <traceFile>
import { makeEnv } from "./env"
import { script } from "./mock-llm"

const [mode, port, idle, trace] = process.argv.slice(2)
const stock = mode === "stock"
const env = await makeEnv(`s6-${mode}`, {
  port: Number(port),
  plugins: [],
  extraEnv: {
    SPIKE_STRACE: trace,
    ...(stock
      ? { OPENCODE_DISABLE_MODELS_FETCH: "" }
      : { LOGINOM_SPIKE_BUILTIN: "1", OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_FREE_MODELS: "1", OPENCODE_DISABLE_CLAUDE_CODE: "1" }),
  },
})
try {
  await env.warm()
  const session = await env.api.createSession()
  await env.api.prompt(session, script([{ tool: "todowrite", input: { todos: [{ content: "check", status: "pending", priority: "low" }] } }, { text: "done" }]))
  await env.api.wait(session)
  console.log(`[${mode}] scenario done, idling ${idle}s`)
  await Bun.sleep(Number(idle) * 1000)
} finally {
  // SIGTERM makes strace detach and leaves the server running; SIGKILL plus --kill-on-exit takes the tracees down.
  env.server().kill("SIGKILL")
  env.mock.stop(true)
  await Bun.sleep(1000)
  process.exit(0)
}
