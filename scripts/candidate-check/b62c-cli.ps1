# B6.2c, checklist step 8 on Windows: the CLI ZIP of the candidate, extracted to C:\lab\b62c\u\cli. Install from the ZIP, a Loginom login, one task on a stub model, removal.
# Run as the ordinary account (b62c-psu.sh user). No real model: the profile config names a stub on 127.0.0.1 (b62c-task.mjs) as the only provider.
# The Loginom server does not exist: `loginom setup` with a made-up address ends in LOGINOM_LOGIN_UNAVAILABLE, as in B3.3 (cli.cmd); what is checked is that the
# login path runs, saves the connection for the profile and reports it.
$ErrorActionPreference = 'Continue'
$extracted = 'C:\lab\b62c\u\cli'; $node = "$extracted\resources\loginom\bin\node.exe"
$installed = Join-Path $env:LOCALAPPDATA 'Programs\loginom-ai-agent-cli'
$profile = 'C:\lab\b62c\u\cli-step8'
function Step($name, [scriptblock]$body) { $t = Get-Date; "== $name"; & $body; "-- $name finished in $([int]((Get-Date)-$t).TotalSeconds) s" }
function Run-Cli([string]$arguments, [string]$stdin) {
  $out = Join-Path $env:TEMP 'b62c-cli.out'
  if ($stdin) { Set-Content (Join-Path $env:TEMP 'b62c-cli.in') -Value $stdin -Encoding ASCII -NoNewline; cmd /c "`"$script:exe`" $arguments < `"$env:TEMP\b62c-cli.in`" > `"$out`" 2>&1" }
  else { cmd /c "`"$script:exe`" $arguments < nul > `"$out`" 2>&1" }
  "exit $LASTEXITCODE"
  # The CLI's PowerShell helper (DPAPI) leaks a CLIXML progress block into a redirected stderr; it is cut here and noted in the log.
  $text = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($out))
  if ($text -match '<Objs') { 'note: #< CLIXML block from a child powershell.exe in the redirected output, removed below' }
  ($text -replace '#< CLIXML\r?\n', '' -replace '(?s)<Objs.*?</Objs>', '').Trim()
}
Remove-Item $profile, C:\lab\b62c\u\work-step8 -Recurse -Force -ErrorAction SilentlyContinue
$env:LOGINOM_AI_AGENT_CLI_PROFILE = $profile
Step 'install from the ZIP (install.cmd)' {
  cmd /c "`"$extracted\install.cmd`" > `"$env:TEMP\b62c-install.out`" 2>&1"; "install exit $LASTEXITCODE"
  Get-Content "$env:TEMP\b62c-install.out" -Encoding UTF8 | Select-Object -First 10
  $script:exe = @(Get-ChildItem $installed -Recurse -Filter loginom-ai-agent-cli.exe)[0].FullName
  "installed: $script:exe"
}
Step 'version' { Run-Cli '--version' }
Step 'login (loginom setup, made-up address)' {
  Run-Cli 'loginom setup --stdin-json --format json' '{"url":"http://127.0.0.1:9/","username":"b62c","password":"b62c-made-up-loginom-password"}'
  Run-Cli 'loginom status --format json'
}
Step 'one task on the stub model (run)' {
  & $node C:\lab\b62c\tools\b62c-task.mjs --cli $script:exe --profile $profile --work C:\lab\b62c\u\work-step8 2>&1 | ForEach-Object { "$_" }
  "task exit $LASTEXITCODE"
}
Step 'removal (uninstall.cmd from the extracted directory)' {
  Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($installed, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { "still running: $($_.Id) $($_.Path)" }
  cmd /c "`"$extracted\uninstall.cmd`" > `"$env:TEMP\b62c-uninstall.out`" 2>&1"; "uninstall exit $LASTEXITCODE"
  Get-Content "$env:TEMP\b62c-uninstall.out" -Encoding UTF8 | Select-Object -First 10
  "installed directory left: $(Test-Path $installed): $((Get-ChildItem $installed -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName.Substring($installed.Length) }) -join ', '); profile kept: $(Test-Path $profile)"
}
