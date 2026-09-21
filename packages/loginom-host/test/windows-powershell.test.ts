import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { win32 } from "node:path"
import { windowsPowerShellArguments } from "../src/windows-powershell"

test("PowerShell module isolation precedes the caller script", () => {
  const args = windowsPowerShellArguments("[Console]::Out.Write('test')")
  expect(args.slice(0, -1)).toEqual(["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand"])
  expect(Buffer.from(args.at(-1)!, "base64").toString("utf16le")).toBe(
    "$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules')\n[Console]::Out.Write('test')",
  )
})

test.skipIf(process.platform !== "win32")(
  "native commands use only built-in Windows modules",
  () => {
    const root = process.env.SystemRoot ?? process.env.SYSTEMROOT
    if (!root) throw Error("SystemRoot required")
    const result = spawnSync(
      win32.join(root, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      windowsPowerShellArguments(`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
if (@(Get-Process).Count -eq 0) { exit 1 }
[Console]::Out.Write($env:PSModulePath)
`),
      {
        env: { SystemRoot: root, PSModulePath: "C:\\untrusted-modules" },
        windowsHide: true,
        timeout: 15000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stdout.toLowerCase()).toBe(win32.join(root, "System32/WindowsPowerShell/v1.0/Modules").toLowerCase())
  },
  20000,
)
