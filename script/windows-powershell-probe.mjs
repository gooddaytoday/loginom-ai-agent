import { spawnSync } from "node:child_process"
import { win32 } from "node:path"

if (process.platform !== "win32") throw Error("Windows is required")
const root = process.env.SystemRoot ?? process.env.SYSTEMROOT
const source =
  "Add-Type -AssemblyName System.Security; $data = [Text.Encoding]::UTF8.GetBytes('probe'); $encrypted = [Security.Cryptography.ProtectedData]::Protect($data, $null, 'CurrentUser'); if ($encrypted.Length -gt 0 -and @(Get-Process).Count -gt 0) { [Console]::Out.Write('OK') }"
const entries = Object.entries(process.env).filter(
  ([key]) => !/TOKEN|KEY|PASSWORD|SECRET|AUTH/i.test(key) && key.toUpperCase() !== "SYSTEMROOT",
)

// Delta-debug only the synthetic probe's environment. Never print values or
// subprocess diagnostics, and never put credentials in the child environment.
function probe(selected, timeout = 3000, command = source) {
  const started = Date.now()
  const result = spawnSync(
    win32.join(root, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")],
    {
      env: { SystemRoot: root, ...Object.fromEntries(selected) },
      windowsHide: true,
      timeout,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  )
  const ok = result.status === 0 && result.stdout === "OK"
  console.log(JSON.stringify({ keys: selected.map(([key]) => key), milliseconds: Date.now() - started, ok }))
  return ok
}

if (!probe(entries, 15000)) throw Error("Inherited non-secret environment failed")
console.log(JSON.stringify({ moduleSearchDirectories: process.env.PSModulePath?.split(";") }))
for (const [name, prefix] of Object.entries({
  runtimePath: "$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules'); ",
  explicitModules:
    "$PSModuleAutoLoadingPreference = 'None'; Import-Module ([IO.Path]::Combine($PSHOME, 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')); Import-Module ([IO.Path]::Combine($PSHOME, 'Modules/Microsoft.PowerShell.Management/Microsoft.PowerShell.Management.psd1')); ",
})) {
  console.log(name)
  probe([], 3000, prefix + source)
}
for (const path of process.env.PSModulePath?.split(";") ?? []) {
  console.log(JSON.stringify({ moduleDirectory: path }))
  probe([["PSModulePath", path]])
}
