import { spawnSync } from "node:child_process"
import { win32 } from "node:path"

if (process.platform !== "win32") throw Error("Windows is required")
const root = process.env.SystemRoot ?? process.env.SYSTEMROOT
const system = { SystemRoot: root }
const systemModules = { ...system, PSModulePath: win32.join(root, "System32/WindowsPowerShell/v1.0/Modules") }
const systemPath = { ...system, PATH: win32.join(root, "System32") }
const profile = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|WINDIR|COMSPEC)$/i.test(
      key,
    ),
  ),
)
for (const [name, env] of Object.entries({
  system,
  systemPath,
  modulesAndPath: { ...systemModules, ...systemPath },
  profileAndPath: { ...profile, ...systemModules, ...systemPath },
  noAnalysisCache: { ...systemModules, PSModuleAnalysisCachePath: "NUL" },
  inherited: process.env,
})) {
  for (const [operation, source] of Object.entries({
    startup: "[Console]::Out.Write('OK')",
    native:
      "[Console]::Out.Write('start;'); Add-Type -AssemblyName System.Security; [Console]::Out.Write('assembly;'); $data = [Text.Encoding]::UTF8.GetBytes('probe'); $encrypted = [Security.Cryptography.ProtectedData]::Protect($data, $null, 'CurrentUser'); [Console]::Out.Write('dpapi;'); if ($encrypted.Length -gt 0 -and @(Get-Process).Count -gt 0) { [Console]::Out.Write('OK') }",
  })) {
    const started = Date.now()
    const result = spawnSync(
      win32.join(root, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(source, "utf16le").toString("base64"),
      ],
      { env, windowsHide: true, timeout: 15_000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
    console.log(
      JSON.stringify({
        runtime: process.versions.bun ? "bun" : "node",
        environment: name,
        operation,
        milliseconds: Date.now() - started,
        exitCode: result.status,
        error: result.error?.code,
        stages: result.stdout,
        ok: result.stdout.endsWith("OK"),
      }),
    )
  }
}
