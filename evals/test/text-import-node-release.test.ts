import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { validateNodeRun } from "../src/node-evals"

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

// These are offline control-flow fixtures, never live completion/cleanup proofs.
async function fixture(id = "txt-comma-utf8", status = "no_artifact") {
  const root = await mkdtemp(path.join(os.tmpdir(), "text-release-unit-"))
  directories.push(root)
  const run = path.join(root, "run")
  const tasks = path.join(root, "tasks")
  const summary = { config: { repeat: 1 }, storage_leftovers: [],
    tasks: [{ id, attempts: [{ attempt: 1, status, environment_cleanup: { status: "confirmed" } }] }] }
  const task = { id, checklist: [{ id: "input", required: true }, { id: "import", required: true }] }
  const cleanup = { result: { status: "confirmed" }, processes: { status: "confirmed" },
    stages: ["processes", "diagnostics", "writer", "ready", "profile_history"].map(stage => ({ stage, status: "confirmed" })) }
  await Bun.write(path.join(run, "summary.json"), JSON.stringify(summary))
  await Bun.write(path.join(tasks, id, "task.json"), JSON.stringify(task))
  await Bun.write(path.join(run, id, "1", "cleanup.json"), JSON.stringify(cleanup))
  return { run, tasks, id, summary, task, cleanup }
}

describe("ordinary node-run quality gate includes text-import tasks", () => {
  test("text no-artifact remains a quality FAIL eligible for ordinary verification", async () => {
    const f = await fixture()
    expect(await validateNodeRun(f.run, [f.id], f.tasks)).toMatchObject({
      code: 1, verdict: "FAIL", errors: [], failures: ["txt-comma-utf8#1: no_artifact"],
    })
  })

  test("all six pilot IDs retain the import checklist gate", async () => {
    for (const id of ["txt-comma-utf8", "csv-comma-utf8", "txt-semicolon-cp1251-decimal", "csv-pipe-multiline", "tsv-utf8", "tsv-utf16le"]) {
      const f = await fixture(id)
      expect((await validateNodeRun(f.run, [id], f.tasks)).errors).toEqual([])
    }
  })

  test("completed text task still requires the full native receipt checker", async () => {
    const f = await fixture("csv-comma-utf8", "completed")
    await Bun.write(path.join(f.tasks, f.id, "SPEC.json"), JSON.stringify({ id:f.id, inputs:[] }))
    const result = await validateNodeRun(f.run, [f.id], f.tasks)
    expect(result.code).toBe(1)
    expect(result.errors).toEqual([])
    expect(result.failures.join(" ")).toContain("events.jsonl")
  })

  test("unknown case ID remains ERROR", async () => {
    const f = await fixture("txt-foreign-case")
    expect((await validateNodeRun(f.run, [f.id], f.tasks)).code).toBe(2)
  })

  test("unknown required checklist gate remains ERROR", async () => {
    const f = await fixture()
    f.task.checklist.push({ id:"foreign", required:true })
    await Bun.write(path.join(f.tasks, f.id, "task.json"), JSON.stringify(f.task))
    expect((await validateNodeRun(f.run, [f.id], f.tasks)).errors.join(" ")).toContain("unknown required ID: foreign")
  })

  test("repeat count and duplicate IDs remain ERROR", async () => {
    const f = await fixture()
    f.summary.config.repeat = 2
    await Bun.write(path.join(f.run, "summary.json"), JSON.stringify(f.summary))
    expect((await validateNodeRun(f.run, [f.id], f.tasks)).code).toBe(2)
    expect((await validateNodeRun(f.run, [f.id, f.id], f.tasks)).code).toBe(2)
  })

  test("unknown cleanup remains ERROR", async () => {
    const f = await fixture()
    f.cleanup.result.status = "unknown"
    await Bun.write(path.join(f.run, f.id, "1", "cleanup.json"), JSON.stringify(f.cleanup))
    expect((await validateNodeRun(f.run, [f.id], f.tasks)).errors.join(" ")).toContain("cleanup evidence unconfirmed")
  })

  test("unit cleanup cannot substitute for a real run", async () => {
    const f = await fixture()
    await Bun.write(path.join(f.run, f.id, "1", "cleanup.json"), JSON.stringify({ ...f.cleanup,
      processes:{ status:"confirmed", observation_mode:"unit_after_exit" } }))
    expect((await validateNodeRun(f.run, [f.id], f.tasks)).errors.join(" ")).toContain("unit_after_exit")
  })

  test("storage leftovers and missing inventory remain ERROR", async () => {
    const f = await fixture()
    for (const storage_leftovers of [null, ["foreign.lgp"]]) {
      await Bun.write(path.join(f.run, "summary.json"), JSON.stringify({ ...f.summary, storage_leftovers }))
      expect((await validateNodeRun(f.run, [f.id], f.tasks)).errors).toContain("storage cleanup unconfirmed")
    }
  })

  test("existing crosstable quality path is preserved", async () => {
    const f = await fixture("crosstable-fixed-sum")
    f.task.checklist = [{ id:"crosstable", required:true }]
    await Bun.write(path.join(f.tasks, f.id, "task.json"), JSON.stringify(f.task))
    expect(await validateNodeRun(f.run, [f.id], f.tasks)).toMatchObject({ code:1, errors:[], verdict:"FAIL" })
  })
})
