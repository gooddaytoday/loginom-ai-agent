# Removes the product profile of the temporary account (backend data, configuration, Desktop userData, projects),
# so the next release starts from an empty profile. Runs as that account.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$targets = @(
  (Join-Path $env:USERPROFILE '.local'), (Join-Path $env:USERPROFILE '.config'), (Join-Path $env:USERPROFILE '.cache'),
  (Join-Path $env:USERPROFILE 'Проекты B33'), (Join-Path $env:APPDATA 'com.loginom.aiagent')
)
foreach ($target in $targets) {
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force; "removed $target" }
}
