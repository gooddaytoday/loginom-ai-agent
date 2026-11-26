# B6.2c SEC-01: the Electron 44.9.1 win32-x64 zip for b62c-sec01.ps1; the caller compares the printed SHA-256 with checksums.json of the Desktop package.
$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
$d = 'C:\lab\b62c\u\sec01'; New-Item -ItemType Directory -Force $d | Out-Null
if (-not (Test-Path "$d\electron.zip")) { Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/electron/electron/releases/download/v44.9.1/electron-v44.9.1-win32-x64.zip' -OutFile "$d\electron.zip" }
(Get-FileHash "$d\electron.zip" -Algorithm SHA256).Hash.ToLower()
