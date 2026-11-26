[CmdletBinding()]
param(
  [ValidateSet("Desktop", "Cli", "Both")]
  [string]$Product = "Both",

  [Parameter(Mandatory)]
  [string]$OutputDirectory,

  [Parameter(Mandatory)]
  [string]$NodeSource,

  [Parameter(Mandatory)]
  [string]$BrowserSource,

  [string]$BunPath = "bun",

  # loginom-ai-agent-pty.exe from .github/workflows/loginom-pty.yml (artifact loginom-ai-agent-pty-x86_64-pc-windows-msvc).
  # Both CLI builds embed it and refuse to build without it.
  [string]$PtyBinary = $env:LOGINOM_AI_AGENT_PTY_BIN,

  [ValidateSet("dev", "beta", "prod")]
  [string]$Channel = "dev",

  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$output = [IO.Path]::GetFullPath($OutputDirectory)
$node = [IO.Path]::GetFullPath($NodeSource)
$browsers = [IO.Path]::GetFullPath($BrowserSource)
$bun = (Get-Command -Name $BunPath -CommandType Application -ErrorAction Stop).Source
if (-not $PtyBinary -or -not (Test-Path -LiteralPath $PtyBinary -PathType Leaf)) {
  throw "Provide the pty executable built by loginom-pty.yml: -PtyBinary or LOGINOM_AI_AGENT_PTY_BIN"
}
$pty = [IO.Path]::GetFullPath($PtyBinary)

if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
  throw "Pinned Node executable does not exist: $node"
}
if (-not (Test-Path -LiteralPath $browsers -PathType Container)) {
  throw "Pinned browser directory does not exist: $browsers"
}
$expectedBunVersion = (Get-Content -Raw -LiteralPath (Join-Path $repo "package.json") | ConvertFrom-Json).packageManager -replace '^bun@', ''
if ((& $bun --version) -ne $expectedBunVersion) {
  throw "Bun $expectedBunVersion is required"
}
if ((& $node --version) -ne "v24.19.0") {
  throw "Node 24.19.0 is required"
}

New-Item -ItemType Directory -Force -Path $output | Out-Null

function Invoke-Bun {
  param(
    [Parameter(Mandatory)]
    [string]$WorkingDirectory,

    [Parameter(Mandatory)]
    [string[]]$Arguments
  )

  Push-Location $WorkingDirectory
  try {
    & $bun @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Bun command failed with exit code $LASTEXITCODE in $WorkingDirectory"
    }
  }
  finally {
    Pop-Location
  }
}

if (-not $SkipInstall) {
  Invoke-Bun -WorkingDirectory $repo -Arguments @(
    "install",
    "--frozen-lockfile",
    "--linker", "hoisted",
    "--ignore-scripts",
    "--filter", "@opencode/desktop",
    "--filter", "@opencode/cli",
    "--filter", "@loginom-ai-agent/loginom-host"
  )

  # The filtered graph contains optional editor grammars whose generic install
  # scripts try to compile with node-gyp even though neither Windows product
  # consumes those builds. Run only the two installation steps required by the
  # release graph, using the explicitly pinned runtimes above.
  & $node (Join-Path $repo "node_modules/electron/install.js")
  if ($LASTEXITCODE -ne 0) {
    throw "Electron installation failed with exit code $LASTEXITCODE"
  }
  Invoke-Bun -WorkingDirectory (Join-Path $repo "packages/core") -Arguments @("run", "fix-node-pty")
}

$saved = @{}
foreach ($name in "LOGINOM_AI_AGENT_CHANNEL", "LOGINOM_AI_AGENT_NODE_SOURCE", "LOGINOM_AI_AGENT_BROWSER_SOURCE", "LOGINOM_AI_AGENT_PTY_BIN", "LOGINOM_AI_AGENT_TARGET", "LOGINOM_AI_AGENT_DESKTOP_APP", "BUN_COMPILE_RELEASE") {
  $saved[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}
try {
  $env:LOGINOM_AI_AGENT_CHANNEL = $Channel
  $env:LOGINOM_AI_AGENT_NODE_SOURCE = $node
  $env:LOGINOM_AI_AGENT_BROWSER_SOURCE = $browsers
  $env:LOGINOM_AI_AGENT_PTY_BIN = $pty
  $env:LOGINOM_AI_AGENT_DESKTOP_APP = $null

  if ($Product -in @("Desktop", "Both")) {
    $cli = Join-Path $repo "packages/cli"
    $desktop = Join-Path $repo "packages/desktop"
    $desktopOutput = Join-Path $output "desktop"
    $unpacked = Join-Path $desktopOutput "win-unpacked"
    if (Test-Path -LiteralPath $desktopOutput) { throw "Desktop output already exists: $desktopOutput" }

    # Desktop bundles the CLI from packages/cli/dist and fails without it, so the CLI is built first. Its directory
    # name is the baseline target (cli-windows-x64-baseline), which clients without AVX2 need.
    # BUN_COMPILE_RELEASE makes the build fetch and checksum that runtime itself; it unpacks it with `unzip`, which
    # the hosted runner has only in Git's usr/bin.
    if (-not (Get-Command unzip -ErrorAction SilentlyContinue)) {
      $gitTools = Join-Path $env:ProgramFiles "Git\usr\bin"
      if (Test-Path -LiteralPath (Join-Path $gitTools "unzip.exe")) { $env:PATH = "$gitTools;$env:PATH" }
      else { throw "unzip is required to unpack the Bun compile runtime" }
    }
    $env:LOGINOM_AI_AGENT_TARGET = "windows-x64-baseline"
    $env:BUN_COMPILE_RELEASE = "bun-v$expectedBunVersion"
    Invoke-Bun -WorkingDirectory $cli -Arguments @("script/build.ts", "--skip-install", "--skip-web-ui")
    if (-not (Test-Path -LiteralPath (Join-Path $cli "dist/cli-windows-x64-baseline/bin/opencode.exe") -PathType Leaf)) {
      throw "The Desktop CLI was not built into packages/cli/dist"
    }
    $env:BUN_COMPILE_RELEASE = $null

    $env:LOGINOM_AI_AGENT_TARGET = "windows-x64"
    Invoke-Bun -WorkingDirectory $desktop -Arguments @("run", "build")
    # First call: the unpacked app, which the release signs. Second call, with the app named: the NSIS installer
    # around it. Each call clears dist/desktop, so the app moves out between them.
    Invoke-Bun -WorkingDirectory $desktop -Arguments @("run", "pack")
    New-Item -ItemType Directory -Force -Path $desktopOutput | Out-Null
    Move-Item -LiteralPath (Join-Path $repo "dist/desktop/app") -Destination $unpacked
    $env:LOGINOM_AI_AGENT_DESKTOP_APP = $unpacked
    Invoke-Bun -WorkingDirectory $desktop -Arguments @("run", "pack")
    $env:LOGINOM_AI_AGENT_DESKTOP_APP = $null
    $installers = @(Get-ChildItem -LiteralPath (Join-Path $repo "dist/desktop") -Filter "*-win-x64.exe" -File)
    if ($installers.Count -ne 1) { throw "Expected one Desktop installer, found $($installers.Count)" }
    Copy-Item -LiteralPath $installers[0].FullName -Destination $desktopOutput
  }

  if ($Product -in @("Cli", "Both")) {
    $cliOutput = Join-Path $output "cli-payload"
    if (Test-Path -LiteralPath $cliOutput) {
      throw "CLI output already exists: $cliOutput"
    }
    Invoke-Bun -WorkingDirectory (Join-Path $repo "packages/loginom-host") -Arguments @(
      "script/build-cli.ts", $cliOutput
    )
  }
}
finally {
  foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], "Process") }
}
