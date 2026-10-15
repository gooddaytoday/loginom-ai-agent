import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { compareContainerIdentity } from "../src/container-comparison"

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function series(containerId: string, records: unknown[] = [{ target: { loginom_build: "7.4.2" } }]) {
  const runDir = await mkdtemp(path.join(os.tmpdir(), "container-comparison-"))
  directories.push(runDir)
  const file = "calc-data-double/1/diagnostics/1-execution-events.jsonl"
  const bytes = records.map(record => JSON.stringify(record)).join("\n") + "\n"
  await Bun.write(path.join(runDir, file), bytes)
  return { containerId, executions: [{ key: "regular:calc-data-double:1", kind: "product" as const,
    record: { runDir, files: [{ path: file, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") }] } }] }
}

test("different container IDs compare using exact observed Loginom versions from registered journals", async () => {
  const before = await series("container-a")
  const after = await series("container-b")
  expect(await compareContainerIdentity(before, after)).toMatchObject({ compatible: true, basis: "loginom-version",
    before: { containerId: "container-a", version: "7.4.2", evidence: [{ execution: before.executions[0]!.key,
      runDir: before.executions[0]!.record.runDir, ...before.executions[0]!.record.files[0] }] },
    after: { containerId: "container-b", version: "7.4.2" } })
})

test("conflicting observed versions in one journal reject the container exception", async () => {
  const before = await series("container-a", [{ target: { loginom_build: "7.4.2" } }, { target: { loginom_build: "7.4.3" } }])
  expect(await compareContainerIdentity(before, await series("container-b"))).toMatchObject({ compatible: false,
    before: { version: null, error: "conflicting_versions" } })
})

test.each(["", "  ", "[redacted]", "7.4.2[REDACTED]", 742])("invalid actual version %p cannot establish equality", async version => {
  const before = await series("container-a", [{ target: { loginom_build: "7.4.2" } }, { target: { loginom_build: version } }])
  expect(await compareContainerIdentity(before, await series("container-b"))).toMatchObject({ compatible: false,
    before: { version: null, error: "invalid_version" } })
})

test.each([742, null, [], { target: [] }, { target: "7.4.2" }].map(record => ({ record })))("malformed journal record %p cannot be hidden alongside a known version", async item => {
  expect(await compareContainerIdentity(await series("a", [{ target: { loginom_build: "7.4.2" } }, item.record]), await series("b")))
    .toMatchObject({ compatible: false, before: { error: "invalid_journal" } })
})

test("the same container ID preserves legacy behavior without reading version evidence", async () => {
  const before = await series("same")
  before.executions[0]!.record.files[0]!.sha256 = "0".repeat(64)
  expect(await compareContainerIdentity(before, { containerId: "same", executions: [] }))
    .toMatchObject({ compatible: true, basis: "container-id", before: { version: null, evidence: [] } })
})

test.each(["7.4.3", "7.4.2-build1", " 7.4.2", "7.4.2 "])("version %p does not match 7.4.2 by normalization", async version => {
  expect(await compareContainerIdentity(await series("a"), await series("b", [{ target: { loginom_build: version } }])))
    .toMatchObject({ compatible: false, basis: null })
})

test("missing journals and unknown versions on either side fail closed", async () => {
  const known = await series("a")
  const missing = { containerId: "b", executions: [] }
  for (const pair of [[known, missing], [missing, known], [missing, { ...missing, containerId: "c" }]] as const)
    expect(await compareContainerIdentity(pair[0], pair[1])).toMatchObject({ compatible: false })
  expect(await compareContainerIdentity(known, await series("b", [{ target: null }, { target: { loginom_build: null } }])))
    .toMatchObject({ compatible: false, after: { error: "missing_version" } })
})

test("expected compatibility versions, nested tool output and unregistered journals are not evidence", async () => {
  expect(await compareContainerIdentity(await series("a"), await series("b", [{
    compatibilityProfile: { loginom_build: "7.4.2" }, tool_output: { target: { loginom_build: "7.4.2" } }, expectedBuild: "7.4.2",
  }]))).toMatchObject({ compatible: false, after: { error: "missing_version" } })
  const unregistered = await series("b")
  unregistered.executions[0]!.record.files = []
  expect(await compareContainerIdentity(await series("a"), unregistered)).toMatchObject({ compatible: false })
})

test("a series can establish its version after an early attempt without observations and a judge-only recovery", async () => {
  const before = await series("a", [{ target: null }])
  const later = await series("a")
  before.executions.push(...later.executions)
  const judge = await series("a", [{ target: { loginom_build: "other" } }])
  expect(await compareContainerIdentity({ ...before, executions: [...before.executions, { ...judge.executions[0]!, kind: "judge" }] }, await series("b")))
    .toMatchObject({ compatible: true, before: { version: "7.4.2" } })
})

test("infra-error journals and previous product recoveries cannot hide conflicting observations", async () => {
  const before = await series("a")
  const recovery = await series("a", [{ target: { loginom_build: "7.4.3" } }])
  before.executions.push(...recovery.executions)
  expect(await compareContainerIdentity(before, await series("b"))).toMatchObject({ compatible: false, before: { error: "conflicting_versions" } })
  const file = recovery.executions[0]!.record.files[0]!
  const bytes = await Bun.file(path.join(recovery.executions[0]!.record.runDir, file.path)).bytes()
  file.path = file.path.replace("/diagnostics/", "/infra-error/diagnostics/")
  await Bun.write(path.join(recovery.executions[0]!.record.runDir, file.path), bytes)
  expect(await compareContainerIdentity(before, await series("b"))).toMatchObject({ compatible: false, before: { error: "conflicting_versions" } })
})

test("the parsed bytes must match the registered SHA even after an earlier archive check", async () => {
  const before = await series("a")
  const file = before.executions[0]!.record.files[0]!
  await Bun.write(path.join(before.executions[0]!.record.runDir, file.path), '{"target":{"loginom_build":"7.4.3"}}\n')
  expect(await compareContainerIdentity(before, await series("b")))
    .toMatchObject({ compatible: false, before: { error: "evidence_changed" } })
})

test("missing files and hash-valid malformed JSON fail closed", async () => {
  const before = await series("a")
  const file = before.executions[0]!.record.files[0]!
  await rm(path.join(before.executions[0]!.record.runDir, file.path))
  expect(await compareContainerIdentity(before, await series("b"))).toMatchObject({ compatible: false, before: { error: "evidence_changed" } })
  await Bun.write(path.join(before.executions[0]!.record.runDir, file.path), "{broken json\n")
  file.sha256 = new Bun.CryptoHasher("sha256").update("{broken json\n").digest("hex")
  expect(await compareContainerIdentity(before, await series("b"))).toMatchObject({ compatible: false, before: { error: "invalid_journal" } })
})

test("hash-valid journals with invalid UTF-8 fail closed", async () => {
  const before = await series("a")
  const file = before.executions[0]!.record.files[0]!
  const bytes = new Uint8Array([...new TextEncoder().encode('{"target":{"loginom_build":"7.4.2"},"note":"'), 0xff,
    ...new TextEncoder().encode('"}\n')])
  await Bun.write(path.join(before.executions[0]!.record.runDir, file.path), bytes)
  file.sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
  expect(await compareContainerIdentity(before, await series("b"))).toMatchObject({ compatible: false, before: { error: "invalid_journal" } })
})

test("registered traversal paths cannot provide an observed version", async () => {
  const before = await series("a")
  before.executions[0]!.record.files[0]!.path = "../1/diagnostics/1-execution-events.jsonl"
  expect(await compareContainerIdentity(before, await series("b"))).toMatchObject({ compatible: false, before: { error: "invalid_evidence_path" } })
})

test("comparing archives leaves their registered metadata and journal bytes unchanged", async () => {
  const before = await series("a")
  const after = await series("b")
  const metadata = JSON.stringify([before, after])
  const sources = await Promise.all([before, after].map(series => Bun.file(path.join(series.executions[0]!.record.runDir,
    series.executions[0]!.record.files[0]!.path)).text()))
  await compareContainerIdentity(before, after)
  expect(JSON.stringify([before, after])).toBe(metadata)
  expect(await Promise.all([before, after].map(series => Bun.file(path.join(series.executions[0]!.record.runDir,
    series.executions[0]!.record.files[0]!.path)).text()))).toEqual(sources)
})
