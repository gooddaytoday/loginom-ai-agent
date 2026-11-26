# B6.2c: the CLI ZIP of the candidate (bsdtar, as an ordinary user would) into C:\lab\b62c\u\cli.
$d = 'C:\lab\b62c\u\cli'
if (Test-Path $d) { Remove-Item $d -Recurse -Force }
New-Item -ItemType Directory $d | Out-Null
tar -xf C:\lab\b62c\dist\cli.zip -C $d
"extract exit $LASTEXITCODE"
exit $LASTEXITCODE
