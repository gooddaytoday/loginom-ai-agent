import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { Product } from "@loginom-ai-agent/product"
import { profilePaths } from "@loginom-ai-agent/product/cli-profile"

export async function acquireProfile(
  root: string,
  channel: keyof typeof Product.channels,
  options: WriterOptions = {},
) {
  if (!path.isAbsolute(root)) throw new Error("PROFILE_ROOT_INVALID")
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  const canonical = await fs.realpath(root)
  if (
    Object.values(Product.channels).some((name) => path.basename(canonical) === name) ||
    [Product.slug, `${Product.slug}-dev`, `${Product.slug}-beta`].includes(path.basename(canonical))
  ) {
    throw new Error("PROFILE_DESKTOP_ROOT")
  }
  if (process.platform === "win32") {
    const { protectWindowsProfile } = await import("./profile-windows")
    await protectWindowsProfile(canonical)
  }
  if (process.platform !== "win32") {
    const info = await fs.stat(canonical)
    if ((process.getuid && info.uid !== process.getuid()) || (info.mode & 0o077) !== 0)
      throw new Error("PROFILE_PERMISSIONS_INVALID")
  }
  const lock = path.join(canonical, ".writer")
  const owner = await admitWriter(canonical, lock, options)
  const release = async () => {
    if ((await fs.readFile(path.join(lock, "owner"), "utf8")) !== owner) throw new Error("PROFILE_OWNER_CHANGED")
    await fs.unlink(path.join(lock, "owner"))
    await removeGuard(lock, options.notice ?? terminalNotice)
  }
  try {
    const marker = path.join(canonical, "cli-profile.json")
    const entries = await fs.readdir(canonical)
    if (!entries.includes("cli-profile.json")) {
      if (entries.some((name) => name !== ".writer")) throw new Error("PROFILE_FORMAT_INVALID")
      await fs.writeFile(marker, JSON.stringify({ format: "loginom-cli", version: 1, channel }), {
        flag: "wx",
        mode: 0o600,
      })
    }
    if ((await fs.lstat(marker)).isSymbolicLink()) throw new Error("PROFILE_FORMAT_INVALID")
    const value: unknown = JSON.parse(await fs.readFile(marker, "utf8"))
    if (
      typeof value !== "object" ||
      value === null ||
      !("format" in value) ||
      value.format !== "loginom-cli" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("channel" in value) ||
      value.channel !== channel
    ) {
      throw new Error("PROFILE_FORMAT_INVALID")
    }
    const paths = profilePaths(canonical)
    for (const directory of [paths.config, paths.data, paths.state, paths.cache, paths.tmp, paths.loginom]) {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 })
      const info = await fs.lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink() || (await fs.realpath(directory)) !== directory) {
        throw new Error("PROFILE_PATH_INVALID")
      }
      if (
        process.platform !== "win32" &&
        ((process.getuid && info.uid !== process.getuid()) || (info.mode & 0o077) !== 0)
      )
        throw new Error("PROFILE_PERMISSIONS_INVALID")
    }
    return { paths, release }
  } catch (error) {
    await release()
    throw error
  }
}

export function profileEnvironment(paths: ReturnType<typeof profilePaths>, env: NodeJS.ProcessEnv) {
  const result = { ...env }
  // Inherited Desktop/sidecar settings must not redirect CLI writes or supply its auth.
  delete result.LOGINOM_AI_AGENT_AUTH_CONTENT
  delete result.LOGINOM_AI_AGENT_CONFIG
  delete result.LOGINOM_AI_AGENT_CONFIG_CONTENT
  return {
    ...result,
    LOGINOM_AI_AGENT_CLI_ROOT: paths.root,
    LOGINOM_AI_AGENT_CONFIG_DIR: paths.config,
    LOGINOM_AI_AGENT_DB: path.join(paths.data, Product.database),
    TMPDIR: paths.tmp,
    TMP: paths.tmp,
    TEMP: paths.tmp,
  }
}

// Writer guard (design §6.3). `.writer/owner` names the owning CLI process. A
// guard is taken over only when that exact process is provably gone on this
// machine (platform, machine id, host name, pid namespace, then pid plus start
// time, so a reused pid is not mistaken for the owner) AND the offline cleanup
// of its run is confirmed: after SIGKILL the forked host, runtime and Chromium
// still run their own shutdown. The new start waits for them, then (on Linux
// only) stops the ones it recognises (SIGTERM, then SIGKILL) and takes over
// only when no process of that run uses the profile any more. Anything that cannot be
// proven (older owner format, another machine or namespace, probe failure,
// unrecognised process) stays PROFILE_BUSY.
export type WriterOwner = {
  format: "loginom-cli-writer"
  version: 1
  nonce: string
  pid: number
  /** Epoch ms, measured by the owner itself; not earlier than its OS creation time. */
  start: number
  host: string
  platform: string
  machine?: string
  linux?: { boot: string; namespace: string; ticks: string }
}
export type WriterSurvivor = {
  pid: number
  command: string
  /** A host, runtime or Chromium of this profile, which offline cleanup may stop. */
  recognised: boolean
  /** Start identity of the pid, re-checked right before it is signalled. */
  identity?: string
}
export type WriterProbe = {
  self(): Promise<Omit<WriterOwner, "format" | "version" | "nonce">>
  owner(owner: WriterOwner): Promise<"alive" | "dead" | "unknown">
  survivors(root: string, owner: WriterOwner): Promise<WriterSurvivor[]>
  /** Signals the survivor only if its pid still has the same identity. */
  signal(survivor: WriterSurvivor, signal: "SIGTERM" | "SIGKILL"): Promise<boolean>
}
export type WriterOptions = {
  probe?: Partial<WriterProbe>
  /** Offline cleanup, ms: wait for a graceful exit, then after SIGTERM, then after SIGKILL. */
  timing?: { grace?: number; terminate?: number; confirm?: number }
  notice?: (text: string) => void
}

// The runtime's own close budget (loginom-host supervisor.ts) is 15 s.
const GRACE_MS = 15_000
const TERMINATE_MS = 15_000
const CONFIRM_MS = 5_000
// The owner records its start after the OS created it. A process created
// later than this margin is another process that reuses the pid.
const START_MARGIN_MS = 5_000

async function admitWriter(root: string, lock: string, options: WriterOptions) {
  const probe = { ...systemWriterProbe, ...options.probe }
  const notice = options.notice ?? terminalNotice
  const ownerPath = path.join(lock, "owner")
  const nonce = randomUUID()
  const owner = JSON.stringify({ format: "loginom-cli-writer", version: 1, nonce, ...(await probe.self()) })
  const started = Date.now()
  const grace = options.timing?.grace ?? GRACE_MS
  const terminate = grace + (options.timing?.terminate ?? TERMINATE_MS)
  const deadline = started + terminate + (options.timing?.confirm ?? CONFIRM_MS)
  const signalled = new Map<number, string>()
  const manual = `If no ${Product.cliExecutable} process uses this profile any more, remove ${lock} and retry.`
  let announced = false
  for (;;) {
    const created = await fs.mkdir(lock, { mode: 0o700 }).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") return false
        throw error
      },
    )
    if (created) {
      await fs.writeFile(ownerPath, owner, { flag: "wx", mode: 0o600 })
      return owner
    }
    const observed = await readOwner(ownerPath)
    let pending: string
    if (observed === undefined)
      pending = `Profile ${root} is locked by ${lock}, which has no owner file (another start may be creating it). ${manual}`
    else {
      const previous = parseOwner(observed)
      if (!previous)
        busy(
          notice,
          `Profile ${root} is locked by ${lock}, whose owner cannot be verified (an older CLI or a damaged guard). ${manual}`,
        )
      const state = await probe.owner(previous).catch(() => "unknown" as const)
      if (state !== "dead") busy(notice, describeOwner(root, lock, previous, state))
      const survivors = await probe
        .survivors(root, previous)
        .catch(() =>
          busy(
            notice,
            `Process ${previous.pid} that used profile ${root} has exited, but its remaining processes cannot be listed. ${manual}`,
          ),
        )
      if (!survivors.length) {
        const outcome = await replaceOwner(lock, observed, owner, nonce)
        if (outcome === "taken") return owner
        pending =
          outcome === "claimed"
            ? `Profile ${root} is being taken over by another start (${path.join(lock, "takeover")} exists). ` +
              `If that start has exited and no ${Product.cliExecutable} process uses this profile, remove ${lock} and retry.`
            : `${lock} changed while it was being taken over. ${manual}`
        if (outcome === "changed" && Date.now() < deadline) continue
      } else {
        const unrecognised = survivors.filter((entry) => !entry.recognised)
        const list = (items: WriterSurvivor[]) =>
          items.map((entry) => `${entry.pid} (${entry.command.slice(0, 120)})`).join(", ")
        pending = unrecognised.length
          ? `Process ${previous.pid} that used profile ${root} has exited, but other processes still use the profile: ` +
            `${list(unrecognised)}. Stop them or leave the profile directory, then retry.`
          : `Process ${previous.pid} that used profile ${root} has exited, and the cleanup of its run is not confirmed: ` +
            `${list(survivors)} did not exit after SIGTERM and SIGKILL. Stop them, then retry.`
        if (!announced)
          notice(
            `Profile ${root}: process ${previous.pid} has exited; waiting up to ${Math.ceil((deadline - started) / 1000)} s ` +
              `for its run to finish: ${list(survivors)}`,
          )
        announced = true
        const elapsed = Date.now() - started
        // Stop only a run made entirely of recognised processes; anything else is the user's.
        if (!unrecognised.length && elapsed >= grace) {
          const signal = elapsed >= terminate ? "SIGKILL" : "SIGTERM"
          for (const survivor of survivors) {
            if (signalled.get(survivor.pid) === signal) continue
            // The guard must still belong to the dead owner judged above.
            if ((await readOwner(ownerPath)) !== observed) break
            await probe.signal(survivor, signal).catch(() => false)
            signalled.set(survivor.pid, signal)
          }
        }
      }
    }
    if (Date.now() >= deadline) busy(notice, pending)
    await new Promise((resolve) => setTimeout(resolve, Math.min(200, Math.max(0, deadline - Date.now()))))
  }
}

// Compare-and-swap of the owner: the exclusive claim file serialises
// contenders, and the owner is replaced only if it still holds the bytes
// that were judged stale. A claim left by a crashed contender stays busy.
async function replaceOwner(lock: string, observed: string, owner: string, nonce: string) {
  const claim = path.join(lock, "takeover")
  const refused = await fs.writeFile(claim, owner, { flag: "wx", mode: 0o600 }).then(
    () => undefined,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") return "claimed" as const
      if (error.code === "ENOENT") return "changed" as const
      throw error
    },
  )
  if (refused) return refused
  const temporary = path.join(lock, `owner-${nonce}`)
  try {
    if ((await readOwner(path.join(lock, "owner"))) !== observed) return "changed" as const
    await fs.writeFile(temporary, owner, { flag: "wx", mode: 0o600 })
    await fs.rename(temporary, path.join(lock, "owner"))
    return "taken" as const
  } finally {
    await fs.rm(temporary, { force: true })
    await fs.unlink(claim)
  }
}

// A contender may hold a claim for a moment while it observes a changed owner.
async function removeGuard(lock: string, notice: (text: string) => void) {
  for (let attempt = 0; ; attempt++) {
    const removed = await fs.rmdir(lock).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOTEMPTY") throw error
        return false
      },
    )
    if (removed) return
    if (attempt >= 40) {
      const entries = await fs.readdir(lock).catch(() => [])
      notice(
        `${lock} could not be removed: it still contains ${entries.join(", ")}, left by a start that was taking the ` +
          `profile over. If no ${Product.cliExecutable} process uses this profile, remove ${lock}.`,
      )
      throw new Error("PROFILE_RELEASE_INCOMPLETE")
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

async function readOwner(file: string) {
  const info = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!info) return undefined
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("PROFILE_BUSY")
  return fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
}

export function parseOwner(text: string): WriterOwner | undefined {
  const value: unknown = (() => {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  })()
  if (typeof value !== "object" || value === null) return undefined
  const owner = value as Partial<WriterOwner>
  if (
    owner.format !== "loginom-cli-writer" ||
    owner.version !== 1 ||
    typeof owner.nonce !== "string" ||
    !Number.isSafeInteger(owner.pid) ||
    (owner.pid ?? 0) <= 0 ||
    !Number.isFinite(owner.start) ||
    typeof owner.host !== "string" ||
    typeof owner.platform !== "string" ||
    (owner.machine !== undefined && typeof owner.machine !== "string")
  )
    return undefined
  const linux = owner.linux
  if (
    linux !== undefined &&
    (typeof linux !== "object" ||
      linux === null ||
      typeof linux.boot !== "string" ||
      typeof linux.namespace !== "string" ||
      typeof linux.ticks !== "string")
  )
    return undefined
  return owner as WriterOwner
}

function describeOwner(root: string, lock: string, owner: WriterOwner, state: "alive" | "unknown") {
  const holder = `process ${owner.pid} on ${owner.host}, started ${new Date(owner.start).toISOString()}`
  if (state === "alive")
    return (
      `Profile ${root} is in use by ${holder}. Wait for it to finish or stop it, ` +
      `or use another profile (LOGINOM_AI_AGENT_CLI_PROFILE).`
    )
  return (
    `Profile ${root} is locked by ${holder}, which cannot be checked from here (another machine, ` +
    `platform or pid namespace). If that process and its children have exited, remove ${lock} and retry.`
  )
}

function busy(notice: (text: string) => void, text: string): never {
  notice(text)
  throw new Error("PROFILE_BUSY")
}

// Machine consumers match stderr "PROFILE_BUSY" exactly; explain only to a person.
function terminalNotice(text: string) {
  if (process.stderr.isTTY) process.stderr.write(`${text}\n`)
}

function inside(root: string, value: string) {
  return value === root || value.startsWith(root + path.sep)
}

const RUNTIME_ENTRIES = ["node-host.mjs", "managed-entry.mjs", "knowledge-entry.mjs", "browser-warmup-entry.mjs"]

async function linuxStat(pid: number | "self") {
  const text = await fs.readFile(`/proc/${pid}/stat`, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT" || error.code === "ESRCH") return undefined
    throw error
  })
  if (text === undefined) return undefined
  const fields = text.slice(text.lastIndexOf(")") + 2).split(" ")
  const ticks = fields[19]
  if (!fields[0] || !fields[1] || !ticks || !/^\d+$/.test(ticks)) throw new Error("PROFILE_OWNER_UNREADABLE")
  return { state: fields[0], parent: Number(fields[1]), ticks }
}

async function linuxSystem() {
  return {
    boot: (await fs.readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim(),
    namespace: await fs.readlink("/proc/self/ns/pid"),
  }
}

function run(file: string, args: string[], options: { env?: NodeJS.ProcessEnv; timeout?: number } = {}) {
  return new Promise<{ code: number; stdout: string }>((resolve, reject) => {
    execFile(
      file,
      args,
      { env: options.env, timeout: options.timeout ?? 10_000, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error && typeof error.code !== "number") return reject(error)
        resolve({ code: typeof error?.code === "number" ? error.code : 0, stdout })
      },
    )
  })
}

function systemRoot() {
  const value = process.env.SystemRoot ?? process.env.SYSTEMROOT
  if (!value || !path.win32.isAbsolute(value)) throw new Error("PROFILE_OWNER_UNREADABLE")
  return value
}

let machine: Promise<string | undefined> | undefined
// A stable identity of this OS installation; without it no owner is judged.
function machineId() {
  machine ??= (async () => {
    if (process.platform === "linux") {
      for (const file of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
        const value = (await fs.readFile(file, "utf8").catch(() => "")).trim()
        if (value) return value
      }
      return undefined
    }
    if (process.platform === "win32") {
      const result = await run(
        path.win32.join(systemRoot(), "System32/reg.exe"),
        ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
        { env: { SystemRoot: systemRoot() } },
      )
      return result.code === 0 ? /MachineGuid\s+REG_SZ\s+(\S+)/.exec(result.stdout)?.[1] : undefined
    }
    if (process.platform === "darwin") {
      const result = await run("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], {
        env: { LC_ALL: "C", PATH: "/usr/bin:/bin" },
      })
      return result.code === 0 ? /"IOPlatformUUID" = "([^"]+)"/.exec(result.stdout)?.[1] : undefined
    }
    return undefined
  })().catch(() => undefined)
  return machine
}

async function windowsProcesses() {
  const { windowsPowerShellArguments, WINDOWS_POWERSHELL_TIMEOUT_MS } = await import(
    "@loginom-ai-agent/loginom-host/windows-powershell"
  )
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $items = @(Get-CimInstance Win32_Process | ForEach-Object {
    $created = 0
    if ($_.CreationDate) { $created = ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() }
    [pscustomobject]@{ p = [long]$_.ProcessId; pp = [long]$_.ParentProcessId; c = $created; l = [string]$_.CommandLine }
  })
  [Console]::Out.Write((ConvertTo-Json -InputObject $items -Compress -Depth 2))
} catch { exit 1 }
`
  const result = await run(
    path.win32.join(systemRoot(), "System32/WindowsPowerShell/v1.0/powershell.exe"),
    windowsPowerShellArguments(script),
    { env: { SystemRoot: systemRoot() }, timeout: WINDOWS_POWERSHELL_TIMEOUT_MS },
  )
  if (result.code !== 0) throw new Error("PROFILE_OWNER_UNREADABLE")
  const value: unknown = JSON.parse(result.stdout)
  if (!Array.isArray(value)) throw new Error("PROFILE_OWNER_UNREADABLE")
  return value.map((entry: { p: number; pp: number; c: number; l: string | null }) => ({
    pid: Number(entry.p),
    parent: Number(entry.pp),
    created: Number(entry.c),
    command: String(entry.l ?? ""),
  }))
}

async function linuxAncestors() {
  const result = new Set<number>([process.pid])
  for (let pid = process.ppid; pid > 1 && !result.has(pid); ) {
    result.add(pid)
    pid = (await linuxStat(pid).catch(() => undefined))?.parent ?? 0
  }
  return result
}

async function linuxSurvivors(root: string) {
  const uid = process.getuid?.()
  const ancestors = await linuxAncestors()
  const readable = <T>(operation: Promise<T>) =>
    operation.catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EACCES" || error.code === "EPERM") return undefined
      throw error
    })
  const entries = await Promise.all(
    (await fs.readdir("/proc"))
      .filter((name) => /^\d+$/.test(name) && Number(name) > 1 && !ancestors.has(Number(name)))
      .map(async (name): Promise<WriterSurvivor | undefined> => {
        try {
          if ((await fs.stat(`/proc/${name}`)).uid !== uid) return undefined
          const stat = await linuxStat(Number(name))
          if (!stat || stat.state === "Z" || stat.state === "X") return undefined
          const args = ((await readable(fs.readFile(`/proc/${name}/cmdline`, "utf8"))) ?? "").split("\0")
          const cwd = await readable(fs.readlink(`/proc/${name}/cwd`))
          // The host and runtime carry the profile only through TMPDIR (a
          // symlink alias on Linux) and cwd; Chromium through its argv.
          const environment = ((await readable(fs.readFile(`/proc/${name}/environ`, "utf8"))) ?? "")
            .split("\0")
            .filter((entry) => /^(LOGINOM_AI_AGENT_CLI_ROOT|TMPDIR|TMP|TEMP)=\//.test(entry))
            .map((entry) => entry.slice(entry.indexOf("=") + 1))
          const resolved = await Promise.all(environment.map((value) => fs.realpath(value).catch(() => value)))
          const temporary = resolved.some((value) => inside(root, value))
          const directory = cwd !== undefined && inside(root, cwd)
          const named = args.some(
            (arg) => inside(root, arg) || arg.includes(root + path.sep) || arg.endsWith(`=${root}`),
          )
          if (!temporary && !directory && !named) return undefined
          const entry = args.slice(1).some((arg) => RUNTIME_ENTRIES.includes(path.basename(arg)))
          const browser = args.some(
            (arg) => arg.startsWith("--user-data-dir=") && inside(path.join(root, "loginom"), arg.slice(16)),
          )
          return {
            pid: Number(name),
            command: args.filter(Boolean).join(" "),
            recognised: (entry && temporary) || browser,
            identity: stat.ticks,
          }
        } catch (error) {
          if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) return undefined
          throw error
        }
      }),
  )
  return entries.filter((entry) => entry !== undefined)
}

export type WindowsProcess = { pid: number; parent: number; created: number; command: string }

// Windows keeps ParentProcessId of orphans, so the dead owner's process tree
// is still discoverable; Chromium also names the profile in argv. The runtime
// names neither the profile nor its owner, so any orphaned host, runtime,
// help or warm-up process counts too (a false busy is safe). Nothing is
// stopped on Windows: survivors are only reported and keep the profile busy.
export function windowsSurvivors(
  all: WindowsProcess[],
  root: string,
  owner: Pick<WriterOwner, "pid" | "start">,
  self = { pid: process.pid, parent: process.ppid },
): WriterSurvivor[] {
  const processes = all.filter((entry) => entry.pid !== self.pid && entry.pid !== self.parent)
  const lower = root.toLowerCase()
  const found = new Map<number, WindowsProcess>()
  for (const entry of processes) {
    const command = entry.command.toLowerCase()
    // Inside the profile only: a sibling such as `<root>-2` must not match.
    if (command.includes(lower + "\\") || command.includes(lower + "/")) found.set(entry.pid, entry)
    if (!RUNTIME_ENTRIES.some((name) => command.includes(name))) continue
    const parent = all.find((item) => item.pid === entry.parent)
    if (!parent || parent.created > entry.created) found.set(entry.pid, entry)
  }
  // A process that reuses the owner's pid has its own children; only
  // children created before it can be orphans of the owner.
  const reuser = all.find((entry) => entry.pid === owner.pid)
  const queue = [owner.pid]
  const visited = new Set(queue)
  for (let parent = queue.shift(); parent !== undefined; parent = queue.shift())
    for (const entry of processes)
      if (
        entry.parent === parent &&
        entry.created >= owner.start - START_MARGIN_MS &&
        (parent !== owner.pid || !reuser || entry.created < reuser.created) &&
        !visited.has(entry.pid)
      ) {
        visited.add(entry.pid)
        found.set(entry.pid, entry)
        queue.push(entry.pid)
      }
  return [...found.values()].map((entry) => ({ pid: entry.pid, command: entry.command, recognised: false }))
}

export const systemWriterProbe: WriterProbe = {
  async self() {
    const identity = {
      pid: process.pid,
      start: Math.floor(Date.now() - process.uptime() * 1000),
      host: os.hostname(),
      platform: process.platform,
      machine: await machineId(),
    }
    if (process.platform !== "linux") return identity
    const [system, stat] = await Promise.all([linuxSystem(), linuxStat("self")]).catch(() => [undefined, undefined])
    if (!system || !stat) return identity
    return { ...identity, linux: { ...system, ticks: stat.ticks } }
  },
  async owner(owner) {
    // Another platform, installation or host cannot be judged from here.
    if (owner.platform !== process.platform || owner.host !== os.hostname()) return "unknown"
    const mine = await machineId()
    if (!owner.machine || !mine || owner.machine !== mine) return "unknown"
    if (process.platform === "linux") {
      if (!owner.linux) return "unknown"
      const system = await linuxSystem()
      if (owner.linux.namespace !== system.namespace) return "unknown"
      // Same installation and namespace after a reboot: every process of that boot is gone.
      if (owner.linux.boot !== system.boot) return "dead"
      const stat = await linuxStat(owner.pid)
      if (!stat || stat.state === "Z" || stat.state === "X" || stat.ticks !== owner.linux.ticks) return "dead"
      return "alive"
    }
    if (process.platform === "win32") {
      const entry = (await windowsProcesses()).find((item) => item.pid === owner.pid)
      if (!entry) return "dead"
      return entry.created > owner.start + START_MARGIN_MS ? "dead" : "alive"
    }
    if (process.platform !== "darwin") return "unknown"
    try {
      process.kill(owner.pid, 0)
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ESRCH" ? "dead" : "unknown"
    }
    const result = await run("/bin/ps", ["-o", "lstart=", "-p", String(owner.pid)], {
      env: { LC_ALL: "C", PATH: "/usr/bin:/bin", ...(process.env.TZ ? { TZ: process.env.TZ } : {}) },
    })
    const created = Date.parse(result.stdout.trim())
    if (result.code !== 0 || !Number.isFinite(created)) return "unknown"
    return created > owner.start + START_MARGIN_MS ? "dead" : "alive"
  },
  async survivors(root, owner) {
    if (process.platform === "linux") return linuxSurvivors(root)
    if (process.platform === "win32") return windowsSurvivors(await windowsProcesses(), root, owner)
    // macOS: no environment or cwd of other processes, and the host names no
    // profile, so an orphaned host or runtime cannot be attributed: it is
    // reported, never stopped.
    const result = await run("/bin/ps", ["-axww", "-o", "pid=,ppid=,command="], {
      env: { LC_ALL: "C", PATH: "/usr/bin:/bin" },
    })
    if (result.code !== 0) throw new Error("PROFILE_OWNER_UNREADABLE")
    return result.stdout
      .split("\n")
      .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ pid: Number(match[1]), parent: Number(match[2]), command: match[3] ?? "" }))
      .filter(
        (entry) =>
          entry.pid !== process.pid &&
          entry.pid !== process.ppid &&
          (entry.command.includes(root + path.sep) ||
            (entry.parent === 1 && RUNTIME_ENTRIES.some((name) => entry.command.includes(`/${name}`)))),
      )
      .map((entry) => ({ pid: entry.pid, command: entry.command, recognised: false }))
  },
  async signal(survivor, signal) {
    // Only Linux can tie a survivor to this profile and re-check its start ticks.
    if (process.platform !== "linux" || !survivor.recognised || survivor.identity === undefined) return false
    const stat = await linuxStat(survivor.pid)
    if (!stat || stat.ticks !== survivor.identity) return false
    try {
      process.kill(survivor.pid, signal)
      return true
    } catch {
      return false
    }
  },
}
