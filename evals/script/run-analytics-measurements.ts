import path from "node:path"
import { mkdir, readdir, stat } from "node:fs/promises"
import { parseArgs, parseEnv } from "node:util"
import { auditMeasurement, exclusiveFact, freezeMeasurementInputs, measurementState, measurementRetrySources, measurementRetryReleases, verifyMeasurementRetryProof, snapshotActor, validateManifest, type MeasurementJob, type MeasurementManifest } from "../src/analytics-measurements"
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
function generationJob(job: MeasurementJob, generation: number) {
  if (!Number.isInteger(generation) || generation < 0 || generation > (job.retryBindings?.length ?? 0)) throw Error("GENERATION_INVALID")
  return generation === 0 ? job : { ...job, ...job.retryBindings![generation - 1]! }
}
function generationDir(manifest: MeasurementManifest, job: MeasurementJob, generation: number) {
  const dir = path.join(manifest.stateDir, "jobs", job.id)
  return generation === 0 ? dir : path.join(dir, `retry-${generation}`)
}
async function nativeEvidence(resultsDir: string, stateDir: string) {
  const journals = []
  for (const file of await readdir(stateDir)) {
    if (!/^run-command-.*\.json$/.test(file)) continue
    const native = await json(path.join(stateDir, file))
    if (native.runDir?.startsWith(resultsDir + path.sep)) journals.push({ file: path.join(stateDir, file), native })
  }
  if (journals.length !== 1) throw Error("NATIVE_JOURNAL_UNKNOWN")
  return journals[0]!
}
async function retryHistory(manifest: MeasurementManifest, job: MeasurementJob, generation: number, manifestHash: string, stateDir: string) {
  const sources: { file: string; sha256: string }[] = []
  for (let prior = 0; prior < generation; prior++) {
    const current = generationJob(job, prior), dir = generationDir(manifest, job, prior)
    if (prior > 0) {
      const file = path.join(dir, "authorization.json")
      await verifyMeasurementRetryProof(file, manifestHash, job.id, prior)
      sources.push({ file, sha256: hash(await Bun.file(file).bytes()) })
    }
    const intentFile = path.join(dir, "launch-intent.json"), intent = await json(intentFile)
    if (intent.manifestHash !== manifestHash || intent.job !== job.id || intent.unit !== current.unit || intent.resultsDir !== current.resultsDir) throw Error("INTENT_MISMATCH")
    const evidence = await nativeEvidence(current.resultsDir, stateDir)
    sources.push(...await measurementRetrySources(current, await unitState(current.unit), evidence.file, path.join(dir, "worker-entry.json"), manifestHash), { file: intentFile, sha256: hash(await Bun.file(intentFile).bytes()) })
  }
  return sources
}
async function checkAuthorization(manifest: MeasurementManifest, job: MeasurementJob, generation: number, manifestHash: string, stateDir: string) {
  if (!generation) return
  const file = path.join(generationDir(manifest, job, generation), "authorization.json")
  await verifyMeasurementRetryProof(file, manifestHash, job.id, generation)
  if (JSON.stringify((await json(file)).sources) !== JSON.stringify(await retryHistory(manifest, job, generation, manifestHash, stateDir))) throw Error("RETRY_HISTORY_CHANGED")
}
export async function runMeasurements(manifestFile: string, jobId?: string, generation = 0, retryJobId?: string) {
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
    const current = generationJob(job, generation), dir = generationDir(manifest, job, generation)
    const unlock = await tryCampaignLock(path.join(manifest.stateDir, "jobs", job.id, "worker.lock"))
    if (!unlock) return 1
    try {
      await checkAuthorization(manifest, job, generation, manifestHash, slots.controller.stateDir)
      const intent = await json(path.join(dir, "launch-intent.json")), binding = await captureUnitBinding()
      if (intent.manifestHash !== manifestHash || intent.job !== job.id || intent.unit !== current.unit || intent.resultsDir !== current.resultsDir || binding?.unit !== current.unit || binding.manager !== "system") throw Error("WORKER_IDENTITY")
      if (!(await exclusiveFact(path.join(dir, "worker-entry.json"), { manifestHash, job: job.id, binding }))) return 1
      const { config } = await pinnedConfiguration(manifest, current)
      const { runPreparedSlots } = await import("../src/prepared-run")
      return (await runPreparedSlots(config)).code
    } finally { await unlock() }
  }
  const unlock = await tryCampaignLock(path.join(manifest.stateDir, "controller.lock"))
  if (!unlock) return 1
  try {
    const { config } = await pinnedConfiguration(manifest, manifest.jobs[0]!)
    if (retryJobId) {
      const retryJob = manifest.jobs.find(item => item.id === retryJobId)
      if (!retryJob || generation < 1) throw Error("GENERATION_INVALID")
      generationJob(retryJob, generation)
      const dir = generationDir(manifest, retryJob, generation), authorization = path.join(dir, "authorization.json")
      await privateDirectory(dir)
      if (await Bun.file(authorization).exists()) {
        await checkAuthorization(manifest, retryJob, generation, manifestHash, slots.controller.stateDir)
        return 1
      }
      const workerUnlock = await tryCampaignLock(path.join(manifest.stateDir, "jobs", retryJob.id, "worker.lock"))
      if (!workerUnlock) return 1
      try {
        const sources = await retryHistory(manifest, retryJob, generation, manifestHash, slots.controller.stateDir)
        const { readServerIdentity } = await import("../src/parallel-pair")
        const { reconcileEnvironment, releaseClosedEnvironment } = await import("../src/startup-reconciliation")
        const identity = await readServerIdentity(slots), env = parseEnv(await Bun.file(manifest.controllerEnvFile).text())
        await reconcileEnvironment(slots, identity, env.EVAL_CLI_BIN!)
        await releaseClosedEnvironment(slots, identity)
        const releases = await measurementRetryReleases([`server:${identity.containerId}`, ...slots.slots.map(slot => `profile:${slot.profileDir}`), `judge:${slots.judge.codexHome}`])
        if (JSON.stringify(sources) !== JSON.stringify(await retryHistory(manifest, retryJob, generation, manifestHash, slots.controller.stateDir))) throw Error("RETRY_HISTORY_CHANGED")
        await exclusiveFact(authorization, { manifestHash, job: retryJob.id, generation, sources, releases })
        return 1
      } finally { await workerUnlock() }
    }
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
    for (const job of manifest.jobs) {
      const authorized = []
      for (let index = 1; index <= (job.retryBindings?.length ?? 0); index++) {
        if (await Bun.file(path.join(generationDir(manifest, job, index), "authorization.json")).exists()) authorized.push(index)
      }
      const selected = authorized.at(-1) ?? 0
      if (authorized.some((value, index) => value !== index + 1)) throw Error("RETRY_GENERATION_GAP")
      await checkAuthorization(manifest, job, selected, manifestHash, slots.controller.stateDir)
      const current = generationJob(job, selected)
      await pinnedConfiguration(manifest, current)
      const dir = generationDir(manifest, job, selected)
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
      const evidence = await nativeEvidence(current.resultsDir, slots.controller.stateDir), state = measurementState(current, unit, evidence.native)
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
    const args = parseArgs({ args: process.argv.slice(2), strict: true, options: { manifest: { type: "string" }, job: { type: "string" }, generation: { type: "string" }, "retry-preflight": { type: "string" } } }).values
    if (!args.manifest || !path.isAbsolute(args.manifest)) throw Error("MANIFEST_ABSOLUTE_REQUIRED")
    if (args.job && args["retry-preflight"]) throw Error("ARGUMENT_CONFLICT")
    process.exitCode = await runMeasurements(args.manifest, args.job, Number(args.generation ?? "0"), args["retry-preflight"])
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "MEASUREMENT_HOLD"
    console.error(code)
    process.exitCode = code.startsWith("MANIFEST_") || code.endsWith("_PINS") ? 2 : 1
  }
}
