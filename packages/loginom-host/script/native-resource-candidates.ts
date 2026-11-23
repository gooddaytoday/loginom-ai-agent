import { createHash } from "node:crypto"
import bunNotice from "../licenses/bun/source.json"

// Build candidates only, not release acceptance. Values are from the verified
// Node inventory dated 2026-09-18 and Chromium 154.0.8037.0 archive inventory
// dated 2026-09-26; native execution of Chromium 1246 is pending.
export const nativeResourceCandidates = {
  "win32-x64": {
    chromiumRevision: "1246",
    node: "bin/node.exe",
    browser: "chromium-1246/chrome-win64/chrome.exe",
    nodeSha256: "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237",
    browserSha256: "e3390ab4c5d43b720a4aac16cb5c3889857a449d1aaeeda4ec86005beb98ff37",
  },
  "darwin-arm64": {
    chromiumRevision: "1246",
    node: "bin/node",
    browser: "chromium-1246/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    nodeSha256: "27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1",
    browserSha256: "ae4d66517f6879a70239c073f7be3d3b4d82bb3158938c6cb456bcd66f8f386e",
  },
}

export function verifyBunBaselineArchive(archive: Uint8Array, platform: "linux" | "win32" = "win32") {
  const expected = platform === "linux" ? bunNotice.linuxX64BaselineSha256 : bunNotice.windowsX64BaselineSha256
  if (createHash("sha256").update(archive).digest("hex") !== expected)
    throw Error("LOGINOM_BUN_CHECKSUM_MISMATCH")
}

type Fetch = (url: string) => Promise<Response>

// GitHub release downloads occasionally reset mid-transfer (ECONNRESET). Retry
// only transport failures and server errors a bounded number of times; every
// attempt's bytes must still match the repository-pinned checksum.
export async function downloadBunBaselineArchive(
  url: string,
  platform: "linux" | "win32",
  { fetch: get = fetch as Fetch, attempts = 4, sleep = (ms: number) => Bun.sleep(ms) } = {},
) {
  for (let attempt = 1; ; attempt++) {
    let failure: unknown
    try {
      const response = await get(url)
      if (response.ok) {
        const archive = Buffer.from(await response.arrayBuffer())
        verifyBunBaselineArchive(archive, platform)
        return archive
      }
      if (response.status < 500 && response.status !== 429) throw Error("LOGINOM_BUN_DOWNLOAD_FAILED")
      failure = Error("LOGINOM_BUN_DOWNLOAD_FAILED", { cause: { status: response.status } })
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("LOGINOM_")) throw error
      failure = Error("LOGINOM_BUN_DOWNLOAD_FAILED", { cause: error })
    }
    if (attempt >= attempts) throw failure
    await sleep(1000 * 2 ** (attempt - 1))
  }
}

export function useBunBaseline(platform: string, arch: string, args: string[]) {
  return (["linux", "win32"].includes(platform) && arch === "x64") || args.includes("--baseline")
}
