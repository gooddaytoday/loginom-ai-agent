import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm, symlink, unlink, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { writeCliManifest, verifyCliManifest } from "../src/cli-manifest"

test("CLI manifest verifies complete payload and rejects mutation, extras and escaped links", async () => {
  const root = await mkdtemp(join(tmpdir(), "cli-manifest-"))
  try {
    for (const path of [
      "bin/loginom-ai-agent-cli",
      "resources/loginom/host/node-host.mjs",
      "resources/loginom/resource-manifest.json",
      "resources/loginom/bin/node",
    ]) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), path)
    }
    const info = {
      version: "test",
      channel: "dev",
      platform: "linux",
      arch: "x64",
      sourceCommit: "a".repeat(40),
      sourceTreeSha256: "b".repeat(64),
      sourceDirty: true,
      dependencies: { node: "24.19.0" },
    }
    await writeCliManifest(root, info)
    expect(await verifyCliManifest(root, { platform: "linux", arch: "x64", version: "test" })).toEqual(info)
    await symlink("loginom-ai-agent-cli", join(root, "bin/alias"))
    await writeCliManifest(root, info)
    expect(await verifyCliManifest(root, info)).toEqual(info)
    await expect(verifyCliManifest(root, { platform: "darwin", arch: "arm64" })).rejects.toThrow(
      "LOGINOM_MANIFEST_TARGET_MISMATCH",
    )
    await writeFile(join(root, "extra"), "unexpected")
    await expect(verifyCliManifest(root, info)).rejects.toThrow("LOGINOM_MANIFEST_PAYLOAD_MISMATCH")
    await unlink(join(root, "extra"))
    await writeFile(join(root, "bin/loginom-ai-agent-cli"), "changed")
    await expect(verifyCliManifest(root, info)).rejects.toThrow("LOGINOM_MANIFEST_PAYLOAD_MISMATCH")
    await symlink(process.execPath, join(root, "escape"))
    await expect(writeCliManifest(root, info)).rejects.toThrow("LOGINOM_MANIFEST_PATH_ESCAPE")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform !== "linux")(
  "archive verification preserves manifest modes under a private umask",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "cli-archive-modes-"))
    const source = join(root, "source")
    const extracted = join(root, "extracted")
    try {
      for (const path of [
        "bin/loginom-ai-agent-cli",
        "resources/loginom/host/node-host.mjs",
        "resources/loginom/resource-manifest.json",
        "resources/loginom/bin/node",
      ]) {
        await mkdir(dirname(join(source, path)), { recursive: true })
        await writeFile(join(source, path), path)
        await chmod(join(source, path), path.includes("/bin/") || path.startsWith("bin/") ? 0o755 : 0o644)
      }
      const info = {
        version: "test",
        channel: "dev",
        platform: "linux",
        arch: "x64",
        sourceCommit: "a".repeat(40),
        sourceTreeSha256: "b".repeat(64),
        sourceDirty: true,
        dependencies: {},
      }
      await writeCliManifest(source, info)
      const archive = join(root, "payload.tar.gz")
      expect(await Bun.spawn(["tar", "-czf", archive, "-C", source, "."]).exited).toBe(0)
      await mkdir(extracted)
      const normal = Bun.spawn(["/bin/sh", "-c", 'umask 077; exec tar "$@"', "tar", "-xzf", archive, "-C", extracted])
      expect(await normal.exited).toBe(0)
      await expect(verifyCliManifest(extracted, info)).rejects.toThrow("LOGINOM_MANIFEST_PAYLOAD_MISMATCH")
      const preserved = Bun.spawn([
        "/bin/sh",
        "-c",
        'umask 077; exec tar "$@"',
        "tar",
        "--same-permissions",
        "-xzf",
        archive,
        "-C",
        extracted,
      ])
      expect(await preserved.exited).toBe(0)
      expect(await verifyCliManifest(extracted, info)).toEqual(info)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)

test("macOS manifest requires and hashes the native Keychain helper", async () => {
  const root = await mkdtemp(join(tmpdir(), "cli-manifest-macos-"))
  try {
    for (const path of [
      "bin/loginom-ai-agent-cli",
      "resources/loginom/host/node-host.mjs",
      "resources/loginom/resource-manifest.json",
      "resources/loginom/bin/node",
    ]) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), path)
    }
    const info = {
      version: "test",
      channel: "dev",
      platform: "darwin",
      arch: "arm64",
      sourceCommit: "a".repeat(40),
      sourceTreeSha256: "b".repeat(64),
      sourceDirty: true,
      dependencies: {},
    }
    await writeCliManifest(root, info)
    await expect(verifyCliManifest(root, info)).rejects.toThrow("LOGINOM_MANIFEST_INCOMPLETE")
    const helper = join(root, "resources/loginom/bin/loginom-keychain")
    await writeFile(helper, "fixture-helper")
    await writeCliManifest(root, info)
    expect(await verifyCliManifest(root, info)).toEqual(info)
    const framework = join(root, "resources/loginom/browser/Framework.framework/Versions")
    await mkdir(join(framework, "A"), { recursive: true })
    await writeFile(join(framework, "A/binary"), "framework")
    await symlink("A", join(framework, "Current"))
    const withFramework = await writeCliManifest(root, info)
    expect(withFramework.files.find((file) => file.path.endsWith("Versions/Current"))?.link).toBe("A")
    expect(withFramework.files.filter((file) => file.path.endsWith("/binary"))).toHaveLength(1)
    expect(await verifyCliManifest(root, info)).toEqual(info)
    await writeFile(join(framework, "A/binary"), "modified-framework")
    await expect(verifyCliManifest(root, info)).rejects.toThrow("LOGINOM_MANIFEST_PAYLOAD_MISMATCH")
    await writeFile(join(framework, "A/binary"), "framework")
    await unlink(join(framework, "Current"))
    await symlink(tmpdir(), join(framework, "Current"))
    await expect(writeCliManifest(root, info)).rejects.toThrow("LOGINOM_MANIFEST_PATH_ESCAPE")
    await unlink(join(framework, "Current"))
    await symlink("A", join(framework, "Current"))
    await writeFile(helper, "changed-helper")
    await expect(verifyCliManifest(root, info)).rejects.toThrow("LOGINOM_MANIFEST_PAYLOAD_MISMATCH")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
