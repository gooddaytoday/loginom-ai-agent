import { execFileSync } from "node:child_process"
import { win32 } from "node:path"
import { windowsPowerShellArguments } from "@loginom-ai-agent/loginom-host/windows-powershell"

// Loginom AI Agent (B5.1e, G2): the Windows ACL check of a CLI profile, ported from 0.4
// (`v0.4.0:packages/opencode/src/cli/profile-windows.ts`). `profile.ts` calls it before the profile is used. Existing
// profiles are inspected, never recursively rewritten to hide unsafe ACLs. It is synchronous, as `apply` is.
export function protectWindowsProfile(root: string) {
  if (process.platform !== "win32") throw Error("PROFILE_PERMISSIONS_INVALID")
  const command = windowsProfileCommand(root, process.env.SystemRoot ?? process.env.SYSTEMROOT)
  try {
    const output = execFileSync(command.file, command.args, {
      input: command.input,
      env: { SystemRoot: command.systemRoot },
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 1024,
      encoding: "utf8",
    })
    if (output !== "OK") throw Error("PROFILE_PERMISSIONS_INVALID")
  } catch {
    throw Error("PROFILE_PERMISSIONS_INVALID")
  }
}

// The profile path goes through stdin (base64 of UTF-16), never argv or the script, so no path can alter the script.
export function windowsProfileCommand(root: string, systemRoot: string | undefined) {
  if (!systemRoot || !win32.isAbsolute(systemRoot) || !win32.isAbsolute(root)) throw Error("PROFILE_PERMISSIONS_INVALID")
  return {
    file: win32.join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    args: windowsPowerShellArguments(script),
    input: Buffer.from(root, "utf16le").toString("base64"),
    systemRoot,
  }
}

const script = `
$ErrorActionPreference = 'Stop'
try {
  $path = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $item = Get-Item -LiteralPath $path -Force
  if (!$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { exit 1 }
  $acl = Get-Acl -LiteralPath $path
  if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { exit 1 }
  $children = @(Get-ChildItem -LiteralPath $path -Force)
  if ($children.Count -eq 0) {
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $path -AclObject $acl
  }
  $items = New-Object System.Collections.Queue
  $items.Enqueue($item)
  while ($items.Count -gt 0) {
    $entry = $items.Dequeue()
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 1 }
    $security = Get-Acl -LiteralPath $entry.FullName
    if ($security.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { exit 1 }
    $rules = $security.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    $userFull = $false
    foreach ($access in $rules) {
      # Deny entries only reduce access. Chromium adds an Everyone/Traverse
      # deny to some LevelDB files, so rejecting denials makes a valid profile
      # impossible to reopen without weakening its confidentiality.
      if ($access.AccessControlType -eq [Security.AccessControl.AccessControlType]::Deny) { continue }
      if ($access.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { exit 1 }
      # Loginom runtime directories deliberately retain LocalSystem so that
      # Windows can service Chromium files. Other allows are handled narrowly.
      if ($access.IdentityReference.Value -ne $sid.Value -and $access.IdentityReference.Value -ne 'S-1-5-18') {
        # Chromium grants its restricted AppContainer capability modify access
        # to cache/network directories. Accept that narrow SID class only
        # inside browser-profile and never with FullControl.
        $browserCapability = @($entry.FullName.Split([IO.Path]::DirectorySeparatorChar)) -contains 'browser-profile' -and
          $access.IdentityReference.Value -match '^S-1-15-3-1024-(?:[0-9]+-){7}[0-9]+$' -and
          ($access.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl
        if (!$browserCapability) { exit 1 }
      }
      if ($access.IdentityReference.Value -eq $sid.Value -and ($access.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) { $userFull = $true }
    }
    if (!$userFull) { exit 1 }
    if ($entry.PSIsContainer) {
      foreach ($child in @(Get-ChildItem -LiteralPath $entry.FullName -Force)) { $items.Enqueue($child) }
    }
  }
  [Console]::Out.Write('OK')
} catch { exit 1 }
`
