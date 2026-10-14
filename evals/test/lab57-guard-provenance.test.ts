import { test, expect } from "bun:test"
import { validateLab57EquivalentGuard } from "../src/lab57-guard-provenance"

test("accepted original source and six parent edges bind the legacy guard without synthesizing admission", async () => {
  const original = await Bun.file(new URL("./fixtures/lab57-cleanup-proposal/input.json", import.meta.url)).json()
  original.guardEntries = ["owner.json"]
  const provenance = await Bun.file(new URL("./fixtures/lab57-cleanup-proposal/equivalent-guard.json", import.meta.url)).json()
  expect(validateLab57EquivalentGuard(original, provenance)).toEqual({
    status: "ORIGINAL_GUARD_PROVENANCE_VERIFIED", applied: false,
    originalParentCapture: "NOT_PRESENT", originalHarnessAdmission: "NOT_PRESENT",
    serverCessation: "UNPROVEN", cleanup: "UNCONFIRMED", missing: [],
  })
})

test("unknown files in the legacy guard are refused even when owner bytes are unchanged", async () => {
  const original = await Bun.file(new URL("./fixtures/lab57-cleanup-proposal/input.json", import.meta.url)).json()
  const provenance = await Bun.file(new URL("./fixtures/lab57-cleanup-proposal/equivalent-guard.json", import.meta.url)).json()
  original.guardEntries = ["owner.json", "foreign-owner.json"]
  expect(validateLab57EquivalentGuard(original, provenance).missing).toContain("GUARD_INVENTORY_CHANGED")
})

const fixture = async () => ({
  original: { ...await Bun.file(new URL("./fixtures/lab57-cleanup-proposal/input.json", import.meta.url)).json(), guardEntries: ["owner.json"] },
  provenance: await Bun.file(new URL("./fixtures/lab57-cleanup-proposal/equivalent-guard.json", import.meta.url)).json(),
})

for (const [section, field] of [
  ["guardCurrentBirth", "pid"], ["guardCurrentBirth", "uid"], ["guardCurrentBirth", "starttime"],
  ["guard", "device"], ["guard", "inode"], ["guard", "ctimeNs"], ["guard", "mtimeNs"], ["guard", "mode"], ["guard", "uid"],
  ["guardOwner", "sha256"], ["guardOwner", "inode"], ["guardOwner", "ctimeNs"], ["guardOwner", "size"],
  ["registration", "path"], ["registration", "sha256"], ["registration", "ctimeNs"],
  ["binding", "configSha256"], ["binding", "task"], ["binding", "role"], ["binding", "sha"],
] as const) test(`closed guard refuses changed ${section}.${field}`, async () => {
  const { original, provenance } = await fixture()
  original[section][field] = "changed"
  expect(validateLab57EquivalentGuard(original, provenance).status).toBe("ORIGINAL_GUARD_PROVENANCE_REFUSED")
})

for (const file of ["evals/script/run-node-evals.ts", "evals/src/node-runner.ts", "evals/src/run.ts", "evals/src/node-eval-ops.ts", "evals/src/lease.ts"])
  test(`closed guard refuses replaced or changed exclusive producer ${file}`, async () => {
    const { original, provenance } = await fixture()
    provenance.sources[file] = provenance.sources[file].replace("await", "void")
    expect(validateLab57EquivalentGuard(original, provenance).missing).toContain(`FROZEN_PRODUCER_CHANGED:${file}`)
  })

for (const id of ["csv-comma-utf8", "csv-pipe-multiline", "tsv-utf16le", "tsv-utf8", "txt-comma-utf8", "txt-semicolon-cp1251-decimal"])
  test(`closed guard refuses a mismatched parent in ${id}`, async () => {
    const { original, provenance } = await fixture()
    const proof = JSON.parse(provenance.captures[id])
    proof.processes.processes[0].parent = 2126566
    provenance.captures[id] = JSON.stringify(proof)
    expect(validateLab57EquivalentGuard(original, provenance).missing).toContain(`ORIGINAL_PARENT_EDGE_CHANGED:${id}`)
  })

for (const file of ["summary.json", "code-verdict.json", "txt-semicolon-cp1251-decimal/1/cleanup.json", "txt-semicolon-cp1251-decimal/1/result.json", "txt-semicolon-cp1251-decimal/1/run.json"])
  test(`closed guard refuses modified raw original ${file}`, async () => {
    const { original, provenance } = await fixture()
    original.source[file] += " "
    expect(validateLab57EquivalentGuard(original, provenance).missing).toContain(`SOURCE_BYTES_CHANGED:${file}`)
  })

test("closed guard refuses a newly declared or timestamp-only provenance", async () => {
  const { original } = await fixture()
  const proof = validateLab57EquivalentGuard(original, { binding: { accepted: true, createdAt: new Date().toISOString() }, sources: {}, captures: {} })
  expect(proof.status).toBe("ORIGINAL_GUARD_PROVENANCE_REFUSED")
  expect(proof.missing.length).toBeGreaterThan(5)
})

test("closed guard refuses to synthesize either missing original record", async () => {
  const { original, provenance } = await fixture()
  original.guardAdmission = { verified: true }
  original.guardParentCapture = { kind: "preserved-original-parent-capture" }
  const proof = validateLab57EquivalentGuard(original, provenance)
  expect(proof.missing).toContain("SYNTHESIZED_HARNESS_ADMISSION_REFUSED")
  expect(proof.missing).toContain("SYNTHESIZED_PARENT_CAPTURE_REFUSED")
})

test("closed guard refuses changed original product command and foreign profile", async () => {
  const { original, provenance } = await fixture()
  original.profile = "/foreign/eval-profile"
  provenance.command += " "
  const proof = validateLab57EquivalentGuard(original, provenance)
  expect(proof.missing).toContain("PROFILE_PATH_CHANGED")
  expect(proof.missing).toContain("ORIGINAL_COMMAND_CHANGED")
})

test("source provenance CLI rejects an apply request before reading files", async () => {
  const child = Bun.spawn([process.execPath, new URL("../script/check-lab57-guard-provenance.ts", import.meta.url).pathname,
    "--apply", "/unavailable/original", "/unavailable/provenance"], { stdout: "pipe", stderr: "pipe" })
  const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()])
  expect(code).toBe(2)
  expect(JSON.parse(stdout)).toEqual({ status: "SOURCE_ONLY", applied: false, reason: "MUTATION_NOT_IMPLEMENTED" })
})
