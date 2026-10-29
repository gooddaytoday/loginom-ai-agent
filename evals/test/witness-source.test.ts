import { expect, test } from "bun:test"
import { chmodSync, linkSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { captureWitnessSource, validateWitnessSource } from "../src/witness-source"

test("binds original bytes and inode without copying secret-bearing bytes into the binding", () => {
  const root = mkdtempSync(path.join(tmpdir(), "witness-source-")), file = path.join(root, "original.json")
  try {
    writeFileSync(file, '{"secret":"fixture-value"}\n', { mode: 0o600 })
    const before = readFileSync(file), binding = captureWitnessSource(file, process.getuid!())
    expect(JSON.stringify(binding)).not.toContain("fixture-value")
    expect(binding.sha256).toBe(new Bun.CryptoHasher("sha256").update(before).digest("hex"))
    expect(() => validateWitnessSource(binding)).not.toThrow()
    expect(readFileSync(file)).toEqual(before)
    renameSync(file, `${file}.old`)
    writeFileSync(file, before, { mode: 0o600 })
    expect(() => validateWitnessSource(binding)).toThrow("WITNESS_SOURCE_CHANGED")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("refuses altered bytes, changed permissions, aliases and excessive size", () => {
  const root = mkdtempSync(path.join(tmpdir(), "witness-source-")), file = path.join(root, "original.json")
  try {
    writeFileSync(file, "original", { mode: 0o600 })
    const binding = captureWitnessSource(file, process.getuid!())
    writeFileSync(file, "modified")
    expect(() => validateWitnessSource(binding)).toThrow("WITNESS_SOURCE_CHANGED")
    chmodSync(file, 0o666)
    expect(() => captureWitnessSource(file, process.getuid!())).toThrow("WITNESS_SOURCE_CHANGED")
    chmodSync(file, 0o600)
    symlinkSync(file, `${file}.symlink`)
    expect(() => captureWitnessSource(`${file}.symlink`, process.getuid!())).toThrow("WITNESS_SOURCE_CHANGED")
    linkSync(file, `${file}.hardlink`)
    expect(() => captureWitnessSource(file, process.getuid!())).toThrow("WITNESS_SOURCE_CHANGED")
    rmSync(`${file}.hardlink`)
    writeFileSync(file, Buffer.alloc(65537))
    expect(() => captureWitnessSource(file, process.getuid!())).toThrow("WITNESS_SOURCE_CHANGED")
  } finally { rmSync(root, { recursive: true, force: true }) }
})
