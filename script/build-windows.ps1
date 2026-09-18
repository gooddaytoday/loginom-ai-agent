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

if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
  throw "Pinned Node executable does not exist: $node"
}
if (-not (Test-Path -LiteralPath $browsers -PathType Container)) {
  throw "Pinned browser directory does not exist: $browsers"
}
if ((& $bun --version) -ne "1.3.14") {
  throw "Bun 1.3.14 is required"
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
    "--filter", "@loginom-ai-agent/desktop",
    "--filter", "@loginom-ai-agent/loginom-host",
    "--filter", "@loginom-ai-agent/agent"
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

$previousChannel = $env:LOGINOM_AI_AGENT_CHANNEL
$previousNode = $env:LOGINOM_AI_AGENT_NODE_SOURCE
$previousBrowser = $env:LOGINOM_AI_AGENT_BROWSER_SOURCE
try {
  $env:LOGINOM_AI_AGENT_CHANNEL = $Channel
  $env:LOGINOM_AI_AGENT_NODE_SOURCE = $node
  $env:LOGINOM_AI_AGENT_BROWSER_SOURCE = $browsers

  if ($Product -in @("Desktop", "Both")) {
    $desktopOutput = Join-Path $output "desktop"
    Invoke-Bun -WorkingDirectory (Join-Path $repo "packages/desktop") -Arguments @("run", "build")
    Invoke-Bun -WorkingDirectory (Join-Path $repo "packages/desktop") -Arguments @(
      "run", "package:win", "--x64", "--publish", "never", "--config.directories.output=$desktopOutput"
    )
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
  $env:LOGINOM_AI_AGENT_CHANNEL = $previousChannel
  $env:LOGINOM_AI_AGENT_NODE_SOURCE = $previousNode
  $env:LOGINOM_AI_AGENT_BROWSER_SOURCE = $previousBrowser
}
