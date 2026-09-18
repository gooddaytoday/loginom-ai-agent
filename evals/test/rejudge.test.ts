import { expect, test } from "bun:test"
import path from "node:path"
import { rm } from "node:fs/promises"
import { main } from "../src/run"
import { evalsRoot } from "../src/config"
import type { RunSummary } from "../src/report"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

test("--judge-only: пересуживает попытки с артефактом, сохраняет prev, не трогает остальные", async () => {
  const originalModel = process.env.JUDGE_MODEL
  const originalCommand = process.env.EVAL_JUDGE_COMMAND
  process.env.JUDGE_MODEL = "fake"
  process.env.EVAL_JUDGE_COMMAND = fakeJudge
  let runDir: string | undefined
  try {
    const dry = await main(["--dry-run", "--repeat", "1"])
    runDir = dry.runDir
    const runId = path.basename(dry.runDir!)
    const result = await main(["--judge-only", runId])
    expect(result.code).toBe(0)
    const summary = (await Bun.file(path.join(dry.runDir!, "summary.json")).json()) as RunSummary
    expect(summary.judge?.model).toBe("fake")
    const byTask = Object.fromEntries(summary.tasks.map((task) => [task.id, task]))
    expect(byTask["group-sum-qty"]!.attempts[0]).toMatchObject({ status: "completed", score: 100, judge_status: "scored" })
    expect(byTask["calc-data-double"]!.attempts[0]).toMatchObject({ status: "no_artifact", score: 0, judge_status: "no_artifact" })
    expect(summary.metrics.mean_score).toBeCloseTo(33.3, 0)
    expect(await Bun.file(path.join(dry.runDir!, "summary.prev.json")).exists()).toBe(true)
  } finally {
    if (originalModel === undefined) delete process.env.JUDGE_MODEL
    else process.env.JUDGE_MODEL = originalModel
    if (originalCommand === undefined) delete process.env.EVAL_JUDGE_COMMAND
    else process.env.EVAL_JUDGE_COMMAND = originalCommand
    if (runDir) await rm(runDir, { recursive: true, force: true })
  }
}, 90_000)
