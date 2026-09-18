import { execFile } from "node:child_process"
import { win32 } from "node:path"

// Called before creating the writer guard or writing profile data. Existing
// profiles are inspected, never recursively rewritten to hide unsafe ACLs.
export async function protectWindowsProfile(root: string) {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
  if (process.platform !== "win32" || !systemRoot || !win32.isAbsolute(systemRoot) || !win32.isAbsolute(root))
    throw Error("PROFILE_PERMISSIONS_INVALID")
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
        $segments = @($entry.FullName.Split([IO.Path]::DirectorySeparatorChar))
        $artifactIndex = [Array]::IndexOf($segments, 'artifacts')
        $uploadRoot = $artifactIndex -ge 0 -and $artifactIndex + 2 -eq $segments.Count -and $segments[$artifactIndex + 1] -eq 'input' -and
          ($access.FileSystemRights -band ([Security.AccessControl.FileSystemRights]::ReadData -bor [Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership)) -eq 0
        $uploadTransfer = $artifactIndex -ge 0 -and $artifactIndex + 2 -lt $segments.Count -and
          $segments[$artifactIndex + 1] -eq 'input' -and
          $segments[$artifactIndex + 2] -match '^transfer-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' -and
          $access.IdentityReference.Value -eq 'S-1-15-3-1024-1528657515-1944437972-2795272136-1227674495-293963776-353393192-4060142787-1908764039' -and
          ($access.FileSystemRights -band ([Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership)) -eq 0
        $browserCapability = (@($segments) -contains 'browser-profile' -and
          $access.IdentityReference.Value -match '^S-1-15-3-1024-(?:[0-9]+-){7}[0-9]+$' -and
          ($access.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl
        ) -or ($access.IdentityReference.Value -eq 'S-1-15-3-1024-1528657515-1944437972-2795272136-1227674495-293963776-353393192-4060142787-1908764039' -and ($uploadRoot -or $uploadTransfer))
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
  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      win32.join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      { env: { SystemRoot: systemRoot }, windowsHide: true, timeout: 30000, maxBuffer: 1024 },
      (error, stdout) => {
        if (error || stdout !== "OK") return reject(Error("PROFILE_PERMISSIONS_INVALID"))
        resolve()
      },
    )
    child.stdin?.on("error", () => reject(Error("PROFILE_PERMISSIONS_INVALID")))
    child.stdin?.end(Buffer.from(root, "utf16le").toString("base64"))
  })
}
