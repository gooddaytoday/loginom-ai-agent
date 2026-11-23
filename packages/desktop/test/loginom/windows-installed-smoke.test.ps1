[CmdletBinding()]
param([string]$RipgrepPath = 'rg')
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'windows-installed-smoke.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
# Load the actual check functions, never the installer, registry or process operations.
foreach ($name in @('Check', 'Test-StartupLog', 'Test-CrashLog', 'Test-RetiredEndpoint', 'Test-InstalledUriScheme', 'Test-PortExcluded', 'Get-ProcessRole')) {
    $fn = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if (-not $fn) { throw "Missing smoke function: $name" }
    Invoke-Expression $fn.Extent.Text
}
function Assert([bool]$Pass, [string]$Message) { if (-not $Pass) { throw $Message } }
foreach ($case in @(
    @{ command='"C:\lab\installed\loginom-ai-agent.exe" "%1"'; owned=$true },
    @{ command='C:\lab\installed\loginom-ai-agent.exe %1'; owned=$true },
    @{ command='"c:\LAB\INSTALLED\loginom-ai-agent-dev.exe" "%1"'; owned=$true },
    @{ command='"C:\lab\installed-dev\loginom-ai-agent-dev.exe" "%1"'; owned=$false },
    @{ command='"C:\lab\installed\..\prod\loginom-ai-agent.exe" "%1"'; owned=$false },
    @{ command='"C:\foreign\app.exe" "C:\lab\installed\argument"'; owned=$false },
    @{ command=''; owned=$false }
)) {
    Assert ((Test-InstalledUriScheme $case.command 'C:\lab\installed') -eq $case.owned) 'URI ownership check failed'
}
Write-Output 'PASS URI ownership: quoted/unquoted, case, foreign sibling, traversal, arguments and absence'
$start = "[2026-11-23 20:00:00.000] [info]  (main) app starting { version: '2.3.0', packaged: true, onboardingTest: false, marks: {} }`n"
$ready = "[2026-11-23 20:00:01.000] [info]  (main)       v2 CLI background service ready {`n"
Assert (-not (Test-StartupLog ($start + '[info]  (main) starting v2 background service') '2.3.0')) 'A starting service is not ready'
Assert (-not (Test-StartupLog ($start + $ready) '2.3.1')) 'Wrong version accepted'
Assert (-not (Test-StartupLog ($start.Replace('packaged: true', 'packaged: false') + $ready) '2.3.0')) 'Unpackaged app accepted'
Assert (-not (Test-StartupLog ($start + $ready.Replace('[info]', '[error]')) '2.3.0')) 'An error line accepted as ready'
Assert (Test-StartupLog ($start + $ready) '2.3.0') 'Healthy startup rejected'
Write-Output 'PASS startup log: version, packaged, the window reached its service'
$netsh = @"

Protocol tcp Port Exclusion Ranges

Start Port    End Port
----------    --------
     28200       28299
     50000       50059     *

* - Administered port exclusions.

"@
Assert (Test-PortExcluded $netsh 28290) 'Reserved port missed'
Assert (Test-PortExcluded $netsh 28200) 'Range start missed'
Assert (Test-PortExcluded $netsh 50059) 'Administered range end missed'
Assert (-not (Test-PortExcluded $netsh 28300)) 'Free port reported reserved'
Assert (-not (Test-PortExcluded ($netsh -replace '(?m)^\s+\d+\s+\d+.*$', '') 28290)) 'Empty table reported a reservation'
Write-Output 'PASS excluded port ranges: inside, edges, administered, outside, empty table'
$install = 'C:\lab\run\installed'
foreach ($case in @(
    @{ process=@{ ProcessId=10; ExecutablePath='C:\x\AppData\Roaming\com.loginom.aiagent.dev\cli-stages\2.3.0-x64\loginom-ai-agent-cli.exe'; CommandLine='' }; service=10; role='service' },
    @{ process=@{ ProcessId=11; ExecutablePath='C:\x\AppData\Roaming\com.loginom.aiagent.dev\cli-stages\2.3.0-x64\loginom-ai-agent-cli.exe'; CommandLine='' }; service=0; role='service' },
    @{ process=@{ ProcessId=12; ExecutablePath="$install\resources\loginom\bin\node.exe"; CommandLine="`"$install\resources\loginom\bin\node.exe`" --use-system-ca $install\resources\loginom\host\node-host.mjs" }; service=10; role='node-host' },
    @{ process=@{ ProcessId=13; ExecutablePath="$install\resources\loginom\bin\node.exe"; CommandLine="node.exe $install\resources\loginom\runtime\src\knowledge-entry.mjs" }; service=10; role='help' },
    @{ process=@{ ProcessId=14; ExecutablePath="$install\resources\loginom\browsers\chromium-1246\chrome-win64\chrome.exe"; CommandLine='chrome.exe --type=renderer' }; service=10; role='browser' },
    @{ process=@{ ProcessId=15; ExecutablePath="$install\resources\loginom\ripgrep\rg.exe"; CommandLine='rg.exe' }; service=10; role='runtime' },
    @{ process=@{ ProcessId=16; ExecutablePath="$install\loginom-ai-agent-dev.exe"; CommandLine='loginom-ai-agent-dev.exe --type=gpu-process' }; service=10; role='electron' },
    @{ process=@{ ProcessId=17; ExecutablePath='C:\Windows\System32\conhost.exe'; CommandLine='conhost.exe 0x4' }; service=10; role='other' },
    @{ process=@{ ProcessId=18; ExecutablePath="$install-old\loginom-ai-agent-dev.exe"; CommandLine='' }; service=10; role='other' }
)) {
    $actual = Get-ProcessRole ([pscustomobject]$case.process) $case.service $install
    Assert ($actual -eq $case.role) "process $($case.process.ProcessId): expected $($case.role), actual $actual"
}
Write-Output 'PASS process roles: service by registration and stage copy, Node host, Help, browser, runtime, Electron, foreign'
$startup = "[2026-11-12 16:58:19.163] [info]  (crash) crash reporter started {`n  path: 'C:\\lab\\profile\\desktop\\Crashpad'`n}"
Assert (Test-CrashLog $startup) 'Normal crash setup rejected'
$v2 = "[2026-11-24 00:29:46.689] [info]  (crash)   crash reporter started {`r`n  path: 'C:\\Users\\user\\AppData\\Roaming\\com.loginom.aiagent.dev\\Crashpad'`r`n}"
Assert (Test-CrashLog $v2) 'Desktop v2 crash setup (indented, CRLF) rejected'
Assert (-not (Test-CrashLog ($v2 + "`r`n[2026-11-24 00:29:47.000] [warn]  (crash)   previous session did not exit cleanly"))) 'Unexpected v2 record accepted'
Assert (Test-CrashLog '') 'Empty crash log rejected'
Assert (-not (Test-CrashLog ($startup + "`nunexpected metadata"))) 'Unexpected crash-log content accepted'
Assert (-not (Test-CrashLog '[error] (crash) previous session ended unexpectedly')) 'Crash accepted'
Write-Output 'PASS crash records'
$root = Join-Path ([IO.Path]::GetTempPath()) ('windows-smoke-regression-' + [guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path $root | Out-Null
    $path = Join-Path $root 'payload.asar'
    [IO.File]::WriteAllBytes($path, ([byte[]]@(0,1,0,1) + [Text.Encoding]::UTF8.GetBytes('mcp.loginom.ai') + [byte[]]@(0,1,0,1)))
    Assert (Test-RetiredEndpoint $root $RipgrepPath) 'Binary retired endpoint missed'
    [IO.File]::WriteAllText($path, 'https://app.loginom.ai/resources/help')
    Assert (-not (Test-RetiredEndpoint $root $RipgrepPath)) 'Clean payload rejected'
    Write-Output 'PASS retired endpoint scan of binary payloads'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
Write-Host 'PASS: URI ownership, startup log, excluded ports, process roles, crash records and retired endpoint checks'
exit 0
