// S5: background services of two products (different identity dirs) and of two profiles of one product must run
// side by side and never adopt each other. Baseline uses the stock service file/port; target applies U5.
import { mkdirSync, rmSync, readdirSync, existsSync } from "node:fs"
import path from "node:path"
import { report, SPIKE } from "./env"

const CLI = path.join(SPIKE, "opencode", "packages", "cli")

function service(run: string, extra: Record<string, string> = {}, tag = "a") {
  const dir = path.join(SPIKE, ".run", "s5", run)
  mkdirSync(path.join(dir, "home"), { recursive: true })
  const log = path.join(dir, `service-${tag}.log`)
  const proc = Bun.spawn(["bun", "run", "src/index.ts", "serve", "--service"], {
    cwd: CLI,
    env: {
      ...process.env,
      HOME: path.join(dir, "home"),
      XDG_DATA_HOME: path.join(dir, "data"),
      XDG_CONFIG_HOME: path.join(dir, "config"),
      XDG_STATE_HOME: path.join(dir, "state"),
      XDG_CACHE_HOME: path.join(dir, "cache"),
      OPENCODE_DISABLE_MODELS_FETCH: "1",
      ...extra,
    },
    stdout: Bun.file(log),
    stderr: Bun.file(`${log}.err`),
  })
  return { proc, dir, log }
}

async function observe(label: string, a: ReturnType<typeof service>, b: ReturnType<typeof service>) {
  await Bun.sleep(12000)
  const alive = (p: ReturnType<typeof service>) => p.proc.exitCode === null
  const files = (p: ReturnType<typeof service>) => (existsSync(path.join(p.dir, "state", "opencode")) ? readdirSync(path.join(p.dir, "state", "opencode")) : [])
  const tail = async (p: ReturnType<typeof service>) => ((await Bun.file(p.log).text()) + (await Bun.file(`${p.log}.err`).text())).trim().split("\n").slice(-2).join(" | ").slice(0, 300)
  const result = { label, a: { alive: alive(a), files: files(a), log: await tail(a) }, b: { alive: alive(b), exitCode: b.proc.exitCode, files: files(b), log: await tail(b) } }
  a.proc.kill("SIGTERM")
  b.proc.kill("SIGTERM")
  await Promise.all([a.proc.exited, b.proc.exited])
  return result
}

rmSync(path.join(SPIKE, ".run", "s5"), { recursive: true, force: true })
const twoProducts = await (async () => {
  const a = service("products-a")
  await Bun.sleep(6000)
  return observe("baseline: two products (separate dirs), stock port", a, service("products-b", {}, "b"))
})()
const twoProfilesShared = await (async () => {
  const a = service("profiles-shared")
  await Bun.sleep(6000)
  return observe("baseline: two profiles sharing identity dirs", a, service("profiles-shared", {}, "b"))
})()
const target = await (async () => {
  const a = service("target-a", { LOGINOM_SPIKE_U5_IDENTITY: "loginom-ai-agent-desktop" })
  await Bun.sleep(6000)
  return observe("target: U5 identities desktop vs cli profile", a, service("target-b", { LOGINOM_SPIKE_U5_IDENTITY: "loginom-ai-agent-cli-work" }, "b"))
})()
const targetShared = await (async () => {
  const a = service("target-shared", { LOGINOM_SPIKE_U5_IDENTITY: "loginom-ai-agent-desktop" })
  await Bun.sleep(6000)
  return observe("target: U5 two profiles sharing dirs", a, service("target-shared", { LOGINOM_SPIKE_U5_IDENTITY: "loginom-ai-agent-cli-work" }, "b"))
})()
const pass = target.a.alive && target.b.alive && targetShared.a.alive && targetShared.b.alive
report("S5", pass ? "PASS" : "FAIL", { twoProducts, twoProfilesShared, target, targetShared })
