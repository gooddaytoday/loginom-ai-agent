[CmdletBinding()]
param([string]$RipgrepPath = 'rg')
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'windows-installed-smoke.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
# Load only pure check functions, never the installer or registry operations.
foreach ($name in @('Test-StartupLog', 'Test-CrashLog', 'Test-RetiredEndpoint')) {
    $fn = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if (-not $fn) { throw "Missing smoke function: $name" }
    Invoke-Expression $fn.Extent.Text
}
function Assert([bool]$Pass, [string]$Message) { if (-not $Pass) { throw $Message } }
$start = "[info] app starting { version: '0.3.9', packaged: true, onboardingTest: true }`n"
Assert (-not (Test-StartupLog ($start + '[info] awaiting server ready') '0.3.9')) 'Awaiting readiness is not ready'
Assert (-not (Test-StartupLog ($start + '[info] server ready {}') '0.4.0')) 'Wrong version accepted'
Assert (-not (Test-StartupLog ($start.Replace('packaged: true', 'packaged: false') + '[info] server ready {}') '0.3.9')) 'Unpackaged app accepted'
Assert (Test-StartupLog ($start + '[info] server ready {}') '0.3.9') 'Healthy startup rejected'
Assert (Test-CrashLog "[info] (crash) crash reporter started {`n path: 'profile\Crashpad'`n}") 'Normal crash setup rejected'
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
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
Write-Host 'PASS: startup/version, crash-event and binary endpoint regression checks'
exit 0
