import { mkdir } from "node:fs/promises"
import { join } from "node:path"

// A process boundary for the manual driver: activation reveals prepare, and
// an unprepared receipt stops the driver before any browser or signal target.
const profile = process.env.LOGINOM_AI_AGENT_CLI_PROFILE!
if (process.argv.includes("setup")) {
  await mkdir(join(profile, "config"), { recursive: true })
  console.log("{}")
  process.exit(0)
}
const config = await Bun.file(join(profile, "config/loginom-ai-agent.json")).json()
const messages: { role: string; content: string; tool_call_id?: string }[] = [
  { role: "user", content: "Inspect the owned fixture" },
]
const calls: { name: string; arguments: unknown }[] = []
process.on("SIGINT", () => process.exit(130))
for (const names of [["skill"], ["skill", "loginom_dock_prepare"], ["skill", "loginom_dock_prepare"]]) {
  const response = await fetch(config.provider.test.options.baseURL + "/chat/completions", {
    method: "POST",
    body: JSON.stringify({ messages, tools: names.map((name) => ({ function: { name } })) }),
  })
  if (!response.ok) process.exit(1)
  const chunk = JSON.parse((await response.text()).split("\n")[0]!.slice(6))
  const call = chunk.choices[0].delta.tool_calls[0]
  calls.push({ name: call.function.name, arguments: JSON.parse(call.function.arguments) })
  await Bun.write(process.env.LOGINOM_ORACLE_PROBE_REPORT!, JSON.stringify(calls))
  messages.push({
    role: "tool",
    content: call.function.name === "skill" ? "Automation loaded" : '{"prepared":false}',
    tool_call_id: call.id,
  })
}
