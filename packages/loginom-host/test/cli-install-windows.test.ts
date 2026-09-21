import { expect, test } from "bun:test"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { installWindowsCli, uninstallWindowsCli } from "../src/cli-install-windows"
import { verifyCliManifest, writeCliManifest } from "../src/cli-manifest"

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
      await writeWindowsFixture(artifact)
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

test.skipIf(process.platform !== "win32")(
  "native Windows launcher forwards arguments and uninstall rejects a running payload",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "windows-installer-native-"))
    try {
      const artifact = join(root, "artifact")
      await writeWindowsFixture(artifact, true)
      await writeCliManifest(artifact, {
        platform: "win32",
        arch: "x64",
        version: "test",
        channel: "dev",
        sourceCommit: "a".repeat(40),
        sourceTreeSha256: "b".repeat(64),
        sourceDirty: true,
        dependencies: {},
      })
      const local = join(root, "Local App Data кириллица")
      await mkdir(local)
      const installed = await installWindowsCli(artifact, local)
      const launcher = Bun.spawn(["cmd.exe", "/d", "/c", "call", installed.launcher, "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      })
      expect(await launcher.exited).toBe(0)
      expect((await new Response(launcher.stdout).text()).trim()).toBe(Bun.version)

      const running = Bun.spawn(
        [
          join(installed.destination, "bin/loginom-ai-agent-cli.exe"),
          "-e",
          "console.log('ready');setTimeout(()=>{},30000)",
        ],
        { stdout: "pipe", stderr: "pipe" },
      )
      try {
        const reader = running.stdout.getReader()
        const ready = await reader.read()
        reader.releaseLock()
        expect(Buffer.from(ready.value ?? []).toString().trim()).toBe("ready")
        await expect(uninstallWindowsCli(local)).rejects.toThrow("CLI_INSTALL_BUSY")
        expect(await Bun.file(installed.launcher).exists()).toBe(true)
        await expect(
          verifyCliManifest(installed.destination, { platform: "win32", arch: "x64", version: "test" }),
        ).resolves.toBeDefined()
      } finally {
        running.kill()
        await running.exited
      }
      await uninstallWindowsCli(local)
      expect(await Bun.file(installed.launcher).exists()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  30000,
)

test.skipIf(process.platform !== "win32")("Windows installer rejects redirected ancestors", async () => {
  const root = await mkdtemp(join(tmpdir(), "windows-installer-junction-"))
  try {
    const artifact = join(root, "artifact")
    await writeWindowsFixture(artifact)
    await writeCliManifest(artifact, {
      platform: "win32",
      arch: "x64",
      version: "test",
      channel: "dev",
      sourceCommit: "a".repeat(40),
      sourceTreeSha256: "b".repeat(64),
      sourceDirty: true,
      dependencies: {},
    })
    const local = join(root, "local")
    const redirected = join(root, "redirected")
    await mkdir(local)
    await mkdir(redirected)
    await symlink(redirected, join(local, "Programs"), "junction")
    await expect(installWindowsCli(artifact, local)).rejects.toThrow("CLI_INSTALL_PATH_INVALID")
    expect(await readdir(redirected)).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeWindowsFixture(root: string, nativeCli = false) {
  const node = "bin/node.exe"
  const browser = "browsers/chromium-1243/chrome-win64/chrome.exe"
  for (const path of ["bin/loginom-ai-agent-cli.exe", `resources/loginom/${node}`, `resources/loginom/${browser}`]) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    if (nativeCli && path === "bin/loginom-ai-agent-cli.exe") {
      await cp(process.execPath, join(root, path))
      continue
    }
    const executable = Buffer.alloc(128)
    executable.writeUInt16LE(0x5a4d, 0)
    executable.writeUInt32LE(64, 0x3c)
    executable.writeUInt32LE(0x00004550, 64)
    executable.writeUInt16LE(0x8664, 68)
    executable.writeUInt16LE(0xf0, 84)
    executable.writeUInt16LE(0x0022, 86)
    executable.writeUInt16LE(0x020b, 88)
    await writeFile(join(root, path), executable)
  }
  await mkdir(join(root, "resources/loginom/host"), { recursive: true })
  await writeFile(join(root, "resources/loginom/host/node-host.mjs"), "fixture")
  const hash = async (path: string) =>
    createHash("sha256").update(await readFile(join(root, "resources/loginom", path))).digest("hex")
  const nodeSha256 = await hash(node)
  const browserSha256 = await hash(browser)
  await writeFile(
    join(root, "resources/loginom/resource-manifest.json"),
    JSON.stringify({
      target: "win32-x64",
      node,
      browser,
      nodeSha256,
      browserSha256,
      files: [
        { path: node, sha256: nodeSha256 },
        { path: browser, sha256: browserSha256 },
      ],
    }),
  )
}
