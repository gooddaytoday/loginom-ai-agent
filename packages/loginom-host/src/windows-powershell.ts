// Cold Windows PowerShell startup can exceed 15s on Windows Server 2022.
// This is a local OS-command limit, independent of agent/tool deadlines.
export const WINDOWS_POWERSHELL_TIMEOUT_MS = 30_000

// Windows PowerShell rebuilds PSModulePath at startup, even with a minimal
// environment. Pin it inside the script before any cmdlet can auto-load user or
// third-party modules (large machine module catalogs can also stall discovery).
// Callers must keep secrets in private stdin, never in this script or argv.
export function windowsPowerShellArguments(script: string) {
  return [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    Buffer.from("$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules')\n" + script, "utf16le").toString("base64"),
  ]
}
