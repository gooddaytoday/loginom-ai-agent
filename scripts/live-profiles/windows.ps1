# B3.3 on the Windows stand, run from the administrator SSH session (`stand.sh admin`). UTF-8 with BOM: Windows
# PowerShell 5.1 reads it so. The checks themselves run as a temporary standard local account with a Cyrillic name and
# a space (`stand.sh user`); everything of the run lies in C:\lab\b33 and in that account's profile.
#   snapshot -Out <file> | account-create | account-delete | dist | clean
param(
  [Parameter(Mandatory)][ValidateSet('snapshot', 'account-create', 'account-delete', 'dist', 'clean')][string]$Task,
  [string]$Out
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Name = 'Проверка Б33'
$Root = 'C:\lab\b33'
$Secret = Join-Path $Root 'secret\account.txt'

# Win32-OpenSSH loads the profile on every password logon and never unloads it: the User Profile Service logs one
# load (event 5) and no unload, the hive stays in HKU without processes or handles, and Win32_UserProfile cannot be
# removed (0x80070020). One LoadUserProfile with the account's token, then UnloadUserProfile until the service unloads
# the hive, gives the count back; on B3.3 that took 28 unloads.
function Release-Profile($user) {
  $hive = "Registry::HKEY_USERS\$($user.SID.Value)"
  if (-not (Test-Path $hive)) { return }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class B33Profile {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct PROFILEINFO { public int dwSize; public int dwFlags; public string lpUserName; public string lpProfilePath; public string lpDefaultPath; public string lpServerName; public string lpPolicyPath; public IntPtr hProfile; }
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool LogonUser(string user, string domain, string password, int type, int provider, out IntPtr token);
  [DllImport("userenv.dll", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool LoadUserProfile(IntPtr token, ref PROFILEINFO info);
  [DllImport("userenv.dll", SetLastError = true)] public static extern bool UnloadUserProfile(IntPtr token, IntPtr profile);
  [DllImport("ntdll.dll")] public static extern int RtlAdjustPrivilege(int privilege, bool enable, bool thread, out bool previous);
  [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool DuplicateHandle(IntPtr sp, IntPtr h, IntPtr tp, out IntPtr th, int access, bool inherit, int options);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
}
'@
  $previous = $false
  [void][B33Profile]::RtlAdjustPrivilege(17, $true, $false, [ref]$previous)
  [void][B33Profile]::RtlAdjustPrivilege(18, $true, $false, [ref]$previous)
  $token = [IntPtr]::Zero
  if (-not [B33Profile]::LogonUser($Name, '.', (Get-Content $Secret -Raw), 2, 0, [ref]$token)) { throw "LogonUser: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
  $info = New-Object B33Profile+PROFILEINFO
  $info.dwSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
  $info.dwFlags = 1
  $info.lpUserName = $Name
  if (-not [B33Profile]::LoadUserProfile($token, [ref]$info)) { throw "LoadUserProfile: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
  $copies = @(1..100 | ForEach-Object { $copy = [IntPtr]::Zero; [void][B33Profile]::DuplicateHandle([B33Profile]::GetCurrentProcess(), $info.hProfile, [B33Profile]::GetCurrentProcess(), [ref]$copy, 0, $false, 2); $copy })
  [void][B33Profile]::UnloadUserProfile($token, $info.hProfile)
  $released = 1
  foreach ($copy in $copies) {
    Start-Sleep -Milliseconds 500
    if (-not (Test-Path $hive)) { break }
    [void][B33Profile]::UnloadUserProfile($token, $copy)
    $released++
  }
  [void][B33Profile]::CloseHandle($token)
  Start-Sleep -Seconds 3
  "profile released after $released unloads, hive loaded: $(Test-Path $hive)"
}

switch ($Task) {
  # Read only: what B3.3 could touch on the stand.
  'snapshot' {
    $ErrorActionPreference = 'Continue'
    $names = { param($items) @($items | ForEach-Object { "$_" } | Sort-Object) }
    $rights = Join-Path $env:TEMP ("b33-rights-" + [guid]::NewGuid() + '.inf')
    secedit /export /areas USER_RIGHTS /cfg $rights | Out-Null
    $logon = Get-Content $rights | Where-Object { $_ -match '^(SeBatchLogonRight|SeNetworkLogonRight|SeInteractiveLogonRight|SeDenyBatchLogonRight)' }
    Remove-Item $rights -Force
    [ordered]@{
      time = (Get-Date).ToString('s')
      users = & $names (Get-LocalUser | ForEach-Object { "$($_.Name) enabled=$($_.Enabled) sid=$($_.SID)" })
      administrators = & $names (Get-LocalGroupMember -SID S-1-5-32-544 | ForEach-Object { $_.Name })
      usersGroup = & $names (Get-LocalGroupMember -SID S-1-5-32-545 | ForEach-Object { $_.Name })
      profiles = & $names (Get-CimInstance Win32_UserProfile | ForEach-Object { "$($_.SID) $($_.LocalPath)" })
      usersDirs = & $names (Get-ChildItem C:\Users -Force -Directory | ForEach-Object { $_.Name })
      userRights = & $names $logon
      tasks = & $names (Get-ScheduledTask | ForEach-Object { "$($_.TaskPath)$($_.TaskName)" })
      taskFolders = & $names ((New-Object -ComObject Schedule.Service) | ForEach-Object { $_.Connect(); $_.GetFolder('\').GetFolders(0) | ForEach-Object { $_.Path } })
      services = & $names (Get-Service | ForEach-Object { $_.Name })
      firewallRules = & $names (Get-NetFirewallRule | ForEach-Object { $_.Name })
      listening = & $names (Get-NetTCPConnection -State Listen | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" })
      lab = & $names (Get-ChildItem C:\lab -Force | ForEach-Object { $_.Name })
      uninstall = & $names (Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall' | ForEach-Object { $_.PSChildName })
      run = & $names (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' | ForEach-Object { $_.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { $_.Name } })
      processes = & $names (Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "$Root*" } | ForEach-Object { "$($_.ProcessId) $($_.ExecutablePath)" })
      freeGB = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
    } | ConvertTo-Json -Depth 4 | Set-Content -Path $Out -Encoding UTF8
    "snapshot: $Out"
  }
  # A standard account (Users only) with a random password kept for administrators; its work area C:\lab\b33\u.
  'account-create' {
    if (Get-LocalUser -Name $Name -ErrorAction SilentlyContinue) { throw "account $Name already exists" }
    $chars = [char[]](48..57 + 65..90 + 97..122)
    $bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $password = (-join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })) + '-Aa1'
    New-Item -ItemType Directory -Force (Split-Path $Secret) | Out-Null
    icacls (Split-Path $Secret) /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
    Set-Content -Path $Secret -Value $password -Encoding ASCII -NoNewline
    $user = New-LocalUser -Name $Name -Password (ConvertTo-SecureString $password -AsPlainText -Force) -PasswordNeverExpires -AccountNeverExpires -Description 'B3.3 temporary standard account'
    Add-LocalGroupMember -SID S-1-5-32-545 -Member $user.SID.Value
    New-Item -ItemType Directory -Force (Join-Path $Root 'u') | Out-Null
    icacls (Join-Path $Root 'u') /grant "*$($user.SID.Value):(OI)(CI)M" | Out-Null
    "created $Name sid=$($user.SID.Value)"
    'administrators: ' + ((Get-LocalGroupMember -SID S-1-5-32-544 | ForEach-Object { $_.Name }) -join ', ')
  }
  # The account's processes, its profile (Win32_UserProfile removes the folder and the ProfileList key) and the account.
  'account-delete' {
    $user = Get-LocalUser -Name $Name -ErrorAction SilentlyContinue
    if ($user) {
      Get-CimInstance Win32_Process | Where-Object { (Invoke-CimMethod -InputObject $_ -MethodName GetOwnerSid -ErrorAction SilentlyContinue).Sid -eq $user.SID.Value } | ForEach-Object {
        "stopping $($_.ProcessId) $($_.Name)"; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      }
      Start-Sleep -Seconds 3
      Release-Profile $user
      $profile = Get-CimInstance Win32_UserProfile | Where-Object { $_.SID -eq $user.SID.Value }
      if ($profile) { "removing profile $($profile.LocalPath)"; $profile | Remove-CimInstance }
      Remove-LocalUser -SID $user.SID.Value
      "deleted $Name sid=$($user.SID.Value)"
      'profile folder left: ' + (Test-Path -LiteralPath "C:\Users\$Name")
      'profile key left: ' + (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$($user.SID.Value)")
    }
    if (Test-Path (Split-Path $Secret)) { Remove-Item (Split-Path $Secret) -Recurse -Force; 'password removed' }
  }
  # The release installers already on the stand, copied unchanged; compare with SHA256SUMS.txt of the releases.
  'dist' {
    New-Item -ItemType Directory -Force (Join-Path $Root 'dist') | Out-Null
    @{ 'loginom-ai-agent-0.3.9-win-x64.exe' = 'desktop-0.3.9.exe'; 'loginom-ai-agent-0.4.0-win-x64.exe' = 'desktop-0.4.0.exe'; 'loginom-ai-agent-cli-0.4.0-win32-x64.zip' = 'cli-0.4.0.zip' }.GetEnumerator() | ForEach-Object {
      Copy-Item (Join-Path C:\lab $_.Key) (Join-Path $Root "dist\$($_.Value)") -Force
      "$((Get-FileHash (Join-Path $Root "dist\$($_.Value)")).Hash.ToLower())  $($_.Value)"
    }
  }
  'clean' {
    $left = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "$Root*" }
    if ($left) { throw "processes still run from $Root" + ($left | ForEach-Object { " $($_.ProcessId)" }) }
    Remove-Item -LiteralPath $Root -Recurse -Force
    "removed ${Root}: " + (-not (Test-Path -LiteralPath $Root))
  }
}
