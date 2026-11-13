import { expect, test } from "bun:test"
import { useBunBaseline, verifyBunBaselineArchive } from "../script/native-resource-candidates"

test("CLI defaults to baseline on Linux and Windows x64, preserving macOS arm64", () => {
  expect(useBunBaseline("linux", "x64", [])).toBe(true)
  expect(useBunBaseline("win32", "x64", [])).toBe(true)
  expect(useBunBaseline("darwin", "arm64", [])).toBe(false)
  expect(useBunBaseline("linux", "arm64", [])).toBe(false)
  expect(useBunBaseline("linux", "x64", ["--baseline"])).toBe(true)
})

test("a substituted ZIP fails the repository-pinned Bun baseline checksum", () => {
  const substituted = Buffer.from("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "base64")
  expect(() => verifyBunBaselineArchive(substituted)).toThrow("LOGINOM_BUN_CHECKSUM_MISMATCH")
  expect(() => verifyBunBaselineArchive(substituted, "linux")).toThrow("LOGINOM_BUN_CHECKSUM_MISMATCH")
})

const archive = process.env.LOGINOM_AI_AGENT_TEST_BUN_BASELINE_ARCHIVE
test.skipIf(!archive)("the pinned upstream Bun archive passes and a changed byte fails", async () => {
  const contents = Buffer.from(await Bun.file(archive!).arrayBuffer())
  expect(() => verifyBunBaselineArchive(contents)).not.toThrow()
  contents[contents.length - 1] ^= 1
  expect(() => verifyBunBaselineArchive(contents)).toThrow("LOGINOM_BUN_CHECKSUM_MISMATCH")
})

const linuxArchive = process.env.LOGINOM_AI_AGENT_TEST_BUN_LINUX_BASELINE_ARCHIVE
test.skipIf(!linuxArchive)("the pinned Linux baseline archive passes only its platform checksum", async () => {
  const contents = Buffer.from(await Bun.file(linuxArchive!).arrayBuffer())
  expect(() => verifyBunBaselineArchive(contents, "linux")).not.toThrow()
  expect(() => verifyBunBaselineArchive(contents, "win32")).toThrow("LOGINOM_BUN_CHECKSUM_MISMATCH")
  contents[contents.length - 1] ^= 1
  expect(() => verifyBunBaselineArchive(contents, "linux")).toThrow("LOGINOM_BUN_CHECKSUM_MISMATCH")
})
