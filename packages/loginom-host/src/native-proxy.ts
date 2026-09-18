import { spawnSync } from "node:child_process"
import { win32 } from "node:path"
import { Option, Schema } from "effect"

const windowsSettings = Schema.Struct({
  autoDetect: Schema.Boolean,
  autoConfigUrl: Schema.String,
  proxy: Schema.String,
  bypass: Schema.String,
})

export function windowsProxyEnvironment(input: unknown, environment: NodeJS.ProcessEnv) {
  const settings = Option.getOrElse(Schema.decodeUnknownOption(windowsSettings)(input), () => {
    throw Error("SYSTEM_PROXY_SETTINGS_INVALID")
  })
  if (settings.autoDetect || settings.autoConfigUrl) throw Error("SYSTEM_PROXY_AUTOMATIC_UNSUPPORTED")
  if (!settings.proxy) return undefined
  const entries = settings.proxy.split(";").filter(Boolean)
  if (entries.length === 1 && !entries[0].includes("="))
    return manualEnvironment(entries[0], entries[0], settings.bypass.split(";"), environment, true)
  const routes = new Map<string, string>()
  for (const entry of entries) {
    const match = /^(http|https)=([^=]+)$/.exec(entry.trim())
    if (!match || routes.has(match[1])) throw Error("SYSTEM_PROXY_PROTOCOL_UNSUPPORTED")
    routes.set(match[1], match[2])
  }
  return manualEnvironment(
    routes.get("http") ?? "",
    routes.get("https") ?? "",
    settings.bypass.split(";"),
    environment,
    true,
  )
}

// scutil --proxy describes nested dictionaries. Only top-level routing is usable
// as process-wide HTTP_PROXY; scoped/automatic routing cannot be flattened safely.
export function macProxyEnvironment(input: string, environment: NodeJS.ProcessEnv) {
  if (!/^<dictionary> \{\r?\n[\s\S]*\}\s*$/.test(input)) throw Error("SYSTEM_PROXY_SETTINGS_INVALID")
  const settings = new Map<string, string>()
  for (const line of input.split(/\r?\n/)) {
    const match = /^  (\w+) : (.*)$/.exec(line)
    if (!match) continue
    if (settings.has(match[1])) throw Error("SYSTEM_PROXY_SETTINGS_INVALID")
    settings.set(match[1], match[2])
  }
  const enabled = (key: string) => {
    const value = settings.get(key)
    if (value !== undefined && value !== "0" && value !== "1") throw Error("SYSTEM_PROXY_SETTINGS_INVALID")
    return value === "1"
  }
  if (enabled("ProxyAutoConfigEnable") || enabled("ProxyAutoDiscoveryEnable"))
    throw Error("SYSTEM_PROXY_AUTOMATIC_UNSUPPORTED")
  if (settings.has("__SCOPED__") || settings.has("__SUPPLEMENTAL__")) throw Error("SYSTEM_PROXY_SCOPED_UNSUPPORTED")
  if (enabled("SOCKSEnable") || enabled("FTPEnable")) throw Error("SYSTEM_PROXY_PROTOCOL_UNSUPPORTED")
  if (!enabled("HTTPEnable") && !enabled("HTTPSEnable")) return undefined
  if (
    (enabled("HTTPSEnable") && enabled("HTTPSRequiresPassword")) ||
    (enabled("HTTPEnable") && enabled("HTTPRequiresPassword"))
  )
    throw Error("SYSTEM_PROXY_AUTHENTICATION_UNSUPPORTED")
  if (enabled("ExcludeSimpleHostnames")) throw Error("SYSTEM_PROXY_BYPASS_UNSUPPORTED")
  const proxy = (scheme: string) => {
    if (!enabled(scheme + "Enable")) return ""
    const host = settings.get(scheme + "Proxy") ?? ""
    return `${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${settings.get(scheme + "Port") ?? ""}`
  }
  const exceptions = /^  ExceptionsList : <array> \{\r?\n([\s\S]*?)^  \}/m.exec(input)
  if (settings.has("ExceptionsList") && !exceptions) throw Error("SYSTEM_PROXY_SETTINGS_INVALID")
  const bypass = (exceptions?.[1] ?? "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = /^    \d+ : (.+)$/.exec(line)
      if (!match) throw Error("SYSTEM_PROXY_SETTINGS_INVALID")
      return match[1]
    })
  return manualEnvironment(proxy("HTTP"), proxy("HTTPS"), bypass, environment)
}

function manualEnvironment(
  http: string,
  https: string,
  bypass: string[],
  environment: NodeJS.ProcessEnv,
  windows = false,
) {
  const address = (value: string) => {
    if (!value) return ""
    const plain = value.startsWith("http://") ? value.slice(7) : value
    if (!/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::\d+)?$/.test(plain)) throw Error("SYSTEM_PROXY_ADDRESS_INVALID")
    if (!URL.canParse("http://" + plain)) throw Error("SYSTEM_PROXY_ADDRESS_INVALID")
    const url = new URL("http://" + plain)
    const port = Number(/:(\d+)$/.exec(plain)?.[1] ?? "80")
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("SYSTEM_PROXY_ADDRESS_INVALID")
    return url.origin
  }
  const noProxy = new Map<string, string>()
  const add = (value: string) => noProxy.set(value.toLowerCase(), value.toLowerCase())
  const bypasses = bypass.map((value) => value.trim()).filter(Boolean)
  const proxyLoopback = windows && bypasses.some((value) => value.toLowerCase() === "<-loopback>")
  for (const value of bypasses) {
    for (const rule of bypassRules(value, environment, windows)) add(rule)
  }
  if (!proxyLoopback) for (const value of ["localhost", "127.0.0.1", "::1"]) add(value)
  const httpProxy = address(http)
  const httpsProxy = address(https)
  return {
    ...environment,
    HTTP_PROXY: httpProxy,
    http_proxy: httpProxy,
    HTTPS_PROXY: httpsProxy,
    https_proxy: httpsProxy,
    ALL_PROXY: "",
    all_proxy: "",
    NO_PROXY: [...noProxy.values()].join(","),
    no_proxy: [...noProxy.values()].join(","),
    NODE_USE_ENV_PROXY: "1",
  }
}

function bypassRules(value: string, environment: NodeJS.ProcessEnv, windows: boolean) {
  if (value.toLowerCase() === "<-loopback>") {
    if (!windows) throw Error("SYSTEM_PROXY_BYPASS_UNSUPPORTED")
    return []
  }
  if (value.toLowerCase() === "<local>") {
    if (!windows) throw Error("SYSTEM_PROXY_BYPASS_UNSUPPORTED")
    return [environment.COMPUTERNAME, environment.HOSTNAME].filter(
      (name): name is string => !!name && /^[a-zA-Z0-9-]+$/.test(name),
    )
  }
  if (value === "*") return [value]
  if (value.includes("/")) throw Error("SYSTEM_PROXY_BYPASS_UNSUPPORTED")
  const prefix = /^(\d{1,3}(?:\.\d{1,3})*)\.(\d{0,3})\*$/.exec(value)
  if (prefix) {
    const fixed = prefix[1].split(".").map(Number)
    if (fixed.length > 3 || fixed.some((part) => part > 255)) throw Error("SYSTEM_PROXY_BYPASS_UNSUPPORTED")
    const values = Array.from({ length: 256 }, (_, index) => index).filter((part) =>
      String(part).startsWith(prefix[2]),
    )
    if (!values.length) throw Error("SYSTEM_PROXY_BYPASS_UNSUPPORTED")
    const ranges = values.reduce<Array<[number, number]>>((result, part) => {
      const last = result.at(-1)
      if (last && last[1] + 1 === part) last[1] = part
      else result.push([part, part])
      return result
    }, [])
    return ranges.map(([start, end]) => {
      const remaining = 3 - fixed.length
      return `${[...fixed, start, ...Array(remaining).fill(0)].join(".")}-${[
        ...fixed,
        end,
        ...Array(remaining).fill(255),
      ].join(".")}`
    })
  }
  const ipv4 = value.split(".").map((part) => part.trim())
  if (ipv4.length <= 4 && ipv4.includes("*") && ipv4.every((part) => part === "*" || /^\d{1,3}$/.test(part))) {
    const parts = [...ipv4, ...Array(4 - ipv4.length).fill("*")]
    if (parts.some((part) => part !== "*" && Number(part) > 255)) throw Error("SYSTEM_PROXY_BYPASS_UNSUPPORTED")
    const wildcard = parts.indexOf("*")
    if (wildcard === -1) return [value]
    if (parts.slice(wildcard).some((part) => part !== "*")) throw Error("SYSTEM_PROXY_BYPASS_UNSUPPORTED")
    return [
      `${parts.map((part) => (part === "*" ? "0" : part)).join(".")}-${parts
        .map((part) => (part === "*" ? "255" : part))
        .join(".")}`,
    ]
  }
  const domain = value.startsWith("*.") ? value.slice(2) : value.startsWith(".") ? value.slice(1) : value
  if (
    !domain ||
    !domain.split(".").every((part) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part))
  ) {
    if (!/^\[?[a-fA-F0-9:]+\]?$/.test(value)) throw Error("SYSTEM_PROXY_BYPASS_UNSUPPORTED")
  }
  return [value.startsWith("*.") ? `.${domain}` : value]
}

export function loadNativeProxy(environment: NodeJS.ProcessEnv, platform: "win32" | "darwin") {
  if (process.platform !== platform) throw Error("SYSTEM_PROXY_PLATFORM_UNAVAILABLE")
  if (platform === "darwin") {
    const result = spawnSync("/usr/sbin/scutil", ["--proxy"], {
      env: { LC_ALL: "C" },
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 128 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    })
    if (result.error || result.status !== 0) throw Error("SYSTEM_PROXY_READ_FAILED")
    return macProxyEnvironment(result.stdout, environment)
  }
  const root = environment.SystemRoot ?? environment.SYSTEMROOT
  if (!root || !win32.isAbsolute(root)) throw Error("SYSTEM_PROXY_READ_FAILED")
  const script = `
$ErrorActionPreference = 'Stop'
try {
  [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LoginomProxy {
  [StructLayout(LayoutKind.Sequential)] public struct Config {
    [MarshalAs(UnmanagedType.Bool)] public bool AutoDetect;
    public IntPtr AutoConfigUrl, Proxy, Bypass;
  }
  [DllImport("winhttp.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool WinHttpGetIEProxyConfigForCurrentUser(out Config config);
  [DllImport("kernel32.dll")] public static extern IntPtr GlobalFree(IntPtr value);
}
'@
  $config = New-Object LoginomProxy+Config
  if (-not [LoginomProxy]::WinHttpGetIEProxyConfigForCurrentUser([ref]$config)) { exit 1 }
  try {
    [ordered]@{
      autoDetect = $config.AutoDetect
      autoConfigUrl = [string][Runtime.InteropServices.Marshal]::PtrToStringUni($config.AutoConfigUrl)
      proxy = [string][Runtime.InteropServices.Marshal]::PtrToStringUni($config.Proxy)
      bypass = [string][Runtime.InteropServices.Marshal]::PtrToStringUni($config.Bypass)
    } | ConvertTo-Json -Compress
  } finally {
    foreach ($value in @($config.AutoConfigUrl, $config.Proxy, $config.Bypass)) {
      if ($value -ne [IntPtr]::Zero) { [void][LoginomProxy]::GlobalFree($value) }
    }
  }
} catch { exit 1 }
`
  const result = spawnSync(
    win32.join(root, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
    {
      env: { SystemRoot: root, TEMP: environment.TEMP, TMP: environment.TMP, USERPROFILE: environment.USERPROFILE },
      windowsHide: true,
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 128 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    },
  )
  if (result.error || result.status !== 0) throw Error("SYSTEM_PROXY_READ_FAILED")
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(result.stdout.trim())
  if (Option.isNone(decoded)) throw Error("SYSTEM_PROXY_SETTINGS_INVALID")
  return windowsProxyEnvironment(decoded.value, environment)
}
