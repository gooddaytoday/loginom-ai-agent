import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { protectWindowsProfile } from "../../src/cli/profile-windows"
import { acquireProfile } from "../../src/cli/profile"

test.skipIf(process.platform === "win32")("Windows ACL protection fails closed on other platforms", async () => {
  await expect(protectWindowsProfile("C:\\profile")).rejects.toThrow("PROFILE_PERMISSIONS_INVALID")
})

test.skipIf(process.platform !== "win32")(
  "native ACL protection inherits private access and rejects Everyone",
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), "loginom-acl-test-"))
    const root = join(temporary, "Профиль с пробелами")
    try {
      await mkdir(root)
      await protectWindowsProfile(root)
      const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
      if (!systemRoot) throw Error("SystemRoot required")
      const transfer = join(root, "loginom", "sessions", "one", "artifacts", "transfer-12345678-1234-1234-1234-123456789abc")
      await mkdir(transfer, { recursive: true })
      const uploadRead = Bun.spawn(
        [
          join(systemRoot, "System32/icacls.exe"),
          transfer,
          "/grant:r",
          "*S-1-15-3-1024-1528657515-1944437972-2795272136-1227674495-293963776-353393192-4060142787-1908764039:(OI)(CI)RX",
        ],
        { stdout: "ignore", stderr: "ignore" },
      )
      expect(await uploadRead.exited).toBe(0)
      await writeFile(join(transfer, "input.csv"), "test")
      await protectWindowsProfile(root)
      await writeFile(join(root, "synthetic.txt"), "test")
      await protectWindowsProfile(root)
      const cache = join(root, "browser-profile", "Default", "Cache")
      await mkdir(cache, { recursive: true })
      const capability = Bun.spawn(
        [
          join(systemRoot, "System32/icacls.exe"),
          cache,
          "/grant",
          "*S-1-15-3-1024-1528657515-1944437972-2795272136-1227674495-293963776-353393192-4060142787-1908764039:(OI)(CI)M",
        ],
        { stdout: "ignore", stderr: "ignore" },
      )
      expect(await capability.exited).toBe(0)
      const database = join(root, "browser-profile", "Default", "CURRENT")
      await writeFile(database, "test")
      const denyTraverse = Bun.spawn(
        [join(systemRoot, "System32/icacls.exe"), database, "/deny", "*S-1-1-0:(X)"],
        { stdout: "ignore", stderr: "ignore" },
      )
      expect(await denyTraverse.exited).toBe(0)
      await protectWindowsProfile(root)
      const system = Bun.spawn([join(systemRoot, "System32/icacls.exe"), root, "/grant", "*S-1-5-18:(OI)(CI)F"], {
        stdout: "ignore",
        stderr: "ignore",
      })
      expect(await system.exited).toBe(0)
      await protectWindowsProfile(root)
      const child = Bun.spawn([join(systemRoot, "System32/icacls.exe"), root, "/grant", "*S-1-1-0:(OI)(CI)R"], {
        stdout: "ignore",
        stderr: "ignore",
      })
      expect(await child.exited).toBe(0)
      await expect(protectWindowsProfile(root)).rejects.toThrow("PROFILE_PERMISSIONS_INVALID")
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  },
  60000,
)

test.skipIf(process.platform !== "win32")(
  "native Windows profiles keep independent writer guards",
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), "loginom-profile-lock-test-"))
    const firstRoot = join(temporary, "Первый профиль")
    const secondRoot = join(temporary, "Second profile")
    let first: Awaited<ReturnType<typeof acquireProfile>> | undefined
    let second: Awaited<ReturnType<typeof acquireProfile>> | undefined
    try {
      first = await acquireProfile(firstRoot, "dev")
      await expect(acquireProfile(firstRoot, "dev")).rejects.toThrow("PROFILE_BUSY")
      second = await acquireProfile(secondRoot, "dev")
      expect(second.paths.root).not.toBe(first.paths.root)
      await first.release()
      first = undefined
      const reopened = await acquireProfile(firstRoot, "dev")
      await reopened.release()
    } finally {
      if (second) await second.release()
      if (first) await first.release()
      await rm(temporary, { recursive: true, force: true })
    }
  },
  60000,
)
