import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { chmod, cp, mkdir, mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../src/config"
import { runNodeEvals } from "../src/node-runner"
import { campaignTick, type CampaignJournal } from "../script/run-campaign"
import { writeLeaseReceipt } from "../src/lease"
import { agentInputsHash, loadTasks, rubricHash } from "../src/task"


test("fake node FAIL survives summary loss and is accounted once without repeating generation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "node-runner-"))
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok", result: { revision: "fixture" } }) })
  try {
    const tasks = path.join(directory, "tasks")
    const taskDir = path.join(tasks, "crosstable-fixed-sum")
    await cp(path.join(evalsRoot, "tasks/calc-data-double"), taskDir, { recursive: true })
    const raw = await Bun.file(path.join(taskDir, "task.json")).json()
    await Bun.write(path.join(taskDir, "task.json"), JSON.stringify({ ...raw, id: "crosstable-fixed-sum",
      checklist: [{ id: "crosstable", text: "real CrossTable", required: true }] }))
    const env = { EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/model", EVAL_PROFILE_DIR: path.join(directory, "profile"),
      EVAL_RESULTS_DIR: path.join(directory, "results"), EVAL_WORKSPACE_ROOT: path.join(directory, "workspace"),
      EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`, LOGINOM_DOCK_API_KEY: "fixture-key",
      LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
      EVAL_AGENT_PROVIDER_ID: "fake", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture-provider",
      EVAL_AGENT_PROVIDER_MODEL_ID: "model" }
    const result = await runNodeEvals(["--tasks", tasks], env)
    expect(result.code).toBe(1)
    const summary = await Bun.file(path.join(result.runDir!, "summary.json")).json()
    expect(summary.judge).toBeNull()
    expect(summary.config.repeat).toBe(1)
    expect(summary.tasks[0].attempts[0]).toMatchObject({ status: "no_artifact", pass: null, oracle_pass: null })
    expect(await Bun.file(path.join(result.runDir!, "code-verdict.json")).json()).toMatchObject({ verdict: "FAIL", code: 1 })
    expect(await Bun.file(path.join(result.runDir!, "code-report.md")).text()).toContain("FAIL")
    const attempt = path.join(result.runDir!, "crosstable-fixed-sum/1"), resultFile = path.join(attempt, "result.json")
    const original = await Bun.file(resultFile).text()
    const slot = { id: "default", username: "eval-default", profileDir: env.EVAL_PROFILE_DIR,
      workspaceRoot: env.EVAL_WORKSPACE_ROOT, historyDir: env.EVAL_PROFILE_DIR + ".history" }
    const slots = { version: 2, server: { container: "server", studioContainer: "studio", url: "http://127.0.0.1/app/",
      network: "eval", alias: "loginom", storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
      controller: { stateDir: path.join(directory, "controller"), adminCredentialsFile: path.join(directory, "secrets/admin.json") },
      judge: { codexHome: path.join(directory, "judge") }, slots: [slot] }
    await Promise.all([slots.controller.stateDir, path.dirname(slots.controller.adminCredentialsFile), slots.judge.codexHome, slot.workspaceRoot]
      .map(dir => mkdir(dir, { recursive: true, mode: 0o700 })))
    await chmod(slot.workspaceRoot, 0o700)
    const context = { harnessRoot: directory, slotsFile: path.join(directory, "slots.json"),
      corpusPinsFile: path.join(directory, "corpus-pins.json"), corpora: { node: { entrypoint: "src/node-runner.ts", tasks: "tasks" } } }
    await writeLeaseReceipt(slots.controller.adminCredentialsFile, {})
    await writeLeaseReceipt(context.slotsFile, slots)
    const selected = await loadTasks(tasks, ["crosstable-fixed-sum"])
    await writeLeaseReceipt(context.corpusPinsFile, { groups: [{ group: "node", tasks: [{ id: "crosstable-fixed-sum",
      agentInputsHash: await agentInputsHash(selected), rubricHash: await rubricHash(selected) }] }] })
    const cleanup = await Bun.file(path.join(attempt, "cleanup.json")).json()
    await writeLeaseReceipt(path.join(attempt, "cleanup.json"), { ...cleanup, slotId: slot.id, profileDir: slot.profileDir,
      archive: cleanup.stages.find((stage: { stage: string }) => stage.stage === "profile_history").path, serverEpoch: "a".repeat(64),
      processes: { ...cleanup.processes, observation_mode: "continuous", error: null, capture_complete: true, unknownProcesses: [] },
      serverSessions: "confirmed", storageDeletionAllowed: true, nextAdmissionAllowed: true })
    const commandJournal = path.join(directory, "command.json")
    await writeLeaseReceipt(commandJournal, { version: 2, kind: "unactivated-preparation", runDir: result.runDir,
      attempts: [{ taskId: "crosstable-fixed-sum", attempt: 1, purpose: "measurement", completedAt: 1000, completionOrder: 1, quality: false }] })
    const saved = await Bun.file(path.join(result.runDir!, "config.json")).json()
    await writeLeaseReceipt(path.join(result.runDir!, "config.json"), { ...saved, commandJournal })
    await rm(path.join(result.runDir!, "summary.json"))
    const manifest = { id: "node-recovery", server: "runner2", executor: "EvalBaseline", parallel: 1, batchSize: 1,
      keys: [{ corpus: "node", taskId: "crosstable-fixed-sum", round: 1 }], pins: {} }
    const journal: CampaignJournal = { manifestHash: "fixture", server: manifest.server, campaignId: manifest.id, executor: manifest.executor,
      repairing: false, repairer: null, batches: [{ id: "one", keys: manifest.keys, resultsDir: env.EVAL_RESULTS_DIR,
        invocationBefore: "before", started: true }], attempts: [], lastProgressAt: 500, consecutiveErrors: 0 }
    const tick = await campaignTick(manifest, journal, { active: false, invocation: "done", exitCode: 1 }, 2000, context)
    expect(tick.journal.attempts).toMatchObject([{ counted: true, pass: false, score: null }])
    expect(tick.action).toBe("finalize")
    expect(tick.journal.lastProgressAt).toBe(1000)
    const repeated = await campaignTick(manifest, tick.journal, { active: false, invocation: "done", exitCode: 1 }, 3000, context)
    expect(repeated.journal.attempts).toHaveLength(1)
    expect(repeated.journal.startedAttempts).toBe(1)
    expect(repeated.next).toEqual([])
    expect(await Bun.file(resultFile).text()).toBe(original)
  } finally { server.stop(true); await rm(directory, { recursive: true, force: true }) }
}, 60_000)

test("runner отклоняет режимы с судьёй и сохранением live storage до вызова harness", async () => {
  for (const flag of ["--calibrate", "--judge-only", "--keep-storage", "--dry-run", "--reset-profile"]) {
    expect(await runNodeEvals([flag], {})).toMatchObject({ code: 2, runDir: null })
  }
  expect(await runNodeEvals(["--unknown-flag"], {})).toMatchObject({ code: 2, runDir: null })
})

test("node runner CLI: help documents slots and strict parser refuses unknown flags", async () => {
  const script = path.join(evalsRoot, "script/run-node-evals.ts")
  const help = Bun.spawn([process.execPath, script, "--help"], { cwd: evalsRoot, env: { PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" })
  expect(await help.exited).toBe(0)
  const output = await new Response(help.stdout).text()
  expect(output).toContain("--parallel")
  expect(output).toContain("EVAL_SLOTS_FILE")
  await new Response(help.stderr).text()
  const bad = Bun.spawn([process.execPath, script, "--unexpected"], { cwd: evalsRoot, env: { PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" })
  expect(await bad.exited).toBe(2)
  expect(await new Response(bad.stderr).text()).toContain("unexpected")
  await new Response(bad.stdout).text()
})

test("text import diagnostic pipeline completes without a package but does not certify missing refusal evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "import-runner-"))
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ result: { revision: "fixture" } }) })
  try {
    const tasks = path.join(root, "tasks"), id = "txt-ambiguous-headers"
    await cp(path.join(evalsRoot, "drafts/text-import", id), path.join(tasks, id), { recursive: true })
    const result = await runNodeEvals(["--tasks", tasks], { EVAL_CLI_MODE: "fake", EVAL_AGENT_MODEL: "fake/model",
      EVAL_PROFILE_DIR: path.join(root, "profile"), EVAL_RESULTS_DIR: path.join(root, "results"), EVAL_WORKSPACE_ROOT: path.join(root, "work"),
      EVAL_ARTIFACT_SOURCE: `dir:${path.join(evalsRoot, "fixtures/storage")}`, LOGINOM_DOCK_API_KEY: "fixture",
      LOGINOM_URL: `http://127.0.0.1:${server.port}`, LOGINOM_DOCK_BASE_URL: `http://127.0.0.1:${server.port}`,
      EVAL_AGENT_PROVIDER_ID: "fake", EVAL_AGENT_PROVIDER_BASE_URL: "http://fixture", EVAL_AGENT_PROVIDER_API_KEY: "fixture",
      EVAL_AGENT_PROVIDER_MODEL_ID: "model" })
    expect(result.code).toBe(1)
    const summary = await Bun.file(path.join(result.runDir!, "summary.json")).json()
    expect(summary.tasks[0].attempts[0]).toMatchObject({ status: "completed", package_path: null, environment_cleanup: { status: "confirmed" } })
    const verdict = await Bun.file(path.join(result.runDir!, "code-verdict.json")).json()
    expect(verdict).toMatchObject({ verdict: "FAIL", code: 1, errors: [] })
    expect(verdict.failures.join(" ")).toContain("prepare")
    expect(await Bun.file(path.join(result.runDir!, id, "1/native-import.json")).exists()).toBe(true)
  } finally { server.stop(true); await rm(root, { recursive: true, force: true }) }
}, 30000)

test("text import live admission refuses inherited non-Luna model before touching a profile", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "import-model-"))
  try {
    const tasks = path.join(root, "tasks")
    await cp(path.join(evalsRoot, "drafts/text-import/txt-ambiguous-headers"), path.join(tasks, "txt-ambiguous-headers"), { recursive: true })
    const result = await runNodeEvals(["--tasks", tasks], { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/usr/bin/false", EVAL_AGENT_MODEL: "openai/gpt-6.1-sol",
      EVAL_AGENT_VARIANT: "high", LOGINOM_DOCK_API_KEY: "fixture", EVAL_PROFILE_DIR: path.join(root, "profile") })
    expect(result).toMatchObject({ code: 2, runDir: null })
    expect(result.error).toContain("gpt-6-luna/high")
    expect(await Bun.file(path.join(root, "profile.harness-lease/owner.json")).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
