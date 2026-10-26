import { expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { terminalCensus } from "../src/terminal-census"

test("kernel flag excludes kernel threads, while identically named userspace still blocks", () => {
  const root = mkdtempSync(path.join(tmpdir(), "terminal-kernel-"))
  try {
    writeFileSync(path.join(root, "stat"), "processes 100\n")
    mkdirSync(path.join(root, "25"))
    const fields = ["I", ...Array(18).fill("0"), "100", "0"]
    fields[6] = String(0x00200000)
    writeFileSync(path.join(root, "25/stat"), `25 (kworker) ${fields.join(" ")}\n`)
    expect(terminalCensus(root, "100", []).groups).toBe(1)
    fields[6] = "0"
    writeFileSync(path.join(root, "25/stat"), `25 (kworker) ${fields.join(" ")}\n`)
    expect(() => terminalCensus(root, "100", [])).toThrow("TERMINAL_CENSUS_LINEAGE")
    fields[6] = "unknown"
    writeFileSync(path.join(root, "25/stat"), `25 (kworker) ${fields.join(" ")}\n`)
    expect(() => terminalCensus(root, "101", [])).toThrow("TERMINAL_CENSUS_IDENTITY")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("inclusive group cutoff rejects zombies without requiring a stable TID inventory", () => {
  const root = mkdtempSync(path.join(tmpdir(), "terminal-census-"))
  try {
    writeFileSync(path.join(root, "stat"), "processes 9007199254740993\n")
    mkdirSync(path.join(root, "25"))
    const fields = ["Z", ...Array(18).fill("0"), "100", "0"]
    writeFileSync(path.join(root, "25/stat"), `25 (name with ) chars) ${fields.join(" ")}\n`)
    expect(() => terminalCensus(root, "100", [])).toThrow("TERMINAL_CENSUS_LINEAGE")
    const proof = terminalCensus(root, "101", [])
    expect(proof.counter).toBe("9007199254740993")
    expect(proof.groups).toBe(1)
    expect(proof.elapsedMs).toBeLessThanOrEqual(1000)
    expect(() => terminalCensus(root, "0", [{ pid: 25, starttime: "99" }])).toThrow("TERMINAL_CENSUS_IDENTITY")
    expect(terminalCensus(root, "0", [{ pid: 25, starttime: "100" }]).groups).toBe(1)
    writeFileSync(path.join(root, "25/stat"), "unreadable identity\n")
    expect(() => terminalCensus(root, "101", [])).toThrow("TERMINAL_CENSUS_IDENTITY")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("refuses an unbounded or ambiguous counter and a vanished enumerated identity", () => {
  const root = mkdtempSync(path.join(tmpdir(), "terminal-census-"))
  try {
    for (const text of ["processes 9223372036854775808\n", "processes 01\n", "processes 1\nprocesses 1\n", "cpu 1\n"]) {
      writeFileSync(path.join(root, "stat"), text)
      expect(() => terminalCensus(root, "100", [])).toThrow("TERMINAL_CENSUS_FENCE")
    }
    writeFileSync(path.join(root, "stat"), "processes 1\n")
    mkdirSync(path.join(root, "25"))
    expect(() => terminalCensus(root, "100", [])).toThrow("TERMINAL_CENSUS_IDENTITY")
  } finally { rmSync(root, { recursive: true, force: true }) }
})
