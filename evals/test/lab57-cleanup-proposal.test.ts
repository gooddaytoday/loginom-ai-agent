import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { prepareLab57CleanupProposal } from "../src/lab57-cleanup-proposal"

async function fixture() {
  return JSON.parse(await readFile(new URL("./fixtures/lab57-cleanup-proposal/input.json", import.meta.url), "utf8"))
}

test("LAB57: a current legacy guard birth cannot substitute for captured admission", async () => {
  const input = JSON.parse(await readFile(new URL("./fixtures/lab57-cleanup-proposal/input.json", import.meta.url), "utf8"))
  const result = prepareLab57CleanupProposal(input)
  expect(result.status).toBe("PREPARED")
  expect(result.applied).toBe(false)
  expect(result.readiness).toBe("NOT_READY")
  expect(result.missing).toContain("LEGACY_GUARD_PARENT_BIRTH_UNCAPTURED")
})

test("LAB57: preparation reports every missing operator prerequisite without granting effects", async () => {
  const result = prepareLab57CleanupProposal(await fixture())
  expect(result.missing).toContain("SERVER_CESSATION_UNPROVEN")
  expect(result.missing).toContain("FRESH_OPERATOR_GUARDS_REQUIRED")
  expect(result.applied).toBe(false)
})
