import { expect, test } from "bun:test"
import path from "node:path"
import { rm } from "node:fs/promises"
import { main } from "../src/run"
import { evalsRoot } from "../src/config"

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

test("--calibrate: positive/negative для каждой задачи, предупреждение когда negative слишком высок", async () => {
  const originalModel = process.env.JUDGE_MODEL
  const originalCommand = process.env.EVAL_JUDGE_COMMAND
  const originalVerdict = process.env.FAKE_CODEX_VERDICT
  const originalExit = process.env.FAKE_CODEX_EXIT
  const originalFlaky = process.env.FAKE_CODEX_FLAKY_MARKER
  process.env.JUDGE_MODEL = "fake"
  process.env.EVAL_JUDGE_COMMAND = fakeJudge
  delete process.env.FAKE_CODEX_VERDICT
  delete process.env.FAKE_CODEX_EXIT
  delete process.env.FAKE_CODEX_FLAKY_MARKER
  let runDir: string | undefined
  try {
    const result = await main(["--calibrate"])
    runDir = result.runDir
    expect(result.code).toBe(0)
    const calibration = await Bun.file(path.join(result.runDir, "calibration.json")).json()
    expect(calibration.rows).toHaveLength(6)
    expect(calibration.rows.filter((row: { kind: string }) => row.kind === "positive").every((row: { score: number }) => row.score === 100)).toBe(true)
    // fake-судья ставит 100 всем, поэтому negative выше порога 40 — три предупреждения
    expect(calibration.warnings).toHaveLength(3)
    expect(await Bun.file(path.join(result.runDir, "calibration.md")).exists()).toBe(true)
    expect(await Bun.file(path.join(result.runDir, "summary.json")).exists()).toBe(false)
    expect(await Bun.file(path.join(result.runDir, "group-sum-qty", "positive", "judge", "checklist.json")).json()).not.toContainEqual(expect.objectContaining({ id: "result-rows" }))
  } finally {
    if (originalModel === undefined) delete process.env.JUDGE_MODEL
    else process.env.JUDGE_MODEL = originalModel
    if (originalCommand === undefined) delete process.env.EVAL_JUDGE_COMMAND
    else process.env.EVAL_JUDGE_COMMAND = originalCommand
    if (originalVerdict === undefined) delete process.env.FAKE_CODEX_VERDICT
    else process.env.FAKE_CODEX_VERDICT = originalVerdict
    if (originalExit === undefined) delete process.env.FAKE_CODEX_EXIT
    else process.env.FAKE_CODEX_EXIT = originalExit
    if (originalFlaky === undefined) delete process.env.FAKE_CODEX_FLAKY_MARKER
    else process.env.FAKE_CODEX_FLAKY_MARKER = originalFlaky
    if (runDir) await rm(runDir, { recursive: true, force: true })
  }
}, 120_000)
