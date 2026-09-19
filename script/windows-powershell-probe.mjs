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
function probe(selected, timeout = 3000) {
  const started = Date.now()
  const result = spawnSync(
    win32.join(root, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(source, "utf16le").toString("base64")],
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
let selected = entries
let chunks = 2
while (selected.length) {
  const size = Math.ceil(selected.length / chunks)
  let reduced = false
  for (let start = 0; start < selected.length; start += size) {
    const candidate = selected.filter((_, index) => index < start || index >= start + size)
    if (!probe(candidate)) continue
    selected = candidate
    chunks = Math.max(2, chunks - 1)
    reduced = true
    break
  }
  if (reduced) continue
  if (chunks >= selected.length) break
  chunks = Math.min(selected.length, chunks * 2)
}
console.log(JSON.stringify({ minimalKeys: selected.map(([key]) => key) }))
