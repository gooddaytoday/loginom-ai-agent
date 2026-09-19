import { execFile } from "node:child_process"
import { windowsPowerShellArguments } from "./windows-powershell"
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { verifyCliManifest } from "./cli-manifest"

// User-only Windows install. PATH is configured explicitly by the user; neither
// registry PATH nor profiles are modified by this installer.
export async function installWindowsCli(artifact: string, localAppData: string) {
  if (process.platform !== "win32") throw Error("CLI_INSTALL_PLATFORM_UNAVAILABLE")
  if (!isAbsolute(artifact) || !localAppData || !isAbsolute(localAppData)) throw Error("CLI_INSTALL_PATH_INVALID")
  const info = await verifyCliManifest(artifact, { platform: "win32", arch: process.arch })
  const name = `${info.version}-${info.channel}`
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw Error("CLI_INSTALL_VERSION_INVALID")
  const paths = await directories(localAppData, true)
  await mkdir(paths.lock).catch(() => {
    throw Error("CLI_INSTALL_BUSY")
  })
  try {
    for (const path of [paths.launcher, paths.receipt, join(paths.base, name)]) await absent(path)
    const staging = await mkdtemp(join(paths.base, ".staging-"))
    const destination = join(paths.base, name)
    try {
      await cp(artifact, staging, { recursive: true, dereference: false, verbatimSymlinks: true })
      await verifyCliManifest(staging, { platform: "win32", arch: process.arch, version: info.version })
      await rename(staging, destination)
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
    const launcher = launcherText(name)
    try {
      await directories(localAppData, false)
      await writeFile(paths.launcher, launcher, { flag: "wx" })
      await writeFile(paths.receipt, JSON.stringify({ format: "loginom-cli-windows-install-v1", name }), { flag: "wx" })
    } catch (error) {
      if ((await readFile(paths.launcher, "utf8").catch(() => undefined)) === launcher) await rm(paths.launcher)
      await rm(destination, { recursive: true, force: true })
      throw error
    }
    return { destination, launcher: paths.launcher, addToUserPath: paths.bin }
  } finally {
    await rm(paths.lock, { recursive: true, force: true })
  }
}

export async function uninstallWindowsCli(localAppData: string) {
  const paths = await directories(localAppData, false)
  await mkdir(paths.lock).catch(() => {
    throw Error("CLI_INSTALL_BUSY")
  })
  try {
    if (!(await lstat(paths.receipt)).isFile()) throw Error("CLI_INSTALL_RECEIPT_INVALID")
    const receipt: unknown = JSON.parse(await readFile(paths.receipt, "utf8"))
    if (
      !receipt ||
      typeof receipt !== "object" ||
      !("format" in receipt) ||
      receipt.format !== "loginom-cli-windows-install-v1" ||
      !("name" in receipt) ||
      typeof receipt.name !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(receipt.name)
    )
      throw Error("CLI_INSTALL_RECEIPT_INVALID")
    const destination = join(paths.base, receipt.name)
    const destinationInfo = await lstat(destination)
    if (!destinationInfo.isDirectory() || destinationInfo.isSymbolicLink()) throw Error("CLI_INSTALL_PATH_INVALID")
    const launcherInfo = await lstat(paths.launcher)
    if (
      !launcherInfo.isFile() ||
      launcherInfo.isSymbolicLink() ||
      (await readFile(paths.launcher, "utf8")) !== launcherText(receipt.name)
    )
      throw Error("CLI_INSTALL_LAUNCHER_CONFLICT")
    await verifyCliManifest(destination, { platform: "win32", arch: process.arch })
    await requireStopped(await realpath(destination))
    // Delete payload first: locked executables must not remove the launcher/receipt.
    await rm(destination, { recursive: true }).catch((error: NodeJS.ErrnoException) => {
      if (["EACCES", "EBUSY", "EPERM"].includes(error.code ?? "")) throw Error("CLI_INSTALL_BUSY")
      throw error
    })
    await rm(paths.launcher)
    await rm(paths.receipt)
  } finally {
    await rm(paths.lock, { recursive: true, force: true })
  }
}

function launcherText(name: string) {
  return `@echo off\r\nsetlocal DisableDelayedExpansion\r\n"%~dp0..\\${name}\\bin\\loginom-ai-agent-cli.exe" %*\r\nexit /b %errorlevel%\r\n`
}

async function directories(localAppData: string, create: boolean) {
  if (process.platform !== "win32") throw Error("CLI_INSTALL_PLATFORM_UNAVAILABLE")
  if (!localAppData || !isAbsolute(localAppData)) throw Error("CLI_INSTALL_PATH_INVALID")
  const base = join(localAppData, "Programs/loginom-ai-agent-cli")
  const bin = join(base, "bin")
  for (const path of [localAppData, join(localAppData, "Programs"), base, bin]) {
    if (create)
      await mkdir(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error
      })
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error("CLI_INSTALL_PATH_INVALID")
  }
  return {
    base,
    bin,
    launcher: join(bin, "loginom-ai-agent-cli.cmd"),
    receipt: join(base, "current.json"),
    lock: join(base, ".install-lock"),
  }
}

async function absent(path: string) {
  await lstat(path).then(
    () => {
      throw Error("CLI_INSTALL_PATH_EXISTS")
    },
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
    },
  )
}

async function requireStopped(destination: string) {
  const root = process.env.SystemRoot ?? process.env.SYSTEMROOT
  if (!root || !isAbsolute(root)) throw Error("CLI_INSTALL_PROCESS_CHECK_FAILED")
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $root = [IO.Path]::GetFullPath([Console]::In.ReadToEnd().Trim()).TrimEnd('\\')
  if ($root.StartsWith('\\\\?\\')) { $root = $root.Substring(4) }
  foreach ($item in Get-Process) {
    if (-not $item.Path) { continue }
    $path = [IO.Path]::GetFullPath($item.Path).TrimEnd('\\')
    if ($path.StartsWith('\\\\?\\')) { $path = $path.Substring(4) }
    if ($path.Equals($root, [StringComparison]::OrdinalIgnoreCase) -or $path.StartsWith($root + '\\', [StringComparison]::OrdinalIgnoreCase)) { exit 2 }
  }
  [Console]::Out.Write('OK')
} catch { exit 1 }
`
  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      join(root, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      windowsPowerShellArguments(script),
      { env: { SystemRoot: root }, windowsHide: true, timeout: 15000, maxBuffer: 1024 },
      (error, stdout) => {
        if (error || stdout !== "OK")
          return reject(Error(error?.code === 2 ? "CLI_INSTALL_BUSY" : "CLI_INSTALL_PROCESS_CHECK_FAILED"))
        resolve()
      },
    )
    child.stdin?.on("error", () => reject(Error("CLI_INSTALL_PROCESS_CHECK_FAILED")))
    child.stdin?.end(destination)
  })
}
