import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { baselineHash, beginBaselineMeasurement, checkBaseline, prepareBaseline, recordBaselineMeasurement, runBaseline } from "../src/baseline"
import { baselineFixturePins } from "../fixtures/baseline"
import { evalsRoot, repoRoot } from "../src/config"

async function recoveryFixture(outcome: Record<string, unknown> = {}, kind: "infrastructure" | "judge" = "infrastructure") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-recovery-"))
  const series = path.join(directory, "series")
  const manifest = await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
  const job = manifest.jobs[0]!
  const admitted = await beginBaselineMeasurement(series, job.key, { checkout: repoRoot, pins: baselineFixturePins })
  const run = path.join(admitted.resultsDir, "original-error")
  await Bun.write(path.join(run, "summary.json"), JSON.stringify({ run_id: "original-error", config: { repeat: 1 }, task_ids: [admitted.case.id], storage_leftovers: [],
    tasks: [{ id: admitted.case.id, attempts: [{ task_id: admitted.case.id, attempt: 1, status: "infra_error", judge_status: "skipped", pass: null, score: null,
      environment_cleanup: { status: "confirmed" }, tokens: { input: 2, output: 1, reasoning: 0 }, counters: { toolCalls: 0, toolErrors: 0, memoryToolCalls: 0 }, duration_ms: 10, cost: 0.01, ...outcome }] }] }))
  await Bun.write(path.join(run, admitted.case.id, "1/cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: { status: "confirmed" },
    stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
  if (kind === "judge") {
    const out = path.join(run, admitted.case.id, "1")
    await mkdir(path.join(out, "artifact/unpacked"), { recursive: true, mode: 0o700 })
    await Bun.write(path.join(out, "artifact/package.lgp"), await Bun.file(path.join(evalsRoot, "tasks/calc-data-double/reference.lgp")).bytes())
    await Bun.$`unzip -q ${path.join(out, "artifact/package.lgp")} -d ${path.join(out, "artifact/unpacked")}`.quiet()
    await Bun.write(path.join(out, "run.json"), JSON.stringify({ finalText: "Fixture Double artifact", tools: [], nodeReceipts: [], nodeReceiptsDropped: 0 }))
    await Bun.write(path.join(out, "prompt.txt"), "Compute Double = Amount * 2.")
    await Bun.write(path.join(out, "judge/verdict.json"), "initial judge unavailable")
  }
  const record = await recordBaselineMeasurement(series, job.key, run)
  const fixed = path.join(directory, "fixed.json")
  await Bun.write(fixed, JSON.stringify({ fixtureEndpointRestored: true }))
  await chmod(fixed, 0o600)
  const fix = { id: "restore-fixture-endpoint", files: [{ path: fixed, sha256: baselineHash(await Bun.file(fixed).bytes()) }] }
  const validation = path.join(directory, "validation.json")
  await Bun.write(validation, JSON.stringify({ version: 1, baselineId: manifest.id, jobKey: job.key, executionId: record.runId,
    pinsSha256: baselineHash(JSON.stringify(manifest.pins)), fixSha256: baselineHash(JSON.stringify(fix)), status: "PASS", modelCalls: 0,
    exitCode: 0, command: "fixture connection probe" }))
  await chmod(validation, 0o600)
  const evidence = path.join(directory, "recovery.json")
  const proof = { version: 1, baselineId: manifest.id, jobKey: job.key, executionId: record.runId,
    executionFilesSha256: baselineHash(JSON.stringify(record.files)), kind, cause: "fixture endpoint unavailable", fix,
    validation: { path: validation, sha256: baselineHash(await Bun.file(validation).bytes()) }, taskId: "fixture-task", runId: "fixture-run" }
  await Bun.write(evidence, JSON.stringify(proof))
  await chmod(evidence, 0o600)
  const env = { EVAL_BASELINE_FIXTURE: "1", EVAL_CLI_MODE: "fake", EVAL_ARTIFACT_SOURCE: "dir:/fixture" }
  const argv = ["recover-measurement", "--series", series, "--job", job.key, "--kind", kind, "--evidence", evidence]
  return { directory, series, manifest, job, run, evidence, proof, env, argv }
}

async function cleanupFixture(fixture: Awaited<ReturnType<typeof recoveryFixture>>) {
  const record = (await checkBaseline(fixture.series)).executions[0]!.record
  const proof = { version: 1, mode: "fixture", baselineId: fixture.manifest.id, runDir: fixture.run,
    executionFilesSha256: baselineHash(JSON.stringify(record.files)), pinsSha256: baselineHash(JSON.stringify(fixture.manifest.pins)), status: "CONFIRMED", modelCalls: 0 }
  const evidence = path.join(fixture.directory, "cleanup-resolved.json")
  await Bun.write(evidence, JSON.stringify(proof))
  await chmod(evidence, 0o600)
  return { proof, evidence, argv: ["resolve-cleanup", "--series", fixture.series, "--evidence", evidence] }
}

test("recovery admission is atomic, idempotent and retains the original terminal error", async () => {
  const fixture = await recoveryFixture()
  try {
    const before = await Bun.file(path.join(fixture.run, "summary.json")).text()
    const admitted = await runBaseline(fixture.argv, fixture.env)
    expect(admitted).toMatchObject({ code: 0, status: "RECOVERY_ADMITTED" })
    expect(typeof admitted.recoveryId).toBe("string")
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject(admitted)
    const report = await checkBaseline(fixture.series)
    expect(report.coverage).toMatchObject({ recorded: 1, measured: 0, pending: 143, unknown: 0 })
    expect(report.released).toBe(false)
    expect(report.recoveries).toHaveLength(1)
    expect(report.recoveries[0]).toMatchObject({ id: admitted.recoveryId, key: fixture.job.key, kind: "infrastructure", state: "admitted" })
    expect(await Bun.file(path.join(fixture.run, "summary.json")).text()).toBe(before)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test("resume fills the missing slot once, preserves its original error and then advances in order", async () => {
  const fixture = await recoveryFixture()
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
  try {
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 0, status: "RECOVERY_ADMITTED" })
    const before = await Bun.file(path.join(fixture.run, "summary.json")).text()
    const env = { ...fixture.env, PATH: Bun.env.PATH, EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_AGENT_VARIANT: "medium",
      EVAL_PROFILE_DIR: path.join(fixture.directory, "profile"), EVAL_WORKSPACE_ROOT: path.join(fixture.directory, "work"),
      EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`, LOGINOM_DOCK_API_KEY: "fixture",
      LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
      EVAL_AGENT_PROVIDER_ID: "openai", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture", EVAL_AGENT_PROVIDER_MODEL_ID: "model",
      EVAL_JUDGE_COMMAND: `${Bun.which("bun")} ${path.join(evalsRoot, "fixtures/fake-codex.ts")}`, JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "high" }
    const concurrent = await Promise.all([runBaseline(["resume", "--series", fixture.series, "--limit", "1"], env),
      runBaseline(["resume", "--series", fixture.series, "--limit", "1"], env)])
    expect(concurrent.filter(result => result.code === 0)).toHaveLength(1)
    expect(concurrent.find(result => result.code === 0)).toMatchObject({ recorded: 1, measured: 1, pending: 143 })
    expect(concurrent.find(result => result.code !== 0)?.status).toBe("BLOCKED")
    const recovered = await checkBaseline(fixture.series)
    expect(recovered.executions).toHaveLength(2)
    expect(recovered.recoveries[0]?.state).toBe("recorded")
    expect(recovered.rows[0]!.runDir).not.toBe(fixture.run)
    expect(recovered.spending.tokens).toMatchObject({ input: 402, output: 51 })
    expect(recovered.infrastructure).toHaveLength(1)
    expect(await Bun.file(path.join(fixture.run, "summary.json")).text()).toBe(before)
    const replacement = await Bun.file(path.join(recovered.rows[0]!.runDir!, "summary.json")).text()
    expect(await runBaseline(["resume", "--series", fixture.series, "--limit", "1"], env)).toMatchObject({ code: 0, recorded: 2, measured: 2, pending: 142 })
    const continued = await checkBaseline(fixture.series)
    expect(continued.recoveries).toHaveLength(1)
    expect(continued.executions).toHaveLength(3)
    expect(await Bun.file(path.join(recovered.rows[0]!.runDir!, "summary.json")).text()).toBe(replacement)
    expect(await Bun.file(path.join(fixture.run, "summary.json")).text()).toBe(before)
    const exported = await runBaseline(["check", "--series", fixture.series, "--export"], {})
    expect(exported).toMatchObject({ code: 0 })
    expect((await Bun.$`tar -xOf ${String(exported.archive)} ${`measurements/${fixture.job.key}/summary.json`}`.quiet()).text()).toBe(before)
  } finally { server.stop(true); await rm(fixture.directory, { recursive: true, force: true }) }
}, 60_000)

test("a successful judge retry retains its first failure in the report and delivery", async () => {
  const fixture = await recoveryFixture({ status: "completed", judge_status: "error", package_path: "/user/fixture.lgp" }, "judge")
  try {
    const marker = path.join(fixture.directory, "first-judge-failed")
    const env = { ...fixture.env, PATH: Bun.env.PATH,
      EVAL_JUDGE_COMMAND: `env FAKE_CODEX_FLAKY_MARKER=${marker} ${Bun.which("bun")} ${path.join(evalsRoot, "fixtures/fake-codex.ts")}`,
      JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "high" }
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 0 })
    expect(await runBaseline(["resume", "--series", fixture.series, "--limit", "1"], env)).toMatchObject({ code: 0, measured: 1 })
    const report = await checkBaseline(fixture.series)
    expect(report.rows[0]!.result).toMatchObject({ judge_status: "scored", judge_attempts: 2 })
    expect(report.infrastructure).toHaveLength(2)
    expect(report.infrastructure).toContainEqual(expect.objectContaining({ phase: "judge-attempt-1", judge_status: "error", error: "судья завершился кодом 1" }))
    const exported = await runBaseline(["check", "--series", fixture.series, "--export"], {})
    expect(exported).toMatchObject({ code: 0 })
    const manifest = JSON.parse((await Bun.$`tar -xOf ${String(exported.archive)} delivery-manifest.json`.quiet()).text()) as { files: { path: string }[] }
    expect(manifest.files.filter(file => /\/judge\/attempt-[12]\.json$/.test(file.path))).toHaveLength(2)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
}, 60_000)

test("a repeated recovery error requires a new verified repair and retains every failed execution", async () => {
  const fixture = await recoveryFixture({ status: "completed", judge_status: "error", package_path: "/user/fixture.lgp" }, "judge")
  try {
    const env = { ...fixture.env, PATH: Bun.env.PATH,
      EVAL_JUDGE_COMMAND: `env FAKE_CODEX_EXIT=1 ${Bun.which("bun")} ${path.join(evalsRoot, "fixtures/fake-codex.ts")}`,
      JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "high" }
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 0 })
    expect(await runBaseline(["resume", "--series", fixture.series, "--limit", "1"], env)).toMatchObject({ code: 2, reason: "AWAITING_RECOVERY" })
    const failed = await checkBaseline(fixture.series)
    const current = failed.executions.at(-1)!.record
    expect(failed.coverage).toMatchObject({ measured: 0, recorded: 1, pending: 143 })
    expect(failed.executions).toHaveLength(2)
    const fix = { ...fixture.proof.fix, id: "renamed-repair" }
    const validation = await Bun.file(fixture.proof.validation.path).json()
    const writeProof = async () => {
      await Bun.write(fixture.proof.validation.path, JSON.stringify({ ...validation, executionId: current.runId, fixSha256: baselineHash(JSON.stringify(fix)) }))
      await Bun.write(fixture.evidence, JSON.stringify({ ...fixture.proof, executionId: current.runId, executionFilesSha256: baselineHash(JSON.stringify(current.files)), fix,
        validation: { path: fixture.proof.validation.path, sha256: baselineHash(await Bun.file(fixture.proof.validation.path).bytes()) } }))
    }
    await writeProof()
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 2, reason: "RECOVERY_FIX_ALREADY_USED" })
    expect((await checkBaseline(fixture.series)).recoveries).toHaveLength(1)
    await Bun.write(fix.files[0]!.path, JSON.stringify({ judgeEndpointRestored: true }))
    fix.files[0]!.sha256 = baselineHash(await Bun.file(fix.files[0]!.path).bytes())
    await writeProof()
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 0 })
    expect(await runBaseline(["resume", "--series", fixture.series, "--limit", "1"], { ...env,
      EVAL_JUDGE_COMMAND: `${Bun.which("bun")} ${path.join(evalsRoot, "fixtures/fake-codex.ts")}` })).toMatchObject({ code: 0, measured: 1, pending: 143 })
    const report = await checkBaseline(fixture.series)
    expect(report.recoveries).toHaveLength(2)
    expect(report.executions.map(execution => execution.kind)).toEqual(["product", "judge", "judge"])
    expect(report.infrastructure).toHaveLength(4)
    expect(report.spending).toMatchObject({ cost: 0.01, tokens: { input: 2, output: 1 } })
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
}, 60_000)

test("crashed recovery reconciles its saved terminal run and refuses to repeat a live child", async () => {
  const fixture = await recoveryFixture()
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
  const processes: { executor?: ReturnType<typeof Bun.spawn>; child?: { pid: number; starttime: string } } = {}
  const env = { ...fixture.env, PATH: Bun.env.PATH, EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_AGENT_VARIANT: "medium",
    EVAL_PROFILE_DIR: path.join(fixture.directory, "profile"), EVAL_WORKSPACE_ROOT: path.join(fixture.directory, "work"), EVAL_FAKE_SLEEP_MS: "1000",
    EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`, LOGINOM_DOCK_API_KEY: "fixture",
    LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
    EVAL_AGENT_PROVIDER_ID: "openai", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture", EVAL_AGENT_PROVIDER_MODEL_ID: "model",
    EVAL_JUDGE_COMMAND: `${Bun.which("bun")} ${path.join(evalsRoot, "fixtures/fake-codex.ts")}`, JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "high" }
  try {
    const admitted = await runBaseline(fixture.argv, fixture.env)
    expect(admitted).toMatchObject({ code: 0 })
    const parent = path.join(fixture.series, "measurements", fixture.job.key, "recoveries", String(admitted.recoveryId))
    const executor = Bun.spawn([process.execPath, path.join(evalsRoot, "script/run-baseline.ts"), "resume", "--series", fixture.series, "--limit", "1"],
      { cwd: evalsRoot, env, stdout: "ignore", stderr: "ignore" })
    processes.executor = executor
    for (let i = 0; i < 100 && !await Bun.file(path.join(parent, "harness-process.json")).exists(); i++) await Bun.sleep(50)
    expect(await Bun.file(path.join(parent, "harness-process.json")).exists()).toBe(true)
    processes.child = await Bun.file(path.join(parent, "harness-process.json")).json()
    executor.kill("SIGKILL")
    await executor.exited
    expect(await runBaseline(["resume", "--series", fixture.series, "--recover-executor", "--limit", "1"], env))
      .toMatchObject({ code: 2, reason: "HARNESS_STILL_RUNNING" })
    const child = await Bun.file(path.join(parent, "harness-process.json")).json() as { pid: number }
    for (let i = 0; i < 400 && await Bun.file(`/proc/${child.pid}/stat`).exists(); i++) await Bun.sleep(50)
    expect(await Bun.file(`/proc/${child.pid}/stat`).exists()).toBe(false)
    expect(await runBaseline(["resume", "--series", fixture.series, "--limit", "1"], env)).toMatchObject({ code: 2, reason: "UNKNOWN_OUTCOME" })
    expect(await runBaseline(["resume", "--series", fixture.series, "--recover-executor", "--limit", "1"], env))
      .toMatchObject({ code: 0, recorded: 2, measured: 2, pending: 142 })
    const report = await checkBaseline(fixture.series)
    expect(report.recoveries).toHaveLength(1)
    expect(report.executions).toHaveLength(3)
    expect(report.recoveries[0]!.state).toBe("recorded")
  } finally {
    if (processes.executor && processes.executor.exitCode === null) { processes.executor.kill("SIGKILL"); await processes.executor.exited }
    const child = processes.child
    if (child && await Bun.file(`/proc/${child.pid}/stat`).exists()) {
      const stat = await Bun.file(`/proc/${child.pid}/stat`).text()
      if (stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19] === child.starttime) process.kill(child.pid, "SIGINT")
      for (let i = 0; i < 400 && await Bun.file(`/proc/${child.pid}/stat`).exists(); i++) await Bun.sleep(50)
      expect(await Bun.file(`/proc/${child.pid}/stat`).exists()).toBe(false)
    }
    server.stop(true)
    await rm(fixture.directory, { recursive: true, force: true })
  }
}, 60_000)

test("reconcile cannot resolve a dispatched job without its child identity receipt", async () => {
  const fixture = await recoveryFixture({ status: "completed", judge_status: "scored", pass: true, score: 100 })
  try {
    await beginBaselineMeasurement(fixture.series, fixture.manifest.jobs[1]!.key, { checkout: repoRoot, pins: baselineFixturePins })
    const before = await Bun.file(path.join(fixture.series, "journal.json")).text()
    expect(await runBaseline(["resume", "--series", fixture.series, "--recover-executor", "--limit", "1"], fixture.env))
      .toMatchObject({ code: 2, reason: "UNKNOWN_OUTCOME_REQUIRES_RECOVERY" })
    expect(await Bun.file(path.join(fixture.series, "journal.json")).text()).toBe(before)
    expect((await checkBaseline(fixture.series)).coverage).toMatchObject({ recorded: 1, measured: 1, unknown: 1 })
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test("an incomplete executor guard blocks recovery even without a PID receipt", async () => {
  const fixture = await recoveryFixture()
  try {
    const before = await Bun.file(path.join(fixture.series, "journal.json")).text()
    await mkdir(path.join(fixture.series, "executor.lock"), { mode: 0o700 })
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 2, reason: "EXECUTOR_REQUIRES_INSPECTION" })
    expect(await Bun.file(path.join(fixture.series, "journal.json")).text()).toBe(before)
    expect((await checkBaseline(fixture.series)).recoveries).toHaveLength(0)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test.each([
  { status: "completed", judge_status: "scored", pass: true, score: 100 },
  { status: "failed", judge_status: "scored", pass: false, score: 20 },
  { status: "timeout", judge_status: "scored", pass: false, score: 0 },
  { status: "no_artifact", judge_status: "no_artifact", pass: false, score: 0 },
])("measured product $status cannot obtain a recovery admission", async outcome => {
  const fixture = await recoveryFixture(outcome)
  try {
    const before = await Bun.file(path.join(fixture.series, "journal.json")).text()
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 2, reason: "RECOVERY_SLOT_INELIGIBLE" })
    expect(await runBaseline(fixture.argv.map(value => value === "infrastructure" ? "judge" : value), fixture.env))
      .toMatchObject({ code: 2, reason: "RECOVERY_SLOT_INELIGIBLE" })
    expect(await Bun.file(path.join(fixture.series, "journal.json")).text()).toBe(before)
    expect((await checkBaseline(fixture.series)).recoveries).toHaveLength(0)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test("concurrent identical recovery requests create only one admission", async () => {
  const fixture = await recoveryFixture()
  try {
    const requests = await Promise.all([runBaseline(fixture.argv, fixture.env), runBaseline(fixture.argv, fixture.env)])
    expect(requests.filter(result => result.code === 0)).toHaveLength(1)
    expect(requests.find(result => result.code !== 0)).toMatchObject({ reason: "JOURNAL_BUSY_REQUIRES_INSPECTION" })
    expect((await checkBaseline(fixture.series)).recoveries).toHaveLength(1)
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject(requests.find(result => result.code === 0)!)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test.each(["reserved", "fix-copied", "admission-written"])("orphan %s recovery admission blocks another dispatch and preserves the terminal source", async phase => {
  const fixture = await recoveryFixture()
  try {
    const journal = await Bun.file(path.join(fixture.series, "journal.json")).text()
    const source = await Bun.file(path.join(fixture.run, "summary.json")).text()
    const directory = path.join(fixture.series, "measurements", fixture.job.key, "recoveries", baselineHash(JSON.stringify(fixture.proof)))
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if (phase !== "reserved") { await Bun.write(path.join(directory, "proof-0.data"), "interrupted private copy"); await chmod(path.join(directory, "proof-0.data"), 0o400) }
    if (phase === "admission-written") { await Bun.write(path.join(directory, "admission.json"), JSON.stringify(fixture.proof)); await chmod(path.join(directory, "admission.json"), 0o400) }
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 2, reason: "RECOVERY_ADMISSION_UNKNOWN" })
    expect(await runBaseline(["resume", "--series", fixture.series, "--limit", "1"], fixture.env)).toMatchObject({ code: 2, reason: "AWAITING_RECOVERY" })
    const report = await checkBaseline(fixture.series)
    expect(report.recoveries).toHaveLength(0)
    expect(report.executions).toHaveLength(1)
    expect(report.coverage).toMatchObject({ measured: 0, pending: 143 })
    expect(await Bun.file(path.join(fixture.series, "journal.json")).text()).toBe(journal)
    expect(await Bun.file(path.join(fixture.run, "summary.json")).text()).toBe(source)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test("recovery refuses changed repair evidence and a positive-looking receipt that invoked a model", async () => {
  const fixture = await recoveryFixture()
  try {
    const before = await Bun.file(path.join(fixture.series, "journal.json")).text()
    await Bun.write(fixture.proof.fix.files[0]!.path, "changed fix")
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 2, reason: "RECOVERY_PROOF_CHANGED" })
    await Bun.write(fixture.proof.fix.files[0]!.path, JSON.stringify({ fixtureEndpointRestored: true }))
    const validation = await Bun.file(fixture.proof.validation.path).json()
    await Bun.write(fixture.proof.validation.path, JSON.stringify({ ...validation, modelCalls: 1 }))
    await Bun.write(fixture.evidence, JSON.stringify({ ...fixture.proof, validation: { path: fixture.proof.validation.path,
      sha256: baselineHash(await Bun.file(fixture.proof.validation.path).bytes()) } }))
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 2, reason: "RECOVERY_VALIDATION_REQUIRED" })
    expect(await Bun.file(path.join(fixture.series, "journal.json")).text()).toBe(before)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test("confirmed missing quality does not bypass an unconfirmed cleanup", async () => {
  const fixture = await recoveryFixture({ environment_cleanup: { status: "failed", error: "fixture cleanup unknown" } })
  try {
    const before = await Bun.file(path.join(fixture.series, "journal.json")).text()
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 2, reason: "CLEANUP_UNKNOWN" })
    expect(await Bun.file(path.join(fixture.series, "journal.json")).text()).toBe(before)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test("admitted recovery retains immutable copies of repair and validation evidence", async () => {
  const fixture = await recoveryFixture()
  try {
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 0 })
    const report = await checkBaseline(fixture.series)
    const copies = report.recoveries[0]!.evidenceFiles
    expect(copies).toHaveLength(2)
    expect(await Bun.file(copies[0]!.path).text()).toBe(JSON.stringify({ fixtureEndpointRestored: true }))
    await Bun.write(fixture.proof.fix.files[0]!.path, "working evidence changed")
    expect((await checkBaseline(fixture.series)).recoveries).toHaveLength(1)
    await chmod(copies[0]!.path, 0o600)
    await Bun.write(copies[0]!.path, "archive tampered")
    await expect(checkBaseline(fixture.series)).rejects.toThrow("RECOVERY_EVIDENCE_CHANGED")
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test("a measured product with failed cleanup cannot admit the next case", async () => {
  const fixture = await recoveryFixture({ status: "no_artifact", judge_status: "no_artifact", pass: false, score: 0,
    environment_cleanup: { status: "failed", error: "fixture cleanup unknown" } })
  try {
    const before = await Bun.file(path.join(fixture.series, "journal.json")).text()
    await expect(beginBaselineMeasurement(fixture.series, fixture.manifest.jobs[1]!.key, { checkout: repoRoot, pins: baselineFixturePins }))
      .rejects.toThrow("CLEANUP_UNKNOWN")
    expect(await Bun.file(path.join(fixture.series, "journal.json")).text()).toBe(before)
    expect((await checkBaseline(fixture.series)).coverage).toMatchObject({ recorded: 1, measured: 1, pending: 143, unknown: 0 })
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test("verified cleanup resolution preserves the failed receipt and admits the next case without a product retry", async () => {
  const fixture = await recoveryFixture({ status: "no_artifact", judge_status: "no_artifact", pass: false, score: 0,
    environment_cleanup: { status: "failed", error: "fixture cleanup failed" } })
  try {
    const before = await Bun.file(path.join(fixture.run, "summary.json")).text()
    const cleanup = await cleanupFixture(fixture)
    const resolved = await runBaseline(cleanup.argv, fixture.env)
    expect(resolved).toMatchObject({ code: 0, status: "CLEANUP_RESOLVED" })
    expect(await runBaseline(cleanup.argv, fixture.env)).toMatchObject(resolved)
    const checked = await checkBaseline(fixture.series)
    expect(checked.cleanup).toBe(true)
    expect(checked.executions[0]!.record.cleanup).toBe(false)
    expect(checked.rows[0]).toMatchObject({ measured: true, cleanup: true, verdict: "FAIL" })
    expect(checked.infrastructure).toContainEqual(expect.objectContaining({ phase: "cleanup-original", cleanup_resolved: true }))
    expect(await Bun.file(path.join(fixture.run, "summary.json")).text()).toBe(before)
    expect(await beginBaselineMeasurement(fixture.series, fixture.manifest.jobs[1]!.key, { checkout: repoRoot, pins: baselineFixturePins }))
      .toMatchObject({ job: fixture.manifest.jobs[1] })
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test("cleanup resolution permits judge recovery from the original artifact without rewriting failed cleanup", async () => {
  const fixture = await recoveryFixture({ status: "completed", judge_status: "error", package_path: "/user/fixture.lgp",
    environment_cleanup: { status: "failed", error: "fixture cleanup failed" } }, "judge")
  try {
    const cleanup = await cleanupFixture(fixture)
    expect(await runBaseline(cleanup.argv, fixture.env)).toMatchObject({ code: 0 })
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 0 })
    expect(await runBaseline(["resume", "--series", fixture.series, "--limit", "1"], { ...fixture.env, PATH: Bun.env.PATH,
      EVAL_JUDGE_COMMAND: `${Bun.which("bun")} ${path.join(evalsRoot, "fixtures/fake-codex.ts")}`, JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "high" }))
      .toMatchObject({ code: 0, measured: 1, pending: 143 })
    const report = await checkBaseline(fixture.series)
    expect(report.cleanup).toBe(true)
    expect(report.executions[0]!.record.cleanup).toBe(false)
    expect(report.executions).toHaveLength(2)
    expect(report.spending.cost).toBe(0.01)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
}, 60_000)

test("cleanup resolution rejects drift and model calls and retains an immutable verification receipt", async () => {
  const fixture = await recoveryFixture({ environment_cleanup: { status: "failed" } })
  try {
    const cleanup = await cleanupFixture(fixture)
    const before = await Bun.file(path.join(fixture.series, "journal.json")).text()
    for (const proof of [{ ...cleanup.proof, pinsSha256: "0".repeat(64) }, { ...cleanup.proof, modelCalls: 1 }, { ...cleanup.proof, mode: "live" }]) {
      await Bun.write(cleanup.evidence, JSON.stringify(proof))
      expect(await runBaseline(cleanup.argv, fixture.env)).toMatchObject({ code: 2, reason: "CLEANUP_RESOLUTION_INVALID" })
      expect(await Bun.file(path.join(fixture.series, "journal.json")).text()).toBe(before)
    }
    await Bun.write(cleanup.evidence, JSON.stringify(cleanup.proof))
    expect(await runBaseline(cleanup.argv, fixture.env)).toMatchObject({ code: 0 })
    const saved = (await checkBaseline(fixture.series)).cleanupResolutions[0]!
    await Bun.write(cleanup.evidence, "working receipt changed")
    expect((await checkBaseline(fixture.series)).cleanup).toBe(true)
    await chmod(saved.evidencePath, 0o600)
    await Bun.write(saved.evidencePath, "closed receipt changed")
    await expect(checkBaseline(fixture.series)).rejects.toThrow("CLEANUP_RESOLUTION_CHANGED")
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test("explicit abandonment retains missing quality and permanently closes a safely released series", async () => {
  const fixture = await recoveryFixture()
  try {
    const before = await Bun.file(path.join(fixture.run, "summary.json")).text()
    const receipt = path.join(fixture.directory, "release.json")
    await Bun.write(receipt, JSON.stringify({ status: "RELEASED", evidenceSha256: "a".repeat(64) }))
    await chmod(receipt, 0o600)
    const argv = ["abandon", "--series", fixture.series, "--evidence", receipt]
    expect(await runBaseline(argv, fixture.env)).toMatchObject({ code: 2, reason: "ABANDON_REASON_REQUIRED" })
    expect(await runBaseline([...argv, "--reason", "confirmed external outage; terminate this series"], fixture.env))
      .toMatchObject({ code: 0, status: "abandoned", measured: 0, pending: 143 })
    expect(await checkBaseline(fixture.series)).toMatchObject({ status: "abandoned", released: true, cleanup: true })
    expect(await Bun.file(path.join(fixture.run, "summary.json")).text()).toBe(before)
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 2, reason: "SERIES_RELEASED" })
    expect(await runBaseline(["resume", "--series", fixture.series, "--limit", "1"], fixture.env)).toMatchObject({ code: 2, reason: "SERIES_RELEASED" })
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test.each(["cleanup", "executor", "unknown"])("abandonment refuses an unresolved %s and retains the journal", async condition => {
  const fixture = await recoveryFixture(condition === "cleanup" ? { environment_cleanup: { status: "failed" } } :
    condition === "unknown" ? { status: "completed", judge_status: "scored", pass: true, score: 100 } : {})
  try {
    if (condition === "executor") await mkdir(path.join(fixture.series, "executor.lock"), { mode: 0o700 })
    if (condition === "unknown") await beginBaselineMeasurement(fixture.series, fixture.manifest.jobs[1]!.key, { checkout: repoRoot, pins: baselineFixturePins })
    const before = await Bun.file(path.join(fixture.series, "journal.json")).text()
    const receipt = path.join(fixture.directory, "release.json")
    await Bun.write(receipt, JSON.stringify({ status: "RELEASED", evidenceSha256: "a".repeat(64) }))
    await chmod(receipt, 0o600)
    expect(await runBaseline(["abandon", "--series", fixture.series, "--evidence", receipt, "--reason", "terminate incomplete series"], fixture.env))
      .toMatchObject({ code: 2, reason: condition === "executor" ? "EXECUTOR_REQUIRES_INSPECTION" : "CLEANUP_UNKNOWN" })
    expect(await Bun.file(path.join(fixture.series, "journal.json")).text()).toBe(before)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
})

test("judge recovery scores the original artifact once without product execution or rewriting its evidence", async () => {
  const fixture = await recoveryFixture({ status: "completed", judge_status: "error", package_path: "/user/fixture.lgp" }, "judge")
  try {
    const out = path.join(fixture.run, "calc-data-double/1")
    const before = await Bun.file(path.join(fixture.run, "summary.json")).text()
    const artifactHash = baselineHash(await Bun.file(path.join(out, "artifact/package.lgp")).bytes())
    const failures = path.join(fixture.directory, "judge-failures.json")
    const task = await Bun.file(path.join(evalsRoot, "tasks/calc-data-double/task.json")).json()
    await Bun.write(failures, JSON.stringify({ "1": task.checklist.map((item: { id: string }) => item.id) }))
    const productCalls = path.join(fixture.directory, "unexpected-product.json")
    const env = { ...fixture.env, PATH: Bun.env.PATH, EVAL_FAKE_ARGS_FILE: productCalls,
      EVAL_JUDGE_COMMAND: `${Bun.which("bun")} ${path.join(evalsRoot, "fixtures/fake-codex.ts")} --failed-by-case ${failures}`,
      JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "high" }
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 0, status: "RECOVERY_ADMITTED" })
    expect(await runBaseline(["resume", "--series", fixture.series, "--limit", "1"], env)).toMatchObject({ code: 0, recorded: 1, measured: 1, pending: 143 })
    const report = await checkBaseline(fixture.series)
    expect(report.executions.map(execution => execution.kind)).toEqual(["product", "judge"])
    expect(report.rows[0]!.result).toMatchObject({ status: "completed", judge_status: "scored", score: 0, pass: false })
    expect(report.cleanup).toBe(true)
    expect(report.spending).toMatchObject({ cost: 0.01, tokens: { input: 2, output: 1 }, judge_tokens: null })
    expect(report.spending.judge_duration_ms).toBeGreaterThan(0)
    expect(report.infrastructure).toHaveLength(1)
    expect(await Bun.file(productCalls).exists()).toBe(false)
    expect(await Bun.file(path.join(fixture.run, "summary.json")).text()).toBe(before)
    expect(await Bun.file(path.join(out, "judge/verdict.json")).text()).toBe("initial judge unavailable")
    expect(baselineHash(await Bun.file(path.join(report.rows[0]!.runDir!, "calc-data-double/1/artifact/package.lgp")).bytes())).toBe(artifactHash)
    const changed = { ...fixture.proof, fix: { ...fixture.proof.fix, id: "seek-better-score" } }
    await Bun.write(fixture.evidence, JSON.stringify(changed))
    expect(await runBaseline(fixture.argv, fixture.env)).toMatchObject({ code: 2, reason: "RECOVERY_SLOT_INELIGIBLE" })
    expect((await checkBaseline(fixture.series)).executions).toHaveLength(2)
    const exported = await runBaseline(["check", "--series", fixture.series, "--export"], {})
    expect(exported).toMatchObject({ code: 0 })
    const manifest = JSON.parse((await Bun.$`tar -xOf ${String(exported.archive)} delivery-manifest.json`.quiet()).text()) as { files: { path: string }[] }
    expect(manifest.files.filter(file => file.path.endsWith("/judge/verdict.json"))).toHaveLength(2)
    expect(manifest.files.some(file => file.path.includes("judge-process-cleanup") || file.path.endsWith("admission.json") || file.path.endsWith(".data"))).toBe(false)
  } finally { await rm(fixture.directory, { recursive: true, force: true }) }
}, 60_000)
