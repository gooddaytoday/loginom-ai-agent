param(
  [ValidateSet('save', 'apply', 'restore')] [string] $Action,
  [string] $Snapshot,
  [ValidateSet('manual', 'pac', 'none')] [string] $Mode = 'none',
  [string] $Server,
  [string] $Pac
)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'Native proxy tests require a disposable GitHub-hosted runner'
}
$root = 'Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$locations = @{
  $root = @('ProxyEnable', 'ProxyServer', 'ProxyOverride', 'AutoConfigURL', 'AutoDetect')
  "$root\Connections" = @('DefaultConnectionSettings', 'SavedLegacySettings')
}
if ($Action -eq 'save') {
  $saved = foreach ($path in $locations.Keys) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($path)
    try {
      foreach ($name in $locations[$path]) {
        $present = $null -ne $key -and $key.GetValueNames() -contains $name
        [pscustomobject]@{ Path = $path; Name = $name; Present = $present
          Value = $(if ($present) { $key.GetValue($name) } else { $null })
          Kind = $(if ($present) { $key.GetValueKind($name).ToString() } else { '' }) }
      }
    } finally { if ($key) { $key.Dispose() } }
  }
  $saved | Export-Clixml -Path $Snapshot
  exit 0
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LoginomProxyFixture {
  [StructLayout(LayoutKind.Sequential)] struct Option { public int Id; public IntPtr Value; }
  [StructLayout(LayoutKind.Sequential)] struct Options {
    public int Size; public IntPtr Connection; public int Count; public int Error; public IntPtr Values;
  }
  [DllImport("wininet.dll", EntryPoint="InternetSetOptionW", SetLastError=true)]
  static extern bool SetOptions(IntPtr handle, int option, ref Options values, int size);
  [DllImport("wininet.dll", EntryPoint="InternetSetOptionW", SetLastError=true)]
  static extern bool Notify(IntPtr handle, int option, IntPtr value, int size);
  public static void Refresh() {
    if (!Notify(IntPtr.Zero, 39, IntPtr.Zero, 0) || !Notify(IntPtr.Zero, 37, IntPtr.Zero, 0))
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  }
  public static void Apply(string mode, string server, string pac) {
    var strings = new[] { Marshal.StringToHGlobalUni(server), Marshal.StringToHGlobalUni(""), Marshal.StringToHGlobalUni(pac) };
    var values = new[] {
      new Option { Id=1, Value=new IntPtr(mode=="manual" ? 3 : mode=="pac" ? 5 : 1) },
      new Option { Id=2, Value=strings[0] }, new Option { Id=3, Value=strings[1] }, new Option { Id=4, Value=strings[2] }
    };
    int size = Marshal.SizeOf(typeof(Option));
    var memory = Marshal.AllocHGlobal(size * values.Length);
    try {
      for (int i=0; i<values.Length; i++) Marshal.StructureToPtr(values[i], IntPtr.Add(memory, i*size), false);
      var list = new Options { Size=Marshal.SizeOf(typeof(Options)), Count=values.Length, Values=memory };
      if (!SetOptions(IntPtr.Zero, 75, ref list, list.Size)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      Refresh();
    } finally {
      Marshal.FreeHGlobal(memory);
      foreach (var pointer in strings) Marshal.FreeHGlobal(pointer);
    }
  }
}
'@
if ($Action -eq 'apply') {
  [LoginomProxyFixture]::Apply($Mode, $Server, $Pac)
  exit 0
}
foreach ($item in (Import-Clixml -Path $Snapshot)) {
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($item.Path)
  try {
    if ($item.Present) {
      # Export-Clixml unwraps some registry arrays into Object[]; SetValue
      # requires their exact native type, notably byte[] for connection flags.
      $value = switch ($item.Kind) {
        'Binary' { ,([byte[]] $item.Value) }
        'None' { ,([byte[]] $item.Value) }
        'DWord' { [int] $item.Value }
        'QWord' { [long] $item.Value }
        'MultiString' { ,([string[]] $item.Value) }
        default { [string] $item.Value }
      }
      $key.SetValue($item.Name, $value, [Microsoft.Win32.RegistryValueKind] $item.Kind)
    } else {
      $key.DeleteValue($item.Name, $false)
    }
    if ($item.Present -ne ($key.GetValueNames() -contains $item.Name)) { throw 'Proxy restore failed' }
    if ($item.Present -and ($key.GetValueKind($item.Name).ToString() -ne $item.Kind -or
        (ConvertTo-Json -InputObject $value -Compress) -ne (ConvertTo-Json -InputObject $key.GetValue($item.Name) -Compress))) {
      throw 'Proxy restore mismatch'
    }
  } finally { $key.Dispose() }
}
[LoginomProxyFixture]::Refresh()
