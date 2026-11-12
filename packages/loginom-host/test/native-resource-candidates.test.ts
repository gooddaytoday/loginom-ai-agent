import { expect, test } from "bun:test"
import { verifyBunBaselineArchive } from "../script/native-resource-candidates"

test("a substituted ZIP fails the repository-pinned Bun baseline checksum", () => {
  const substituted = Buffer.from("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "base64")
  expect(() => verifyBunBaselineArchive(substituted)).toThrow("LOGINOM_BUN_CHECKSUM_MISMATCH")
})

const archive = process.env.LOGINOM_AI_AGENT_TEST_BUN_BASELINE_ARCHIVE
test.skipIf(!archive)("the pinned upstream Bun archive passes and a changed byte fails", async () => {
  const contents = Buffer.from(await Bun.file(archive!).arrayBuffer())
  expect(() => verifyBunBaselineArchive(contents)).not.toThrow()
  contents[contents.length - 1] ^= 1
  expect(() => verifyBunBaselineArchive(contents)).toThrow("LOGINOM_BUN_CHECKSUM_MISMATCH")
})
