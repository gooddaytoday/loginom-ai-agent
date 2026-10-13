import { expect, test } from "bun:test"
import { selectionAttempt } from "../script/run-node-selection-attempt"

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
