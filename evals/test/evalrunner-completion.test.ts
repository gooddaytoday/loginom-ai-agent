import { expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtemp, mkdir, rm, cp, readFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { evalsRoot } from "../src/config"
import { loadEvalrunnerCorpus, createEvalrunnerManifest, reserveEvalrunnerSeries, admitEvalrunnerSlot, durableEvalrunnerJson, evalrunnerHash } from "../src/evalrunner-series"
import { acquireEvalrunnerSeriesLease, checkEvalrunnerSeries, completeEvalrunnerSlot } from "../src/evalrunner-controller"
import { inspectEvalrunnerSeries } from "../src/evalrunner-series-check"
import { sealEvalrunnerEvidence } from "../src/evalrunner"
import { verifyEvalrunnerModel } from "../src/evalrunner-model"
import { validateNodeRun } from "../src/node-evals"

test("143/144 cannot release; 144 measured quality FAILs with closed model history can complete, and later evidence drift refuses", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-completion-"))
  const config = { root, results: path.join(root, "results"), checkout: path.join(root, "checkout"), profile: path.join(root, "profile") }
  await mkdir(config.results)
  await mkdir(path.join(config.checkout, "evals"), { recursive: true })
  await cp(path.join(evalsRoot, "tasks"), path.join(config.checkout, "evals/tasks"), { recursive: true })
  try {
    const corpus = await loadEvalrunnerCorpus(evalsRoot)
    const pins = { cli: { sourceCommit: "a".repeat(40), version: "0.2.0" }, binarySha256: "b".repeat(64), imageDigest: "sha256:" + "c".repeat(64), harnessSha: "d".repeat(40) }
    const manifest = createEvalrunnerManifest({ issue: "LAB-77", task: "fixture", scope: "full", pins, corpus, series: path.join(config.results, "v02-full-LAB-77") })
    await reserveEvalrunnerSeries(config, manifest)
    const lease = await acquireEvalrunnerSeriesLease(config, manifest)
    for (const [index, slot] of manifest.slots.entries()) {
      const selected = await admitEvalrunnerSlot(config, manifest, slot, "fixture")
      const run = path.join(selected, "runs/one"), attempt = path.join(run, slot.case, "1")
      const archive = config.profile + ".history/" + slot.id, session = "fixture-session-" + index
      await mkdir(attempt, { recursive: true })
      await mkdir(path.join(archive, "data"), { recursive: true, mode: 0o700 })
      const db = new Database(path.join(archive, "data/loginom-ai-agent.db"), { create: true })
      db.exec("CREATE TABLE message(id TEXT, session_id TEXT, data TEXT)")
      db.query("INSERT INTO message VALUES(?,?,?)").run("assistant", session, JSON.stringify({ role: "assistant", providerID: "openai", modelID: "gpt-6.1-sol", variant: "medium" }))
      db.close()
      const cleanup = { result: { status: "confirmed" }, processes: { status: "confirmed", observation_mode: "continuous", capture_complete: true, unknownProcesses: [],
        verification: [{ owned_remaining: 0 }, { owned_remaining: 0 }] }, stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"]
        .map(stage => ({ stage, status: "confirmed", ...(stage === "profile_history" ? { path: archive } : {}) })) }
      await durableEvalrunnerJson(path.join(attempt, "cleanup.json"), cleanup)
      const node = slot.collection === "node"
      const result = { attempt: 1, task_id: slot.case, status: "no_artifact", judge_status: node ? "skipped" : "no_artifact", score: node ? null : 0, pass: node ? null : false,
        session_id: session, environment_cleanup: { status: "confirmed" }, duration_ms: 1, tokens: { input: 1, output: 1, reasoning: 0 }, checklist: null }
      const summary = { run_id: "fixture", started_at: "2026-10-15T00:00:00Z", finished_at: "2026-10-15T00:00:01Z", interrupted: false, stopped_reason: null, storage_leftovers: [],
        config: { repeat: 1, infra_retries: 0, timeout_ms: 1_800_000, judge_timeout_ms: 300_000, pass_threshold: 70, keep_storage: false },
        harness: { git_sha: pins.harnessSha.slice(0, 9), dirty: false },
        agent: { cli_mode: "binary", cli_version: pins.cli.version, model: "openai/gpt-6.1-sol", variant: "medium", source_dirty: false, source_commit: pins.cli.sourceCommit, binary_sha256: pins.binarySha256 },
        judge: node ? null : { model: "gpt-6-sol", reasoning: "xhigh" }, loginom: { image_digest: pins.imageDigest }, task_ids: [slot.case], tasks: [{ id: slot.case, attempts: [result] }] }
      await durableEvalrunnerJson(path.join(run, "summary.json"), summary)
      if (node) {
        const code = await validateNodeRun(run, [slot.case], path.join(config.checkout, "evals/tasks/node-evals"))
        expect(code.code).toBe(1)
        await durableEvalrunnerJson(path.join(run, "code-verdict.json"), code)
      }
      await durableEvalrunnerJson(path.join(selected, "release.json"), { status: "RELEASED", verdict: "FAIL", code: node ? 1 : 0, case: slot.case, runDir: run, sessionId: session,
        summarySha256: evalrunnerHash(await Bun.file(path.join(run, "summary.json")).bytes()), evidence: await sealEvalrunnerEvidence(selected) })
      if (index === 0) {
        const releaseHash = evalrunnerHash(await Bun.file(path.join(selected, "release.json")).bytes())
        expect(await inspectEvalrunnerSeries(config, manifest.series)).toMatchObject({ status: "BLOCKED", completed: 0 })
        await completeEvalrunnerSlot(config, manifest, slot)
        expect((await inspectEvalrunnerSeries(config, manifest.series)).completed).toBe(1)
        expect(evalrunnerHash(await Bun.file(path.join(selected, "release.json")).bytes())).toBe(releaseHash)
        expect(await Bun.file(path.join(selected, "dispatch.json")).exists()).toBe(false)
      } else {
        const model = await verifyEvalrunnerModel(config, { sessionId: session, cleanupFile: path.join(attempt, "cleanup.json") })
        await durableEvalrunnerJson(path.join(manifest.series, "completions", slot.id + ".json"), { model, releaseSha256: evalrunnerHash(await Bun.file(path.join(selected, "release.json")).bytes()) })
      }
      if (index === 142) {
        expect(await inspectEvalrunnerSeries(config, manifest.series)).toMatchObject({ status: "READY", completed: 143, expected: 144 })
        await expect(lease.release()).rejects.toThrow("Series coverage unconfirmed")
        await durableEvalrunnerJson(path.join(manifest.series, "release.json"), { status: "RELEASED", completed: 144, expected: 144 })
        await expect(checkEvalrunnerSeries(config, manifest.series)).rejects.toThrow("Incomplete series")
        await rm(path.join(manifest.series, "release.json"))
      }
    }
    expect(await inspectEvalrunnerSeries(config, manifest.series)).toMatchObject({ status: "COMPLETE", completed: 144 })
    await lease.release()
    await durableEvalrunnerJson(path.join(manifest.series, "release.json"), { status: "RELEASED", completed: 144, expected: 144, evidence: await sealEvalrunnerEvidence(manifest.series) })
    expect(await checkEvalrunnerSeries(config, manifest.series)).toMatchObject({ status: "RELEASED", completed: 144 })
    const taskFile = path.join(config.checkout, "evals/tasks/calc-data-double/task.json")
    const originalTask = await readFile(taskFile), task = JSON.parse(originalTask.toString())
    const inputFile = path.join(path.dirname(taskFile), task.inputs[0]), originalInput = await readFile(inputFile)
    await Bun.write(inputFile, Buffer.concat([originalInput, Buffer.from("\nfixture drift")]))
    await expect(checkEvalrunnerSeries(config, manifest.series)).rejects.toThrow("Corpus changed")
    await Bun.write(inputFile, originalInput)
    task.checklist[0].text += " fixture rubric drift"
    await Bun.write(taskFile, JSON.stringify(task))
    await expect(checkEvalrunnerSeries(config, manifest.series)).rejects.toThrow("Corpus changed")
    await Bun.write(taskFile, originalTask)
    await Bun.write(path.join(manifest.series, "slots", manifest.slots[0]!.id, "runs/one/summary.json"), "changed")
    await expect(checkEvalrunnerSeries(config, manifest.series)).rejects.toThrow("Incomplete series")
  } finally { await rm(root, { recursive: true, force: true }) }
}, 180_000)
