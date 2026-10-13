import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { reserveAttempt, runSelectionAttempt, selectionAttempt } from "../script/run-node-selection-attempt"

test("an attempt cannot escape the pinned task through its identifier", () => {
  expect(() => selectionAttempt({}, "../foreign-task", 1)).toThrow("SELECTION_TASK_INVALID")
})

test("a pinned slot derives the same owned paths without exposing oracle to the workspace", () => {
  const result = selectionAttempt(pins(), "sales-by-category", 2)
  expect(result.directory).toBe("/tmp/selection-results/baseline/sales-by-category/2")
  expect(result.workspace).toBe("/tmp/selection-inputs/local-1/baseline/sales-by-category/2")
  expect(result.packagePath).toBe("/user/node-selection-local-1-sales-by-category-baseline-2.lgp")
  expect(result.resultName).toBe("node-selection-local-1-sales-by-category-baseline-2.result.csv")
})

test("unsafe or incomplete pins are rejected before any CLI or filesystem work", () => {
  for (const change of [
    { phase: "../other" }, { runID: "../other" }, { resultsRoot: "relative" },
    { workspaceRoot: "/tmp/selection-profile" }, { manifestSha256: "unknown" },
    { connection: { url: "http://user:secret@localhost/", username: "user", folder: "/user" } },
    { storageDir: "/workdir/UserStorage/other" }, { deadlineSeconds: 0 },
    { container: { id: "loginom-server", name: "loginom-server" } },
  ]) expect(() => selectionAttempt({ ...pins(), ...change }, "sales-by-category", 1)).toThrow("SELECTION_PINS_INVALID")
})

test("the verified local Docker container name may contain version dots", () => {
  const input = pins()
  input.container.name = "loginom-server-7.4.2-test"
  expect(selectionAttempt(input, "sales-by-category", 1).pins.container.name).toBe("loginom-server-7.4.2-test")
})

test("reserving an existing slot refuses a rerun and preserves its evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-attempt-test-"))
  try {
    const plan = selectionAttempt({ ...pins(), resultsRoot: path.join(root, "results"), workspaceRoot: path.join(root, "inputs") }, "sales-by-category", 1)
    await reserveAttempt(plan)
    await Bun.write(path.join(plan.directory, "sentinel.txt"), "original evidence")
    await expect(reserveAttempt(plan)).rejects.toThrow("SELECTION_SLOT_EXISTS")
    expect(await Bun.file(path.join(plan.directory, "sentinel.txt")).text()).toBe("original evidence")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("failed payload preflight preserves an incident and does not consume the model slot", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selection-preflight-test-"))
  try {
    const value = { ...pins(), resultsRoot: path.join(root, "results"), workspaceRoot: path.join(root, "inputs"), payload: path.join(root, "payload") }
    await Bun.write(path.join(value.payload, "cli-manifest.json"), "changed payload")
    const file = path.join(root, "pins.json")
    await Bun.write(file, JSON.stringify(value))
    const result = await runSelectionAttempt(file, "sales-by-category", 1)
    expect(result.exitCode).toBe(3)
    expect(result.modelStarted).toBe(false)
    expect(result.blocker).toBe("SELECTION_MANIFEST_MISMATCH")
    expect(result.evidence).toContain("/incidents/")
    expect((await Bun.file(path.join(result.evidence, "attempt.json")).json()).modelStarted).toBe(false)
    expect(await Bun.file(path.join(value.resultsRoot, "baseline/sales-by-category/1/attempt.json")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function pins() {
  return {
    runID: "local-1", phase: "baseline", resultsRoot: "/tmp/selection-results",
    workspaceRoot: "/tmp/selection-inputs", payload: "/tmp/selection-payload", profile: "/tmp/selection-profile",
    manifestSha256: "a".repeat(64), expectedSkillDigest: "b".repeat(64),
    model: "openai/gpt-6-sol-fast", variant: "medium", frozenModelsPath: "/tmp/models.json",
    frozenModelsSha256: "c".repeat(64), deadlineSeconds: 1800, graceSeconds: 90,
    connection: { url: "http://localhost/", username: "user", folder: "/user" },
    container: { id: "d".repeat(64), name: "loginom-server" }, storageDir: "/workdir/UserStorage/user",
    tasks: { "sales-by-category": {
      directory: "/tmp/tasks/sales-by-category", mode: "standard", attempts: [1, 2, 3],
      promptSha256: "e".repeat(64), inputHashes: { "data/dataset.csv": "f".repeat(64) }, oracleSha256: "0".repeat(64),
    } },
  }
}
