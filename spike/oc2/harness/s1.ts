// S1: a privileged tool hidden without a grant cannot be executed directly, through CodeMode `execute`, from a
// subagent spawned by a granted session, or from a scheduled wake after the granted execution ended.
// A positive control checks that the same tool runs when the session holds a grant.
import { makeEnv, report } from "./env"
import { script } from "./mock-llm"

const env = await makeEnv("s1", {
  port: 47120,
  plugins: [],
  extraEnv: { LOGINOM_SPIKE_BUILTIN: "1", LOGINOM_SPIKE_U3: "1", OPENCODE_FLAGS: "schedules" },
})
const executed = (sessionID: string, tool: string) =>
  env.plugin().filter((e) => e.event === "tool.executed" && e.sessionID === sessionID && e.tool === tool).length
const before = (sessionID: string, tool: string) =>
  env.plugin().filter((e) => e.event === "execute.before" && e.sessionID === sessionID && e.tool === tool)
const toolParts = async (sessionID: string) =>
  ((await env.api.messages(sessionID)).body.data as { type: string; content?: { type: string; name?: string; state?: unknown }[] }[])
    .flatMap((m) => m.content ?? [])
    .filter((part) => part.type === "tool")
try {
  const results: Record<string, unknown> = {}

  const direct = await env.api.createSession()
  await env.api.prompt(direct, script([{ tool: "loginom_dock_prepare", input: { intent: "open" } }, { text: "end" }]))
  await env.api.wait(direct)
  results.direct = { executed: executed(direct, "loginom_dock_prepare"), before: before(direct, "loginom_dock_prepare"), parts: await toolParts(direct) }

  const codemode = await env.api.createSession()
  await env.api.prompt(codemode, script([{ tool: "execute", input: { code: "return await tools.loginom_dock_codemode({ intent: 'x' })" } }, { text: "end" }]))
  await env.api.wait(codemode)
  results.codemode = { executed: executed(codemode, "loginom_dock_codemode"), before: before(codemode, "loginom_dock_codemode"), parts: await toolParts(codemode) }

  const granted = await env.api.createSession()
  const rpc = await env.api.rpc("loginom.runner", "start", { sessionID: granted, text: script([{ tool: "loginom_dock_prepare", input: { intent: "open" } }, { text: "end" }]) })
  await Bun.sleep(500)
  await env.api.wait(granted)
  results.positiveControl = { rpc, executed: executed(granted, "loginom_dock_prepare") }

  const parent = await env.api.createSession()
  const child = script([{ tool: "loginom_dock_prepare", input: { intent: "from-child" } }, { text: "child end" }])
  await env.api.rpc("loginom.runner", "start", { sessionID: parent, text: script([{ tool: "subagent", input: { agent: "general", description: "spike child", prompt: child } }, { text: "parent end" }]) })
  await Bun.sleep(500)
  await env.api.wait(parent)
  await Bun.sleep(4000)
  const childCalls = env.plugin().filter((e) => e.event === "execute.before" && e.tool === "loginom_dock_prepare" && e.sessionID !== parent && e.sessionID !== granted && e.sessionID !== direct)
  results.subagent = { childCalls, childExecuted: env.plugin().filter((e) => e.event === "tool.executed" && e.input?.intent === "from-child").length }

  const scheduled = await env.api.createSession()
  const wake = script([{ tool: "loginom_dock_prepare", input: { intent: "from-schedule" } }, { text: "wake end" }])
  await env.api.rpc("loginom.runner", "start", { sessionID: scheduled, text: script([{ tool: "execute", input: { code: `return await tools.opencode.schedule_create({ when: { in: "3 seconds" }, prompt: ${JSON.stringify(wake)} })` } }, { text: "scheduled" }]) })
  await Bun.sleep(500)
  await env.api.wait(scheduled)
  await Bun.sleep(9000)
  await env.api.wait(scheduled)
  results.schedule = {
    created: (await toolParts(scheduled)).map((p) => JSON.stringify(p).slice(0, 300)),
    wakeCalls: before(scheduled, "loginom_dock_prepare"),
    wakeExecuted: env.plugin().filter((e) => e.event === "tool.executed" && e.input?.intent === "from-schedule").length,
    grantEvents: env.plugin().filter((e) => e.sessionID === scheduled && e.event.startsWith("grant")),
  }

  const r = results as any
  const pass =
    r.direct.executed === 0 &&
    r.codemode.executed === 0 &&
    r.codemode.before.some((e: any) => e.allowed === false) &&
    r.positiveControl.executed === 1 &&
    r.subagent.childExecuted === 0 &&
    r.subagent.childCalls.length > 0 &&
    r.schedule.wakeExecuted === 0 &&
    r.schedule.wakeCalls.length > 0
  report("S1", pass ? "PASS" : "FAIL", results)
} finally {
  env.stop()
}
