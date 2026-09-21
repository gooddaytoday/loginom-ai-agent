import { expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

test("release notes require all platforms, matching provenance, checksums and passing reports", async () => {
  const root = resolve(import.meta.dir, "../../../..")
  const dir = await mkdtemp(join(tmpdir(), "loginom-release-notes-"))
  const commit = (await $`git rev-parse HEAD`.cwd(root).text()).trim()
  const assets = [
    "loginom-ai-agent-linux-amd64.deb",
    "loginom-ai-agent-linux-x86_64.AppImage",
    "loginom-ai-agent-cli-HEAD-linux-x64.tar.gz",
    "loginom-ai-agent-win-x64.exe",
    "loginom-ai-agent-cli-HEAD-win32-x64.zip",
    "loginom-ai-agent-mac-arm64.dmg",
    "loginom-ai-agent-mac-arm64.zip",
    "loginom-ai-agent-cli-HEAD-darwin-arm64.tar.gz",
    "loginom-ai-agent-HEAD-source.tar.gz",
    "loginom-ai-agent-HEAD-windows-source.tar.gz",
    "loginom-ai-agent-HEAD-macos-source.tar.gz",
  ]
  const digest = new Bun.CryptoHasher("sha256").update("fixture").digest("hex")
  const manifest = {
    version: "HEAD",
    source: { commit, dirty: false },
    artifacts: assets.map((file) => ({ file, sha256: digest })),
  }
  const matrix = {
    artifactHash: digest,
    reports: ["ubuntu22", "ubuntu24", "ubuntu26", "debian12", "debian13"].map((name) => ({ name, status: "PASS" })),
  }
  const write = (name: string, value: unknown) => Bun.write(join(dir, name), JSON.stringify(value))
  const run = () =>
    $`${process.execPath} ${join(root, "script/release-notes.ts")} --tag HEAD --channel prod --assets ${dir} --output ${join(dir, "notes.md")}`
      .cwd(root)
      .quiet()
      .nothrow()
  try {
    for (const name of assets) await Bun.write(join(dir, name), "fixture")
    for (const name of ["release-manifest.json", "windows-release-manifest.json", "macos-release-manifest.json"])
      await write(name, manifest)
    for (const name of [
      "static-deb.json",
      "static-appimage.json",
      "static-nsis.json",
      "static-dmg.json",
      "static-zip.json",
      "macos-build-report.json",
      "macos-source-checks.json",
      "macos-offline-smoke.json",
    ])
      await write(name, { status: "PASS" })
    await write("linux-matrix.json", matrix)
    expect((await run()).exitCode).toBe(0)
    expect(await Bun.file(join(dir, "notes.md")).text()).toContain("Pre-release")
    await write("macos-release-manifest.json", { ...manifest, source: { commit: "wrong", dirty: false } })
    expect((await run()).stderr.toString()).toContain("Release provenance mismatch")
    await write("macos-release-manifest.json", manifest)
    await Bun.write(join(dir, assets[0]), "changed")
    expect((await run()).exitCode).not.toBe(0)
    await Bun.write(join(dir, assets[0]), "fixture")
    await write("macos-offline-smoke.json", { status: "FAIL" })
    expect((await run()).stderr.toString()).toContain("Passing report required")
    await write("macos-offline-smoke.json", { status: "PASS" })
    await write("linux-matrix.json", { ...matrix, reports: matrix.reports.slice(1) })
    expect((await run()).stderr.toString()).toContain("complete passing Linux matrix")
    await write("linux-matrix.json", matrix)
    await rm(join(dir, "loginom-ai-agent-cli-HEAD-win32-x64.zip"))
    expect((await run()).exitCode).not.toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)
