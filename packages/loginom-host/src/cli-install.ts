import { execFile } from "node:child_process"
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { isAbsolute, join, relative, sep } from "node:path"
import { verifyCliManifest } from "./cli-manifest"

// Unix user install. Profiles live elsewhere and are never inspected or removed.
export async function installCli(artifact: string, home: string) {
  if (process.platform !== "linux" && process.platform !== "darwin") throw new Error("CLI_INSTALL_PLATFORM_UNAVAILABLE")
  if (!isAbsolute(artifact) || !isAbsolute(home)) throw new Error("CLI_INSTALL_PATH_INVALID")
  const info = await verifyCliManifest(artifact, { platform: process.platform, arch: process.arch })
  const name = `${info.version}-${info.channel}`
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw new Error("CLI_INSTALL_VERSION_INVALID")
  const base = join(home, ".local/share/loginom-ai-agent-cli")
  const launcher = join(home, ".local/bin/loginom-ai-agent-cli")
  await installDirectories(home, true)
  const lock = join(base, ".install-lock")
  await mkdir(lock).catch(() => {
    throw new Error("CLI_INSTALL_BUSY")
  })
  try {
    await absent(launcher)
    await absent(join(base, "current.json"))
    const destination = join(base, name)
    await absent(destination)
    const staging = await mkdtemp(join(base, ".staging-"))
    try {
      await cp(artifact, staging, { recursive: true, dereference: false, verbatimSymlinks: true })
      await verifyCliManifest(staging, { platform: process.platform, arch: process.arch, version: info.version })
      await rename(staging, destination)
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
    try {
      await installDirectories(home, false)
      // Never replace an existing launcher, including a foreign or dangling symlink.
      await symlink(join(destination, "bin/loginom-ai-agent-cli"), launcher)
      await writeFile(join(base, "current.json"), JSON.stringify({ format: "loginom-cli-install-v1", name }) + "\n", {
        flag: "wx",
        mode: 0o600,
      })
    } catch (error) {
      if ((await readlink(launcher).catch(() => undefined)) === join(destination, "bin/loginom-ai-agent-cli"))
        await rm(launcher)
      await rm(destination, { recursive: true, force: true })
      throw error
    }
    return { destination, launcher }
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

export async function uninstallCli(home: string) {
  if (process.platform !== "linux" && process.platform !== "darwin") throw new Error("CLI_INSTALL_PLATFORM_UNAVAILABLE")
  if (!isAbsolute(home)) throw new Error("CLI_INSTALL_PATH_INVALID")
  const base = join(home, ".local/share/loginom-ai-agent-cli")
  const launcher = join(home, ".local/bin/loginom-ai-agent-cli")
  await installDirectories(home, false)
  const lock = join(base, ".install-lock")
  await mkdir(lock).catch(() => {
    throw new Error("CLI_INSTALL_BUSY")
  })
  try {
    if (!(await lstat(join(base, "current.json"))).isFile()) throw new Error("CLI_INSTALL_RECEIPT_INVALID")
    const receipt: unknown = JSON.parse(await readFile(join(base, "current.json"), "utf8"))
    if (
      !receipt ||
      typeof receipt !== "object" ||
      !("format" in receipt) ||
      receipt.format !== "loginom-cli-install-v1" ||
      !("name" in receipt) ||
      typeof receipt.name !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(receipt.name) ||
      receipt.name === "." ||
      receipt.name === ".."
    )
      throw new Error("CLI_INSTALL_RECEIPT_INVALID")
    const destination = join(base, receipt.name)
    if ((await readlink(launcher)) !== join(destination, "bin/loginom-ai-agent-cli"))
      throw new Error("CLI_INSTALL_LAUNCHER_CONFLICT")
    if ((await lstat(destination)).isSymbolicLink()) throw new Error("CLI_INSTALL_PATH_INVALID")
    await verifyCliManifest(destination, { platform: process.platform, arch: process.arch })
    const canonical = await realpath(destination)
    if (process.platform === "darwin") await requireMacStopped(canonical)
    if (process.platform === "linux") {
      for (const pid of (await readdir("/proc")).filter(
        (value) => /^\d+$/.test(value) && value !== String(process.pid),
      )) {
        const executable = await readlink(`/proc/${pid}/exe`).catch(() => undefined)
        if (!executable) continue
        const path = relative(canonical, executable.replace(/ \(deleted\)$/, ""))
        if (path && !path.startsWith(".." + sep) && !isAbsolute(path)) throw new Error("CLI_INSTALL_BUSY")
      }
    }
    await rm(launcher)
    await rm(destination, { recursive: true })
    await rm(join(base, "current.json"))
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

async function absent(path: string) {
  await lstat(path).then(
    () => {
      throw new Error("CLI_INSTALL_PATH_EXISTS")
    },
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
    },
  )
}

// Check each component before using recursive copy/removal. This rejects existing
// redirects; it is not a defence against a concurrent writer replacing ancestors.
async function installDirectories(home: string, create: boolean) {
  for (const path of [
    home,
    join(home, ".local"),
    join(home, ".local/share"),
    join(home, ".local/share/loginom-ai-agent-cli"),
    join(home, ".local/bin"),
  ]) {
    if (create)
      await mkdir(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error
      })
    if (!(await lstat(path)).isDirectory()) throw new Error("CLI_INSTALL_PATH_INVALID")
  }
}

// Inspect open files/mappings in the verified payload using the OS tool. A
// missing tool, timeout or diagnostic is not evidence that the payload is idle.
async function requireMacStopped(directory: string) {
  await new Promise<void>((resolve, reject) => {
    execFile(
      "/usr/sbin/lsof",
      ["-nP", "-F", "p", "+D", directory],
      { env: {}, timeout: 30000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (/^p[0-9]+$/m.test(stdout)) return reject(Error("CLI_INSTALL_BUSY"))
        if (stdout || stderr || error?.code !== 1) return reject(Error("CLI_INSTALL_PROCESS_CHECK_FAILED"))
        resolve()
      },
    )
  })
}
