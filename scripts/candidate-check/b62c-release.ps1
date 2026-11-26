# B6.2c, B3.3 on Windows for one release: wipe the profile, install the release Desktop (NSIS /S /currentuser, the installer replaces the previous
# release), `live.mjs old` writes the profile, then the candidate CLI from the ZIP takes it over on both paths (`serve`, `migrate`).
# Run as the ordinary account: powershell -File C:\lab\b62c\tools\b62c-release.ps1 -Rel 0.3.9
param([Parameter(Mandatory)][string]$Rel)
$ErrorActionPreference = 'Continue'
$app = "C:\lab\b62c\u\apps\$Rel"; $state = "C:\lab\b62c\u\state-$Rel"; $node = "$app\resources\loginom\bin\node.exe"
$cliNode = 'C:\lab\b62c\u\cli\resources\loginom\bin\node.exe'; $cli = 'C:\lab\b62c\u\cli\bin\loginom-ai-agent-cli.exe'
& C:\lab\b62c\tools\wipe.ps1
Remove-Item $state -Recurse -Force -ErrorAction SilentlyContinue
$t = Get-Date
$p = Start-Process -FilePath "C:\lab\b62c\dist\desktop-$Rel.exe" -ArgumentList '/S', '/currentuser', "/D=$app" -PassThru -Wait
"== install $Rel exit $($p.ExitCode) in $([int]((Get-Date)-$t).TotalSeconds) s; apps: $((Get-ChildItem C:\lab\b62c\u\apps | ForEach-Object Name) -join ',')"
$t = Get-Date
& $node C:\lab\b62c\tools\live.mjs old --app "$app\loginom-ai-agent.exe" --label $Rel --state $state 2>&1 | ForEach-Object { "$_" }
"== old $Rel exit $LASTEXITCODE in $([int]((Get-Date)-$t).TotalSeconds) s"
# Before the first CLI start: the provider of the profile points at the stub on 127.0.0.1 and nowhere else (the key is not printed).
$config = Get-Content "$state\pristine\config\loginom-ai-agent.jsonc" -Raw
"provider baseURL: " + (([regex]::Matches($config, '"baseURL"\s*:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) -join ' ')
foreach ($path in 'serve', 'migrate') {
  $t = Get-Date
  & $cliNode C:\lab\b62c\tools\live.mjs v2 --bin $cli --state $state --path $path --profile "C:\lab\b62c\u\cli-$Rel-$path" 2>&1 | ForEach-Object { "$_" }
  "== v2 $Rel $path exit $LASTEXITCODE in $([int]((Get-Date)-$t).TotalSeconds) s"
}
