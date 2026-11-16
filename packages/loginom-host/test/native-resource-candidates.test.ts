import { expect, test } from "bun:test"
import { downloadBunBaselineArchive, useBunBaseline, verifyBunBaselineArchive } from "../script/native-resource-candidates"

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

function reset() {
  return Object.assign(Error("read ECONNRESET"), { code: "ECONNRESET" })
}
const noDelay = async () => {}
const substitutedZip = () => new Response(Buffer.from("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "base64"))

test("a reset Bun baseline download is retried and the retried bytes are still checksum-verified", async () => {
  const urls: string[] = []
  const fetch = async (url: string) => {
    urls.push(url)
    if (urls.length === 1) throw reset()
    if (urls.length === 2)
      return { ok: true, status: 200, arrayBuffer: () => Promise.reject(reset()) } as unknown as Response
    if (urls.length === 3) return new Response("unavailable", { status: 503 })
    return substitutedZip()
  }
  await expect(downloadBunBaselineArchive("https://bun.invalid/bun.zip", "linux", { fetch, sleep: noDelay }))
    .rejects.toThrow("LOGINOM_BUN_CHECKSUM_MISMATCH")
  expect(urls).toEqual(Array(4).fill("https://bun.invalid/bun.zip"))
})

test("Bun baseline download retries are bounded and a client error or checksum mismatch is final", async () => {
  let calls = 0
  const resets = async () => {
    calls++
    throw reset()
  }
  const failure = downloadBunBaselineArchive("https://bun.invalid/bun.zip", "win32", { fetch: resets, attempts: 3, sleep: noDelay })
  await expect(failure).rejects.toThrow("LOGINOM_BUN_DOWNLOAD_FAILED")
  await expect(failure).rejects.toMatchObject({ cause: { code: "ECONNRESET" } })
  expect(calls).toBe(3)
  for (const response of [() => new Response("missing", { status: 404 }), substitutedZip]) {
    calls = 0
    const once = async () => {
      calls++
      return response()
    }
    await expect(downloadBunBaselineArchive("https://bun.invalid/bun.zip", "linux", { fetch: once, sleep: noDelay })).rejects.toThrow(/LOGINOM_BUN_/)
    expect(calls).toBe(1)
  }
})

test.skipIf(!linuxArchive)("a reset download of the pinned Linux baseline succeeds on retry", async () => {
  const contents = Buffer.from(await Bun.file(linuxArchive!).arrayBuffer())
  let calls = 0
  const fetch = async () => (++calls === 1 ? Promise.reject(reset()) : new Response(contents))
  expect(await downloadBunBaselineArchive("https://bun.invalid/bun.zip", "linux", { fetch, sleep: noDelay })).toEqual(contents)
  expect(calls).toBe(2)
})
