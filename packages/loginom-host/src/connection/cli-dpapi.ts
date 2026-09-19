import { execFile } from "node:child_process"
import { win32 } from "node:path"
import { windowsPowerShellArguments } from "../windows-powershell"

// Windows PowerShell is an OS component. Never resolve it through user PATH or
// place credentials in argv, environment variables, scripts or temporary files.
export async function cliDpapi(operation: "Protect" | "Unprotect", input: Buffer): Promise<Buffer> {
  const root = process.env.SystemRoot ?? process.env.SYSTEMROOT
  if (process.platform !== "win32" || !root || !win32.isAbsolute(root))
    throw new Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")
  if (input.length > (operation === "Protect" ? 1024 * 1024 : 2 * 1024 * 1024))
    throw new Error("LOGINOM_CREDENTIAL_FORMAT_INVALID")
  const script = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())
  $entropy = [Text.Encoding]::UTF8.GetBytes('loginom-cli-secrets-v1')
  $result = [Security.Cryptography.ProtectedData]::${operation}($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Convert]::ToBase64String($result))
} catch { exit 1 }
`
  return new Promise((resolve, reject) => {
    const child = execFile(
      win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      windowsPowerShellArguments(script),
      { env: { SystemRoot: root }, windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" },
      (error, stdout) => {
        // Discard child errors/stderr: platform diagnostics may contain input.
        if (error || !stdout || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(stdout)) {
          reject(new Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE"))
          return
        }
        resolve(Buffer.from(stdout, "base64"))
      },
    )
    child.stdin?.on("error", () => reject(new Error("LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE")))
    child.stdin?.end(input.toString("base64"))
  })
}
