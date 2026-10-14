import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"
import { main } from "../src/run"
import { superviseProcess } from "../src/process-supervisor"

for (const mode of ["calibrate", "judge-only", "run"] as const) test(`${mode} admission drains an interrupted version probe before any measured output`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-admission-"))
  let cleanupConfirmed = true
  try {
    const pidFile = path.join(root, "version-child.pid")
    const version = path.join(root, "version.json")
    const trace = path.join(root, "judge.jsonl")
    const resultFile = path.join(root, "result.json")
    const resultsDir = path.join(root, "results")
    const script = path.join(root, "interrupt.ts")
    const previous = mode === "judge-only" ? await main(["--dry-run", "--only", "group-sum-qty"], { EVAL_RESULTS_DIR: resultsDir }) : undefined
    const summary = previous?.runDir ? await Bun.file(path.join(previous.runDir, "summary.json")).text() : undefined
    const configs = await Array.fromAsync(new Bun.Glob("results/**/config.json").scan({ cwd: root }))
    await mkdir(path.join(root, "supervision"))
    await Bun.write(script, `import { main } from ${JSON.stringify(path.join(evalsRoot, "src/run.ts"))}
const pending = main(${JSON.stringify(mode === "judge-only" ? ["--judge-only", path.basename(previous!.runDir!)] : mode === "calibrate" ? ["--calibrate", "--only", "group-sum-qty"] : ["--only", "group-sum-qty"])},${JSON.stringify({
      EVAL_RESULTS_DIR: resultsDir, JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: `bun ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --child-pid-file ${pidFile} --version-home-file ${version} --gate-log ${trace}`,
      EVAL_PROFILE_DIR: path.join(root, "profile"), EVAL_WORKSPACE_ROOT: path.join(root, "work"),
      EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/fake-model", LOGINOM_DOCK_API_KEY: "fixture-dock",
      LOGINOM_URL: "http://127.0.0.1:1/app/", EVAL_ARTIFACT_SOURCE: `dir:${path.join(root, "storage")}`,
    })})
const deadline = Date.now() + 10000
while (!await Bun.file(${JSON.stringify(pidFile)}).exists() && Date.now() < deadline) await Bun.sleep(10)
if (!await Bun.file(${JSON.stringify(pidFile)}).exists()) throw Error("Version probe did not start")
process.kill(process.pid,"SIGINT")
try { await Bun.write(${JSON.stringify(resultFile)},JSON.stringify({kind:"completed",result:await pending})) }
catch (error) { await Bun.write(${JSON.stringify(resultFile)},JSON.stringify({kind:"refused",code:error.exitCode,message:error.message})) }
`)
    cleanupConfirmed = false
    const run = await superviseProcess({ cmd: [process.execPath, script], cwd: root,
      env: { PATH: process.env.PATH!, HOME: root }, timeoutMs: 20_000, outDir: path.join(root, "supervision") })
    cleanupConfirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.exitCode).toBe(0)
    expect(await Bun.file(resultFile).json()).toEqual({ kind: "refused", code: 2, message: "JUDGE_VERSION_UNCONFIRMED" })
    expect(await Bun.file(version).exists()).toBe(false)
    expect(await Bun.file(trace).exists()).toBe(false)
    expect(await Array.fromAsync(new Bun.Glob("**/calibration.json").scan({ cwd: root }))).toEqual([])
    expect(await Array.fromAsync(new Bun.Glob("results/**/config.json").scan({ cwd: root }))).toEqual(configs)
    expect(await Array.fromAsync(new Bun.Glob("results/**/summary.prev.json").scan({ cwd: root }))).toEqual([])
    if (previous?.runDir) expect(await Bun.file(path.join(previous.runDir, "summary.json")).text()).toBe(summary!)
    expect(run.processCleanup.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
  } finally { if (cleanupConfirmed) await rm(root, { recursive: true, force: true }) }
}, 45_000)
