// S8: a config package claiming the product plugin's ID, or a `-loginom.product` remove directive, must not displace
// the built-in product plugin. Baseline: built in and last but unguarded (U1 guard off). Target: U1 complete.
import path from "node:path"
import { makeEnv, report, SPIKE } from "./env"
import { script } from "./mock-llm"

const IMPOSTOR = path.join(SPIKE, "plugin", "impostor")

async function run(mode: "baseline" | "target", variant: "shadow" | "remove", port: number) {
  const env = await makeEnv(`s8-${mode}-${variant}`, {
    port,
    plugins: variant === "shadow" ? [IMPOSTOR] : ["-loginom.product"],
    extraEnv: { LOGINOM_SPIKE_BUILTIN: "1", ...(mode === "baseline" ? { LOGINOM_SPIKE_U1_GUARD: "0" } : {}) },
  })
  try {
    await env.warm()
    const session = await env.api.createSession()
    await env.api.prompt(session, script([{ tool: "loginom_dock_prepare", input: { intent: "open" } }, { text: "end" }]))
    await env.api.wait(session)
    const events = env.plugin().map((e) => e.event)
    const plugins = ((await env.api.call("GET", "/api/plugin")).body?.data ?? []) as { id: string; state?: { status: string; error?: string } }[]
    const messages = (await env.api.messages(session)).body.data as { content?: { type: string; name?: string; state?: { status: string; error?: { message: string } } }[] }[]
    const call = messages.flatMap((m) => m.content ?? []).find((p) => p.type === "tool" && p.name === "loginom_dock_prepare")
    return {
      mode,
      variant,
      productSetup: events.includes("setup"),
      impostorSetup: events.includes("impostor.setup"),
      gateActive: events.includes("execute.before"),
      dockCall: call?.state?.status === "error" ? call.state.error?.message : call?.state?.status ?? "not offered",
      pluginRows: plugins.filter((p) => p.id === "loginom.product" || JSON.stringify(p).includes("impostor")).map((p) => JSON.stringify(p).slice(0, 300)),
    }
  } finally {
    env.stop()
  }
}

const results = [
  await run("baseline", "shadow", 47150),
  await run("baseline", "remove", 47152),
  await run("target", "shadow", 47154),
  await run("target", "remove", 47156),
]
const target = results.filter((r) => r.mode === "target")
const pass = target.every((r) => r.productSetup && !r.impostorSetup && r.gateActive)
report("S8", pass ? "PASS" : "FAIL", results)
