# B6.2c: before the checklist run, remove the release Desktops of the B3.3 part (their own uninstallers) and the product profile they left, so the clean install starts on a clean profile.
$ErrorActionPreference = 'Continue'
Get-ChildItem C:\lab\b62c\u\apps -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $uninstaller = Get-ChildItem $_.FullName -Filter 'Uninstall *.exe' | Select-Object -First 1
  if ($uninstaller) { $p = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S', '/currentuser' -PassThru -Wait; "uninstall $($_.Name) exit $($p.ExitCode)" }
}
# the NSIS uninstaller restarts itself from %TEMP% and returns at once: wait until the application directories are gone
1..60 | ForEach-Object { if (-not (Get-ChildItem C:\lab\b62c\u\apps -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path "$($_.FullName)\*.exe" })) { return }; Start-Sleep 2 }
Remove-Item C:\lab\b62c\u\apps -Recurse -Force -ErrorAction SilentlyContinue
& C:\lab\b62c\tools\wipe.ps1
'HKCU uninstall entries left: ' + @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Loginom*' }).Count
'HKCU URI scheme left: ' + (Test-Path 'HKCU:\Software\Classes\loginom-ai-agent')
