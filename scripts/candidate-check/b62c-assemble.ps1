# B6.2c: joins the 20 MB parts C:\lab\b62c\parts\<prefix>.NNN into <Out> and prints its SHA-256 (compare with the Linux side).
param([Parameter(Mandatory)][string]$Prefix, [Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
$parts = @(Get-ChildItem C:\lab\b62c\parts -Filter "$Prefix.*" | Sort-Object Name)
$stream = [IO.File]::Create($Out)
try { foreach ($part in $parts) { $bytes = [IO.File]::ReadAllBytes($part.FullName); $stream.Write($bytes, 0, $bytes.Length) } } finally { $stream.Dispose() }
"$($parts.Count) parts, $((Get-Item $Out).Length) bytes, sha256 $((Get-FileHash $Out -Algorithm SHA256).Hash.ToLower())"
