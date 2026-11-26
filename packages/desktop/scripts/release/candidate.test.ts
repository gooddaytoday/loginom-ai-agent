import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { hash } from "./manifest"
import { expectRed } from "./candidate"
import { writeSums } from "./sums"

// B5.2b: the checks loginom-release.yml runs after the three platform builds, against files made on the spot.
const reference = await Bun.file(
  new URL("../../../../docs/testing/loginom-ai-agent/reports/2026-09-17-proxy/release-manifest.json", import.meta.url),
).json()

async function collect(mutate?: (files: Map<string, string>) => void) {
  const directory = await mkdtemp(join(tmpdir(), "loginom-sums-"))
  const files = new Map([
    ["loginom-ai-agent-linux-amd64.deb", "deb"],
    ["loginom-ai-agent-win-x64.exe", "exe"],
    ["loginom-ai-agent-mac-arm64.dmg", "dmg"],
    ["loginom-ai-agent-mac-arm64.zip", "zip"],
  ])
  const manifest = (platform: "linux" | "win32" | "darwin", kinds: [string, string][]) => ({
    ...reference,
    version: "2.3.0",
    source: { ...reference.source, commit: "a".repeat(40) },
    target:
      platform === "darwin"
        ? { platform, arch: "arm64", minimumOS: "14.0", backend: "v1" }
        : { ...reference.target, platform },
    installation: { ...reference.installation, scope: platform === "linux" ? "machine" : "user" },
    signing: platform === "darwin" ? { status: "ad-hoc", identity: "-", notarized: false } : reference.signing,
    paths: platform === "win32" ? { ...reference.paths, node: "bin/node.exe", chromium: "chrome.exe" } : reference.paths,
    artifacts: kinds.map(([file, kind]) => ({ file, kind, bytes: files.get(file)!.length, sha256: hash(files.get(file)!) })),
  })
  const manifests = {
    "release-manifest.json": manifest("linux", [["loginom-ai-agent-linux-amd64.deb", "deb"]]),
    "windows-release-manifest.json": manifest("win32", [["loginom-ai-agent-win-x64.exe", "nsis"]]),
    "macos-release-manifest.json": manifest("darwin", [
      ["loginom-ai-agent-mac-arm64.dmg", "dmg"],
      ["loginom-ai-agent-mac-arm64.zip", "zip"],
    ]),
  }
  mutate?.(files)
  await Promise.all([
    ...[...files].map(([name, body]) => writeFile(join(directory, name), body)),
    ...Object.entries(manifests).map(([name, body]) => writeFile(join(directory, name), JSON.stringify(body))),
  ])
  return directory
}

test("SHA256SUMS.txt covers a candidate whose files are the ones the manifests hash", async () => {
  const directory = await collect()
  try {
    await writeSums(directory)
    const sums = await readFile(join(directory, "SHA256SUMS.txt"), "utf8")
    expect(sums).toContain(`${hash("dmg")}  loginom-ai-agent-mac-arm64.dmg\n`)
    expect(sums).not.toContain("SHA256SUMS.txt")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("the release is refused when a byte changed after the manifest was written, or a file is missing", async () => {
  const changed = await collect()
  const missing = await collect()
  try {
    await writeFile(join(changed, "loginom-ai-agent-win-x64.exe"), "exE")
    await expect(writeSums(changed)).rejects.toThrow("Release artifact mismatch: loginom-ai-agent-win-x64.exe")
    await rm(join(missing, "loginom-ai-agent-mac-arm64.zip"))
    await expect(writeSums(missing)).rejects.toThrow("Release artifact missing: loginom-ai-agent-mac-arm64.zip")
    await rm(join(missing, "windows-release-manifest.json"))
    await expect(writeSums(missing)).rejects.toThrow("Required release manifest missing")
  } finally {
    await Promise.all([changed, missing].map((directory) => rm(directory, { recursive: true, force: true })))
  }
})

test("manifests of two commits do not make one release", async () => {
  const directory = await collect()
  try {
    const name = join(directory, "macos-release-manifest.json")
    const manifest = await Bun.file(name).json()
    await writeFile(name, JSON.stringify({ ...manifest, source: { ...manifest.source, commit: "b".repeat(40) } }))
    await expect(writeSums(directory)).rejects.toThrow("Release provenance mismatch")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("the G5 control is red only when the check fails without the file, and restores the file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-g5-"))
  try {
    await mkdir(join(directory, "host"))
    const file = join(directory, "host/node-host.mjs")
    await writeFile(file, "host")
    const present = async () => {
      if (!(await Bun.file(file).exists())) throw Error("missing")
    }
    await expectRed("CLI", file, false, present)
    expect(await readFile(file, "utf8")).toBe("host")
    // A check that does not look at the file, and a copy left intact, are both "stayed green".
    await expect(expectRed("CLI", file, false, async () => {})).rejects.toThrow("G5 control: the CLI check stayed green")
    expect(await readFile(file, "utf8")).toBe("host")
    await expect(expectRed("CLI", file, true, present)).rejects.toThrow("file not removed")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
