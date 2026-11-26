# Runs packages/desktop/test/loginom/windows-installed-smoke.ps1 as a throw-away standard user on a GitHub-hosted
# Windows runner (B5.1j). The runner account is an elevated administrator, and the smoke requires an ordinary one
# (`ordinary-user`, B4.14c), so this creates a local account in the Users group, as test-windows-profile.ps1 does.
# Exit code: that of the smoke (0 pass, 1 FAIL). The smoke report and logs are copied to -OutputDirectory.
[CmdletBinding()]
param(
  [switch]$Child,
  [Parameter(Mandatory = $true)][string]$Installer,
  [string]$RunRoot,
  [Parameter(Mandatory = $true)][string]$ExpectedVersion,
  [string]$Channel = 'dev',
  [string]$Mutation = 'None',
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
if ($Child) {
  $env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules')
  $env:TEMP = [IO.Path]::Combine([Environment]::GetFolderPath('UserProfile'), 'AppData', 'Local', 'Temp')
  $env:TMP = $env:TEMP
  [void][IO.Directory]::CreateDirectory($env:TEMP)
  & (Join-Path $PSScriptRoot 'windows-installed-smoke.ps1') -Installer $Installer -RunRoot $RunRoot -ExpectedVersion $ExpectedVersion `
    -Channel $Channel -AllowServer -Mutation $Mutation
  exit $LASTEXITCODE
}
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'This isolated-account smoke is only for disposable GitHub-hosted runners'
}
if (-not $OutputDirectory) { throw 'OutputDirectory is required' }

$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$smoke = Join-Path $repo 'packages\desktop\test\loginom'
$name = 'loginom-' + [Guid]::NewGuid().ToString('N').Substring(0, 10)
$stage = New-Item -ItemType Directory -Path (Join-Path $env:PUBLIC $name)
Copy-Item -LiteralPath (Join-Path $smoke 'windows-installed-smoke.ps1'), (Join-Path $smoke 'windows-sidecar-smoke.mjs'), $PSCommandPath -Destination $stage.FullName
Copy-Item -LiteralPath $Installer -Destination (Join-Path $stage.FullName 'installer.exe')
$launcher = Join-Path $stage.FullName 'run-windows-installed-smoke.ps1'
$childRoot = Join-Path $stage.FullName 'run'
$password = ConvertTo-SecureString ([Guid]::NewGuid().ToString('N') + 'aA1!') -AsPlainText -Force
$account = New-LocalUser -Name $name -Password $password -AccountNeverExpires
try {
  Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $account
  # The account writes its report next to the staged scripts; it gets nothing else of the runner.
  & icacls.exe $stage.FullName /grant "${name}:(OI)(CI)M" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Cannot grant the smoke account write access to its staging folder' }
  $stdout = Join-Path $stage.FullName 'stdout.log'
  $stderr = Join-Path $stage.FullName 'stderr.log'
  $process = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') `
    -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-File', "`"$launcher`"", '-Child',
      '-Installer', "`"$(Join-Path $stage.FullName 'installer.exe')`"", '-RunRoot', "`"$childRoot`"",
      '-ExpectedVersion', $ExpectedVersion, '-Channel', $Channel, '-Mutation', $Mutation) `
    -Credential ([PSCredential]::new(".\$name", $password)) -LoadUserProfile -UseNewEnvironment -WindowStyle Hidden `
    -WorkingDirectory $stage.FullName -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  if (-not $process.WaitForExit(1500000)) {
    $process.Kill()
    $process.WaitForExit()
    Write-Host 'Installed smoke exceeded its process deadline'
    $exit = 124
  } else { $exit = $process.ExitCode }
  Get-Content -LiteralPath $stdout
  Get-Content -LiteralPath $stderr
  New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
  foreach ($file in @('report.json', 'logs.zip')) {
    $path = Join-Path $childRoot $file
    if (Test-Path -LiteralPath $path) { Copy-Item -LiteralPath $path -Destination (Join-Path $OutputDirectory $file) -Force }
  }
  exit $exit
} finally {
  # Only the uniquely named account created above; its profile stays on the disposable runner.
  Remove-LocalUser -SID $account.SID
  $password.Dispose()
}
