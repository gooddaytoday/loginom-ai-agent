# Run with Windows PowerShell 5.1; exercises the smoke's actual log checks without installing an app.
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot 'windows-installed-smoke.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
foreach ($name in @('Check', 'Check-Logs')) {
    $definition = $ast.Find({ param($node)
        $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
    }, $true)
    if (-not $definition) { throw "Missing production function: $name" }
    . ([scriptblock]::Create($definition.Extent.Text))
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('windows-smoke-log-test-' + [guid]::NewGuid().ToString('N'))
$logs = Join-Path $root 'desktop\logs\run'
$crash = Join-Path $logs 'crash.log'
$startup = @"
[2026-11-12 16:58:19.163] [info]  (crash) crash reporter started {
  path: 'C:\\lab\\profile\\desktop\\Crashpad'
}
"@
function Assert-Status([string]$Id, [string]$Expected) {
    $actual = @($checks | Where-Object id -eq $Id)
    if ($actual.Count -ne 1 -or $actual[0].status -ne $Expected) {
        throw "$Id expected $Expected; actual: $($actual | ConvertTo-Json -Compress)"
    }
}
try {
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    foreach ($case in @(
        @{ name='absent'; text=$null; status='PASS' },
        @{ name='startup'; text=$startup; status='PASS' },
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
    if (@($checks | Where-Object status -eq 'FAIL').Count) { throw 'WARN failed the smoke' }
    if (($checks | Where-Object id -eq 'background-dependency-install').detail -notmatch 'server.log:1:.*404') { throw 'Missing warning evidence' }
    Write-Output 'PASS dependency WARN preserves successful result and evidence'
    [IO.File]::WriteAllText((Join-Path $logs 'main.log'), '[error] real failure')
    [IO.File]::WriteAllText((Join-Path $root 'failure.dmp'), 'dump')
    $checks = [Collections.Generic.List[object]]::new()
    Check-Logs $root
    Assert-Status 'no-error-lines' 'FAIL'
    Assert-Status 'no-minidumps' 'FAIL'
    Assert-Status 'background-dependency-install' 'WARN'
    Write-Output 'PASS ERROR and minidump still fail alongside WARN'
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force
}
