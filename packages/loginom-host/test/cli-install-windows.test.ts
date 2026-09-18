import { expect, test } from "bun:test"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { installWindowsCli, uninstallWindowsCli } from "../src/cli-install-windows"
import { writeCliManifest } from "../src/cli-manifest"

test.skipIf(process.platform === "win32")(
  "Windows installer rejects unsupported hosts without creating paths",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "windows-installer-"))
    try {
      await expect(installWindowsCli(join(root, "artifact"), join(root, "local"))).rejects.toThrow(
        "CLI_INSTALL_PLATFORM_UNAVAILABLE",
      )
      await expect(uninstallWindowsCli(join(root, "local"))).rejects.toThrow("CLI_INSTALL_PLATFORM_UNAVAILABLE")
      expect(await readdir(root)).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)

test.skipIf(process.platform !== "win32")(
  "native Windows installer preserves foreign launcher and independent data",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "windows-installer-"))
    try {
      const artifact = join(root, "artifact")
      for (const file of [
        "bin/loginom-ai-agent-cli.exe",
        "resources/loginom/bin/node.exe",
        "resources/loginom/host/node-host.mjs",
        "resources/loginom/resource-manifest.json",
      ]) {
        await mkdir(dirname(join(artifact, file)), { recursive: true })
        await writeFile(join(artifact, file), "fixture")
      }
      await writeCliManifest(artifact, {
        platform: "win32",
        arch: process.arch,
        version: "test",
        channel: "dev",
        sourceCommit: "a".repeat(40),
        sourceTreeSha256: "b".repeat(64),
        sourceDirty: true,
        dependencies: {},
      })
      const local = join(root, "local")
      await mkdir(local)
      const launcher = join(local, "Programs/loginom-ai-agent-cli/bin/loginom-ai-agent-cli.cmd")
      await mkdir(dirname(launcher), { recursive: true })
      await writeFile(launcher, "foreign")
      await expect(installWindowsCli(artifact, local)).rejects.toThrow("CLI_INSTALL_PATH_EXISTS")
      expect(await readFile(launcher, "utf8")).toBe("foreign")
      await rm(launcher)
      await writeFile(join(local, "independent.txt"), "keep")
      const installed = await installWindowsCli(artifact, local)
      expect(installed.launcher).toBe(launcher)
      expect(await readFile(launcher, "utf8")).toContain('"%~dp0..\\test-dev\\bin\\loginom-ai-agent-cli.exe" %*')
      await uninstallWindowsCli(local)
      expect(await Bun.file(launcher).exists()).toBe(false)
      expect(await readFile(join(local, "independent.txt"), "utf8")).toBe("keep")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  30000,
)
