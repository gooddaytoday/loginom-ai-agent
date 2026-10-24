import { expect, test } from "bun:test"
import { serverFileObservation } from "../src/server-files"
import { requireServerFilesClosed } from "../src/slot-storage"

const container = "a".repeat(64)
const stat = `1 (loginom) S ${"0 ".repeat(18)}123`
const frame = (after = "1 ", target?: string) => [
  ["B", "before", "1 ", stat, "", ""],
  ["P", "1", stat, "", "", ""],
  ...(target ? [["F", "1", "3", target, "1:2:1:regular file", ""]] : []),
  ["E", "1", stat, "", "", ""],
  ["B", "after", after, stat, "", ""],
].flat().join("\0") + "\0"

test("server file observation rereads an incomplete snapshot before permitting cleanup", async () => {
  let reads = 0
  const observed = await serverFileObservation(container, async () => ({ code: 0, output: frame(++reads === 1 ? "1 2 " : "1 ") }))
  expect(reads).toBe(2)
  expect(observed.complete).toBe(true)
  expect(observed.pidsBefore).toEqual(["1"])
  expect(observed.pidsAfter).toEqual(["1"])
})

test("server file observation refuses persistent incomplete or failed scans after three reads", async () => {
  for (const result of [{ code: 0, output: frame("1 2 ") }, { code: 1, output: "" }]) {
    let reads = 0
    await expect(serverFileObservation(container, async () => { reads++; return result })).rejects.toThrow("SERVER_FILE_SCAN_UNCONFIRMED")
    expect(reads).toBe(3)
  }
})

test("server file observation keeps an active own file visible without retrying a complete snapshot", async () => {
  let reads = 0
  const observed = await serverFileObservation(container, async () => {
    reads++
    return { code: 0, output: frame("1 ", "/workdir/UserStorage/eval-a/data.csv") }
  })
  expect(reads).toBe(1)
  expect(() => requireServerFilesClosed(observed, "/workdir/UserStorage/eval-a")).toThrow("SLOT_SERVER_FILES_ACTIVE")
})
