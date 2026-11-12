# Windows PowerShell 5.1+, no Node/Bun/browser or GUI automation dependency.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Installer,
    [Parameter(Mandatory=$true)][string]$RunRoot,
    [Parameter(Mandatory=$true)][string]$ExpectedVersion,
    [ValidateSet('prod','beta','dev')][string]$Channel = 'prod',
    [ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSha256,
    [ValidateRange(20,600)][int]$TimeoutSeconds = 120,
    [switch]$AllowServer,
    [switch]$KeepProxy
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$checks = [Collections.Generic.List[object]]::new()
$report = [ordered]@{ schemaVersion=1; startedAt=(Get-Date).ToUniversalTime().ToString('o');
    installer=$Installer; expectedVersion=$ExpectedVersion; channel=$Channel;
    scriptSha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant(); checks=$checks }
$slug = 'loginom-ai-agent' + $(if ($Channel -ne 'prod') { '-' + $Channel })
$appId = 'com.loginom.aiagent' + $(if ($Channel -ne 'prod') { '.' + $Channel })
$name = 'Loginom AI Agent' + $(if ($Channel -eq 'dev') { ' Dev' } elseif ($Channel -eq 'beta') { ' Beta' })
$profile = Join-Path $RunRoot 'profile'
$install = Join-Path $RunRoot 'installed'
$exe = Join-Path $install "$slug.exe"
$userData = Join-Path $env:APPDATA $appId
$marker = Join-Path $userData ('installed-smoke-' + [guid]::NewGuid().ToString('N') + '.txt')
$token = [guid]::NewGuid().ToString()
$installAttempted = $false
$mainProcess = $null
$uninstaller = $null
$ownedDataCreated = $false
$proxyKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'

function Check([string]$Id, [bool]$Pass, [string]$Detail) {
    $checks.Add([pscustomobject]@{ id=$Id; status=$(if ($Pass) {'PASS'} else {'FAIL'}); detail=$Detail })
}
function Entries {
    @(Get-ItemProperty @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -match ('^' + [regex]::Escape($name) + '( \d|$)') })
}
function Test-StartupLog([string]$Text, [string]$Version) {
    return ($Text -match ("app starting\s*\{\s*version: '" + [regex]::Escape($Version) + "',\s*packaged: true,\s*onboardingTest: true") -and
        $Text -match '\[info\]\s+server ready\s*\{')
}
function Test-CrashLog([string]$Text) {
    if (-not $Text.Trim()) { return $true }
    $events = @($Text -split '\r?\n' | Where-Object { $_ -match '\[(info|warn|error|debug|fatal)\]' })
    return ($events.Count -gt 0 -and @($events | Where-Object { $_ -notmatch '\[info\].*crash reporter started' }).Count -eq 0)
}
function Test-RetiredEndpoint([string]$Directory, [string]$Ripgrep) {
    $found = @(& $Ripgrep --text --files-with-matches --fixed-strings --hidden --no-ignore -- 'mcp.loginom.ai' $Directory)
    $code = $LASTEXITCODE
    if ($code -gt 1) { throw "Installed-file scan failed: ripgrep exit $code" }
    return ($code -eq 0)
}
function Processes {
    # Query by executable path, never kill by name (other Node/Chrome installations may be in use).
    @(Get-CimInstance Win32_Process | Where-Object {
        $_.ExecutablePath -and $_.ExecutablePath.StartsWith($install + '\', [StringComparison]::OrdinalIgnoreCase)
    })
}
function Wait-For([scriptblock]$Condition, [int]$Seconds = $TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        if (& $Condition) { return $true }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    return $false
}
function Run-Installer([string]$Path, [string]$Arguments) {
    $child = Start-Process -FilePath $Path -ArgumentList $Arguments -PassThru
    if (-not $child.WaitForExit(180000)) {
        Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
        throw "Installer timed out: $Path"
    }
    if ($child.ExitCode -ne 0) { throw "Installer exit $($child.ExitCode): $Path" }
}
function Remove-Installation {
    if (-not $uninstaller) {
        $script:uninstaller = Get-ChildItem -LiteralPath $install -Filter 'Uninstall *.exe' -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $uninstaller) { throw 'Uninstaller is missing' }
    Run-Installer $uninstaller '/S /currentuser'
    return (Wait-For { -not (Test-Path -LiteralPath $install) -and (Entries).Count -eq 0 } 90)
}

try {
    if (-not [IO.Path]::IsPathRooted($RunRoot) -or $RunRoot -match '["\r\n]') { throw 'RunRoot must be an absolute safe path' }
    $RunRoot = [IO.Path]::GetFullPath($RunRoot)
    $profile = Join-Path $RunRoot 'profile'
    $install = Join-Path $RunRoot 'installed'
    $exe = Join-Path $install "$slug.exe"
    New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null
    if ((Test-Path -LiteralPath $profile) -or (Test-Path -LiteralPath $install)) { throw 'Use a fresh RunRoot' }
    if ((Entries).Count) { throw "Existing $name installation: uninstall it explicitly before this test" }
    $os = Get-CimInstance Win32_OperatingSystem
    $report.os = [ordered]@{ caption=$os.Caption; version=$os.Version; architecture=$os.OSArchitecture }
    $supported = [Environment]::Is64BitOperatingSystem -and (($os.ProductType -eq 1 -and [int]$os.BuildNumber -ge 22000) -or ($AllowServer -and $os.ProductType -ne 1))
    Check 'windows-x64' $supported "$($os.Caption) $($os.Version); allowServer=$AllowServer"
    if (-not $supported) { throw 'Windows 11 x64 or an explicitly allowed Windows Server is required' }
    if ($Installer -match '^https://') {
        $download = Join-Path $RunRoot 'installer.exe'
        Invoke-WebRequest -UseBasicParsing -Uri $Installer -OutFile $download
        $Installer = $download
    }
    $Installer = (Resolve-Path -LiteralPath $Installer).Path
    $hash = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
    $report.sha256 = $hash
    $report.signature = (Get-AuthenticodeSignature -LiteralPath $Installer).Status.ToString()
    Check 'installer-sha256' (-not $ExpectedSha256 -or $hash -eq $ExpectedSha256.ToLowerInvariant()) $hash
    if ($ExpectedSha256 -and $hash -ne $ExpectedSha256.ToLowerInvariant()) { throw 'Installer SHA256 mismatch' }
    $env:LOGINOM_AI_AGENT_TEST_ONBOARDING = '1'
    $env:LOGINOM_AI_AGENT_TEST_ROOT = $profile
    # Set a deterministic direct connection for this dedicated stand; never modify network/firewall rules.
    if (-not $KeepProxy) { Set-ItemProperty -LiteralPath $proxyKey -Name ProxyEnable -Value 0 }
    if (-not (Test-Path -LiteralPath $userData)) {
        New-Item -ItemType Directory -Path $userData | Out-Null
        $ownedDataCreated = $true
    }
    [IO.File]::WriteAllText($marker, $token)
    New-Item -ItemType Directory -Path $profile | Out-Null
    $installAttempted = $true
    # NSIS requires /D last and unquoted, including when the directory contains spaces.
    Run-Installer $Installer "/S /currentuser /D=$install"
    Check 'silent-install' $true 'NSIS /S /currentuser exited 0'
    $entries = @(Entries)
    $report.registration = @($entries | Select-Object DisplayName,DisplayVersion,UninstallString,InstallLocation,PSChildName)
    Check 'installed-apps' ($entries.Count -eq 1 -and $entries[0].DisplayVersion -eq $ExpectedVersion) ($report.registration | ConvertTo-Json -Compress)
    $uninstaller = Get-ChildItem -LiteralPath $install -Filter 'Uninstall *.exe' | Select-Object -First 1 -ExpandProperty FullName
    Check 'install-path' ((Test-Path -LiteralPath $exe) -and $entries.Count -eq 1 -and $entries[0].UninstallString.Contains($install)) $exe
    $resources = Join-Path $install 'resources\loginom'
    $help = Join-Path $resources 'help\help-manifest.json'
    $helpPresent = Test-Path -LiteralPath $help -PathType Leaf
    if ($helpPresent) { Get-Content -LiteralPath $help -Raw | ConvertFrom-Json | Out-Null }
    Check 'bundled-help-manifest' $helpPresent $help
    if (-not $helpPresent) { throw 'Bundled Loginom Help manifest is missing' }
    $retired = Test-RetiredEndpoint $install (Join-Path $resources 'ripgrep\rg.exe')
    Check 'no-retired-endpoint' (-not $retired) 'All installed files, including binaries/ASAR, scanned with bundled ripgrep'
    if ($retired) { throw 'Installed files contain mcp.loginom.ai' }
    $shell = New-Object -ComObject WScript.Shell
    $links = @(@([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('StartMenu')) |
        ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue } |
        Where-Object { $shell.CreateShortcut($_.FullName).TargetPath -eq $exe } | Select-Object -ExpandProperty FullName)
    Check 'shortcut' ($links.Count -gt 0) ($links -join '; ')
    $report.shortcuts = $links
    $mainProcess = Start-Process -FilePath $exe -PassThru
    $logs = Join-Path $profile 'desktop\logs'
    $report.logs = $logs
    $ready = Wait-For {
        $mainProcess.Refresh()
        if ($mainProcess.HasExited) { throw "Desktop exited before ready: $($mainProcess.ExitCode)" }
        $script:mainLog = Get-ChildItem -LiteralPath $logs -Filter main.log -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        $mainLog -and (Get-Content -LiteralPath $mainLog.FullName -Raw) -match '\[info\]\s+server ready\s*\{'
    }
    $text = if ($mainLog) { Get-Content -LiteralPath $mainLog.FullName -Raw } else { '' }
    Check 'app-starting-version' (Test-StartupLog $text $ExpectedVersion) "$logs\*\main.log"
    Check 'server-ready' $ready "$logs\*\main.log"
    Start-Sleep -Seconds 5
    $live = @(Processes)
    $report.processes = @($live | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath)
    Check 'processes-alive' (@($live | Where-Object ProcessId -eq $mainProcess.Id).Count -eq 1 -and $live.Count -gt 1) ($report.processes | ConvertTo-Json -Compress)
    # WM_CLOSE exercises normal Electron shutdown, including sidecar cleanup. No force-kill can pass it.
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SmokeWindows {
    public delegate bool Callback(IntPtr window, IntPtr state);
    [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr state);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    public static int Close(uint pid) {
        int count = 0;
        EnumWindows((window, state) => {
            uint owner; GetWindowThreadProcessId(window, out owner);
            if (owner == pid && IsWindowVisible(window) && PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero)) count++;
            return true;
        }, IntPtr.Zero);
        return count;
    }
}
'@
    $windows = [SmokeWindows]::Close($mainProcess.Id)
    $closed = Wait-For { (Processes).Count -eq 0 }
    Check 'graceful-close' ($windows -gt 0 -and $closed) "WM_CLOSE windows=$windows; no installed-path processes=$closed"
    if (-not $closed) { throw 'Desktop did not close; forced cleanup is a failure' }
    $mainProcess.Refresh()
    $quitText = Get-Content -LiteralPath $mainLog.FullName -Raw
    Check 'clean-exit-code' ($mainProcess.HasExited -and $mainProcess.ExitCode -eq 0 -and $quitText -match 'app quit[^\r\n]*exitCode: 0') 'Main process exited 0 and logged app quit'
} catch {
    Check 'execution' $false $_.Exception.Message
} finally {
    if ($installAttempted) {
        try {
            @(Processes) | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            $removed = Remove-Installation
            Check 'silent-uninstall' $removed '/S /currentuser; installation directory and installed-app entry removed'
            Check 'shortcut-removed' ($null -ne $links -and @($links | Where-Object { Test-Path -LiteralPath $_ }).Count -eq 0) ($links -join '; ')
            Check 'preserves-user-data' ((Test-Path -LiteralPath $marker) -and [IO.File]::ReadAllText($marker) -eq $token) "preservesUserData=true: $marker"
            Check 'cleanup' ((Processes).Count -eq 0 -and -not (Test-Path -LiteralPath $install) -and (Entries).Count -eq 0) 'No installed files, registration or owned processes'
        } catch { Check 'cleanup' $false $_.Exception.Message }
        # Collect errors even when startup throws, and include shutdown/cleanup failures.
        $logs = Join-Path $profile 'desktop\logs'
        $errors = @(Get-ChildItem -LiteralPath $logs -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object Extension -eq '.log' | Select-String -Pattern '\[(error|fatal)\]|level=(ERROR|FATAL)|uncaught|unhandled rejection|FATAL ERROR')
        $crashLogs = @(Get-ChildItem -LiteralPath $profile -Recurse -File -Filter crash.log -ErrorAction SilentlyContinue)
        $dumps = @(Get-ChildItem -LiteralPath $profile -Recurse -File -Filter '*.dmp' -ErrorAction SilentlyContinue)
        $report.crashArtifacts = @(@($crashLogs) + @($dumps) | Select-Object FullName,Length,CreationTimeUtc)
        Check 'no-error-lines' ((Test-Path -LiteralPath $logs) -and $errors.Count -eq 0) (($errors | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line)" }) -join "`n")
        $badCrashLogs = @($crashLogs | Where-Object { -not (Test-CrashLog (Get-Content -LiteralPath $_.FullName -Raw)) })
        Check 'no-crash-events' ($badCrashLogs.Count -eq 0) 'Only the normal crash reporter initialization info event is allowed in crash.log'
        Check 'no-minidumps' ($dumps.Count -eq 0) (($dumps | Select-Object -ExpandProperty FullName) -join '; ')
        foreach ($id in @('silent-install','installed-apps','install-path','bundled-help-manifest','no-retired-endpoint','shortcut','app-starting-version','server-ready','processes-alive','graceful-close','clean-exit-code','silent-uninstall','shortcut-removed','preserves-user-data')) {
            if (-not @($checks | Where-Object id -eq $id).Count) { Check $id $false 'Not reached; see execution/cleanup failure' }
        }
    }
    if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
    if ($ownedDataCreated -and (Test-Path -LiteralPath $userData) -and @(Get-ChildItem -LiteralPath $userData -Force).Count -eq 0) {
        Remove-Item -LiteralPath $userData
    }
    if (-not $KeepProxy) {
        Set-ItemProperty -LiteralPath $proxyKey -Name ProxyEnable -Value 0
        Check 'proxy-disabled' ((Get-ItemProperty -LiteralPath $proxyKey).ProxyEnable -eq 0) 'ProxyEnable=0'
    }
    $report.finishedAt = (Get-Date).ToUniversalTime().ToString('o')
    $report.status = if (@($checks | Where-Object status -eq 'FAIL').Count) { 'FAIL' } else { 'PASS' }
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $RunRoot 'report.json') -Encoding UTF8
    [Console]::WriteLine(($checks | Format-Table id,status,detail -Wrap | Out-String -Width 160))
    if (Test-Path -LiteralPath (Join-Path $profile 'desktop\logs')) {
        Compress-Archive -Path (Join-Path $profile 'desktop\logs') -DestinationPath (Join-Path $RunRoot 'logs.zip') -Force
    }
}
if ($report.status -eq 'PASS') { exit 0 }
exit 1
