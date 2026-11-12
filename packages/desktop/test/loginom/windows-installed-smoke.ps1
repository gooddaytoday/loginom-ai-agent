[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][string]$EvidenceDirectory,
  [Parameter(Mandatory)][string]$Version,
  [ValidateSet("dev", "beta", "prod")][string]$Channel = "dev",
  [string]$NodePath = "node"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw "WINDOWS_REQUIRED" }
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$node = (Get-Command $NodePath -CommandType Application -ErrorAction Stop).Source
$evidence = [IO.Path]::GetFullPath($EvidenceDirectory)
if ((Test-Path -LiteralPath $evidence) -and @(Get-ChildItem -LiteralPath $evidence -Force).Count) {
  throw "Evidence directory must be new or empty: $evidence"
}
New-Item -ItemType Directory -Force -Path $evidence | Out-Null
$slug = if ($Channel -eq "prod") { "loginom-ai-agent" } else { "loginom-ai-agent-$Channel" }
$displayName = switch ($Channel) { dev { "Loginom AI Agent Dev" } beta { "Loginom AI Agent Beta" } prod { "Loginom AI Agent" } }
$appId = if ($Channel -eq "prod") { "com.loginom.aiagent" } else { "com.loginom.aiagent.$Channel" }

# A custom /D still uses the channel's uninstall registry key. Refuse to replace
# an existing installation on a manual test machine; profiles may already exist.
foreach ($key in @("HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*")) {
  $existing = @(Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object { $_.PSObject.Properties["DisplayName"] -and $_.DisplayName -eq $displayName })
  if ($existing.Count) { throw "Channel already installed; use a clean Windows account: $displayName" }
}

$root = Join-Path ([IO.Path]::GetTempPath()) ("loginom-installed-smoke-" + [guid]::NewGuid().ToString("N"))
$install = Join-Path $root "Installed Desktop"
$profile = Join-Path $root "profile"
$dataDirectory = Join-Path $env:APPDATA $appId
$dataExisted = Test-Path -LiteralPath $dataDirectory
$sentinel = Join-Path $dataDirectory ("installed-smoke-" + [guid]::NewGuid().ToString("N") + ".txt")
$report = [ordered]@{
  status = "FAIL"; version = $Version; channel = $Channel; commit = $env:GITHUB_SHA
  installerSha256 = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
  checks = @(); failures = @(); logs = "logs"; profileLogs = "$profile\desktop\logs"
  limitations = @("No Loginom/model credentials or live business scenario", "Onboarding test mode uses an in-memory database; no history/upgrade persistence claim", "crash.log permits only the normal crash reporter initialization event", "User data preservation checks a sentinel in the channel APPDATA directory")
}
$installStarted = $false

function Invoke-BoundedProcess {
  param([string]$FilePath, [string]$Arguments, [int]$Seconds, [string]$Label)
  $options = @{ FilePath = $FilePath; ArgumentList = $Arguments; PassThru = $true }
  if ($Label -eq "probe") {
    $options.RedirectStandardOutput = Join-Path $evidence "probe.stdout.txt"
    $options.RedirectStandardError = Join-Path $evidence "probe.stderr.txt"
  }
  $child = Start-Process @options
  if (-not $child.WaitForExit($Seconds * 1000)) {
    Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
    throw "$Label timed out after $Seconds seconds"
  }
  $child.WaitForExit()
  if ($child.ExitCode -ne 0) { throw "$Label failed with exit code $($child.ExitCode)" }
}

function Get-OwnedProcesses {
  @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($install + "\", [StringComparison]::OrdinalIgnoreCase)
  })
}

try {
  New-Item -ItemType Directory -Force -Path $root, $dataDirectory | Out-Null
  [IO.File]::WriteAllText($sentinel, [guid]::NewGuid().ToString())
  $sentinelHash = (Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash
  $installStarted = $true
  # NSIS requires /D last and unquoted, including when the path contains spaces.
  Invoke-BoundedProcess $installerPath "/S /currentuser /D=$install" 180 "install"
  $report.checks += "silent-install"
  $executable = Join-Path $install "$slug.exe"
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "Installed executable missing: $executable" }
  $probe = Join-Path $PSScriptRoot "windows-installed-smoke.mjs"
  Invoke-BoundedProcess $node "`"$probe`" `"$install`" `"$profile`" `"$evidence`" `"$Version`" `"$slug.exe`"" 360 "probe"
  $report.checks += @("installed-files-retired-endpoint-scan", "bundled-help-manifest", "installed-version", "isolated-onboarding-window", "startup-and-server-ready-logs", "no-crash-events-or-dumps", "graceful-exit")
} catch {
  $report.failures += $_.Exception.Message
} finally {
  try {
    $logRoot = Join-Path $profile "desktop\logs"
    if (Test-Path -LiteralPath $logRoot) { Copy-Item -LiteralPath $logRoot -Destination (Join-Path $evidence "logs") -Recurse -Force }
    $remaining = @(Get-OwnedProcesses)
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ($remaining.Count -and [DateTime]::UtcNow -lt $deadline) {
      Start-Sleep -Milliseconds 500
      $remaining = @(Get-OwnedProcesses)
    }
    if ($remaining.Count) {
      $remaining | Select-Object ProcessId, ParentProcessId, ExecutablePath | ConvertTo-Json | Set-Content (Join-Path $evidence "leftover-processes.json")
      $report.failures += "Installed processes survived graceful exit"
      # Only executables below this invocation's unique install directory.
      foreach ($item in $remaining) { Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue }
    } else { $report.checks += "no-leftover-processes" }
  } catch { $report.failures += "Process/log cleanup: $($_.Exception.Message)" }
  try {
    if ($installStarted) {
      $uninstallers = @(Get-ChildItem -LiteralPath $install -Filter "Uninstall*.exe" -File -ErrorAction SilentlyContinue)
      if ($uninstallers.Count -ne 1) { throw "Expected one installed uninstaller, found $($uninstallers.Count)" }
      # _?= avoids NSIS copying itself and returning before removal finishes.
      Invoke-BoundedProcess $uninstallers[0].FullName "/S /currentuser _?=$install" 180 "uninstall"
      if (Test-Path -LiteralPath (Join-Path $install "$slug.exe")) { throw "Installed Desktop survived uninstall" }
      if (@(Get-OwnedProcesses).Count) { throw "Installed process survived uninstall" }
      $report.checks += "silent-uninstall"
      if (-not (Test-Path -LiteralPath $sentinel) -or (Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash -ne $sentinelHash) {
        throw "User data sentinel changed or disappeared during uninstall"
      }
      $report.checks += "user-data-preserved"
    }
  } catch { $report.failures += "Uninstall: $($_.Exception.Message)" }
  if (Test-Path -LiteralPath $sentinel) { Remove-Item -LiteralPath $sentinel -Force }
  if (-not $dataExisted -and (Test-Path -LiteralPath $dataDirectory) -and -not @(Get-ChildItem -LiteralPath $dataDirectory -Force).Count) {
    Remove-Item -LiteralPath $dataDirectory
  }
  if (-not $report.failures.Count) { $report.status = "PASS" }
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidence "windows-installed-smoke.json") -Encoding utf8
  # Retain failed profiles locally for diagnosis; artifacts contain only evidence.
  if ($report.status -eq "PASS") { Remove-Item -LiteralPath $root -Recurse -Force }
}
if ($report.status -ne "PASS") { throw ($report.failures -join "; ") }
Write-Host "PASS: installed Windows Desktop smoke ($evidence)"
