import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireProfile } from "../../src/cli/profile"

const roots: string[] = []
async function temporary() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-profile-test-"))
  roots.push(root)
  return root
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

test("only one writer including a symlink alias; separate profiles remain independent", async () => {
  const root = await temporary()
  const first = await acquireProfile(path.join(root, "first"), "prod")
  await fs.symlink(first.paths.root, path.join(root, "alias"))
  await expect(acquireProfile(path.join(root, "alias"), "prod")).rejects.toThrow("PROFILE_BUSY")
  const second = await acquireProfile(path.join(root, "second"), "prod")
  await second.release()
  await first.release()
  const next = await acquireProfile(path.join(root, "alias"), "prod")
  expect(next.paths.root).toBe(first.paths.root)
  await next.release()
})

test("unknown existing data is rejected without installing a marker", async () => {
  const root = await temporary()
  await fs.writeFile(path.join(root, "desktop.db"), "untouched")
  await expect(acquireProfile(root, "prod")).rejects.toThrow("PROFILE_FORMAT_INVALID")
  expect(await fs.readdir(root)).toEqual(["desktop.db"])
  expect(await fs.readFile(path.join(root, "desktop.db"), "utf8")).toBe("untouched")
})

test("channel mismatch and escaped storage are rejected before backend imports", async () => {
  const root = await temporary()
  const first = await acquireProfile(root, "prod")
  await first.release()
  await expect(acquireProfile(root, "beta")).rejects.toThrow("PROFILE_FORMAT_INVALID")
  await fs.rmdir(first.paths.data)
  await fs.symlink(await temporary(), first.paths.data)
  await expect(acquireProfile(root, "prod")).rejects.toThrow("PROFILE_PATH_INVALID")
})

test("a foreign nonce is never removed and an abandoned guard is never stolen", async () => {
  const root = await temporary()
  const first = await acquireProfile(root, "prod")
  await fs.writeFile(path.join(root, ".writer", "owner"), "foreign")
  await expect(first.release()).rejects.toThrow("PROFILE_OWNER_CHANGED")
  await expect(acquireProfile(root, "prod")).rejects.toThrow("PROFILE_BUSY")
  expect(await fs.readFile(path.join(root, ".writer", "owner"), "utf8")).toBe("foreign")
})

test.skipIf(process.platform === "win32")("public profile root is rejected before any admission write", async () => {
  const root = await temporary()
  await fs.chmod(root, 0o755)
  await expect(acquireProfile(root, "prod")).rejects.toThrow("PROFILE_PERMISSIONS_INVALID")
  expect(await fs.readdir(root)).toEqual([])
  expect((await fs.stat(root)).mode & 0o777).toBe(0o755)
})

test.skipIf(process.platform === "win32")(
  "existing shared storage is rejected without repairing permissions or retaining a guard",
  async () => {
    const root = await temporary()
    const first = await acquireProfile(root, "prod")
    await first.release()
    for (const directory of [
      first.paths.config,
      first.paths.data,
      first.paths.state,
      first.paths.cache,
      first.paths.tmp,
      first.paths.loginom,
    ]) {
      await fs.chmod(directory, 0o750)
      await expect(acquireProfile(root, "prod")).rejects.toThrow("PROFILE_PERMISSIONS_INVALID")
      expect((await fs.stat(directory)).mode & 0o777).toBe(0o750)
      expect(await fs.readdir(root)).not.toContain(".writer")
      await fs.chmod(directory, 0o700)
    }
    const reopened = await acquireProfile(root, "prod")
    await reopened.release()
  },
)
