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
  $path = [Console]::In.ReadToEnd()
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
    $full = $false
    foreach ($access in $rules) {
      if ($access.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { exit 1 }
      if ($access.IdentityReference.Value -ne $sid.Value) { exit 1 }
      if (($access.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) { $full = $true }
    }
    if (!$full) { exit 1 }
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
    child.stdin?.end(root)
  })
}
