import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { readRootWitnessFile } from "../src/root-witness-file"

test("reads a bounded root-owned regular file through protected ancestors", () => {
  expect(readRootWitnessFile("/etc/debian_version", 128)).toEqual(readFileSync("/etc/debian_version"))
})

test("refuses a symlink leaf, writable ancestor, noncanonical path and size overflow", () => {
  for (const file of ["/etc/mtab", "/var/run/absent-witness.json", "/dev/null", "/etc",
    "/tmp/absent-witness.json", "/etc/../etc/debian_version", "relative.json", "/etc/debian_version\0"]) {
    expect(() => readRootWitnessFile(file, 128)).toThrow("ROOT_WITNESS_FILE")
  }
  expect(() => readRootWitnessFile("/etc/debian_version", 1)).toThrow("ROOT_WITNESS_FILE")
  expect(() => readRootWitnessFile("/etc/debian_version", Infinity)).toThrow("ROOT_WITNESS_FILE")
})
