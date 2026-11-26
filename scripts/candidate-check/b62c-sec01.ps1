# B6.2c SEC-01 on Windows (B4.14a level): the Desktop safeStorage codec in Electron 44 under DPAPI, as the ordinary account (run through b62c-psu.sh user).
# Needs C:\lab\b62c\u\sec01\electron.zip (electron-v44.9.1-win32-x64.zip, SHA-256 from packages/desktop/node_modules/electron/checksums.json) and tools\credentials.cjs, safe-storage-smoke.cjs.
# write / read / unavailable as loginom-windows.yml does, then the same ciphertext damaged on disk: read must refuse (non-zero exit, no evidence).
$d='C:\lab\b62c\u\sec01'; $t0=Get-Date
if (-not (Test-Path "$d\electron\electron.exe")) { Expand-Archive "$d\electron.zip" "$d\electron" -Force }
"electron.exe: " + (Get-Item "$d\electron\electron.exe").VersionInfo.ProductVersion
"whoami: $([Security.Principal.WindowsIdentity]::GetCurrent().Name); admin=$(([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators'))"
New-Item -ItemType Directory -Force "$d\ev","$d\prof" | Out-Null
Remove-Item "$d\credentials.json","$d\ev\*","$d\must-not-exist.json" -ErrorAction SilentlyContinue
$env:LOGINOM_SAFE_STORAGE_CODEC='C:\lab\b62c\tools\credentials.cjs'; $env:LOGINOM_SAFE_STORAGE_PROFILE="$d\prof"
function Run($mode, $data, $name = $mode) {
  $env:LOGINOM_SAFE_STORAGE_MODE=$mode; $env:LOGINOM_SAFE_STORAGE_DATA=$data; $env:LOGINOM_SAFE_STORAGE_EVIDENCE="$d\ev\safe-storage-$name.json"
  $t=Get-Date
  $p = Start-Process "$d\electron\electron.exe" -ArgumentList '"C:\lab\b62c\tools\safe-storage-smoke.cjs"' -PassThru -RedirectStandardOutput "$d\$mode.out" -RedirectStandardError "$d\$mode.err"
  $null = $p.Handle  # keeps the handle so ExitCode is readable
  if (-not $p.WaitForExit(60000)) { Stop-Process -Id $p.Id -Force; "$mode TIMEOUT"; return }
  $p.WaitForExit()
  "$mode exit $($p.ExitCode) in $([int]((Get-Date)-$t).TotalMilliseconds) ms; stderr: $((Get-Content "$d\$mode.err" -Raw))"
  if (Test-Path "$d\ev\safe-storage-$name.json") { Get-Content "$d\ev\safe-storage-$name.json" -Raw }
}
Run 'write' "$d\credentials.json"
"stored file: $((Get-Content "$d\credentials.json" -Raw).Length) chars; keys: $(((Get-Content "$d\credentials.json" -Raw) | ConvertFrom-Json).PSObject.Properties.Name -join ',')"
Run 'read' "$d\credentials.json"
Run 'unavailable' "$d\must-not-exist.json"
"must-not-exist.json exists: $(Test-Path "$d\must-not-exist.json")"
# damage on disk, between processes: one byte of the ciphertext flipped; read must refuse (exit 1, no evidence)
$j = Get-Content "$d\credentials.json" -Raw | ConvertFrom-Json
$b = [Convert]::FromBase64String($j.encrypted); $b[$b.Length-1] = $b[$b.Length-1] -bxor 0xFF
Set-Content "$d\damaged.json" -Value (@{encrypted=[Convert]::ToBase64String($b)} | ConvertTo-Json -Compress) -Encoding ASCII -NoNewline
Run 'read' "$d\damaged.json" 'read-damaged'
"damaged read left evidence: $(Test-Path "$d\ev\safe-storage-read-damaged.json")"
"total $([int]((Get-Date)-$t0).TotalSeconds) s"
