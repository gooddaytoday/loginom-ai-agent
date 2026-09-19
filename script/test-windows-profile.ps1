[CmdletBinding()]
param(
  [switch]$Child,
  [string]$BunPath
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($Child) {
  $env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules')
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  if (([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Expected a standard user'
  }
  $env:TEMP = [IO.Path]::Combine([Environment]::GetFolderPath('UserProfile'), 'AppData', 'Local', 'Temp')
  $env:TMP = $env:TEMP
  [void][IO.Directory]::CreateDirectory($env:TEMP)
  & $BunPath test (Join-Path $repo 'packages/agent/test/cli/profile-windows.test.ts')
  exit $LASTEXITCODE
}
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'This isolated-account test is only for disposable GitHub-hosted runners'
}

# Hosted Windows runners are elevated and create Administrators-owned files.
# Exercise the per-user profile contract with a real standard-user token rather
# than weakening owner validation or repairing an existing profile's ACL.
$name = 'loginom-' + [Guid]::NewGuid().ToString('N').Substring(0, 10)
$stage = New-Item -ItemType Directory -Path (Join-Path $env:PUBLIC $name)
$bun = Join-Path $stage.FullName 'bun.exe'
Copy-Item -LiteralPath (Get-Command bun -CommandType Application).Source -Destination $bun
$password = ConvertTo-SecureString ([Guid]::NewGuid().ToString('N') + 'aA1!') -AsPlainText -Force
$account = New-LocalUser -Name $name -Password $password -AccountNeverExpires
try {
  Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $account
  $credential = [PSCredential]::new(".\$name", $password)
  $stdout = Join-Path $stage.FullName 'stdout.log'
  $stderr = Join-Path $stage.FullName 'stderr.log'
  # CreateProcessWithLogonW limits argv to 1024 characters. Use a short file
  # invocation instead of expanding this test wrapper into an encoded command.
  $profileProcess = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') `
    -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-File', "`"$PSCommandPath`"", '-Child', '-BunPath', "`"$bun`"") `
    -Credential $credential -LoadUserProfile -UseNewEnvironment -WindowStyle Hidden `
    -WorkingDirectory (Join-Path $repo 'packages/loginom-host') `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  if (-not $profileProcess.WaitForExit(120000)) {
    $profileProcess.Kill()
    $profileProcess.WaitForExit()
    throw 'Native profile test exceeded its process deadline'
  }
  Get-Content -LiteralPath $stdout
  Get-Content -LiteralPath $stderr
  if ($profileProcess.ExitCode -ne 0) { throw "Native profile test failed with exit code $($profileProcess.ExitCode)" }
} finally {
  # Only remove the uniquely named account this script just created. Its files
  # remain on the disposable runner for job diagnostics, never on a user PC.
  Remove-LocalUser -SID $account.SID
  $password.Dispose()
}
