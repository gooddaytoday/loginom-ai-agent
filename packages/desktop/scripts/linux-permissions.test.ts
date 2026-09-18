import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, chmod, stat, symlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { linuxPermissions, verifyLinuxPermissions } from "./linux-permissions"

test("Linux payload becomes user-readable without following links outside the package", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-linux-modes-"))
  try {
    const payload = join(root, "payload")
    await mkdir(payload, { mode: 0o700 })
    await writeFile(join(payload, "app.asar"), "fixture", { mode: 0o600 })
    await writeFile(join(payload, "node"), "fixture", { mode: 0o700 })
    await chmod(join(payload, "node"), 0o700)
    await writeFile(join(root, "private"), "untouched", { mode: 0o600 })
    await symlink(join(root, "private"), join(payload, "link"))
    await expect(verifyLinuxPermissions(payload)).rejects.toThrow("RELEASE_PUBLIC_DIRECTORY_PERMISSIONS_INVALID")
    await linuxPermissions(payload)
    await verifyLinuxPermissions(payload)
    await chmod(join(payload, "app.asar"), 0o600)
    await expect(verifyLinuxPermissions(payload)).rejects.toThrow("RELEASE_PUBLIC_FILE_PERMISSIONS_INVALID")
    await linuxPermissions(payload)
    expect((await stat(payload)).mode & 0o777).toBe(0o755)
    expect((await stat(join(payload, "app.asar"))).mode & 0o777).toBe(0o644)
    expect((await stat(join(payload, "node"))).mode & 0o777).toBe(0o755)
    expect((await stat(join(root, "private"))).mode & 0o777).toBe(0o600)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
