import { expect, test } from "bun:test"
import { selectionAttempt } from "../script/run-node-selection-attempt"

test("an attempt cannot escape the pinned task through its identifier", () => {
  expect(() => selectionAttempt({}, "../foreign-task", 1)).toThrow("SELECTION_TASK_INVALID")
})
