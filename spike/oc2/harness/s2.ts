// S2: the fake Host lease taken by a privileged tool is released when the execution succeeds, fails (provider error),
// is interrupted during the model or during the tool, and on SIGTERM. After kill -9 the stale lease is detected on
// the next start and the run is marked requires-recovery.
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { makeEnv, report } from "./env"
import { script } from "./mock-llm"

const env = await makeEnv("s2", { port: 47160, plugins: [], extraEnv: { LOGINOM_SPIKE_BUILTIN: "1", LOGINOM_SPIKE_U3: "1" } })
const leaseDir = env.env.LOGINOM_SPIKE_STATE
const leases = () => (existsSync(leaseDir) ? readdirSync(leaseDir).filter((name) => name.startsWith("lease-")) : [])
const events = (sessionID: string) => env.plugin().filter((e) => e.sessionID === sessionID)
const until = async (check: () => boolean, ms = 20000) => {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (check()) return true
    await Bun.sleep(100)
  }
  return false
}
const acquired = (sessionID: string) => until(() => events(sessionID).some((e) => e.event === "lease.acquired"))
const released = (sessionID: string) => events(sessionID).find((e) => e.event === "lease.released")

async function start(steps: Parameters<typeof script>[0]) {
  const sessionID = await env.api.createSession()
  await env.api.rpc("loginom.runner", "start", { sessionID, text: script(steps) })
  return sessionID
}

const results: Record<string, unknown> = {}
try {
  await env.warm()

  const ok = await start([{ tool: "loginom_dock_prepare", input: {} }, { text: "end" }])
  await Bun.sleep(300)
  await env.api.wait(ok)
  await until(() => released(ok) !== undefined, 5000)
  const okEnd = env.llm().at(-1)?.t
  results.succeeded = { released: released(ok), latencyFromLastModelCallMs: released(ok) ? released(ok).t - okEnd : null }

  const failed = await start([{ tool: "loginom_dock_prepare", input: {} }, { status: 400 }])
  await Bun.sleep(300)
  await env.api.wait(failed)
  await until(() => released(failed) !== undefined, 5000)
  results.failed = { released: released(failed), execution: events(failed).filter((e) => e.event === "event").map((e) => e.type) }

  const midModel = await start([{ tool: "loginom_dock_prepare", input: {} }, { hang: 15000 }])
  await acquired(midModel)
  await Bun.sleep(500)
  const interruptAt = Date.now()
  await env.api.interrupt(midModel)
  await until(() => released(midModel) !== undefined, 5000)
  results.interruptedDuringModel = { released: released(midModel), latencyMs: released(midModel) ? released(midModel).t - interruptAt : null }

  const midTool = await start([{ tool: "loginom_dock_prepare", input: { sleep: 15000 } }, { text: "end" }])
  await acquired(midTool)
  await Bun.sleep(500)
  const interruptToolAt = Date.now()
  await env.api.interrupt(midTool)
  await until(() => released(midTool) !== undefined, 5000)
  results.interruptedDuringTool = { released: released(midTool), latencyMs: released(midTool) ? released(midTool).t - interruptToolAt : null }

  const term = await start([{ tool: "loginom_dock_prepare", input: {} }, { hang: 15000 }])
  await acquired(term)
  const termAt = Date.now()
  env.server().kill("SIGTERM")
  await env.server().exited
  results.sigterm = { released: released(term), latencyMs: released(term) ? released(term).t - termAt : null, leaseFilesLeft: leases(), exitedAfterMs: Date.now() - termAt }

  await env.restart()
  await env.warm()
  const killed = await start([{ tool: "loginom_dock_prepare", input: {} }, { hang: 15000 }])
  await acquired(killed)
  env.server().kill("SIGKILL")
  await env.server().exited
  const left = leases()
  await Bun.sleep(4000)
  await env.restart()
  await env.warm()
  await Bun.sleep(500)
  results.kill9 = { leaseFilesAfterKill: left.length, recovery: env.plugin().filter((e) => e.event === "lease.requires-recovery"), leaseFilesAfterRestart: leases().length }

  const r = results as any
  const within = (ms: number | null) => ms !== null && ms <= 5000
  const pass =
    r.succeeded.released?.reason === "session.execution.succeeded" &&
    r.failed.released?.reason === "session.execution.failed" &&
    within(r.interruptedDuringModel.latencyMs) &&
    within(r.interruptedDuringTool.latencyMs) &&
    within(r.sigterm.latencyMs) &&
    r.kill9.leaseFilesAfterKill === 1 &&
    r.kill9.recovery.some((e: any) => e.sessionID === killed) &&
    r.kill9.leaseFilesAfterRestart === 0
  report("S2", pass ? "PASS" : "FAIL", results)
} finally {
  env.stop()
}
