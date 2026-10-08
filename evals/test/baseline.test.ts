import { expect, test } from "bun:test"
import { chmod, cp, lstat, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { prepareBaseline, beginBaselineMeasurement, recordBaselineMeasurement, checkBaseline, sealBaselineRelease, runBaseline, verifyBaselineInstallation, baselineHash, captureBaselinePins, admitBaselineSmoke, checkBaselineReadiness } from "../src/baseline"
import { acquireNodeStand, type NodeOpsConfig } from "../src/node-eval-ops"
import { repoRoot, evalsRoot } from "../src/config"

import { baselineFixturePins } from "../fixtures/baseline"

test("prepared baseline includes the four accepted LAB-31 cases in each of three rounds", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-lab31-"))
  try {
    const manifest = await prepareBaseline(path.join(directory, "series"), { checkout: repoRoot, pins: baselineFixturePins })
    expect(manifest.cases).toHaveLength(48)
    expect(manifest.jobs).toHaveLength(144)
    for (const id of ["crosstable-column-cartesian", "crosstable-local-variable-bindings", "crosstable-multi-facts", "crosstable-string-counts-null"]) {
      expect(manifest.jobs.filter(job => job.caseKey === `node:${id}`).map(job => job.attempt)).toEqual([1, 2, 3])
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("prepare freezes all 48 cases as three complete rounds without executing a model", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-"))
  try {
    const manifest = await prepareBaseline(path.join(directory, "series"), { checkout: repoRoot, pins: baselineFixturePins })
    expect(manifest.cases).toHaveLength(48)
    expect(manifest.jobs).toHaveLength(144)
    expect(new Set(manifest.jobs.map(job => job.key)).size).toBe(144)
    for (const attempt of [1, 2, 3]) {
      expect(manifest.jobs.filter(job => job.attempt === attempt).map(job => job.caseKey)).toEqual(manifest.cases.map(item => item.key))
    }
    const before = await Bun.file(path.join(directory, "series/manifest.json")).text()
    await expect(prepareBaseline(path.join(directory, "series"), { checkout: repoRoot, pins: baselineFixturePins })).rejects.toThrow("SERIES_EXISTS")
    expect(await Bun.file(path.join(directory, "series/manifest.json")).text()).toBe(before)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("a selected smoke prepares exactly one case and one logical attempt", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-single-smoke-"))
  try {
    const manifest = await prepareBaseline(path.join(directory, "series"), {
      checkout: repoRoot, pins: baselineFixturePins, smoke: true, smokeCase: "calc-data-double",
    })
    expect(manifest.cases.map(item => item.key)).toEqual(["regular:calc-data-double"])
    expect(manifest.jobs).toEqual([{ key: "regular-calc-data-double-1", caseKey: "regular:calc-data-double", attempt: 1 }])
    expect(manifest.smokeOracle?.expectedCsv).toBe("Double\n20\n40\n")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("smoke rejects a missing or foreign case before live configuration or dispatch", async () => {
  for (const [selector, reason] of [[[], "SMOKE_CASE_REQUIRED"], [["--case", "group-sum-qty"], "SMOKE_CASE_REFUSED"]] as const) {
    expect(await runBaseline(["smoke", "--series", "/fixture/not-created", ...selector], {})).toMatchObject({ code: 2, reason })
  }
  expect(await runBaseline(["prepare", "--series", "/fixture/not-created", "--case", "calc-data-double"], {}))
    .toMatchObject({ code: 2, reason: "CASE_ONLY_FOR_SMOKE" })
})

async function readinessFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-readiness-"))
  const results = path.join(directory, "results")
  await mkdir(results)
  const checkout = path.join(directory, "checkouts/evalbaseline")
  await cp(path.join(evalsRoot, "tasks"), path.join(checkout, "evals/tasks"), { recursive: true })
  const role = { checkout, evalProfile: path.join(directory, "roles/evalbaseline/profile"), workRoots: [path.join(directory, "roles/evalbaseline/work")], resultsRoot: results,
    cliBin: path.join(directory, "cli-baseline/bin/cli"), readinessIssue: "LAB-32" }
  const worker = (name: string) => ({ checkout: path.join(directory, "checkouts", name), referenceProfile: path.join(directory, "roles", name, "reference"),
    evalProfile: path.join(directory, "roles", name, "eval"), workRoots: [path.join(directory, "roles", name, "work")], resultsRoot: path.join(directory, "roles", name, "results") })
  const config: NodeOpsConfig = { version: 2, runtimeRoot: directory, endpoint: "http://fixture", container: { name: "fixture", id: "b".repeat(64), storageDir: "/workdir/UserStorage/user" },
    cliBin: path.join(directory, "cli-old/bin/cli"), roles: { rich: worker("rich"), ben: worker("ben"), evalbaseline: role } }
  for (const item of Object.values(config.roles)) for (const root of [item.checkout, item.evalProfile, item.referenceProfile, ...item.workRoots, item.resultsRoot])
    if (root) await mkdir(root, { recursive: true, mode: 0o700 })
  await Bun.write(config.cliBin, "fixture CLI never executed")
  await Bun.write(role.cliBin, "fixture CLI never executed")
  const pins = { ...baselineFixturePins, opsConfigSha256: baselineHash(JSON.stringify(config)) }
  return { directory, checkout, config, pins, async prepare(name: string, smokeCase = "calc-data-double") {
    const series = path.join(results, name)
    await prepareBaseline(series, { checkout, pins, config, smoke: true, smokeCase })
    return series
  }, close: () => rm(directory, { recursive: true, force: true }) }
}

test("readiness admits each smoke case once and a new series cannot bypass the durable limit", async () => {
  const fixture = await readinessFixture()
  try {
    const original = await fixture.prepare("calc-one")
    const duplicate = await fixture.prepare("calc-two")
    const admitted = await admitBaselineSmoke(original, fixture.config, { issue: "LAB-32", task: "smoke-one" })
    expect(await admitBaselineSmoke(original, fixture.config, { issue: "LAB-32", task: "smoke-one" })).toEqual(admitted)
    await beginBaselineMeasurement(original, "regular-calc-data-double-1", { checkout: fixture.checkout, pins: fixture.pins })
    await expect(admitBaselineSmoke(duplicate, fixture.config, { issue: "LAB-32", task: "smoke-two" })).rejects.toThrow("SMOKE_ALREADY_ADMITTED")
    await expect(beginBaselineMeasurement(original, "regular-calc-data-double-1", { checkout: fixture.checkout, pins: fixture.pins })).rejects.toThrow("ALREADY_DISPATCHED")
    await admitBaselineSmoke(await fixture.prepare("node-one", "crosstable-fixed-sum"), fixture.config, { issue: "LAB-32", task: "smoke-three" })
    expect(await checkBaselineReadiness(fixture.config)).toMatchObject({ expected: 2, admitted: 2, complete: 0, ready: false })
    expect(await checkBaseline(original)).toMatchObject({ coverage: { unknown: 1 }, released: false })
  } finally { await fixture.close() }
})

test("concurrent smoke admissions cannot reserve two series for the same case", async () => {
  const fixture = await readinessFixture()
  try {
    const one = await fixture.prepare("one")
    const two = await fixture.prepare("two")
    const admissions = await Promise.allSettled([one, two].map((series, index) =>
      admitBaselineSmoke(series, fixture.config, { issue: "LAB-32", task: `smoke-${index}` })))
    expect(admissions.filter(admission => admission.status === "fulfilled")).toHaveLength(1)
    expect(admissions.filter(admission => admission.status === "rejected")).toHaveLength(1)
    expect(await checkBaselineReadiness(fixture.config)).toMatchObject({ admitted: 1, complete: 0, ready: false })
  } finally { await fixture.close() }
})

test("readiness refuses the wrong card, changed pins and altered admission evidence", async () => {
  const fixture = await readinessFixture()
  try {
    const series = await fixture.prepare("one")
    await expect(admitBaselineSmoke(series, fixture.config, { issue: "LAB-other", task: "smoke" })).rejects.toThrow("SMOKE_ADMISSION_REFUSED")
    expect(await checkBaselineReadiness(fixture.config)).toMatchObject({ admitted: 0, ready: false })
    await admitBaselineSmoke(series, fixture.config, { issue: "LAB-32", task: "smoke" })
    await expect(checkBaselineReadiness(fixture.config, { ...fixture.pins, dockRevision: "changed" })).rejects.toThrow("READINESS_PINS_CHANGED")
    const receipt = path.join(fixture.directory, "operations/baseline-readiness/LAB-32/calc-data-double.json")
    const saved = await Bun.file(receipt).json()
    await chmod(receipt, 0o600)
    await Bun.write(receipt, JSON.stringify({ ...saved, manifestSha256: "0".repeat(64) }))
    await expect(checkBaselineReadiness(fixture.config)).rejects.toThrow("READINESS_EVIDENCE_CHANGED")
  } finally { await fixture.close() }
})

test("live smoke admission is wired before dispatch and preserves the duplicate series as pending", async () => {
  const fixture = await readinessFixture()
  try {
    const pins = { ...fixture.pins, mode: "live" as const }
    const role = fixture.config.roles.evalbaseline!
    const series = path.join(role.resultsRoot, "live-one")
    const duplicate = path.join(role.resultsRoot, "live-two")
    for (const target of [series, duplicate]) {
      await prepareBaseline(target, { checkout: fixture.checkout, pins, config: fixture.config, smoke: true, smokeCase: "calc-data-double" })
    }
    const lease = await acquireNodeStand(fixture.config, { issue: "LAB-32", task: "smoke-task", role: "evalbaseline", phase: "eval", sha: pins.harnessSha })
    for (const target of [series, duplicate]) {
      await Bun.write(path.join(target, "stand-handle.json"), JSON.stringify(lease))
      await chmod(path.join(target, "stand-handle.json"), 0o600)
    }
    await beginBaselineMeasurement(series, "regular-calc-data-double-1", { checkout: fixture.checkout, pins })
    await expect(beginBaselineMeasurement(duplicate, "regular-calc-data-double-1", { checkout: fixture.checkout, pins })).rejects.toThrow("SMOKE_ALREADY_ADMITTED")
    expect((await checkBaselineReadiness(fixture.config)).admitted).toBe(1)
    expect((await checkBaseline(duplicate)).coverage).toMatchObject({ pending: 1, unknown: 0 })
  } finally { await fixture.close() }
})

test("smoke dispatches a startup error only once through both standard and node harness", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-smoke-dispatch-"))
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
  try {
    const checkout = path.join(directory, "checkout")
    await mkdir(path.join(checkout, "evals"), { recursive: true })
    await cp(path.join(evalsRoot, "tasks"), path.join(checkout, "evals/tasks"), { recursive: true })
    for (const part of ["src", "script"]) await symlink(path.join(evalsRoot, part), path.join(checkout, "evals", part))
    for (const smokeCase of ["calc-data-double", "crosstable-fixed-sum"]) {
      const caseDir = path.join(checkout, "evals/tasks", ...(smokeCase === "calc-data-double" ? [] : ["node-evals"]), smokeCase)
      const task = await Bun.file(path.join(caseDir, "task.json")).json()
      await Bun.write(path.join(caseDir, "data/fake-infra-retry.json"), "{}")
      await Bun.write(path.join(caseDir, "task.json"), JSON.stringify({ ...task, inputs: [...task.inputs, "data/fake-infra-retry.json"] }))
      const series = path.join(directory, smokeCase)
      const manifest = await prepareBaseline(series, { checkout, pins: baselineFixturePins, smoke: true, smokeCase })
      const env = { PATH: Bun.env.PATH, EVAL_BASELINE_FIXTURE: "1", EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_AGENT_VARIANT: "medium",
        EVAL_PROFILE_DIR: path.join(directory, smokeCase + "-profile"), EVAL_WORKSPACE_ROOT: path.join(directory, "work"),
        EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`, LOGINOM_DOCK_API_KEY: "fixture",
        LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
        EVAL_AGENT_PROVIDER_ID: "openai", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture", EVAL_AGENT_PROVIDER_MODEL_ID: "model",
        EVAL_JUDGE_COMMAND: `${Bun.which("bun")} ${path.join(evalsRoot, "fixtures/fake-codex.ts")}`, JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "high" }
      expect(await runBaseline(["start", "--series", series], env)).toMatchObject({ code: 0, recorded: 1, measured: 0 })
      const report = await checkBaseline(series)
      const summary = await Bun.file(path.join(report.rows[0]!.runDir!, "summary.json")).json()
      expect(manifest.infraRetries).toBe(0)
      expect(summary.config.infra_retries).toBe(0)
      expect(summary.tasks[0].attempts[0]).toMatchObject({ status: "infra_error" })
      expect(summary.tasks[0].attempts[0].infra_retry).toBeUndefined()
      expect(await Bun.file(path.join(directory, "work", summary.run_id, smokeCase, "1/fake-launches.json")).json()).toBe(1)
    }
  } finally { server.stop(true); await rm(directory, { recursive: true, force: true }) }
}, 60_000)

test("installation verification refuses tampered payloads and extra files without executing CLI", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "baseline-install-"))
  try {
    const bin = path.join(root, "bin/loginom-ai-agent-cli")
    await Bun.write(bin, "fixture binary never executed")
    await chmod(bin, 0o755)
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify({ format: "loginom-cli-artifact-v1", metadata: { version: "0.1.17", sourceCommit: baselineFixturePins.cliSource, sourceDirty: false },
      files: [{ path: "bin/loginom-ai-agent-cli", sha256: baselineHash("fixture binary never executed"), mode: 0o755 }] }))
    expect((await verifyBaselineInstallation(bin)).files).toBe(1)
    const manifest = await Bun.file(path.join(root, "cli-manifest.json")).json()
    manifest.files[0].mode = 0o4755
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify(manifest))
    await expect(verifyBaselineInstallation(bin)).rejects.toThrow("CLI_FILE_CHANGED")
    manifest.files[0].mode = 0o755
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify(manifest))
    await Bun.write(bin, "tampered")
    await expect(verifyBaselineInstallation(bin)).rejects.toThrow("CLI_FILE_CHANGED")
    await Bun.write(bin, "fixture binary never executed")
    await Bun.write(path.join(root, "unexpected"), "extra")
    await expect(verifyBaselineInstallation(bin)).rejects.toThrow("CLI_FILE_SET_CHANGED")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("live preparation rejects drift from the agreed product and judge settings before connecting", async () => {
  const role = { checkout: "/fixture/checkout", referenceProfile: "/fixture/reference", evalProfile: "/fixture/eval", workRoots: ["/fixture/work"], resultsRoot: "/fixture/results" }
  const config: NodeOpsConfig = { version: 2, runtimeRoot: "/fixture", endpoint: "http://localhost/app/", container: { name: "fixture", id: "b".repeat(64), storageDir: "/workdir/UserStorage/user" },
    cliBin: "/fixture/old/bin/cli", roles: { rich: role, ben: role, evalbaseline: { ...role, referenceProfile: undefined, cliBin: "/fixture/new/bin/cli" } } }
  await expect(captureBaselinePins(config, { EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_AGENT_VARIANT: "high" })).rejects.toThrow("MODEL_PIN_CHANGED")
  await expect(captureBaselinePins(config, { EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_AGENT_VARIANT: "medium", JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "medium" })).rejects.toThrow("JUDGE_PIN_CHANGED")
  await expect(captureBaselinePins(config, { EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_AGENT_VARIANT: "medium", JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "high", EVAL_JUDGE_COMMAND: "fake-codex" })).rejects.toThrow("JUDGE_OVERRIDE_REFUSED")
})

test("live entry refuses a test-only attempt limit instead of quietly starting a partial baseline", async () => {
  expect(await runBaseline(["start", "--series", "/fixture/series", "--limit", "1"], {})).toMatchObject({ code: 2, reason: "LIVE_LIMIT_REFUSED" })
})

test("prepare freezes a matching operational config before any live admission", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-config-"))
  try {
    const config = { version: 2 } as NodeOpsConfig
    const pins = { ...baselineFixturePins, opsConfigSha256: baselineHash(JSON.stringify(config)) }
    await prepareBaseline(path.join(directory, "series"), { checkout: repoRoot, pins, config })
    expect(await Bun.file(path.join(directory, "series/ops-config.json")).json()).toEqual(config)
    expect((await lstat(path.join(directory, "series/ops-config.json"))).mode & 0o077).toBe(0)
    await expect(prepareBaseline(path.join(directory, "wrong"), { checkout: repoRoot, pins: baselineFixturePins, config })).rejects.toThrow("CONFIG_PIN_CHANGED")
    expect(await Bun.file(path.join(directory, "wrong/manifest.json")).exists()).toBe(false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("separate smoke series check only their own artifact and independent oracle", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-smoke-"))
  try {
    for (const smokeCase of ["calc-data-double", "crosstable-fixed-sum"]) {
      const series = path.join(directory, smokeCase)
      const manifest = await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins, smoke: true, smokeCase })
      const regular = smokeCase === "calc-data-double"
      expect(manifest.jobs).toHaveLength(1)
      expect(manifest.smokeOracle?.expectedCsv).toBe(regular ? "Double\n20\n40\n" : undefined)
      const job = manifest.jobs[0]!
      const admitted = await beginBaselineMeasurement(series, job.key, { checkout: repoRoot, pins: baselineFixturePins })
      const run = path.join(admitted.resultsDir, "fixture")
      await Bun.write(path.join(run, "summary.json"), JSON.stringify({ run_id: job.key, config: { repeat: 1, infra_retries: 0 }, task_ids: [admitted.case.id], storage_leftovers: [],
        tasks: [{ id: admitted.case.id, attempts: [{ task_id: admitted.case.id, attempt: 1, status: regular ? "completed" : "no_artifact", judge_status: regular ? "scored" : "skipped",
          judge_attempts: regular ? 1 : 0, package_path: regular ? "package.lgp" : null, pass: regular, score: regular ? 100 : null,
          environment_cleanup: { status: "confirmed" }, tokens: { input: 0, output: 0, reasoning: 0 }, counters: { toolCalls: 0, toolErrors: 0, memoryToolCalls: 0 }, duration_ms: 1, cost: 0 }] }] }))
      await Bun.write(path.join(run, admitted.case.id, "1/cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: { status: "confirmed" },
        stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
      if (regular) {
        await Bun.write(path.join(run, admitted.case.id, "1/artifact/package.lgp"), await Bun.file(path.join(evalsRoot, "tasks/calc-data-double/reference.lgp")).bytes())
        await Bun.write(path.join(run, admitted.case.id, "1/artifact/results/export.result.csv"), '\uFEFF"Amount";"Double"\r\n10;20\r\n20;40\r\n')
      }
      await recordBaselineMeasurement(series, job.key, run)
      await sealBaselineRelease(series, { status: "RELEASED", evidenceSha256: "5".repeat(64) })
      const report = await checkBaseline(series)
      expect(report.coverage.measured).toBe(1)
      expect(report.status).toBe("incomplete")
      expect(report.smokeVerification).toMatchObject({ verified: false, checks: [regular
        ? { caseKey: "regular:calc-data-double", artifact: true, oracle: { checked: true, passed: true } }
        : { caseKey: "node:crosstable-fixed-sum", artifact: false }] })
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("all 144 fixture measurements retain separate quality axes and become complete only after release", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-full-"))
  try {
    const series = path.join(directory, "series")
    const manifest = await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
    for (const job of manifest.jobs) {
      const dispatched = await beginBaselineMeasurement(series, job.key, { checkout: repoRoot, pins: baselineFixturePins })
      const run = path.join(dispatched.resultsDir, "fixture")
      const id = dispatched.case.id
      await Bun.write(path.join(run, "summary.json"), JSON.stringify({ run_id: job.key, config: { repeat: 1 }, task_ids: [id], storage_leftovers: [],
        tasks: [{ id, attempts: [{ task_id: id, attempt: 1, status: "failed", judge_status: "no_artifact", pass: false, score: 0,
          environment_cleanup: { status: "confirmed" }, tokens: { input: 4, output: 2, reasoning: 0 }, counters: { toolCalls: 0, toolErrors: 0, memoryToolCalls: 0 }, duration_ms: 1, cost: 0 }] }] }))
      await Bun.write(path.join(run, id, "1/cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: { status: "confirmed" },
        stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
      await recordBaselineMeasurement(series, job.key, run)
    }
    const before = await checkBaseline(series)
    expect(before.coverage).toEqual({ expected: 144, recorded: 144, measured: 144, pending: 0, unknown: 0 })
    expect(before.status).toBe("incomplete")
    await sealBaselineRelease(series, { status: "RELEASED", evidenceSha256: "5".repeat(64) })
    const after = await checkBaseline(series)
    expect(after.status).toBe("complete")
    const releasedJournal = await Bun.file(path.join(series, "journal.json")).text()
    await expect(beginBaselineMeasurement(series, manifest.jobs[0]!.key, { checkout: repoRoot, pins: baselineFixturePins })).rejects.toThrow("SERIES_RELEASED")
    expect(await Bun.file(path.join(series, "journal.json")).text()).toBe(releasedJournal)
    expect(after.nodes).toHaveLength(10)
    expect(after.nodes.every(item => item.measured === 3 && item.passed === 0)).toBe(true)
    expect(after.groups.regular?.metrics.total).toBe(9)
    expect(after.groups.analytic?.metrics.total).toBe(105)
    expect((await lstat(path.join(after.rows[0]!.runDir!, "summary.json"))).mode & 0o222).toBe(0)
    await chmod(path.join(after.rows[0]!.runDir!, "summary.json"), 0o600)
    await Bun.write(path.join(after.rows[0]!.runDir!, "summary.json"), "{}")
    await expect(checkBaseline(series)).rejects.toThrow("EVIDENCE_CHANGED")
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 30_000)

test("check writes a separate report without models, admission or changes to stored evidence", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-check-"))
  try {
    const series = path.join(directory, "series")
    await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
    const before = await Bun.file(path.join(series, "journal.json")).text()
    const result = await runBaseline(["check", "--series", series], {})
    expect(result).toMatchObject({ code: 0, status: "incomplete", expected: 144, measured: 0 })
    expect(typeof result.reportDir).toBe("string")
    expect(await Bun.file(path.join(String(result.reportDir), "report.md")).text()).toContain("144")
    expect(await Bun.file(path.join(series, "journal.json")).text()).toBe(before)
    expect((await runBaseline(["start", "--series", series], {})).code).toBe(2)
    await Bun.write(path.join(series, "stand-handle.json"), JSON.stringify({ token: "secret-token" }))
    await Bun.write(path.join(series, "private-history/agent.db"), "secret-history")
    const exported = await runBaseline(["check", "--series", series, "--export"], {})
    expect(exported).toMatchObject({ code: 0 })
    expect(typeof exported.archive).toBe("string")
    const inspected = await Bun.$`python3 ${path.join(evalsRoot, "script/baseline-archive.py")} verify ${String(exported.archive)} ${String(exported.archiveSha256)}`.quiet()
    const names = JSON.parse(inspected.text()).files as string[]
    expect(names).toContain("manifest.json")
    expect(names).not.toContain("stand-handle.json")
    expect(names.some(name => name.endsWith(".db"))).toBe(false)
    expect(await Bun.file(path.join(series, "journal.json")).text()).toBe(before)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("fixture executor resumes pending jobs through the real harness without repeating a saved attempt", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-executor-"))
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
  const verification = { passed: false }
  try {
    const series = path.join(directory, "series")
    await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
    const env = { PATH: Bun.env.PATH, EVAL_BASELINE_FIXTURE: "1", EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "openai/gpt-6.1-sol", EVAL_AGENT_VARIANT: "medium",
      EVAL_PROFILE_DIR: path.join(directory, "profile"), EVAL_WORKSPACE_ROOT: path.join(directory, "work"), EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`,
      LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_API_KEY: "fixture",
      EVAL_AGENT_PROVIDER_ID: "openai", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture", EVAL_AGENT_PROVIDER_MODEL_ID: "model",
      EVAL_JUDGE_COMMAND: `${Bun.which("bun")} ${path.join(evalsRoot, "fixtures/fake-codex.ts")}`, JUDGE_MODEL: "gpt-6-astra", JUDGE_REASONING: "high" }
    const started = await runBaseline(["start", "--series", series, "--limit", "1"], env)
    expect(started).toMatchObject({ code: 0, recorded: 1, measured: 1 })
    const first = (await checkBaseline(series)).rows[0]!.runDir!
    const before = await Bun.file(path.join(first, "summary.json")).text()
    const resumed = await runBaseline(["resume", "--series", series, "--limit", "1"], env)
    expect(resumed).toMatchObject({ code: 0, recorded: 2 })
    expect(await Bun.file(path.join(first, "summary.json")).text()).toBe(before)
    expect((await checkBaseline(series)).rows.filter(row => row.runDir === first)).toHaveLength(1)
    const comparison = await runBaseline(["check", "--series", series, "--compare", series], {})
    expect(comparison).toMatchObject({ code: 0 })
    expect(await Bun.file(path.join(String(comparison.reportDir), "compare-regular.md")).text()).toContain("calc-data-double")
    expect(await Bun.file(path.join(first, "summary.json")).text()).toBe(before)
    verification.passed = true
  } finally {
    server.stop(true)
    if (verification.passed) await rm(directory, { recursive: true, force: true })
    // Preserve the actual cleanup proof if a guard fails; absence cannot diagnose it.
    if (!verification.passed) console.error(`Failed resume fixture retained privately: ${directory}`)
  }
}, 60_000)

test("a recorded product failure is retained while an unknown dispatch or pin drift blocks continuation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-resume-"))
  try {
    const series = path.join(directory, "series")
    const manifest = await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
    const first = manifest.jobs[0]!
    const dispatched = await beginBaselineMeasurement(series, first.key, { checkout: repoRoot, pins: baselineFixturePins })
    const run = path.join(dispatched.resultsDir, "fixture")
    await Bun.write(path.join(run, "summary.json"), JSON.stringify({ run_id: "fixture", config: { repeat: 1 }, task_ids: ["calc-data-double"], storage_leftovers: [],
      tasks: [{ id: "calc-data-double", attempts: [{ task_id: "calc-data-double", attempt: 1, status: "failed", judge_status: "no_artifact", pass: false, score: 0,
        environment_cleanup: { status: "confirmed" }, tokens: { input: 0, output: 0, reasoning: 0 }, counters: { toolCalls: 0, toolErrors: 0, memoryToolCalls: 0 }, duration_ms: 1, cost: 0 }] }] }))
    await Bun.write(path.join(run, "calc-data-double/1/cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: { status: "confirmed" },
      stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
    await recordBaselineMeasurement(series, first.key, run)
    await expect(beginBaselineMeasurement(series, first.key, { checkout: repoRoot, pins: baselineFixturePins })).rejects.toThrow("ALREADY_DISPATCHED")
    const report = await checkBaseline(series)
    expect(report.coverage).toMatchObject({ expected: 144, recorded: 1, measured: 1, pending: 143, unknown: 0 })
    expect(report.status).toBe("incomplete")
    await expect(beginBaselineMeasurement(series, manifest.jobs[1]!.key, { checkout: repoRoot, pins: { ...baselineFixturePins, dockRevision: "changed" } })).rejects.toThrow("PINS_CHANGED")
    await beginBaselineMeasurement(series, manifest.jobs[1]!.key, { checkout: repoRoot, pins: baselineFixturePins })
    expect((await checkBaseline(series)).coverage.unknown).toBe(1)
    await expect(beginBaselineMeasurement(series, manifest.jobs[1]!.key, { checkout: repoRoot, pins: baselineFixturePins })).rejects.toThrow("ALREADY_DISPATCHED")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("judge and infrastructure errors retain retry expenditure and stop admission of the next slot", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "baseline-errors-"))
  try {
    for (const [index, kind] of ["judge", "infrastructure"].entries()) {
      const series = path.join(directory, kind)
      const manifest = await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins })
      const job = manifest.jobs[0]!
      const admitted = await beginBaselineMeasurement(series, job.key, { checkout: repoRoot, pins: baselineFixturePins })
      const run = path.join(admitted.resultsDir, "fixture")
      const initial = { task_id: admitted.case.id, attempt: 1, status: "infra_error", judge_status: "skipped", pass: null, score: null,
        environment_cleanup: { status: "confirmed" }, tokens: { input: 2, output: 1, reasoning: 0 }, counters: { toolCalls: 0, toolErrors: 0, memoryToolCalls: 0 }, duration_ms: 10, cost: 0.01 }
      await Bun.write(path.join(run, "summary.json"), JSON.stringify({ run_id: job.key, config: { repeat: 1 }, task_ids: [admitted.case.id], storage_leftovers: [],
        tasks: [{ id: admitted.case.id, attempts: [{ ...initial, status: index ? "infra_error" : "completed", judge_status: index ? "skipped" : "error", infra_retry: { initial } }] }] }))
      for (const out of ["1", "1/infra-error"]) await Bun.write(path.join(run, admitted.case.id, out, "cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: { status: "confirmed" },
        stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
      await recordBaselineMeasurement(series, job.key, run)
      await expect(beginBaselineMeasurement(series, job.key, { checkout: repoRoot, pins: baselineFixturePins })).rejects.toThrow("ALREADY_DISPATCHED")
      const before = await Bun.file(path.join(series, "journal.json")).text()
      await expect(beginBaselineMeasurement(series, manifest.jobs[1]!.key, { checkout: repoRoot, pins: baselineFixturePins })).rejects.toThrow("AWAITING_RECOVERY")
      expect(await Bun.file(path.join(series, "journal.json")).text()).toBe(before)
      const report = await checkBaseline(series)
      expect(report.coverage).toMatchObject({ measured: 0, recorded: 1, pending: 143, unknown: 0 })
      expect(report.status).toBe("incomplete")
      expect(report.released).toBe(false)
      expect(report.spending).toMatchObject({ duration_ms: 20, cost: 0.02, tokens: { input: 4, output: 2, reasoning: 0 } })
      expect(report.infrastructure).toHaveLength(2)
      await expect(sealBaselineRelease(series, { status: "RELEASED", evidenceSha256: "5".repeat(64) })).rejects.toThrow("AWAITING_RECOVERY")
      expect(await runBaseline(["resume", "--series", series], { EVAL_BASELINE_FIXTURE: "1", EVAL_CLI_MODE: "fake", EVAL_ARTIFACT_SOURCE: "dir:/fixture" }))
        .toMatchObject({ code: 2, status: "AWAITING_RECOVERY", reason: "AWAITING_RECOVERY" })
      expect(await Bun.file(path.join(series, "journal.json")).text()).toBe(before)
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
