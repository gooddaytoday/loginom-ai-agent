# Windows PowerShell 5.1+; probes use only the candidate's bundled Node.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Installer,
    [Parameter(Mandatory=$true)][string]$RunRoot,
    [Parameter(Mandatory=$true)][string]$ExpectedVersion,
    [ValidateSet('prod','beta','dev')][string]$Channel = 'prod',
    [ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSha256,
    [ValidateRange(20,600)][int]$TimeoutSeconds = 120,
    [ValidateSet('Window','Inspector')][string]$CloseMethod = 'Window',
    [ValidateSet('None','MissingSkill')][string]$PayloadMutation = 'None',
    [switch]$AllowServer,
    [switch]$KeepProxy
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$checks = [Collections.Generic.List[object]]::new()
$report = [ordered]@{ schemaVersion=1; startedAt=(Get-Date).ToUniversalTime().ToString('o');
    installer=$Installer; expectedVersion=$ExpectedVersion; channel=$Channel; closeMethod=$CloseMethod; payloadMutation=$PayloadMutation;
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
$uriRegistered = $false
$uriKey = 'HKCU:\Software\Classes\loginom-ai-agent\shell\open\command'
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
    # Remove only complete startup records, including their path metadata and closing brace.
    $startupRecord = '(?m)^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[info\] +\(crash\) crash reporter started \{\r?\n +path: ''[^''\r\n]+''\r?\n\}\r?(?:\n|\z)'
    return (-not [regex]::Replace($Text, $startupRecord, '').Trim())
}
function Test-RetiredEndpoint([string]$Directory, [string]$Ripgrep) {
    $found = @(& $Ripgrep --text --files-with-matches --fixed-strings --hidden --no-ignore -- 'mcp.loginom.ai' $Directory)
    $code = $LASTEXITCODE
    if ($code -gt 1) { throw "Installed-file scan failed: ripgrep exit $code" }
    return ($code -eq 0)
}
function Test-InstalledUriScheme([string]$Command, [string]$Directory) {
    $target = [regex]::Match($Command.TrimStart(), '^(?:"([^"]+)"|(\S+))(?:\s|$)')
    if (-not $target.Success) { return $false }
    $path = if ($target.Groups[1].Success) { $target.Groups[1].Value } else { $target.Groups[2].Value }
    if (-not [IO.Path]::IsPathRooted($path)) { return $false }
    try {
        return [IO.Path]::GetFullPath($path).StartsWith(
            [IO.Path]::GetFullPath($Directory).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)
    } catch { return $false }
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

function Check-Logs([string]$Profile) {
    $logs = Join-Path $Profile 'desktop\logs'
    $errors = @(Get-ChildItem -LiteralPath $logs -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object Extension -eq '.log' | Select-String -Pattern '\[(error|fatal)\]|level=(ERROR|FATAL)|uncaught|unhandled rejection|FATAL ERROR')
    $crashLogs = @(Get-ChildItem -LiteralPath $Profile -Recurse -File -Filter crash.log -ErrorAction SilentlyContinue)
    $unexpectedCrashes = @($crashLogs | ForEach-Object {
        if (-not (Test-CrashLog ([IO.File]::ReadAllText($_.FullName)))) { $_.FullName }
    })
    $dumps = @(Get-ChildItem -LiteralPath $Profile -Recurse -File -Filter '*.dmp' -ErrorAction SilentlyContinue)
    $report.crashArtifacts = @(@($crashLogs) + @($dumps) | Select-Object FullName,Length,CreationTimeUtc)
    Check 'no-error-lines' ((Test-Path -LiteralPath $logs) -and $errors.Count -eq 0) (($errors | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line)" }) -join "`n")
    Check 'no-crash-events' ($unexpectedCrashes.Count -eq 0) ('Only complete crash reporter initialization info records are allowed; unexpected content in: ' + ($unexpectedCrashes -join '; '))
    Check 'no-minidumps' ($dumps.Count -eq 0) (($dumps | Select-Object -ExpandProperty FullName) -join '; ')
    $warnings = @(Get-ChildItem -LiteralPath $logs -Recurse -File -Filter '*.log' -ErrorAction SilentlyContinue |
        Select-String -SimpleMatch 'background dependency install failed')
    if ($warnings.Count) {
        $checks.Add([pscustomobject]@{ id='background-dependency-install'; status='WARN';
            detail=(($warnings | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line)" }) -join "`n") })
    }
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
    # Before any ordinary app launch, the installer must have published the
    # exact profile cache the Host will read. This also exercises /S installs.
    $cachePath = Join-Path $profile 'desktop\loginom\resource-verification.json'
    $cache = Get-Content -LiteralPath $cachePath -Raw | ConvertFrom-Json
    $manifestPath = Join-Path $resources 'resource-manifest.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $cacheReady = $cache.protocol -eq 1 -and $cache.version -eq $ExpectedVersion -and
        $cache.root -eq (Resolve-Path -LiteralPath $resources).Path -and
        $cache.manifestHash -eq (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -and
        @($cache.files.PSObject.Properties).Count -eq @($manifest.files).Count
    Check 'installer-resource-cache' $cacheReady 'Full resource verification cache exists before first app launch'
    if (-not $cacheReady) { throw 'Installer did not prepare the Host resource cache' }
    $warm = Get-Content -LiteralPath (Join-Path $profile 'desktop\loginom\browser-warmup.json') -Raw | ConvertFrom-Json
    $warmReady = $warm.status -eq 'ready' -and $warm.closed_ack -eq $true -and $warm.node_exit_code -eq 0 -and
        $warm.manifestHash -eq $cache.manifestHash -and -not (Test-Path -LiteralPath $warm.profile)
    Check 'installer-browser-warmup' $warmReady 'Chromium was ready and fully closed before first app launch'
    if (-not $warmReady) { throw 'Installer did not complete browser warmup' }
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
    if ($PayloadMutation -eq 'MissingSkill') {
        # Damage only this disposable installation; retain the original manifest
        # so the sidecar catalog must still satisfy its declared inventory.
        Remove-Item -LiteralPath (Join-Path $resources 'skills\loginom-automation\SKILL.md')
    }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $inspectorPort = $listener.LocalEndpoint.Port
    $listener.Stop()
    # Pause before startup to seed the encrypted offline profile, then execute
    # production startup and tools. The inspector is accessible only on loopback.
    $mainProcess = Start-Process -FilePath $exe -ArgumentList "--inspect-brk=127.0.0.1:$inspectorPort" -PassThru
    $probeFile = Join-Path $RunRoot 'sidecar.json'
    & (Join-Path $resources 'bin\node.exe') (Join-Path $PSScriptRoot 'windows-sidecar-smoke.mjs') `
        $inspectorPort $resources $profile $probeFile $TimeoutSeconds
    $probeExit = $LASTEXITCODE
    if (Test-Path -LiteralPath $probeFile) {
        $probe = Get-Content -LiteralPath $probeFile -Raw | ConvertFrom-Json
        foreach ($item in $probe.checks) { Check $item.id ($item.status -eq 'PASS') $item.detail }
    }
    Check 'sidecar-probe-exit' ($probeExit -eq 0) "Installed Node probe exit=$probeExit; sidecar.json"
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
    $report.uriBeforeUninstall = (Get-ItemProperty -LiteralPath $uriKey -ErrorAction SilentlyContinue).'(default)'
    $uriRegistered = Test-InstalledUriScheme $report.uriBeforeUninstall $install
    Check 'uri-scheme-registered' $uriRegistered ([string]$report.uriBeforeUninstall)
    Start-Sleep -Seconds 5
    $live = @(Processes)
    $report.processes = @($live | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath)
    Check 'processes-alive' (@($live | Where-Object ProcessId -eq $mainProcess.Id).Count -eq 1 -and $live.Count -gt 1) ($report.processes | ConvertTo-Json -Compress)
    if ($CloseMethod -eq 'Window') {
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
        if ($windows -eq 0) { throw 'WM_CLOSE found no visible Desktop window' }
        $closeDetail = "WM_CLOSE windows=$windows"
    } else {
        # Invoke the installed app's production before-quit/sidecar cleanup path in SSH session 0.
        $targets = @(Invoke-RestMethod -Uri "http://127.0.0.1:$inspectorPort/json/list" -TimeoutSec 10)
        if ($targets.Count -ne 1) { throw 'Expected one main-process inspector target' }
        $socket = [Net.WebSockets.ClientWebSocket]::new()
        $cancel = [Threading.CancellationTokenSource]::new(10000)
        try {
            $socket.ConnectAsync([uri]$targets[0].webSocketDebuggerUrl, $cancel.Token).GetAwaiter().GetResult()
            $request = @{ id=1; method='Runtime.evaluate'; params=@{
                expression="require('electron').app.quit()"; includeCommandLineAPI=$true
            }} | ConvertTo-Json -Depth 4 -Compress
            $bytes = [Text.Encoding]::UTF8.GetBytes($request)
            $socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, $cancel.Token).GetAwaiter().GetResult()
            $buffer = [byte[]]::new(65536)
            $reply = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $cancel.Token).GetAwaiter().GetResult()
            $response = [Text.Encoding]::UTF8.GetString($buffer, 0, $reply.Count) | ConvertFrom-Json
            if ($response.id -ne 1 -or $response.error -or $response.result.exceptionDetails) {
                throw ('Electron app.quit failed: ' + ($response | ConvertTo-Json -Depth 6 -Compress))
            }
        } finally {
            $socket.Abort()
            $socket.Dispose()
            $cancel.Dispose()
        }
        $closeDetail = 'Electron app.quit() via loopback inspector'
    }
    $closed = Wait-For { (Processes).Count -eq 0 }
    Check 'graceful-close' $closed "$closeDetail; no installed-path processes=$closed"
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
            $report.uriAfterUninstall = (Get-ItemProperty -LiteralPath $uriKey -ErrorAction SilentlyContinue).'(default)'
            Check 'uri-scheme-removed' ($uriRegistered -and -not (Test-InstalledUriScheme $report.uriAfterUninstall $install)) ([string]$report.uriAfterUninstall)
            Check 'shortcut-removed' ($null -ne $links -and @($links | Where-Object { Test-Path -LiteralPath $_ }).Count -eq 0) ($links -join '; ')
            Check 'preserves-user-data' ((Test-Path -LiteralPath $marker) -and [IO.File]::ReadAllText($marker) -eq $token) "preservesUserData=true: $marker"
            Check 'cleanup' ((Processes).Count -eq 0 -and -not (Test-Path -LiteralPath $install) -and (Entries).Count -eq 0) 'No installed files, registration or owned processes'
        } catch { Check 'cleanup' $false $_.Exception.Message }
        # Collect errors even when startup throws, and include shutdown/cleanup failures.
        Check-Logs $profile
        foreach ($id in @('silent-install','installed-apps','install-path','bundled-help-manifest','no-retired-endpoint','shortcut','sidecar-bundled-skills','sidecar-local-help','sidecar-probe-exit','app-starting-version','server-ready','uri-scheme-registered','processes-alive','graceful-close','clean-exit-code','silent-uninstall','uri-scheme-removed','shortcut-removed','preserves-user-data')) {
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
