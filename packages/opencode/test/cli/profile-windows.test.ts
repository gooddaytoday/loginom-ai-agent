import { expect, test } from "bun:test"
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { protectWindowsProfile, removeAbandonedBrowserDirectories } from "../../src/cli/profile-windows"
import { acquireProfile } from "../../src/cli/profile"

test.skipIf(process.platform === "win32")("Windows ACL protection fails closed on other platforms", async () => {
  await expect(protectWindowsProfile("C:\\profile")).rejects.toThrow("PROFILE_PERMISSIONS_INVALID")
  await expect(removeAbandonedBrowserDirectories("C:\\profile")).rejects.toThrow("PROFILE_CLEANUP_FAILED")
})

test.skipIf(process.platform !== "win32")(
  "native ACL protection inherits private access and rejects Everyone",
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), "loginom-acl-test-"))
    const root = join(temporary, "Профиль с пробелами")
    try {
      await mkdir(root)
      await protectWindowsProfile(root)
      await writeFile(join(root, "synthetic.txt"), "test")
      await protectWindowsProfile(root)
      const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
      if (!systemRoot) throw Error("SystemRoot required")
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

test.skipIf(process.platform !== "win32")(
  "native ACL protection accepts Chromium capability access only in caches a killed CLI leaves",
  async () => {
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
    if (!systemRoot) throw Error("SystemRoot required")
    const icacls = async (target: string, grant: string) => {
      const child = Bun.spawn([join(systemRoot, "System32/icacls.exe"), target, "/grant", grant], {
        stdout: "ignore",
        stderr: "ignore",
      })
      expect(await child.exited).toBe(0)
    }
    const capability =
      "*S-1-15-3-1024-1528657515-1944437972-2795272136-1227674495-293963776-353393192-4060142787-1908764039:"
    const temporary = await mkdtemp(join(tmpdir(), "loginom-acl-cache-test-"))
    let count = 0
    const profile = async (...directories: string[]) => {
      const root = join(temporary, `profile ${count++}`)
      await mkdir(root)
      await protectWindowsProfile(root)
      for (const directory of directories) await mkdir(join(root, directory), { recursive: true })
      return root
    }
    try {
      // Paths observed on Windows after the CLI was killed during login: the
      // runtime's mkdtemp user-data-dir and the validation login disk cache.
      const network = join("cache", "tmp", "lbC1wMfr", "Default", "Network")
      const httpCache = join("loginom", "validation", "http-cache", "Default", "Cache")
      const root = await profile(network, httpCache)
      await icacls(join(root, network), capability + "(OI)(CI)M")
      // Chromium's own grant (LAB-2078 readback): Modify, Synchronize on the
      // directory plus an inherit-only entry with these generic rights.
      await icacls(join(root, httpCache), capability + "(OI)(CI)(GR,GW,GE,D)")
      await writeFile(join(root, network, "Cookies"), "test")
      await writeFile(join(root, httpCache, "index"), "test")
      await protectWindowsProfile(root)
      for (const [directory, grant] of [
        [join("cache", "tmp", "other", "Default", "Network"), capability + "(OI)(CI)M"],
        [join("cache", "tmp"), capability + "M"],
        [join("cache", "tmp", "lbC1wMfr"), capability + "M"],
        [join("loginom", "validation", "http-cache"), capability + "M"],
        [join("loginom", "validation", "other", "Default"), capability + "(OI)(CI)M"],
        [join("config", "Default"), capability + "(OI)(CI)M"],
        [network, capability + "(OI)(CI)F"],
        // Only Modify + Synchronize: 0.4.3 accepted these because they are not FullControl.
        [network, capability + "(OI)(CI)(M,WDAC)"],
        [network, capability + "(OI)(CI)(M,WO)"],
        [network, capability + "(OI)(CI)(M,DC)"],
        [network, capability + "(OI)(CI)(IO)(GA)"],
        [network, "*S-1-15-2-1:(OI)(CI)M"],
        // Another principal inside an anchor is what the check exists for.
        [network, "*S-1-1-0:(OI)(CI)R"],
        // The anchors hold only relative to the profile root, never deeper.
        [join("config", "cache", "tmp", "lbC1wMfr", "Default", "Network"), capability + "(OI)(CI)M"],
        [join("data", "loginom", "validation", "http-cache", "Default"), capability + "(OI)(CI)M"],
        // Only the exact mkdtemp name shape: lb plus six characters, lowercase prefix.
        [join("cache", "tmp", "lbC1wMf", "Default", "Network"), capability + "(OI)(CI)M"],
        [join("cache", "tmp", "lbC1wMfr0", "Default", "Network"), capability + "(OI)(CI)M"],
        [join("cache", "tmp", "LBC1wMfr", "Default", "Network"), capability + "(OI)(CI)M"],
      ]) {
        const rejected = await profile(directory)
        await icacls(join(rejected, directory), grant)
        await expect(protectWindowsProfile(rejected)).rejects.toThrow("PROFILE_PERMISSIONS_INVALID")
      }
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  },
  100000,
)

test.skipIf(process.platform !== "win32")(
  "native cleanup removes only abandoned Chromium directories directly in the profile cache\\tmp",
  async () => {
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
    if (!systemRoot) throw Error("SystemRoot required")
    // Standard users may create junctions but not symlinks.
    const junction = async (link: string, target: string) => {
      const child = Bun.spawn([join(systemRoot, "System32/cmd.exe"), "/d", "/c", "mklink", "/J", link, target], {
        stdout: "ignore",
        stderr: "ignore",
      })
      expect(await child.exited).toBe(0)
    }
    const temporary = await mkdtemp(join(tmpdir(), "loginom-acl-cleanup-test-"))
    try {
      const outside = join(temporary, "outside")
      await mkdir(join(outside, "lbC1wMfr"), { recursive: true })
      await writeFile(join(outside, "keep.txt"), "keep")
      const root = join(temporary, "profile")
      await mkdir(root)
      await protectWindowsProfile(root)
      const abandoned = join(root, "cache", "tmp", "lbC1wMfr")
      await mkdir(join(abandoned, "Default", "Network"), { recursive: true })
      await writeFile(join(abandoned, "Default", "Network", "Cookies"), "test")
      // A junction inside an abandoned directory is unlinked, never entered.
      await junction(join(abandoned, "Default", "link"), outside)
      const kept = [
        join("cache", "tmp", "lbC1wMf"),
        join("cache", "tmp", "lbC1wMfr0"),
        // NTFS names are case-insensitive: a different name, not LBC1wMfr.
        join("cache", "tmp", "LBx9Yz00"),
        join("cache", "tmp", "lb-1wMfr"),
        join("cache", "tmp", "other", "lbC1wMfr"),
        join("config", "cache", "tmp", "lbC1wMfr"),
      ]
      for (const directory of kept) await mkdir(join(root, directory, "Default"), { recursive: true })
      await writeFile(join(root, "cache", "tmp", "lbAbCd12"), "not a directory")
      await junction(join(root, "cache", "tmp", "lbJunct1"), outside)
      await removeAbandonedBrowserDirectories(root)
      await expect(lstat(abandoned)).rejects.toThrow()
      for (const directory of kept) expect((await lstat(join(root, directory, "Default"))).isDirectory()).toBe(true)
      expect(await readFile(join(root, "cache", "tmp", "lbAbCd12"), "utf8")).toBe("not a directory")
      await lstat(join(root, "cache", "tmp", "lbJunct1"))
      expect(await readFile(join(outside, "keep.txt"), "utf8")).toBe("keep")
      expect((await lstat(join(outside, "lbC1wMfr"))).isDirectory()).toBe(true)
      // Nothing left to remove: returns without starting PowerShell.
      await removeAbandonedBrowserDirectories(root)

      // The anchor is the profile root itself: a redirected cache\tmp is refused.
      const redirected = join(temporary, "redirected")
      await mkdir(join(redirected, "cache"), { recursive: true })
      await junction(join(redirected, "cache", "tmp"), outside)
      await expect(removeAbandonedBrowserDirectories(redirected)).rejects.toThrow("PROFILE_CLEANUP_FAILED")
      expect((await lstat(join(outside, "lbC1wMfr"))).isDirectory()).toBe(true)
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  },
  60000,
)
