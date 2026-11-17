// S9 (Linux only): Hub-managed skills with dotted IDs work through the skill tool, prompt attachments and `skill`
// permission rules; `skill.reload()` picks up installs and removals; plugin storage handles large values and many
// keys; a config plugin's `./gui-experimental` bundle is served to clients.
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { makeEnv, report, SPIKE } from "./env"
import { script } from "./mock-llm"

const GUI = path.join(SPIKE, "plugin", "gui-probe")
const toolPart = async (env: Awaited<ReturnType<typeof makeEnv>>, sessionID: string, name: string) =>
  ((await env.api.messages(sessionID)).body.data as { content?: { type: string; name?: string; state?: { status: string; error?: { message: string }; content?: unknown } }[] }[])
    .flatMap((m) => m.content ?? [])
    .find((p) => p.type === "tool" && p.name === name)
const results: Record<string, unknown> = {}

const env = await makeEnv("s9", { port: 47180, plugins: [GUI], extraEnv: { LOGINOM_SPIKE_BUILTIN: "1", LOGINOM_SPIKE_U3: "1" } })
try {
  await env.warm()
  const viaTool = await env.api.createSession()
  await env.api.prompt(viaTool, script([{ tool: "skill", input: { id: "hub.community-review" } }, { text: "end" }]))
  await env.api.wait(viaTool)
  const part = await toolPart(env, viaTool, "skill")
  results.skillTool = { status: part?.state?.status, content: JSON.stringify(part?.state?.content ?? part?.state?.error).slice(0, 160) }

  const viaMention = await env.api.createSession()
  const mention = await env.api.prompt(viaMention, script([{ text: "end" }], "use @community-review"), { skills: [{ id: "hub.community-review" }] })
  await env.api.wait(viaMention)
  const mentionMessages = JSON.stringify((await env.api.messages(viaMention)).body.data)
  results.promptAttachment = { status: mention.status, skillTextInSession: mentionMessages.includes("Community review skill.") }

  const fresh = path.join(env.hub, "fresh-solution")
  mkdirSync(fresh, { recursive: true })
  writeFileSync(path.join(fresh, "SKILL.md"), "---\nname: fresh-solution\ndescription: installed at runtime\n---\nFresh.\n")
  const listed = async () => ((await env.api.skills()).body.data as { id: string }[]).map((s) => s.id)
  const beforeReload = (await listed()).includes("hub.fresh-solution")
  await env.api.rpc("loginom.runner", "hubReload", {})
  const afterInstall = (await listed()).includes("hub.fresh-solution")
  rmSync(fresh, { recursive: true })
  await env.api.rpc("loginom.runner", "hubReload", {})
  const afterRemove = (await listed()).includes("hub.fresh-solution")
  results.reload = { beforeReload, afterInstall, afterRemove }

  results.kv = [
    (await env.api.rpc("loginom.runner", "kvProbe", { bytes: 1_000_000, keys: 0 })).body,
    (await env.api.rpc("loginom.runner", "kvProbe", { bytes: 10_000_000, keys: 0 })).body,
    (await env.api.rpc("loginom.runner", "kvProbe", { bytes: 1000, keys: 1000 })).body,
  ]

  const plugins = (await env.api.call("GET", "/api/plugin")).body?.data as { id: string; features?: { gui?: boolean } }[]
  const gui = await env.api.call("GET", "/api/plugin/gui?id=loginom.gui-probe")
  results.guiBundle = { listed: plugins.find((p) => p.id === "loginom.gui-probe")?.features, served: gui.status, body: JSON.stringify(gui.body).slice(0, 200) }
} finally {
  env.stop()
}

const deny = await makeEnv("s9-deny", { port: 47190, plugins: [], extraConfig: { permissions: [{ action: "skill", resource: "hub.*", effect: "deny" }] }, extraEnv: { LOGINOM_SPIKE_BUILTIN: "1", LOGINOM_SPIKE_U3: "1" } })
try {
  await deny.warm()
  const session = await deny.api.createSession()
  await deny.api.prompt(session, script([{ tool: "skill", input: { id: "hub.community-review" } }, { text: "end" }]))
  await deny.api.wait(session)
  const part = await toolPart(deny, session, "skill")
  const offered = deny.llm().filter((r) => r.tools.includes("skill")).length
  results.permissionRule = { status: part?.state?.status, error: part?.state?.error?.message, skillToolOffered: offered > 0 }
} finally {
  deny.stop()
}

const r = results as any
const pass =
  r.skillTool.status === "completed" &&
  r.promptAttachment.status === 200 &&
  r.reload.afterInstall && !r.reload.beforeReload && !r.reload.afterRemove &&
  r.kv.every((k: any) => k.output?.roundTrip !== false) &&
  r.guiBundle.served === 200 &&
  (r.permissionRule.status === "error" || r.permissionRule.status === undefined)
report("S9", pass ? "PARTIAL" : "FAIL", results)
