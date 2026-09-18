import { expect, test } from "bun:test"
import path from "node:path"
import { rm } from "node:fs/promises"
import { main, stamp } from "../src/run"
import type { RunSummary } from "../src/report"

test("main --dry-run --repeat 2: статусы по фикстурам, попытки в подпапках, summary без судьи", async () => {
  const result = await main(["--dry-run", "--repeat", "2", "--label", "dry"])
  expect(result.code).toBe(0)
  const runDir = result.runDir!
  const summary = (await Bun.file(path.join(runDir, "summary.json")).json()) as RunSummary
  expect(summary.label).toBe("dry")
  expect(summary.config.repeat).toBe(2)
  expect(summary.metrics.total).toBe(6)
  expect(summary.metrics.completed).toBe(2)
  expect(summary.metrics.mean_score).toBeNull()
  expect(summary.judge).toBeNull()
  const byTask = Object.fromEntries(summary.tasks.map((task) => [task.id, task]))
  expect(byTask["group-sum-qty"]!.attempts.map((item) => item.status)).toEqual(["completed", "completed"])
  expect(byTask["group-sum-qty"]!.attempts[0]!.artifact_origin).toBe("receipt")
  expect(byTask["group-sum-qty"]!.attempts[0]!.judge_status).toBe("skipped")
  expect(byTask["filter-active-rows"]!.attempts[0]).toMatchObject({ status: "failed", exit_code: 1, failure_kind: "tool", score: 0, judge_status: "no_artifact" })
  expect(byTask["calc-data-double"]!.attempts[0]).toMatchObject({ status: "no_artifact", score: 0, pass: false })
  expect(await Bun.file(path.join(runDir, "group-sum-qty", "2", "artifact", "package.lgp")).exists()).toBe(true)
  expect(await Bun.file(path.join(runDir, "group-sum-qty", "1", "prompt.txt")).text()).toContain("Сохрани готовый пакет как")
  expect(await Bun.file(path.join(runDir, "report.md")).exists()).toBe(true)
  const config = await Bun.file(path.join(runDir, "config.json")).json()
  expect(config.dock.apiKey).toBe("<unset>")
  await rm(runDir, { recursive: true, force: true })
}, 60_000)

test("stamp: YYYYMMDD-HHmmss", () => {
  expect(stamp(new Date("2026-09-18T12:34:56.789Z"))).toBe("20260918-123456")
})

test("main --dry-run --only: подмножество задач", async () => {
  const result = await main(["--dry-run", "--only", "group-sum-qty"])
  const summary = (await Bun.file(path.join(result.runDir!, "summary.json")).json()) as RunSummary
  expect(summary.task_ids).toEqual(["group-sum-qty"])
  expect(summary.metrics.total).toBe(1)
  await rm(result.runDir!, { recursive: true, force: true })
}, 30_000)
