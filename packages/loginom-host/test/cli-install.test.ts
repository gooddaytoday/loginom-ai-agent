import { expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { installCli, uninstallCli } from "../src/cli-install"
import { writeCliManifest } from "../src/cli-manifest"

test.skipIf(process.platform !== "linux" && process.platform !== "darwin")(
  "user install preserves foreign launchers/profiles and refuses uninstall of a live payload",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "cli-install-"))
    const artifact = join(root, "artifact")
    const home = join(root, "home")
    try {
      for (const file of [
        "bin/loginom-ai-agent-cli",
        "resources/loginom/bin/node",
        "resources/loginom/host/node-host.mjs",
        "resources/loginom/resource-manifest.json",
        ...(process.platform === "darwin" ? ["resources/loginom/bin/loginom-keychain"] : []),
      ]) {
        await mkdir(dirname(join(artifact, file)), { recursive: true })
        await writeFile(join(artifact, file), file)
      }
      await cp("/bin/sleep", join(artifact, "bin/loginom-ai-agent-cli"))
      await symlink("loginom-ai-agent-cli", join(artifact, "bin/alias"))
      await writeCliManifest(artifact, {
        version: "test",
        channel: "dev",
        platform: process.platform,
        arch: process.arch,
        sourceCommit: "a".repeat(40),
        sourceTreeSha256: "b".repeat(64),
        sourceDirty: true,
        dependencies: {},
      })
      for (const redirect of [".local", ".local/share", ".local/bin", ".local/share/loginom-ai-agent-cli"]) {
        const redirectedHome = join(root, "redirect-" + redirect.replaceAll("/", "-"))
        const foreign = join(root, "foreign-" + redirect.replaceAll("/", "-"))
        await mkdir(foreign)
        await writeFile(join(foreign, "keep"), "foreign")
        await mkdir(dirname(join(redirectedHome, redirect)), { recursive: true })
        await symlink(foreign, join(redirectedHome, redirect))
        await expect(installCli(artifact, redirectedHome)).rejects.toThrow("CLI_INSTALL_PATH_INVALID")
        expect(await readFile(join(foreign, "keep"), "utf8")).toBe("foreign")
        expect(await Bun.file(join(foreign, "current.json")).exists()).toBe(false)
      }
      await mkdir(join(home, ".local/bin"), { recursive: true })
      const launcher = join(home, ".local/bin/loginom-ai-agent-cli")
      await writeFile(launcher, "foreign")
      await expect(installCli(artifact, home)).rejects.toThrow("CLI_INSTALL_PATH_EXISTS")
      expect(await readFile(launcher, "utf8")).toBe("foreign")
      await rm(launcher)
      const profile = join(home, ".config/com.loginom.aiagent/cli/profiles/default")
      await mkdir(profile, { recursive: true })
      await writeFile(join(profile, "keep"), "profile")
      const installed = await installCli(artifact, home)
      expect(await readlink(launcher)).toBe(join(installed.destination, "bin/loginom-ai-agent-cli"))
      expect(await readlink(join(installed.destination, "bin/alias"))).toBe("loginom-ai-agent-cli")
      const child = Bun.spawn([launcher, "30"], { stdout: "ignore", stderr: "ignore" })
      try {
        await expect(uninstallCli(home)).rejects.toThrow("CLI_INSTALL_BUSY")
      } finally {
        child.kill()
        await child.exited
      }
      for (const redirect of [".local", ".local/share", ".local/bin", ".local/share/loginom-ai-agent-cli"]) {
        const path = join(home, redirect)
        const moved = path + "-original"
        await rename(path, moved)
        await symlink(moved, path)
        try {
          await expect(uninstallCli(home)).rejects.toThrow("CLI_INSTALL_PATH_INVALID")
          expect(await Bun.file(join(installed.destination, "cli-manifest.json")).exists()).toBe(true)
          expect(await readlink(launcher)).toBe(join(installed.destination, "bin/loginom-ai-agent-cli"))
        } finally {
          await rm(path)
          await rename(moved, path)
        }
      }
      const receipt = join(home, ".local/share/loginom-ai-agent-cli/current.json")
      const receiptBytes = await readFile(receipt)
      const foreignReceipt = join(root, "foreign-receipt.json")
      await writeFile(foreignReceipt, receiptBytes)
      await rm(receipt)
      await symlink(foreignReceipt, receipt)
      await expect(uninstallCli(home)).rejects.toThrow("CLI_INSTALL_RECEIPT_INVALID")
      expect(await readFile(foreignReceipt)).toEqual(receiptBytes)
      expect(await readlink(launcher)).toBe(join(installed.destination, "bin/loginom-ai-agent-cli"))
      await rm(receipt)
      await writeFile(receipt, receiptBytes)
      await uninstallCli(home)
      expect(await readFile(join(profile, "keep"), "utf8")).toBe("profile")
      expect(await Bun.file(launcher).exists()).toBe(false)
      expect(await Bun.file(join(installed.destination, "cli-manifest.json")).exists()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
