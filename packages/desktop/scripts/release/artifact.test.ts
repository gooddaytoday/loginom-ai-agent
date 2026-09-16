import { expect, test } from "bun:test"
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { decodeManifest, hash, relativePath, verifyResourceTree } from "./manifest"

test("static extraction validation detects missing, altered, escaped and foreign architecture resources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-static-test-"))
  const executable = Buffer.alloc(64)
  executable.write("\x7fELF")
  executable[4] = 2
  executable.writeUInt16LE(62, 18)
  const resource = {
    protocol: 1,
    target: "linux-x64",
    node: "node",
    browser: "chrome",
    files: ["node", "chrome"].map((path) => ({ path, sha256: hash(executable) })),
  }
  const manifest = JSON.stringify(resource)
  try {
    await writeFile(join(directory, "resource-manifest.json"), manifest)
    for (const file of ["node", "chrome"]) {
      await writeFile(join(directory, file), executable)
      await chmod(join(directory, file), 0o755)
    }
    expect((await verifyResourceTree(directory, hash(manifest))).files).toBe(2)
    await expect(verifyResourceTree(directory, "0".repeat(64))).rejects.toThrow("RELEASE_RESOURCES_MANIFEST_MISMATCH")
    await writeFile(join(directory, "chrome"), "modified")
    await expect(verifyResourceTree(directory, hash(manifest))).rejects.toThrow("RELEASE_RESOURCE_HASH_MISMATCH")
    await rm(join(directory, "chrome"))
    await expect(verifyResourceTree(directory, hash(manifest))).rejects.toThrow()
    await symlink("/etc/hosts", join(directory, "chrome"))
    await expect(verifyResourceTree(directory, hash(manifest))).rejects.toThrow("RELEASE_RESOURCE_ESCAPE")
    await rm(join(directory, "chrome"))
    executable.writeUInt16LE(183, 18)
    await writeFile(join(directory, "chrome"), executable, { mode: 0o755 })
    resource.files[1].sha256 = hash(executable)
    const foreign = JSON.stringify(resource)
    await writeFile(join(directory, "resource-manifest.json"), foreign)
    await expect(verifyResourceTree(directory, hash(foreign))).rejects.toThrow("RELEASE_EXECUTABLE_INVALID")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("release paths and unsupported targets cannot enter the static verifier", () => {
  for (const path of ["../escape", "/absolute", "a/../b", "a\\b", "a//b", ""])
    expect(() => relativePath(path)).toThrow()
  expect(relativePath("resources/loginom/bin/node")).toBe("resources/loginom/bin/node")
  expect(() => decodeManifest({ schemaVersion: 1, target: { platform: "linux", arch: "arm64" } })).toThrow()
})
