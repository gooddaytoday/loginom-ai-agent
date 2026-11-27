import { execFile } from "node:child_process"
import { readdir } from "node:fs/promises"
import { win32 } from "node:path"
import { windowsPowerShellArguments } from "@loginom-ai-agent/loginom-host/windows-powershell"

// Called before creating the writer guard or writing profile data. Existing
// profiles are inspected, never recursively rewritten to hide unsafe ACLs.
// The error stays the bare code machine consumers match; the refused path and
// ACE go to the person through notice.
export async function protectWindowsProfile(root: string, notice?: (text: string) => void) {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
  if (process.platform !== "win32" || !systemRoot || !win32.isAbsolute(systemRoot) || !win32.isAbsolute(root))
    throw Error("PROFILE_PERMISSIONS_INVALID")
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $path = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  function Reject($at, $reason) {
    [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes(('{0}: {1}' -f $at, $reason))))
    exit 1
  }
  function Format-Ace($access) {
    'ACE {0} {1}, rights 0x{2:X8} ({3}), inheritance {4}, propagation {5}, inherited {6}' -f $access.IdentityReference.Value,
      $access.AccessControlType, [int]$access.FileSystemRights, $access.FileSystemRights, $access.InheritanceFlags,
      $access.PropagationFlags, $access.IsInherited
  }
  $item = Get-Item -LiteralPath $path -Force
  if (!$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { Reject $path 'not a directory, or a reparse point' }
  $acl = Get-Acl -LiteralPath $path
  $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if ($owner -ne $sid.Value) { Reject $path ('owner {0}, expected {1}' -f $owner, $sid.Value) }
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
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { Reject $entry.FullName 'reparse point' }
    $security = Get-Acl -LiteralPath $entry.FullName
    $owner = $security.GetOwner([Security.Principal.SecurityIdentifier]).Value
    if ($owner -ne $sid.Value) { Reject $entry.FullName ('owner {0}, expected {1}' -f $owner, $sid.Value) }
    # On Windows the runtime keeps Chromium's user-data-dir in cache/tmp/lbXXXXXX
    # (mkdtemp under the profile TMP, for MAX_PATH) and the validation login its
    # disk cache in loginom/validation/http-cache. Normal shutdown removes both;
    # a killed CLI leaves them. Match them only strictly below these root-relative
    # anchors; an entry not below the root gets no exception.
    $relative = @()
    $prefix = $item.FullName + [IO.Path]::DirectorySeparatorChar
    if ($entry.FullName.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
      $relative = @($entry.FullName.Substring($prefix.Length).Split([IO.Path]::DirectorySeparatorChar))
    }
    $chromiumCache = $relative.Count -ge 4 -and (
      ($relative[0] -eq 'cache' -and $relative[1] -eq 'tmp' -and $relative[2] -cmatch '^lb[A-Za-z0-9]{6}\\z') -or
      ($relative[0] -eq 'loginom' -and $relative[1] -eq 'validation' -and $relative[2] -eq 'http-cache')
    )
    $rules = $security.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    $userFull = $false
    foreach ($access in $rules) {
      # Deny entries only reduce access. Chromium adds an Everyone/Traverse
      # deny to some LevelDB files, so rejecting denials makes a valid profile
      # impossible to reopen without weakening its confidentiality.
      if ($access.AccessControlType -eq [Security.AccessControl.AccessControlType]::Deny) { continue }
      if ($access.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { Reject $entry.FullName (Format-Ace $access) }
      # Loginom runtime directories deliberately retain LocalSystem so that
      # Windows can service Chromium files. Other allows are handled narrowly.
      if ($access.IdentityReference.Value -ne $sid.Value -and $access.IdentityReference.Value -ne 'S-1-5-18') {
        # Chromium grants its restricted AppContainer capability modify access
        # to cache/network directories. Accept that narrow SID class only
        # inside browser-profile or the Chromium caches above. Chromium asks for
        # GENERIC_READ|WRITE|EXECUTE|DELETE: Windows stores Modify, Synchronize
        # plus an inherit-only entry with the generic bits. Map generic bits
        # through the file mapping and allow nothing beyond Modify, Synchronize:
        # no ChangePermissions, TakeOwnership, DeleteSubdirectoriesAndFiles.
        $rights = [int]$access.FileSystemRights
        $mapped = $rights -band 0x0FFFFFFF
        if ($rights -band [int]::MinValue) { $mapped = $mapped -bor 0x120089 }
        if ($rights -band 0x40000000) { $mapped = $mapped -bor 0x120116 }
        if ($rights -band 0x20000000) { $mapped = $mapped -bor 0x1200A0 }
        if ($rights -band 0x10000000) { $mapped = $mapped -bor 0x1F01FF }
        $browserCapability = ($chromiumCache -or (@($entry.FullName.Split([IO.Path]::DirectorySeparatorChar)) -contains 'browser-profile')) -and
          $access.IdentityReference.Value -match '^S-1-15-3-1024-(?:[0-9]+-){7}[0-9]+$' -and
          ($mapped -band -bnot 0x1301BF) -eq 0
        if (!$browserCapability) { Reject $entry.FullName (Format-Ace $access) }
      }
      if ($access.IdentityReference.Value -eq $sid.Value -and ($access.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) { $userFull = $true }
    }
    if (!$userFull) { Reject $entry.FullName ('no FullControl ACE for {0}' -f $sid.Value) }
    if ($entry.PSIsContainer) {
      foreach ($child in @(Get-ChildItem -LiteralPath $entry.FullName -Force)) { $items.Enqueue($child) }
    }
  }
  [Console]::Out.Write('OK')
} catch { exit 1 }
`
  await runPowerShell(systemRoot, script, root, "PROFILE_PERMISSIONS_INVALID", notice)
}

const abandonedBrowserDirectory = /^lb[A-Za-z0-9]{6}$/

// Removes Chromium user-data-dirs (cache/tmp/lbXXXXXX, see above) that a
// killed CLI left behind. Call it only while holding the profile writer guard
// taken over from a dead owner. Only directories directly in <root>/cache/tmp
// are removed; reparse points are never followed, only unlinked.
export async function removeAbandonedBrowserDirectories(root: string) {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
  if (process.platform !== "win32" || !systemRoot || !win32.isAbsolute(systemRoot) || !win32.isAbsolute(root))
    throw Error("PROFILE_CLEANUP_FAILED")
  const names = await readdir(win32.join(root, "cache", "tmp")).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw Error("PROFILE_CLEANUP_FAILED")
  })
  if (!names.some((name) => abandonedBrowserDirectory.test(name))) return
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $root = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))
  $reparse = [IO.FileAttributes]::ReparsePoint
  $cache = [IO.Path]::Combine($root, 'cache')
  $tmp = [IO.Path]::Combine($cache, 'tmp')
  foreach ($path in @($root, $cache, $tmp)) {
    $item = Get-Item -LiteralPath $path -Force
    if (!$item.PSIsContainer -or ($item.Attributes -band $reparse)) { exit 1 }
  }
  function Remove-Entry($entry) {
    # A junction or symlink is removed as a link; its target is never entered.
    if ($entry.PSIsContainer -and !($entry.Attributes -band $reparse)) {
      foreach ($child in @(Get-ChildItem -LiteralPath $entry.FullName -Force)) { Remove-Entry $child }
    }
    if ($entry.PSIsContainer) { [IO.Directory]::Delete($entry.FullName, $false) } else { [IO.File]::Delete($entry.FullName) }
  }
  $failed = $false
  foreach ($entry in @(Get-ChildItem -LiteralPath $tmp -Force)) {
    if (!$entry.PSIsContainer -or ($entry.Attributes -band $reparse) -or $entry.Name -cnotmatch '^lb[A-Za-z0-9]{6}\\z') { continue }
    try { Remove-Entry $entry } catch { $failed = $true }
  }
  if ($failed) { exit 1 }
  [Console]::Out.Write('OK')
} catch { exit 1 }
`
  await runPowerShell(systemRoot, script, root, "PROFILE_CLEANUP_FAILED")
}

function runPowerShell(
  systemRoot: string,
  script: string,
  root: string,
  code: string,
  notice?: (text: string) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const child = execFile(
      win32.join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      windowsPowerShellArguments(script),
      { env: { SystemRoot: systemRoot }, windowsHide: true, timeout: 30000, maxBuffer: 1 << 20 },
      (error, stdout) => {
        if (error || stdout !== "OK") {
          // A refusal reason arrives as base64 UTF-16, unaffected by the console code page.
          if (notice && /^[A-Za-z0-9+/]+=*$/.test(stdout))
            notice(`${code}: ${Buffer.from(stdout, "base64").toString("utf16le")}`)
          return reject(Error(code))
        }
        resolve()
      },
    )
    child.stdin?.on("error", () => reject(Error(code)))
    child.stdin?.end(Buffer.from(root, "utf16le").toString("base64"))
  })
}
