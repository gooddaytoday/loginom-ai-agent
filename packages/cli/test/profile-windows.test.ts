import { expect, test } from "bun:test"
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliProfile } from "../src/profile"
import { protectWindowsProfile, windowsProfileCommand } from "../src/profile-windows"

// The Windows ACL check of a CLI profile (B5.1e, G2), ported with its test from 0.4
// (`v0.4.0:packages/opencode/test/cli/profile-windows.test.ts`). The native cases run on Windows only
// (`script/test-windows-profile.ps1` in `windows-native-check.yml`); the logic around PowerShell runs everywhere.
test("the profile path travels on stdin and relative paths are refused", () => {
  const command = windowsProfileCommand("D:\\data\\профиль с пробелами", "C:\\Windows")
  expect(command.file).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
  expect(Buffer.from(command.input, "base64").toString("utf16le")).toBe("D:\\data\\профиль с пробелами")
  expect(command.args.join(" ")).not.toContain("профиль")
  expect(command.args.slice(0, 4)).toEqual(["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand"])
  const script = Buffer.from(command.args[4]!, "base64").toString("utf16le")
  expect(script).toContain("Get-Acl")
  expect(script).not.toContain("D:\\data")
  expect(() => windowsProfileCommand("profile", "C:\\Windows")).toThrow("PROFILE_PERMISSIONS_INVALID")
  expect(() => windowsProfileCommand("C:\\profile", "Windows")).toThrow("PROFILE_PERMISSIONS_INVALID")
  expect(() => windowsProfileCommand("C:\\profile", undefined)).toThrow("PROFILE_PERMISSIONS_INVALID")
})

test.skipIf(process.platform === "win32")("Windows ACL protection fails closed on other platforms", () => {
  const systemRoot = process.env.SystemRoot
  process.env.SystemRoot = "C:\\Windows"
  try {
    expect(() => protectWindowsProfile("C:\\profile")).toThrow("PROFILE_PERMISSIONS_INVALID")
  } finally {
    if (systemRoot === undefined) delete process.env.SystemRoot
    else process.env.SystemRoot = systemRoot
  }
})

test.skipIf(process.platform !== "win32")(
  "native ACL protection inherits private access and rejects Everyone",
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), "loginom-acl-test-"))
    const root = join(temporary, "Профиль с пробелами")
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
    if (!systemRoot) throw Error("SystemRoot required")
    const icacls = (...args: string[]) =>
      Bun.spawn([join(systemRoot, "System32/icacls.exe"), ...args], { stdout: "ignore", stderr: "ignore" }).exited
    try {
      await mkdir(root)
      protectWindowsProfile(root)
      await writeFile(join(root, "synthetic.txt"), "test")
      protectWindowsProfile(root)
      const cache = join(root, "browser-profile", "Default", "Cache")
      await mkdir(cache, { recursive: true })
      expect(
        await icacls(
          cache,
          "/grant",
          "*S-1-15-3-1024-1528657515-1944437972-2795272136-1227674495-293963776-353393192-4060142787-1908764039:(OI)(CI)M",
        ),
      ).toBe(0)
      const database = join(root, "browser-profile", "Default", "CURRENT")
      await writeFile(database, "test")
      expect(await icacls(database, "/deny", "*S-1-1-0:(X)")).toBe(0)
      protectWindowsProfile(root)
      expect(await icacls(root, "/grant", "*S-1-5-18:(OI)(CI)F")).toBe(0)
      protectWindowsProfile(root)
      expect(await icacls(root, "/grant", "*S-1-1-0:(OI)(CI)R")).toBe(0)
      expect(() => protectWindowsProfile(root)).toThrow("PROFILE_PERMISSIONS_INVALID")
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  },
  60000,
)

test.skipIf(process.platform !== "win32")(
  "a native profile is applied, reopened, and refused once Everyone can read it",
  async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), "loginom-profile-test-")))
    const root = join(temporary, "Первый профиль")
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
    if (!systemRoot) throw Error("SystemRoot required")
    const env = { LOGINOM_AI_AGENT_CLI_PROFILE: root, SystemRoot: systemRoot }
    try {
      expect(CliProfile.apply({ ...env }).root).toBe(root)
      expect(CliProfile.apply({ ...env }).root).toBe(root)
      const grant = Bun.spawn([join(systemRoot, "System32/icacls.exe"), root, "/grant", "*S-1-1-0:(OI)(CI)R"], {
        stdout: "ignore",
        stderr: "ignore",
      })
      expect(await grant.exited).toBe(0)
      expect(() => CliProfile.apply({ ...env })).toThrow("PROFILE_PERMISSIONS_INVALID")
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  },
  60000,
)
