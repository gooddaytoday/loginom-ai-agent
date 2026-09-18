import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { protectWindowsProfile } from "../../src/cli/profile-windows"

test.skipIf(process.platform === "win32")("Windows ACL protection fails closed on other platforms", async () => {
  await expect(protectWindowsProfile("C:\\profile")).rejects.toThrow("PROFILE_PERMISSIONS_INVALID")
})

test.skipIf(process.platform !== "win32")(
  "native ACL protection inherits private access and rejects Everyone",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "loginom-acl-test-"))
    try {
      await protectWindowsProfile(root)
      await writeFile(join(root, "synthetic.txt"), "test")
      await protectWindowsProfile(root)
      const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
      if (!systemRoot) throw Error("SystemRoot required")
      const child = Bun.spawn([join(systemRoot, "System32/icacls.exe"), root, "/grant", "*S-1-1-0:(OI)(CI)R"], {
        stdout: "ignore",
        stderr: "ignore",
      })
      expect(await child.exited).toBe(0)
      await expect(protectWindowsProfile(root)).rejects.toThrow("PROFILE_PERMISSIONS_INVALID")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  60000,
)
