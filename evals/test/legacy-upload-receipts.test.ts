import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { writeLeaseReceipt } from "../src/lease"
import { readDeliveredStorage } from "../src/slot-storage"

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-legacy-upload-"))
  const source = path.join(root, "workspace/data/source.lgp"), bytes = Buffer.from("pinned local package")
  const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
  const receipt = { prepared: true, workspace: { status: "READY", package_ref: { path: "/eval-a/input.lgp" } },
    local_package_upload: { status: "SUCCEEDED", destination: "/eval-a/input.lgp", bytes: bytes.length,
      source_sha256: sha256, bytes_source: "native_file_store", upload_completion_verified: true, cleanup_complete: true } }
  await writeLeaseReceipt(path.join(root, "input-files.json"), [{ path: source, bytes: bytes.length, sha256 }])
  const write = (body: unknown, localPackagePath = source, status = "completed") => Bun.write(path.join(root, "events.jsonl"), JSON.stringify({
    type: "tool_use", part: { tool: "loginom_dock_prepare", state: { status,
      input: { local_package_path: localPackagePath }, output: JSON.stringify(body) } },
  }) + "\n")
  return { root, source, bytes, sha256, receipt, write }
}

test.each([
  { name: "absent legacy field", flag: {}, accepted: true },
  { name: "verified new field", flag: { source_unchanged_verified: true }, accepted: true },
  { name: "explicit false", flag: { source_unchanged_verified: false }, accepted: false },
  { name: "null", flag: { source_unchanged_verified: null }, accepted: false },
  { name: "string", flag: { source_unchanged_verified: "true" }, accepted: false },
  { name: "number", flag: { source_unchanged_verified: 1 }, accepted: false },
  { name: "object", flag: { source_unchanged_verified: {} }, accepted: false },
])("local upload cleanup compatibility: $name", async ({ flag, accepted }) => {
  const f = await fixture()
  try {
    await f.write({ ...f.receipt, local_package_upload: { ...f.receipt.local_package_upload, ...flag } })
    expect(await readDeliveredStorage([f.root], "eval-a")).toEqual(accepted
      ? [{ name: "input.lgp", bytes: f.bytes.length, sha256: f.sha256 }] : [])
  } finally { await rm(f.root, { recursive: true }) }
})

test("legacy upload still requires every pinned input and native upload binding", async () => {
  const f = await fixture()
  try {
    for (const upload of [
      { ...f.receipt.local_package_upload, source_sha256: "a".repeat(64) },
      { ...f.receipt.local_package_upload, bytes: f.bytes.length + 1 },
      { ...f.receipt.local_package_upload, bytes_source: "unverified" },
      { ...f.receipt.local_package_upload, upload_completion_verified: false },
      { ...f.receipt.local_package_upload, cleanup_complete: false },
      { ...f.receipt.local_package_upload, status: "FAILED" },
      { ...f.receipt.local_package_upload, destination: "/eval-b/input.lgp" },
    ]) {
      await f.write({ ...f.receipt, local_package_upload: upload })
      expect(await readDeliveredStorage([f.root], "eval-a")).toEqual([])
    }
    await f.write({ ...f.receipt, prepared: false })
    expect(await readDeliveredStorage([f.root], "eval-a")).toEqual([])
    await f.write({ ...f.receipt, workspace: { status: "READY", package_ref: { path: "/eval-a/other.lgp" } } })
    expect(await readDeliveredStorage([f.root], "eval-a")).toEqual([])
    await f.write(f.receipt, path.join(f.root, "foreign.lgp"))
    expect(await readDeliveredStorage([f.root], "eval-a")).toEqual([])
    await f.write(f.receipt, f.source, "error")
    expect(await readDeliveredStorage([f.root], "eval-a")).toEqual([])
    await f.write(f.receipt)
    expect(await readDeliveredStorage([f.root], "eval-b")).toEqual([])
    await rm(path.join(f.root, "input-files.json"))
    expect(await readDeliveredStorage([f.root], "eval-a")).toEqual([])
  } finally { await rm(f.root, { recursive: true }) }
})

test("native deletion accepts a legacy upload only with its exact server bytes", async () => {
  const f = await fixture(), storage = await mkdtemp(path.join(os.tmpdir(), "evals-legacy-storage-"))
  const script = path.resolve(import.meta.dir, "../fixtures/cleanup-slot-storage.sh")
  try {
    await f.write(f.receipt)
    const claims = await readDeliveredStorage([f.root], "eval-a"), info = await stat(storage)
    expect(claims).toHaveLength(1)
    const args = ["sh", script, storage, `${info.dev} ${info.ino} ${info.uid} ${info.gid}`, "1", "eval-owned",
      ...claims.flatMap(entry => [entry.sha256, String(entry.bytes), entry.name])]
    await Bun.write(path.join(storage, "input.lgp"), "changed bytes")
    await Bun.write(path.join(storage, "eval-owned.lgp"), "generated package")
    expect(Bun.spawnSync(args).exitCode).not.toBe(0)
    expect(await Bun.file(path.join(storage, "eval-owned.lgp")).exists()).toBe(true)
    await Bun.write(path.join(storage, "input.lgp"), f.bytes)
    await Bun.write(path.join(storage, "foreign.lgp"), "unclaimed")
    expect(Bun.spawnSync(args).exitCode).not.toBe(0)
    expect(await Bun.file(path.join(storage, "input.lgp")).exists()).toBe(true)
    await rm(path.join(storage, "foreign.lgp"))
    expect(Bun.spawnSync(args).exitCode).toBe(0)
    expect(await Bun.file(path.join(storage, "input.lgp")).exists()).toBe(false)
    expect(await Bun.file(path.join(storage, "eval-owned.lgp")).exists()).toBe(false)
  } finally { await Promise.all([rm(f.root, { recursive: true }), rm(storage, { recursive: true })]) }
})
