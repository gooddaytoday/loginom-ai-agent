// S3: skills from ~/.agents, ~/.claude, project roots and config `skills[]` paths are not visible; an impostor
// `loginom-automation` cannot replace the bundled one; direct activation of a non-official skill is refused while a
// grant is active. Runs twice: baseline (plugin loaded from config, no seams) and target (U1 built-in + U3).
import { makeEnv, report } from "./env"
import { script } from "./mock-llm"

const FOREIGN = ["home-agents-skill", "home-claude-skill", "project-agents-skill", "project-claude-skill", "project-opencode-skill", "config-path-skill"]

async function run(mode: "baseline" | "target", port: number) {
  const env = await makeEnv(`s3-${mode}`, {
    port,
    plugins: mode === "baseline" ? undefined : [],
    extraEnv: mode === "target" ? { LOGINOM_SPIKE_BUILTIN: "1", LOGINOM_SPIKE_U3: "1" } : {},
  })
  try {
    await env.warm()
    const skills = (await env.api.skills()).body.data as { id: string; name: string; path?: string; content: string }[]
    const listed = skills.map((s) => `${s.id} <- ${s.path?.replace(env.run, "<run>")}`)
    const foreignListed = skills.filter((s) => FOREIGN.includes(s.name)).map((s) => s.id)
    const automation = skills.filter((s) => s.name === "loginom-automation")
    const impostor = automation.some((s) => s.content.includes("IMPOSTOR"))

    const session = await env.api.createSession()
    const rpc = await env.api.rpc("loginom.runner", "start", { sessionID: session, text: script([{ hang: 4000 }, { text: "end" }]) })
    console.error(mode, "rpc", JSON.stringify(rpc).slice(0, 400))
    await Bun.sleep(1500)
    const grantActive = env.plugin().some((e) => e.event === "grant.minted" && e.sessionID === session) && !env.plugin().some((e) => e.event === "grant.ended" && e.sessionID === session)
    const communityDuringGrant = await env.api.activateSkill(session, "hub.community-review")
    const foreignActivation = await env.api.activateSkill(session, "home-agents-skill")
    await env.api.wait(session)
    const system = env.llm().map((r) => r.system as string).join("\n")
    const systemMentions = FOREIGN.filter((name) => system.includes(name))
    return {
      mode,
      listed,
      foreignListed,
      impostorAutomation: impostor,
      grantActive,
      communityDuringGrant: { status: communityDuringGrant.status, body: String(JSON.stringify(communityDuringGrant.body)).slice(0, 200) },
      foreignActivation: { status: foreignActivation.status, body: String(JSON.stringify(foreignActivation.body)).slice(0, 200) },
      systemMentions,
      systemHasImpostor: system.includes("IMPOSTOR"),
    }
  } finally {
    env.stop()
  }
}

const baseline = await run("baseline", 47130)
const target = await run("target", 47140)
const ok = (r: typeof target) =>
  r.foreignListed.length === 0 && !r.impostorAutomation && r.grantActive && r.communityDuringGrant.status >= 400 && r.foreignActivation.status >= 400 && r.systemMentions.length === 0 && !r.systemHasImpostor
report("S3", ok(target) ? "PASS" : "FAIL", { baselinePasses: ok(baseline), baseline, target })
