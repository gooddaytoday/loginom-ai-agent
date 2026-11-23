# Windows PowerShell 5.1+. Installed NSIS smoke of Desktop v2 (B4.14c): PKG-01, PKG-02, BRAND-01, LIFE-01 and removal.
# Runs as the ordinary user whose real profile it uses; probes run on the candidate's bundled Node
# (windows-sidecar-smoke.mjs). PKG-01 waits for the application window, not the 0.4 wizard (decision B-97 p. 10), and
# for the window's own service (`service-desktop.json`, B4.9). LIFE-01: every close of the window stops the service, its
# Node host and the Host's runtimes (B4.10); every relaunch starts a new service.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Installer,
    [Parameter(Mandatory=$true)][string]$RunRoot,
    [Parameter(Mandatory=$true)][string]$ExpectedVersion,
    [ValidateSet('prod','beta','dev')][string]$Channel = 'prod',
    [ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSha256,
    [ValidateRange(20,1800)][int]$TimeoutSeconds = 300,
    [ValidateRange(1,20)][int]$Runs = 3,
    [ValidateSet('Window','Renderer')][string]$CloseMethod = 'Window',
    # Mutations damage only this disposable installation, to show that the case they name turns red.
    [ValidateSet('None','SkillByte','NoServiceStop','NoRenderer','ForeignScheme','LockedUpdaterCache')][string]$Mutation = 'None',
    # The profile already holds a Loginom connection (a 0.4 one that Desktop moves to its service, B4.13).
    [switch]$Connection,
    [switch]$AllowServer
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$checks = [Collections.Generic.List[object]]::new()
$launches = [Collections.Generic.List[object]]::new()
$report = [ordered]@{ schemaVersion=2; startedAt=(Get-Date).ToUniversalTime().ToString('o');
    installer=$Installer; expectedVersion=$ExpectedVersion; channel=$Channel; closeMethod=$CloseMethod; mutation=$Mutation;
    connection=[bool]$Connection; scriptSha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant();
    checks=$checks; launches=$launches }
$slug = 'loginom-ai-agent' + $(if ($Channel -ne 'prod') { '-' + $Channel })
$appId = 'com.loginom.aiagent' + $(if ($Channel -ne 'prod') { '.' + $Channel })
$name = 'Loginom AI Agent' + $(if ($Channel -eq 'dev') { ' Dev' } elseif ($Channel -eq 'beta') { ' Beta' })
$servicePort = @{ prod=28288; beta=28289; dev=28290 }[$Channel]
$userData = Join-Path $env:APPDATA $appId
$serviceData = Join-Path $env:USERPROFILE ".local\share\$slug"
$registration = Join-Path $env:USERPROFILE ".local\state\$slug\service-desktop.json"
$updaterCache = Join-Path $env:LOCALAPPDATA '@loginom-ai-agentdesktop-updater'
$uriKey = 'HKCU:\Software\Classes\loginom-ai-agent\shell\open\command'
$marker = Join-Path $userData ('installed-smoke-' + [guid]::NewGuid().ToString('N') + '.txt')
$token = [guid]::NewGuid().ToString()
$installAttempted = $false
$uninstaller = $null
$links = $null
$uriRegistered = $false
$ownedDataCreated = $false
$cacheLock = $null

function Check([string]$Id, [bool]$Pass, [string]$Detail) {
    $checks.Add([pscustomobject]@{ id=$Id; status=$(if ($Pass) {'PASS'} else {'FAIL'}); detail=$Detail })
}
function Entries {
    @(Get-ItemProperty @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -match ('^' + [regex]::Escape($name) + '( \d|$)') })
}
# Desktop v2 logs the version it starts with, then that its window reached the service.
function Test-StartupLog([string]$Text, [string]$Version) {
    return ($Text -match ("app starting\s*\{\s*version: '" + [regex]::Escape($Version) + "',\s*packaged: true,") -and
        $Text -match '\[info\]\s+\(main\)\s+v2 CLI background service ready')
}
function Test-CrashLog([string]$Text) {
    # Remove only complete startup records, including their path metadata and closing brace.
    $startupRecord = '(?m)^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[info\] +\(crash\) crash reporter started \{(?:\r?\n +path: ''[^''\r\n]+''\r?\n\}| path: ''[^''\r\n]+'' \})\r?(?:\n|\z)'
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
# `netsh int ipv4 show excludedportrange protocol=tcp`: Hyper-V, WinNAT, WSL and Docker reserve ranges a service
# cannot bind (B4.9 picked the channel ports without seeing them).
function Test-PortExcluded([string]$Netsh, [int]$Port) {
    foreach ($range in [regex]::Matches($Netsh, '(?m)^\s*(\d+)\s+(\d+)\s*\*?\s*$')) {
        if ($Port -ge [int]$range.Groups[1].Value -and $Port -le [int]$range.Groups[2].Value) { return $true }
    }
    return $false
}
function Get-ProcessRole($Process, [int]$Service, [string]$Install) {
    $path = [string]$Process.ExecutablePath
    $line = [string]$Process.CommandLine
    if ($Process.ProcessId -eq $Service) { return 'service' }
    if ($line -match 'knowledge-entry\.mjs') { return 'help' }
    if ($line -match 'node-host\.mjs') { return 'node-host' }
    if ($path -match '\\resources\\loginom\\browsers\\') { return 'browser' }
    if ($path -match '\\resources\\loginom\\') { return 'runtime' }
    if ($path -match '\\cli-stages\\') { return 'service' }
    if ($Install -and $path.StartsWith($Install + '\', [StringComparison]::OrdinalIgnoreCase)) { return 'electron' }
    return 'other'
}
# The run's processes: descendants of the application and of its service (detached, so it can outlive the app's tree),
# and anything started from the installation or userData, such as the service's stage copy of the CLI.
function Owned([int]$Main, [int]$Service) {
    $table = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine)
    $mine = [Collections.Generic.HashSet[int]]::new()
    foreach ($id in @($Main, $Service)) { if ($id) { [void]$mine.Add($id) } }
    foreach ($entry in $table) {
        foreach ($root in @($install, $userData)) {
            if ($entry.ExecutablePath -and $entry.ExecutablePath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { [void]$mine.Add([int]$entry.ProcessId) }
        }
    }
    do {
        $changed = $false
        foreach ($entry in $table) {
            if ($mine.Contains([int]$entry.ParentProcessId) -and $mine.Add([int]$entry.ProcessId)) { $changed = $true }
        }
    } while ($changed)
    @($table | Where-Object { $mine.Contains([int]$_.ProcessId) -and $_.ProcessId -ne $PID } | ForEach-Object {
        [pscustomobject]@{ pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId; name=$_.Name; role=(Get-ProcessRole $_ $Service $install) }
    })
}
function Roles($List) {
    $roles = [ordered]@{}
    foreach ($group in @($List | Group-Object role)) { $roles[$group.Name] = $group.Count }
    return $roles
}
function Listening([int[]]$Ports) {
    @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $Ports -contains $_.LocalPort } |
        ForEach-Object { [int]$_.LocalPort } | Sort-Object -Unique)
}
function Wait-For([scriptblock]$Condition, [int]$Seconds = $TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        $value = & $Condition
        if ($value) { return $value }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    return $null
}
function Run-Installer([string]$Path, [string]$Arguments) {
    $started = Get-Date
    $child = Start-Process -FilePath $Path -ArgumentList $Arguments -PassThru
    $null = $child.Handle  # keeps ExitCode readable after the process exits
    # The installer ends with `--verify-resources` (B4.5a): hashing and the Chromium warmup took minutes on a stand.
    if (-not $child.WaitForExit(1200000)) {
        Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
        throw "Installer timed out: $Path"
    }
    $seconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
    if ($child.ExitCode -ne 0) { throw "Installer exit $($child.ExitCode) after $seconds s: $Path" }
    return $seconds
}
function Probe([string[]]$Arguments) {
    $output = Join-Path $RunRoot ('probe-' + [guid]::NewGuid().ToString('N') + '.json')
    & $node (Join-Path $PSScriptRoot 'windows-sidecar-smoke.mjs') @($Arguments + $output) | Out-Null
    $code = $LASTEXITCODE
    $value = if (Test-Path -LiteralPath $output) { Get-Content -LiteralPath $output -Raw | ConvertFrom-Json } else { $null }
    if ($code -ne 0 -or -not $value -or $value.failure) { throw "probe $($Arguments[0]): exit $code $(if ($value) { $value.failure })" }
    return $value
}
function Visible-Windows([int]$Process) {
    if (-not ('SmokeWindows' -as [type])) {
        Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class SmokeWindows {
    public delegate bool Callback(IntPtr window, IntPtr state);
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr state);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    // Visible top-level windows of the process larger than 100x100: not Chromium's helper windows.
    public static List<string> List(uint pid) {
        var found = new List<string>();
        EnumWindows((window, state) => {
            uint owner; GetWindowThreadProcessId(window, out owner);
            Rect rect;
            if (owner == pid && IsWindowVisible(window) && GetWindowRect(window, out rect) && rect.Right - rect.Left > 100 && rect.Bottom - rect.Top > 100) {
                var text = new StringBuilder(512); GetWindowText(window, text, 512);
                found.Add(window.ToInt64() + "|" + text + "|" + (rect.Right - rect.Left) + "x" + (rect.Bottom - rect.Top));
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
    public static int Close(uint pid) {
        int count = 0;
        foreach (var item in List(pid)) if (PostMessage(new IntPtr(long.Parse(item.Split('|')[0])), 0x0010, IntPtr.Zero, IntPtr.Zero)) count++;
        return count;
    }
}
'@
    }
    @([SmokeWindows]::List([uint32]$Process) | ForEach-Object {
        $parts = $_.Split('|'); [pscustomobject]@{ title=$parts[1]; size=$parts[2] } })
}
function Free-Port {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()
    return $port
}
# Same-length byte edit of the installed app.asar (asar integrity is not enabled for this build).
function Patch-Asar([string]$Pattern, [scriptblock]$Replace) {
    $path = Join-Path $install 'resources\app.asar'
    $bytes = [IO.File]::ReadAllBytes($path)
    $text = [Text.Encoding]::GetEncoding(28591).GetString($bytes)
    $found = [regex]::Matches($text, $Pattern)
    if ($found.Count -ne 1) { throw "Mutation pattern found $($found.Count) times: $Pattern" }
    $value = & $Replace $found[0].Value
    if ($value.Length -ne $found[0].Length) { throw 'Mutation changes the length' }
    [Text.Encoding]::GetEncoding(28591).GetBytes($value).CopyTo($bytes, $found[0].Index)
    [IO.File]::WriteAllBytes($path, $bytes)
}

function Launch([int]$Run, [int]$Previous) {
    $debug = Free-Port
    $started = Get-Date
    $observation = [ordered]@{ run=$Run; relaunch=($Previous -ne 0); status='FAIL' }
    $launches.Add($observation)
    $app = Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$debug" -PassThru
    $null = $app.Handle
    $script:app = $app
    $observation.main = $app.Id
    try {
        $window = Wait-For { $app.Refresh(); if ($app.HasExited) { throw "Desktop exited before its window: $($app.ExitCode)" }; @(Visible-Windows $app.Id) | Select-Object -First 1 }
        if (-not $window) { throw 'APP_WINDOW_NOT_SHOWN' }
        $observation.window = [ordered]@{ title=$window.title; size=$window.size; seconds=[math]::Round(((Get-Date) - $started).TotalSeconds, 1) }
        # A fresh registration of a new service, not the file of the previous launch.
        $service = Wait-For {
            $value = Get-Content -LiteralPath $registration -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($value -and $value.pid -ne $Previous -and (Get-Process -Id $value.pid -ErrorAction SilentlyContinue) -and
                (Get-Item -LiteralPath $registration).LastWriteTime -ge $started.AddSeconds(-1)) { $value }
        }
        if (-not $service) { throw 'SERVICE_NOT_STARTED' }
        $observation.service = [ordered]@{ pid=[int]$service.pid; previous=$(if ($Previous) { $Previous }) }
        $answer = Probe @('service', $registration, $resources, $workspace, [string]$TimeoutSeconds)
        $observation.service.port = [int]$answer.port
        $observation.service.version = $answer.version
        $observation.skills = $answer.skills.actual
        $logs = Join-Path $userData 'logs'
        $mainLog = Wait-For {
            @(Get-ChildItem -LiteralPath $logs -Filter main.log -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTime -ge $started } | Where-Object {
                    (Get-Content -LiteralPath $_.FullName -Raw) -match 'v2 CLI background service ready' }) | Select-Object -First 1
        }
        if (-not $mainLog) { throw 'WINDOW_NOT_CONNECTED' }
        $observation.mainLog = $mainLog.FullName
        $observation.renderer = Probe @('renderer', [string]$debug, [string]$TimeoutSeconds)
        if ($observation.renderer.wizard) { throw 'WIZARD_SHOWN' }
        # The service starts its Node host at boot; with a connection the Host then starts Help for the active generation.
        if (-not (Wait-For { @(Owned $app.Id $service.pid | Where-Object role -eq 'node-host').Count })) { throw 'HOST_NOT_STARTED' }
        if ($Connection -and -not (Wait-For { @(Owned $app.Id $service.pid | Where-Object role -eq 'help').Count } ([math]::Max($TimeoutSeconds, 600)))) { throw 'HELP_NOT_STARTED' }
        Start-Sleep -Seconds 3
        $before = @(Owned $app.Id $service.pid)
        $observation.before = Roles $before
        $observation.processes = @($before | ForEach-Object { "$($_.pid):$($_.role):$($_.name)" })
        if ($Run -eq 1) { $script:firstLaunch = [ordered]@{ before=$before; mainLog=$mainLog.FullName } }
        $closing = Get-Date
        if ($CloseMethod -eq 'Window') {
            # WM_CLOSE: the user closes the last window; Electron quits on Windows (window-all-closed).
            if ([SmokeWindows]::Close([uint32]$app.Id) -eq 0) { throw 'WM_CLOSE found no visible Desktop window' }
        } else {
            Probe @('close', [string]$debug) | Out-Null
        }
        if (-not $app.WaitForExit(100000)) { throw 'DESKTOP_EXIT_TIMEOUT' }
        $observation.exit = [ordered]@{ code=$app.ExitCode; seconds=[math]::Round(((Get-Date) - $closing).TotalSeconds, 2) }
        if ($app.ExitCode -ne 0) { throw 'DESKTOP_EXIT_UNCONFIRMED' }
        Start-Sleep -Seconds 5
        $remaining = @(@($before | Where-Object { Get-Process -Id $_.pid -ErrorAction SilentlyContinue }) +
            @(Owned 0 0 | Where-Object { $before.pid -notcontains $_.pid }))
        $observation.remaining = @($remaining | ForEach-Object { "$($_.pid):$($_.role)" })
        if ($remaining.Count) { throw ('OWN_PROCESSES_REMAIN: ' + ($observation.remaining -join ' ')) }
        $observation.registration = $(if (Test-Path -LiteralPath $registration) { 'present' } else { 'removed' })
        if (Test-Path -LiteralPath $registration) { throw 'REGISTRATION_REMAINS' }
        $open = @(Listening @($servicePort, $debug))
        if ($open.Count) { throw ('OWN_PORTS_STILL_LISTENING: ' + ($open -join ' ')) }
        $observation.status = 'PASS'
    } catch {
        $observation.failure = $_.Exception.Message
        # Leave nothing for the next run: a failed launch still stops everything it started.
        @(Owned $app.Id $(if ($observation.service) { $observation.service.pid } else { 0 })) | ForEach-Object {
            Stop-Process -Id $_.pid -Force -ErrorAction SilentlyContinue }
    }
    [Console]::WriteLine(($observation | ConvertTo-Json -Depth 5 -Compress))
    return $observation
}

try {
    if (-not [IO.Path]::IsPathRooted($RunRoot) -or $RunRoot -match '["\r\n]') { throw 'RunRoot must be an absolute safe path' }
    $RunRoot = [IO.Path]::GetFullPath($RunRoot)
    $install = Join-Path $RunRoot 'installed'
    $workspace = Join-Path $RunRoot 'workspace'
    $exe = Join-Path $install "$slug.exe"
    $resources = Join-Path $install 'resources\loginom'
    $node = Join-Path $resources 'bin\node.exe'
    New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null
    if ((Test-Path -LiteralPath $install) -or (Test-Path -LiteralPath $workspace)) { throw 'Use a fresh RunRoot' }
    if ((Entries).Count) { throw "Existing $name installation: uninstall it explicitly before this test" }
    $os = Get-CimInstance Win32_OperatingSystem
    $report.os = [ordered]@{ caption=$os.Caption; version=$os.Version; architecture=$os.OSArchitecture }
    $report.user = [ordered]@{ administrator=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
    $supported = [Environment]::Is64BitOperatingSystem -and (($os.ProductType -eq 1 -and [int]$os.BuildNumber -ge 22000) -or ($AllowServer -and $os.ProductType -ne 1))
    Check 'windows-x64' $supported "$($os.Caption) $($os.Version); allowServer=$AllowServer"
    if (-not $supported) { throw 'Windows 11 x64 or an explicitly allowed Windows Server is required' }
    Check 'ordinary-user' (-not $report.user.administrator) 'The installing account is not an elevated administrator'
    $Installer = (Resolve-Path -LiteralPath $Installer).Path
    $hash = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
    $report.sha256 = $hash
    $report.signature = (Get-AuthenticodeSignature -LiteralPath $Installer).Status.ToString()
    Check 'installer-sha256' (-not $ExpectedSha256 -or $hash -eq $ExpectedSha256.ToLowerInvariant()) $hash
    if ($ExpectedSha256 -and $hash -ne $ExpectedSha256.ToLowerInvariant()) { throw 'Installer SHA256 mismatch' }
    $netsh = (& netsh int ipv4 show excludedportrange protocol=tcp | Out-String)
    $report.excludedPortRanges = $netsh.Trim()
    Check 'port-not-excluded' (-not (Test-PortExcluded $netsh $servicePort)) "$servicePort; netsh int ipv4 show excludedportrange protocol=tcp"
    Check 'port-free' ((Listening @($servicePort)).Count -eq 0) "nothing listens on $servicePort before the install"
    $foreignBefore = @(@((Join-Path $env:USERPROFILE '.local\share\opencode'), (Join-Path $env:USERPROFILE '.config\opencode'),
        (Join-Path $env:APPDATA 'ai.opencode.desktop'), (Join-Path $env:APPDATA 'ai.opencode.desktop.dev'),
        (Join-Path $env:APPDATA 'ai.opencode.desktop.beta'), 'HKCU:\Software\Classes\opencode') | Where-Object { Test-Path -LiteralPath $_ })
    if (-not $Connection) {
        Check 'clean-profile' (-not (Test-Path -LiteralPath $userData) -and -not (Test-Path -LiteralPath $serviceData)) "$userData; $serviceData"
    }
    if (-not (Test-Path -LiteralPath $userData)) {
        New-Item -ItemType Directory -Path $userData | Out-Null
        $ownedDataCreated = $true
    }
    [IO.File]::WriteAllText($marker, $token)
    New-Item -ItemType Directory -Path $workspace | Out-Null
    $installAttempted = $true
    # NSIS requires /D last and unquoted, including when the directory contains spaces.
    $seconds = Run-Installer $Installer "/S /currentuser /D=$install"
    # PKG-02: NSIS customInstall runs `<app> --verify-resources` last and aborts with exit 1 on any refusal (B4.5a).
    Check 'silent-install' $true "NSIS /S /currentuser exited 0 after $seconds s, including --verify-resources"
    $entries = @(Entries)
    $report.registration = @($entries | Select-Object DisplayName,DisplayVersion,Publisher,DisplayIcon,UninstallString,InstallLocation,PSChildName)
    Check 'installed-apps' ($entries.Count -eq 1 -and $entries[0].DisplayVersion -eq $ExpectedVersion) ($report.registration | ConvertTo-Json -Compress)
    Check 'installed-apps-names' (-not (($report.registration | ConvertTo-Json -Compress) -match 'opencode')) 'No OpenCode in the installed-apps entry'
    $uninstaller = Get-ChildItem -LiteralPath $install -Filter 'Uninstall *.exe' | Select-Object -First 1 -ExpandProperty FullName
    Check 'install-path' ((Test-Path -LiteralPath $exe) -and $entries.Count -eq 1 -and $entries[0].UninstallString.Contains($install)) $exe
    $version = (Get-Item -LiteralPath $exe).VersionInfo
    $report.executable = [ordered]@{ productName=$version.ProductName; fileDescription=$version.FileDescription; companyName=$version.CompanyName; productVersion=$version.ProductVersion }
    Check 'executable-names' ($version.ProductName -eq $name -and -not (($report.executable | ConvertTo-Json -Compress) -match 'opencode')) ($report.executable | ConvertTo-Json -Compress)
    Check 'updater-cache-installer' (Test-Path -LiteralPath (Join-Path $updaterCache 'installer.exe')) "$updaterCache\installer.exe"
    # The install-time verification wrote its full cache and the Chromium warmup receipt into userData (B4.8a).
    $cache = Get-Content -LiteralPath (Join-Path $userData 'loginom\resource-verification.json') -Raw | ConvertFrom-Json
    $manifestPath = Join-Path $resources 'resource-manifest.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $cacheReady = $cache.protocol -eq 1 -and $cache.version -eq $ExpectedVersion -and
        $cache.root -eq (Resolve-Path -LiteralPath $resources).Path -and
        $cache.manifestHash -eq (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -and
        @($cache.files.PSObject.Properties).Count -eq @($manifest.files).Count
    Check 'installer-resource-cache' $cacheReady "files=$(@($manifest.files).Count); $userData\loginom\resource-verification.json"
    $warm = Get-Content -LiteralPath (Join-Path $userData 'loginom\browser-warmup.json') -Raw | ConvertFrom-Json
    $warmReady = $warm.status -eq 'ready' -and $warm.closed_ack -eq $true -and $warm.node_exit_code -eq 0 -and
        $warm.manifestHash -eq $cache.manifestHash -and -not (Test-Path -LiteralPath $warm.profile)
    Check 'installer-browser-warmup' $warmReady 'Chromium was ready and fully closed before the first launch'
    $help = Join-Path $resources 'help\help-manifest.json'
    $helpPresent = Test-Path -LiteralPath $help -PathType Leaf
    if ($helpPresent) { Get-Content -LiteralPath $help -Raw | ConvertFrom-Json | Out-Null }
    Check 'bundled-help-manifest' $helpPresent $help
    $retired = Test-RetiredEndpoint $install (Join-Path $resources 'ripgrep\rg.exe')
    Check 'no-retired-endpoint' (-not $retired) 'All installed files, including binaries/ASAR, scanned with bundled ripgrep'
    $shell = New-Object -ComObject WScript.Shell
    $links = @(@([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('StartMenu')) |
        ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue } |
        Where-Object { $shell.CreateShortcut($_.FullName).TargetPath -eq $exe } | Select-Object -ExpandProperty FullName)
    $report.shortcuts = $links
    Check 'shortcut' ($links.Count -gt 0 -and @($links | Where-Object { [IO.Path]::GetFileNameWithoutExtension($_) -ne $name }).Count -eq 0) ($links -join '; ')
    if ($Mutation -eq 'SkillByte') {
        $skill = Join-Path $resources 'skills\loginom-automation\SKILL.md'
        $bytes = [IO.File]::ReadAllBytes($skill); $bytes[0] = $bytes[0] -bxor 1; [IO.File]::WriteAllBytes($skill, $bytes)
    }
    if ($Mutation -eq 'NoServiceStop') {
        # service-identity.ts stopService(): the quit participant no longer stops the service (B4.14b M1).
        Patch-Asar 'await [A-Za-z_$][\w$]*\.stop\(\{file:[A-Za-z_$][\w$]*\(\)\}\)' { param($found) 'void 0'.PadRight($found.Length) }
    }
    if ($Mutation -eq 'NoRenderer') {
        Patch-Asar 'src="\./assets/main-[\w-]+\.js"' { param($found) $found.Replace('main-', 'mainX') }
    }
    # PKG-02: every installed file against the manifest, `--verify-resources` again and the bundled Chromium.
    $verify = Start-Process -FilePath $exe -ArgumentList '--verify-resources' -PassThru -Wait -RedirectStandardError (Join-Path $RunRoot 'verify-resources.err')
    Check 'verify-resources' ($verify.ExitCode -eq 0) "exit=$($verify.ExitCode) $((Get-Content -LiteralPath (Join-Path $RunRoot 'verify-resources.err') -Raw -ErrorAction SilentlyContinue))"
    $payload = $null
    try { $payload = Probe @('resources', $resources) } catch { Check 'resource-hashes' $false $_.Exception.Message }
    if ($payload) {
        $report.resources = $payload
        Check 'resource-hashes' ($payload.files -eq @($manifest.files).Count) "files=$($payload.files); manifestHash=$($payload.manifestHash)"
        Check 'bundled-chromium' ($payload.browser.title -eq 'Bundled Chromium') "$($payload.browser.path); $($payload.browser.version)"
    }
    # PKG-01 and LIFE-01: the first launch opens the window; every close stops everything; every relaunch starts again.
    $previous = 0
    for ($run = 1; $run -le $Runs; $run++) {
        $observation = Launch $run $previous
        if ($observation.service) { $previous = $observation.service.pid }
        if ($run -eq 1) {
            Check 'app-window' ([bool]$observation.window -and $observation.window.title -eq 'Loginom AI Agent') ($observation.window | ConvertTo-Json -Compress)
            Check 'renderer-loaded' ([bool]$observation.renderer -and -not $observation.renderer.wizard) ($observation.renderer | ConvertTo-Json -Compress)
            Check 'service-ready' ($observation.service.port -eq $servicePort -and [bool]$observation.service.version) ($observation.service | ConvertTo-Json -Compress)
            Check 'bundled-skills' (@($observation.skills).Count -gt 0) (@($observation.skills) -join ', ')
            $text = if ($observation.mainLog) { Get-Content -LiteralPath $observation.mainLog -Raw } else { '' }
            Check 'app-starting-version' (Test-StartupLog $text $ExpectedVersion) ([string]$observation.mainLog)
            # BRAND-01: the scheme the app registered for this user, and what Task Manager names.
            if ($Mutation -eq 'ForeignScheme') {
                # Another program took the scheme after the launch; the next launch registers it again.
                Set-ItemProperty -LiteralPath $uriKey -Name '(default)' -Value ('"' + $env:SystemRoot + '\System32\notepad.exe" "%1"')
            }
            $report.uriAfterLaunch = (Get-ItemProperty -LiteralPath $uriKey -ErrorAction SilentlyContinue).'(default)'
            $uriRegistered = Test-InstalledUriScheme ([string]$report.uriAfterLaunch) $install
            Check 'uri-scheme-registered' $uriRegistered ([string]$report.uriAfterLaunch)
            $images = @($firstLaunch.before | ForEach-Object {
                $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.pid)" -ErrorAction SilentlyContinue
                $description = if ($process -and $process.ExecutablePath) { (Get-Item -LiteralPath $process.ExecutablePath).VersionInfo.FileDescription }
                "$($_.role)=$($_.name)|$description" } | Sort-Object -Unique)
            $report.taskManager = $images
            Check 'process-names' (@($images | Where-Object { $_ -match 'opencode' }).Count -eq 0 -and @($images | Where-Object { $_ -like "electron=$slug.exe|*" }).Count -eq 1 -and
                @($images | Where-Object { $_ -like 'service=loginom-ai-agent-cli.exe|*' }).Count -eq 1) ($images -join '; ')
            if ($Connection) {
                # B4.13: the 0.4 connection moved to the service's store once, with DPAPI; its Host started Help for it.
                $store = Get-Content -LiteralPath (Join-Path $serviceData 'loginom\connection\connection.json') -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
                $moved = [regex]::Match($text, "Loginom connection of 0\.4 for the service \{ state: '(\w+)'(?:, generation: (\d+))?")
                $report.connection = [ordered]@{ log=$moved.Value; generation=$(if ($store) { $store.generation }); protection=$(if ($store) { $store.secrets.protection }) }
                Check 'connection-moved' ($moved.Groups[1].Value -in @('moved','current') -and $store -and $store.secrets.protection -eq 'dpapi') ($report.connection | ConvertTo-Json -Compress)
            }
        }
    }
    foreach ($case in @(1..$Runs)) {
        $item = @($launches | Where-Object { $_.run -eq $case })[0]
        Check "life-01-run-$case" ($item.status -eq 'PASS') ([string]$(if ($item.failure) { $item.failure } else { "exit $($item.exit.code) in $($item.exit.seconds) s; before $(($item.before | ConvertTo-Json -Compress)); service $($item.service.pid)" }))
    }
} catch {
    Check 'execution' $false $_.Exception.Message
} finally {
    if ($installAttempted) {
        try {
            if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue }
            @(Owned 0 0) | ForEach-Object { Stop-Process -Id $_.pid -Force -ErrorAction SilentlyContinue }
            if ($Mutation -eq 'LockedUpdaterCache' -and (Test-Path -LiteralPath (Join-Path $updaterCache 'installer.exe'))) {
                $cacheLock = [IO.File]::Open((Join-Path $updaterCache 'installer.exe'), 'Open', 'Read', 'None')
            }
            if (-not $uninstaller) { $uninstaller = Get-ChildItem -LiteralPath $install -Filter 'Uninstall *.exe' | Select-Object -First 1 -ExpandProperty FullName }
            if (-not $uninstaller) { throw 'Uninstaller is missing' }
            $seconds = Run-Installer $uninstaller '/S /currentuser'
            $removed = Wait-For { -not (Test-Path -LiteralPath $install) -and (Entries).Count -eq 0 } 90
            Check 'silent-uninstall' ([bool]$removed) "/S /currentuser in $seconds s; installation directory and installed-app entry removed"
            if ($cacheLock) { $cacheLock.Dispose() }
            $report.uriAfterUninstall = (Get-ItemProperty -LiteralPath $uriKey -ErrorAction SilentlyContinue).'(default)'
            Check 'uri-scheme-removed' ($uriRegistered -and -not (Test-Path -LiteralPath 'HKCU:\Software\Classes\loginom-ai-agent')) ([string]$report.uriAfterUninstall)
            # Decision B-97 p. 2: the installer's own copy in the updater cache (hundreds of MB) goes with the app.
            Check 'updater-cache-removed' (-not (Test-Path -LiteralPath $updaterCache)) $updaterCache
            if ($Mutation -eq 'LockedUpdaterCache') { Remove-Item -LiteralPath $updaterCache -Recurse -Force -ErrorAction SilentlyContinue }
            Check 'shortcut-removed' ($null -ne $links -and @($links | Where-Object { Test-Path -LiteralPath $_ }).Count -eq 0) ($links -join '; ')
            Check 'preserves-user-data' ((Test-Path -LiteralPath $marker) -and [IO.File]::ReadAllText($marker) -eq $token) "preservesUserData=true: $marker"
            $foreignAfter = @(@((Join-Path $env:USERPROFILE '.local\share\opencode'), (Join-Path $env:USERPROFILE '.config\opencode'),
                (Join-Path $env:APPDATA 'ai.opencode.desktop'), (Join-Path $env:APPDATA 'ai.opencode.desktop.dev'),
                (Join-Path $env:APPDATA 'ai.opencode.desktop.beta'), 'HKCU:\Software\Classes\opencode') | Where-Object { Test-Path -LiteralPath $_ })
            Check 'no-opencode-places' (@($foreignAfter | Where-Object { $foreignBefore -notcontains $_ }).Count -eq 0) ($foreignAfter -join '; ')
            Check 'cleanup' ((Owned 0 0).Count -eq 0 -and -not (Test-Path -LiteralPath $install) -and (Entries).Count -eq 0) 'No installed files, registration or owned processes'
        } catch {
            if ($cacheLock) { $cacheLock.Dispose() }
            Check 'cleanup' $false $_.Exception.Message
        }
        $logs = Join-Path $userData 'logs'
        $crashLogs = @(Get-ChildItem -LiteralPath $userData -Recurse -File -Filter crash.log -ErrorAction SilentlyContinue)
        $unexpectedCrashes = @($crashLogs | Where-Object { -not (Test-CrashLog ([IO.File]::ReadAllText($_.FullName))) } | ForEach-Object { $_.FullName })
        Check 'no-crash-events' ($unexpectedCrashes.Count -eq 0) ('unexpected content in: ' + ($unexpectedCrashes -join '; '))
        $dumps = @(Get-ChildItem -LiteralPath $userData -Recurse -File -Filter '*.dmp' -ErrorAction SilentlyContinue)
        Check 'no-minidumps' ($dumps.Count -eq 0) (($dumps | Select-Object -ExpandProperty FullName) -join '; ')
        $errors = @(Get-ChildItem -LiteralPath $logs -Recurse -File -Filter '*.log' -ErrorAction SilentlyContinue |
            Select-String -Pattern '\[(error|fatal)\]|uncaught|unhandled rejection|FATAL ERROR')
        $report.errorLines = @($errors | Select-Object -First 40 | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line)" })
        foreach ($id in @('silent-install','installed-apps','install-path','verify-resources','resource-hashes','bundled-chromium','app-window','renderer-loaded','service-ready','uri-scheme-registered','process-names','silent-uninstall','uri-scheme-removed','updater-cache-removed','shortcut-removed','preserves-user-data')) {
            if (-not @($checks | Where-Object id -eq $id).Count) { Check $id $false 'Not reached; see execution/cleanup failure' }
        }
        if (Test-Path -LiteralPath $logs) {
            Compress-Archive -Path $logs -DestinationPath (Join-Path $RunRoot 'logs.zip') -Force
        }
    }
    if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
    if ($ownedDataCreated -and (Test-Path -LiteralPath $userData) -and @(Get-ChildItem -LiteralPath $userData -Force).Count -eq 0) {
        Remove-Item -LiteralPath $userData
    }
    $report.finishedAt = (Get-Date).ToUniversalTime().ToString('o')
    $report.status = if (@($checks | Where-Object status -eq 'FAIL').Count) { 'FAIL' } else { 'PASS' }
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $RunRoot 'report.json') -Encoding UTF8
    [Console]::WriteLine(($checks | Format-Table id,status,detail -Wrap | Out-String -Width 160))
}
if ($report.status -eq 'PASS') { exit 0 }
exit 1
