import { test, expect } from "bun:test"
import { validateLab57EquivalentGuard } from "../src/lab57-guard-provenance"

test("accepted original source and six parent edges bind the legacy guard without synthesizing admission", async () => {
  const original = await Bun.file(new URL("./fixtures/lab57-cleanup-proposal/input.json", import.meta.url)).json()
  const provenance = await Bun.file(new URL("./fixtures/lab57-cleanup-proposal/equivalent-guard.json", import.meta.url)).json()
  expect(validateLab57EquivalentGuard(original, provenance)).toEqual({
    status: "ORIGINAL_GUARD_PROVENANCE_VERIFIED", applied: false,
    originalParentCapture: "NOT_PRESENT", originalHarnessAdmission: "NOT_PRESENT",
    serverCessation: "UNPROVEN", cleanup: "UNCONFIRMED", missing: [],
  })
})
