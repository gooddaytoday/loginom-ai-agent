[CmdletBinding()]
param([string]$RipgrepPath = 'rg')
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'windows-installed-smoke.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
# Load the actual check functions, never the installer or registry operations.
foreach ($name in @('Check', 'Check-Logs', 'Test-StartupLog', 'Test-CrashLog', 'Test-RetiredEndpoint')) {
    $fn = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if (-not $fn) { throw "Missing smoke function: $name" }
    Invoke-Expression $fn.Extent.Text
}
function Assert([bool]$Pass, [string]$Message) { if (-not $Pass) { throw $Message } }
function Assert-Status([string]$Id, [string]$Expected) {
    $actual = @($checks | Where-Object id -eq $Id)
    if ($actual.Count -ne 1 -or $actual[0].status -ne $Expected) {
        throw "$Id expected $Expected; actual: $($actual | ConvertTo-Json -Compress)"
    }
}
$start = "[info] app starting { version: '0.3.9', packaged: true, onboardingTest: true }`n"
Assert (-not (Test-StartupLog ($start + '[info] awaiting server ready') '0.3.9')) 'Awaiting readiness is not ready'
Assert (-not (Test-StartupLog ($start + '[info] server ready {}') '0.4.0')) 'Wrong version accepted'
Assert (-not (Test-StartupLog ($start.Replace('packaged: true', 'packaged: false') + '[info] server ready {}') '0.3.9')) 'Unpackaged app accepted'
Assert (Test-StartupLog ($start + '[info] server ready {}') '0.3.9') 'Healthy startup rejected'
$startup = "[2026-11-12 16:58:19.163] [info]  (crash) crash reporter started {`n  path: 'C:\\lab\\profile\\desktop\\Crashpad'`n}"
Assert (Test-CrashLog $startup) 'Normal crash setup rejected'
Assert (-not (Test-CrashLog ($startup + "`nunexpected metadata"))) 'Unexpected crash-log content accepted'
Assert (-not (Test-CrashLog '[2026-11-12 16:58:19.163] [info] (crash) crash reporter started {')) 'Incomplete startup record accepted'
Assert (-not (Test-CrashLog '[error] (crash) previous session ended unexpectedly')) 'Crash accepted'
Assert (-not (Test-CrashLog '[info] (crash) renderer process gone')) 'Unexpected crash info event accepted'
$root = Join-Path ([IO.Path]::GetTempPath()) ('windows-smoke-regression-' + [guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path $root | Out-Null
    $path = Join-Path $root 'payload.asar'
    [IO.File]::WriteAllBytes($path, ([byte[]]@(0,1,0,1) + [Text.Encoding]::UTF8.GetBytes('mcp.loginom.ai') + [byte[]]@(0,1,0,1)))
    Assert (Test-RetiredEndpoint $root $RipgrepPath) 'Binary retired endpoint missed'
    [IO.File]::WriteAllText($path, 'https://app.loginom.ai/resources/help')
    Assert (-not (Test-RetiredEndpoint $root $RipgrepPath)) 'Clean payload rejected'
    $logs = Join-Path $root 'desktop\logs\run'
    $crash = Join-Path $logs 'crash.log'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    foreach ($case in @(
        @{ name='absent'; text=$null; status='PASS' },
        @{ name='empty'; text=''; status='PASS' },
        @{ name='startup'; text=$startup; status='PASS' },
        @{ name='CRLF startup'; text=$startup.Replace("`n", "`r`n"); status='PASS' },
        @{ name='repeated startup'; text=($startup + "`r`n" + $startup); status='PASS' },
        @{ name='unexpected record'; text=($startup + "`r`n[2026-11-12 16:58:20.000] [warn] (crash) previous session did not exit cleanly"); status='FAIL' },
        @{ name='startup substring'; text='unexpected crash reporter started'; status='FAIL' },
        @{ name='incomplete record'; text='[2026-11-12 16:58:19.163] [info] (crash) crash reporter started {'; status='FAIL' },
        @{ name='unexpected metadata'; text=($startup -replace 'path:', 'unexpected:'); status='FAIL' },
        @{ name='fatal startup'; text=($startup -replace '\[info\]', '[fatal]'); status='FAIL' }
    )) {
        if ($null -eq $case.text) { Remove-Item $crash -ErrorAction SilentlyContinue }
        else { [IO.File]::WriteAllText($crash, $case.text) }
        $checks = [Collections.Generic.List[object]]::new()
        $report = [ordered]@{}
        Check-Logs $root
        Assert-Status 'no-crash-events' $case.status
        Write-Output "PASS $($case.name)"
    }
    [IO.File]::WriteAllText($crash, $startup)
    [IO.File]::WriteAllText((Join-Path $logs 'server.log'), 'level=WARN message="background dependency install failed" error="404 @loginom-ai-agent/plugin"')
    $checks = [Collections.Generic.List[object]]::new()
    Check-Logs $root
    Assert-Status 'background-dependency-install' 'WARN'
    Assert (@($checks | Where-Object status -eq 'FAIL').Count -eq 0) 'WARN failed the smoke'
    Assert (($checks | Where-Object id -eq 'background-dependency-install').detail -match 'server.log:1:.*404') 'Missing warning evidence'
    $jsonChecks = @((@{ checks=$checks } | ConvertTo-Json -Depth 5 | ConvertFrom-Json).checks)
    Assert (@($jsonChecks | Where-Object { $_.id -eq 'background-dependency-install' -and $_.status -eq 'WARN' }).Count -eq 1) 'JSON lost the WARN row'
    Assert (($checks | Format-Table id,status,detail | Out-String -Width 300) -match 'background-dependency-install\s+WARN') 'Table lost the WARN row'
    Write-Output 'PASS dependency WARN preserves successful result, JSON, table and evidence'
    [IO.File]::WriteAllText((Join-Path $logs 'main.log'), '[error] real failure')
    [IO.File]::WriteAllText((Join-Path $root 'failure.dmp'), 'dump')
    $checks = [Collections.Generic.List[object]]::new()
    Check-Logs $root
    Assert-Status 'no-error-lines' 'FAIL'
    Assert-Status 'no-minidumps' 'FAIL'
    Assert-Status 'background-dependency-install' 'WARN'
    Write-Output 'PASS ERROR and minidump still fail alongside WARN'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
Write-Host 'PASS: startup/version, strict crash records, dependency WARN and binary endpoint regression checks'
exit 0
