import path from "node:path"
import { mkdir, readdir, stat } from "node:fs/promises"
import { parseArgs, parseEnv } from "node:util"
import { auditMeasurement, exclusiveFact, freezeMeasurementInputs, measurementState, snapshotActor, validateManifest, type MeasurementJob, type MeasurementManifest } from "../src/analytics-measurements"
import { tryCampaignLock } from "../src/campaign-lock"
import { loadConfig } from "../src/config"
import { loadSlots } from "../src/slots"
import { captureUnitBinding } from "../src/process-supervisor"

const hash = (value: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(value).digest("hex")
const json = (file: string) => Bun.file(file).json()
async function privateDirectory(dir: string) {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  if (((await stat(dir)).mode & 0o777) !== 0o700) throw Error("PRIVATE_DIRECTORY_REQUIRED")
}
async function unitState(unit: string) {
  const child = Bun.spawn(["/usr/bin/systemctl", "show", unit, "--property=Id,ActiveState,InvocationID,ExecMainStatus,Delegate,MainPID,ControlGroup,Restart,FragmentPath"], { stdout: "pipe", stderr: "ignore", timeout: 10000 })
  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()])
  if (code) throw Error("UNIT_STATUS_UNAVAILABLE")
  const properties = Object.fromEntries(output.trim().split("\n").map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)] }))
  if (properties.Id !== unit || properties.Delegate !== "no" || properties.Restart !== "no" || !properties.FragmentPath) throw Error("UNIT_CONFIG_UNVERIFIED")
  const metadata = await stat(properties.FragmentPath)
  if (metadata.uid !== 0 || (metadata.mode & 0o022)) throw Error("UNIT_OWNERSHIP")
  return properties
}
async function pinnedConfiguration(manifest: MeasurementManifest, job: MeasurementJob) {
  for (const [file, pin] of [[manifest.controllerEnvFile, manifest.pins.controllerEnvSha256], [manifest.slotsFile, manifest.pins.slotsSha256], [manifest.resourceBudgetFile, manifest.pins.resourceBudgetSha256]])
    if (hash(await Bun.file(file!).bytes()) !== pin) throw Error("INPUT_PIN_CHANGED")
  const env = parseEnv(await Bun.file(manifest.controllerEnvFile).text())
  if (env.EVAL_CLI_MODE !== "binary" || !env.EVAL_CLI_BIN || !path.isAbsolute(env.EVAL_CLI_BIN) ||
    env.EVAL_AGENT_MODEL !== "openai/gpt-6.1-terra" || env.EVAL_AGENT_VARIANT !== "high" || env.JUDGE_MODEL !== "gpt-6.1-sol" || env.JUDGE_REASONING !== "xhigh" ||
    Object.keys(env).some(key => key.startsWith("EVAL_CAMPAIGN_"))) throw Error("EXECUTION_PINS")
  const installedManifest = path.join(path.dirname(path.dirname(env.EVAL_CLI_BIN)), "cli-manifest.json")
  if (hash(await Bun.file(env.EVAL_CLI_BIN).bytes()) !== manifest.pins.cliBinarySha256 || hash(await Bun.file(installedManifest).bytes()) !== manifest.pins.cliManifestSha256) throw Error("CLI_PIN_CHANGED")
  const config = loadConfig(["--tasks", job.tasksDir, "--only", job.taskId, "--repeat", "1", "--parallel", "1", "--timeout-ms", "1800000", "--label", job.id],
    { ...env, EVAL_RESULTS_DIR: job.resultsDir, EVAL_SLOTS_FILE: manifest.slotsFile, EVAL_RESOURCE_BUDGET_FILE: manifest.resourceBudgetFile })
  return { config, env }
}
export async function runMeasurements(manifestFile: string, jobId?: string) {
  const raw = await Bun.file(manifestFile).text(), manifest = validateManifest(JSON.parse(raw)), manifestHash = hash(raw)
  await privateDirectory(manifest.stateDir)
  const frozen = path.join(manifest.stateDir, "manifest.json")
  await exclusiveFact(frozen, { manifestHash, manifest })
  if ((await json(frozen)).manifestHash !== manifestHash) throw Error("MANIFEST_CHANGED")
  await freezeMeasurementInputs(path.join(manifest.stateDir, "task-pins.json"), manifestHash, manifest.jobs)
  const slots = await loadSlots(manifest.slotsFile, 1)
  const job = jobId ? manifest.jobs.find(item => item.id === jobId) : undefined
  if (jobId && !job) throw Error("JOB_UNKNOWN")
  if (job) {
    const dir = path.join(manifest.stateDir, "jobs", job.id)
    const unlock = await tryCampaignLock(path.join(dir, "worker.lock"))
    if (!unlock) return 1
    try {
      const intent = await json(path.join(dir, "launch-intent.json")), binding = await captureUnitBinding()
      if (intent.manifestHash !== manifestHash || intent.job !== job.id || intent.unit !== job.unit || intent.resultsDir !== job.resultsDir || binding?.unit !== job.unit || binding.manager !== "system") throw Error("WORKER_IDENTITY")
      if (!(await exclusiveFact(path.join(dir, "worker-entry.json"), { manifestHash, job: job.id, binding }))) return 1
      const { config } = await pinnedConfiguration(manifest, job)
      const { runPreparedSlots } = await import("../src/prepared-run")
      return (await runPreparedSlots(config)).code
    } finally { await unlock() }
  }
  const unlock = await tryCampaignLock(path.join(manifest.stateDir, "controller.lock"))
  if (!unlock) return 1
  try {
    const { config } = await pinnedConfiguration(manifest, manifest.jobs[0]!)
    const snapshot = async () => {
      const value = await snapshotActor(manifest.memory, config.dock.baseUrl, config.dock.apiKey)
      if (JSON.stringify(value).includes(config.dock.apiKey)) throw Error("MEMORY_SECRET_IN_CONTENT")
      return value
    }
    const beforeFile = path.join(manifest.stateDir, "memory-before.json")
    if (!(await Bun.file(beforeFile).exists())) {
      if ((await Promise.all(manifest.jobs.map(item => Bun.file(path.join(manifest.stateDir, "jobs", item.id, "launch-intent.json")).exists()))).some(Boolean)) throw Error("MEMORY_BEFORE_MISSING")
      await exclusiveFact(beforeFile, await snapshot())
    }
    for (const current of manifest.jobs) {
      await pinnedConfiguration(manifest, current)
      const dir = path.join(manifest.stateDir, "jobs", current.id)
      await privateDirectory(dir)
      const intentFile = path.join(dir, "launch-intent.json")
      const unit = await unitState(current.unit)
      if (!(await Bun.file(intentFile).exists())) {
        if (!["inactive", "failed"].includes(unit.ActiveState ?? "") || unit.MainPID !== "0" || unit.ControlGroup !== "") throw Error("UNIT_NOT_IDLE")
        await privateDirectory(current.resultsDir)
        if ((await readdir(current.resultsDir)).length) throw Error("RESULTS_NOT_EMPTY")
        if (await exclusiveFact(intentFile, { version: 1, kind: "measurement-launch", manifestHash, job: current.id, unit: current.unit, resultsDir: current.resultsDir, createdAt: new Date().toISOString() })) {
          const start = Bun.spawn(["/usr/bin/sudo", "-n", "/usr/bin/systemctl", "start", "--no-block", current.unit], { stdout: "ignore", stderr: "ignore", timeout: 10000 })
          await start.exited
        }
        return 1
      }
      const intent = await json(intentFile)
      if (intent.manifestHash !== manifestHash || intent.job !== current.id || intent.unit !== current.unit || intent.resultsDir !== current.resultsDir) throw Error("INTENT_MISMATCH")
      const journals = []
      for (const file of await readdir(slots.controller.stateDir)) {
        if (!/^run-command-.*\.json$/.test(file)) continue
        const native = await json(path.join(slots.controller.stateDir, file))
        if (native.runDir?.startsWith(current.resultsDir + path.sep)) journals.push({ file: path.join(slots.controller.stateDir, file), native })
      }
      if (journals.length !== 1) throw Error("NATIVE_JOURNAL_UNKNOWN")
      const evidence = journals[0]!, state = measurementState(current, unit, evidence.native)
      if (state === "running") return 1
      if (state !== "consumed") throw Error(state === "zero-admissions" ? "ZERO_ADMISSIONS_REQUIRES_EXPLICIT_REPAIR" : "NATIVE_ADMISSION_UNKNOWN")
      const completionFile = path.join(dir, "completion.json"), nativeHash = hash(await Bun.file(evidence.file).bytes())
      if (await Bun.file(completionFile).exists()) {
        const completed = await json(completionFile)
        if (completed.manifestHash !== manifestHash || completed.nativeHash !== nativeHash || completed.invocation !== unit.InvocationID || completed.audit?.status !== "PASS") throw Error("COMPLETION_EVIDENCE_CHANGED")
        continue
      }
      const audit = await auditMeasurement(current, evidence.file, slots)
      await exclusiveFact(path.join(dir, `audit-${crypto.randomUUID()}.json`), audit)
      if (audit.status !== "PASS") throw Error("AUDIT_INCOMPLETE")
      await exclusiveFact(completionFile, { manifestHash, nativeHash, invocation: unit.InvocationID, audit })
    }
    const after = await snapshot()
    await exclusiveFact(path.join(manifest.stateDir, `memory-after-${crypto.randomUUID()}.json`), after)
    if (JSON.stringify(after) !== JSON.stringify(await json(beforeFile))) throw Error("MEMORY_CHANGED")
    return 0
  } finally { await unlock() }
}

if (import.meta.main) {
  try {
    const args = parseArgs({ args: process.argv.slice(2), strict: true, options: { manifest: { type: "string" }, job: { type: "string" } } }).values
    if (!args.manifest || !path.isAbsolute(args.manifest)) throw Error("MANIFEST_ABSOLUTE_REQUIRED")
    process.exitCode = await runMeasurements(args.manifest, args.job)
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "MEASUREMENT_HOLD"
    console.error(code)
    process.exitCode = code.startsWith("MANIFEST_") || code.endsWith("_PINS") ? 2 : 1
  }
}
