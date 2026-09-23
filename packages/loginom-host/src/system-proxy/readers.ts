import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { hostname } from "node:os"
import { join } from "node:path"

import { windowsPowerShellArguments } from "../windows-powershell"

export type CommandResult = {
  code: number | null
  stdout: string
  timedOut: boolean
  error?: string
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { timeoutMs: number; env?: NodeJS.ProcessEnv; maxBytes: number; signal?: AbortSignal },
) => Promise<CommandResult>

export type SystemProxySnapshot = {
  windows?: unknown
  macos?: string
  gnome?: string
  kde?: string
}

export type ReadOutcome =
  | { ok: true; snapshot: SystemProxySnapshot }
  | { ok: false; code: "read-failed" | "timeout" }

const OUTPUT_LIMIT = 128 * 1024

export function spawnCommand(
  command: string,
  args: string[],
  options: { timeoutMs: number; env?: NodeJS.ProcessEnv; maxBytes: number; signal?: AbortSignal },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = ""
    let settled = false
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort = () => undefined
    const finish = (result: CommandResult) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener("abort", onAbort)
      resolve(result)
    }
    if (options.signal?.aborted) {
      resolve({ code: null, stdout: "", timedOut: true })
      return
    }
    const child = spawn(command, args, {
      env: options.env,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
      detached: process.platform !== "win32",
    })
    const stop = () => {
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL")
          return
        } catch {
          // Процесс уже завершился.
        }
      }
      child.kill()
    }
    timer = setTimeout(() => {
      timedOut = true
      stop()
    }, options.timeoutMs)
    onAbort = () => {
      timedOut = true
      stop()
    }
    options.signal?.addEventListener("abort", onAbort, { once: true })
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
      if (Buffer.byteLength(stdout) > options.maxBytes) {
        stdout = stdout.slice(0, options.maxBytes)
        stop()
      }
    })
    child.once("error", (error) => finish({ code: null, stdout, timedOut, error: error.message }))
    child.once("close", (code) => finish({ code, stdout, timedOut }))
  })
}

export async function readSystemProxy(input: {
  platform?: NodeJS.Platform
  environment?: NodeJS.ProcessEnv
  runner?: CommandRunner
  timeoutMs?: number
  signal?: AbortSignal
  readText?: (path: string) => Promise<string>
} = {}): Promise<ReadOutcome> {
  const platform = input.platform ?? process.platform
  const environment = input.environment ?? process.env
  const runner = input.runner ?? spawnCommand
  const timeoutMs = input.timeoutMs ?? 8000
  try {
    if (platform === "win32") return readWindows(environment, runner, timeoutMs, input.signal)
    if (platform === "darwin") return readMacos(runner, timeoutMs, input.signal)
    if (platform === "linux")
      return readLinux(
        environment,
        runner,
        timeoutMs,
        input.readText ?? ((path) => readFile(path, "utf8")),
        input.signal,
      )
    return { ok: true, snapshot: {} }
  } catch {
    return { ok: false, code: "read-failed" }
  }
}

async function readWindows(
  environment: NodeJS.ProcessEnv,
  runner: CommandRunner,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ReadOutcome> {
  const root = environment.SystemRoot ?? environment.SYSTEMROOT
  if (!root) return { ok: false, code: "read-failed" }
  const result = await runner(
    join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    windowsPowerShellArguments(windowsScript()),
    {
      timeoutMs,
      maxBytes: OUTPUT_LIMIT,
      signal,
      env: {
        SystemRoot: root,
        TEMP: environment.TEMP,
        TMP: environment.TMP,
        USERPROFILE: environment.USERPROFILE,
      },
    },
  )
  if (result.timedOut) return { ok: false, code: "timeout" }
  if (result.error || result.code !== 0) return { ok: false, code: "read-failed" }
  try {
    return { ok: true, snapshot: { windows: JSON.parse(result.stdout) } }
  } catch {
    return { ok: false, code: "read-failed" }
  }
}

async function readMacos(runner: CommandRunner, timeoutMs: number, signal?: AbortSignal): Promise<ReadOutcome> {
  const result = await runner("/usr/sbin/scutil", ["--proxy"], {
    timeoutMs,
    maxBytes: OUTPUT_LIMIT,
    signal,
    env: { LC_ALL: "C" },
  })
  if (result.timedOut) return { ok: false, code: "timeout" }
  if (result.error || result.code !== 0) return { ok: false, code: "read-failed" }
  return { ok: true, snapshot: { macos: result.stdout } }
}

async function readLinux(
  environment: NodeJS.ProcessEnv,
  runner: CommandRunner,
  timeoutMs: number,
  readText: (path: string) => Promise<string>,
  signal?: AbortSignal,
): Promise<ReadOutcome> {
  const desktop = desktopKind(environment)
  if (desktop === "kde") return readKde(environment, readText)
  const gnome = await readGnome(environment, runner, timeoutMs, signal)
  if (gnome.ok === false && desktop === "unknown" && gnome.code === "read-failed") {
    const kde = await readKde(environment, readText)
    if (kde.ok && kde.snapshot.kde) return kde
  }
  if (desktop === "unknown" && gnome.ok === false && gnome.code === "read-failed") return { ok: true, snapshot: {} }
  return gnome
}

async function readGnome(
  environment: NodeJS.ProcessEnv,
  runner: CommandRunner,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ReadOutcome> {
  const result = await runner("gsettings", ["list-recursively", "org.gnome.system.proxy"], {
    timeoutMs,
    maxBytes: OUTPUT_LIMIT,
    signal,
    env: environment,
  })
  if (result.timedOut) return { ok: false, code: "timeout" }
  if (result.error || result.code !== 0) return { ok: false, code: "read-failed" }
  return { ok: true, snapshot: { gnome: result.stdout } }
}

async function readKde(
  environment: NodeJS.ProcessEnv,
  readText: (path: string) => Promise<string>,
): Promise<ReadOutcome> {
  const home = environment.HOME || hostname()
  const root = environment.XDG_CONFIG_HOME || join(home, ".config")
  try {
    const kde = await readText(join(root, "kioslaverc"))
    return { ok: true, snapshot: { kde } }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined
    if (code === "ENOENT") return { ok: true, snapshot: {} }
    return { ok: false, code: "read-failed" }
  }
}

function desktopKind(environment: NodeJS.ProcessEnv) {
  const names = (environment.XDG_CURRENT_DESKTOP ?? "")
    .split(":")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  if (names.some((name) => name.includes("kde"))) return "kde"
  if (names.some((name) => name === "ubuntu" || name.includes("gnome") || name === "cinnamon" || name === "mate" || name === "unity"))
    return "gnome"
  return "unknown"
}

function windowsScript() {
  return `
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
}
