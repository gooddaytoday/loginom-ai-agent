// Smoke: server starts with the plugin, the scripted model answers, the plugin hooks fire.
import { makeEnv } from "./env"
import { script } from "./mock-llm"

const env = await makeEnv("smoke", { port: 47110 })
try {
  const sessionID = await env.api.createSession()
  console.log("session", sessionID)
  console.log("prompt", (await env.api.prompt(sessionID, script([{ text: "hello from spike" }]))).status)
  console.log("wait", (await env.api.wait(sessionID)).status)
  const messages = await env.api.messages(sessionID)
  console.log("messages", JSON.stringify(messages.body).slice(0, 1500))
  console.log("skills", JSON.stringify((await env.api.skills()).body).slice(0, 800))
  console.log("llm", JSON.stringify(env.llm().map((r) => ({ n: r.n, tools: r.tools, step: r.step }))))
  console.log("plugin", env.plugin().map((e) => e.event).join(","))
} finally {
  env.stop()
}
