import path from "node:path"
import { spawn } from "node:child_process"
import { lstat, open, readdir, readFile, readlink, realpath, stat, writeFile, rm } from "node:fs/promises"

export type ProcessIdentity = {
  pid: number; starttime: string; uid: number; parent: number; group: number; session: number
  executable: string; device: number; inode: number
}
type ProcessView = ProcessIdentity & { args: string[]; cwd: string; name: string }
export type WriterIdentity = { device: number; inode: number; owner: string }
export type ProcessCleanup = {
  status: "confirmed" | "failed" | "not_run"; error: string | null
  processes: ProcessIdentity[]; runtimeDirectories: string[]; writer: WriterIdentity | null
  capture_complete: boolean
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const gone = (error: unknown) => ["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")
const key = (process: ProcessIdentity) => `${process.pid}:${process.starttime}`
const inside = (file: string, root: string) => file === root || file.startsWith(root + path.sep)

export async function writerIdentity(profile: string): Promise<WriterIdentity | null> {
  try {
    const info = await lstat(path.join(profile, ".writer"))
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error("Writer is not a private directory")
    return { device: info.dev, inode: info.ino, owner: await readFile(path.join(profile, ".writer", "owner"), "utf8") }
  } catch (error) {
    if (gone(error)) return null
    throw error
  }
}

async function processView(pid: number, required = true, owners: ProcessIdentity[] = []): Promise<ProcessView | undefined> {
  let relevant = required
  try {
    const directory = `/proc/${pid}`
    const owner = await stat(directory)
    if (owner.uid !== process.getuid?.()) return undefined
    const raw = await readFile(path.join(directory, "stat"), "utf8")
    const fields = raw.slice(raw.lastIndexOf(")") + 2).split(" ")
    if (["Z", "X"].includes(fields[0] ?? "")) return undefined
    const name = raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")"))
    relevant ||= /^(?:loginom-ai-|chrome|chromium)/.test(name) || owners.some((owner) =>
      owner.pid === pid || owner.pid === Number(fields[1]) || owner.group === Number(fields[2]) && owner.session === Number(fields[3]))
    const args = (await readFile(path.join(directory, "cmdline"), "utf8")).split("\0").filter(Boolean)
    relevant ||= args.some((arg) => /(?:node-host\.mjs|standalone\.ts|loginom-ai-agent-cli)$/.test(arg))
    const executable = await readlink(path.join(directory, "exe"))
    const info = await stat(path.join(directory, "exe"))
    return { pid, uid: owner.uid, starttime: fields[19]!, parent: Number(fields[1]),
      group: Number(fields[2]), session: Number(fields[3]), executable, device: info.dev, inode: info.ino,
      name, args,
      cwd: await readlink(path.join(directory, "cwd")) }
  } catch (error) {
    if (gone(error)) return undefined
    if (!relevant && ["EACCES", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")) return undefined
    throw Error(`Cannot inspect process identity PID ${pid}`)
  }
}

async function snapshot(owners: ProcessIdentity[] = []) {
  return (await Promise.all((await readdir("/proc")).filter((name) => /^\d+$/.test(name))
    .map((pid) => processView(Number(pid), false, owners)))).filter((entry) => entry !== undefined)
}

function identity(view: ProcessView): ProcessIdentity {
  return { pid: view.pid, starttime: view.starttime, uid: view.uid, parent: view.parent,
    group: view.group, session: view.session, executable: view.executable, device: view.device, inode: view.inode }
}

async function runtimeDirectories(profile: string): Promise<string[]> {
  const walk = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
      if (gone(error)) return []
      throw error
    })
    return (await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map(async (entry) => {
      const file = path.join(directory, entry.name)
      if (path.basename(directory) === "attempts") return [file]
      if (entry.name === "browser-profile") return []
      return walk(file)
    }))).flat()
  }
  return walk(path.join(profile, "loginom", "runtime"))
}

async function browserIdentity(cmd: string[], env: Record<string, string>) {
  if (cmd.some((arg) => arg.endsWith("/fixtures/fake-cli.ts"))) return undefined
  const binary = await realpath(Bun.which(cmd[0]!) ?? cmd[0]!)
  const resources = env.LOGINOM_AI_AGENT_CLI_BUNDLE ?? path.join(path.dirname(path.dirname(binary)), "resources", "loginom")
  const manifest = await Bun.file(path.join(resources, "resource-manifest.json")).json() as { browser?: unknown }
  if (typeof manifest.browser !== "string" || path.isAbsolute(manifest.browser)) throw Error("Browser manifest identity unavailable")
  const executable = await realpath(path.join(resources, manifest.browser))
  if (!inside(executable, await realpath(resources))) throw Error("Browser executable escapes bundle")
  const info = await stat(executable)
  return { executable, device: info.dev, inode: info.ino, directory: path.dirname(executable) }
}

/** Own ancestry is captured before reparent/setsid; argv is never a kill authority.
 * Unknown native children block continuation rather than becoming guessed owners.
 */
export async function superviseProcess(input: {
  cmd: string[]; cwd: string; env: Record<string, string>; timeoutMs: number
  profileDir?: string; outDir?: string; stdin?: string; signal?: AbortSignal
}) {
  if (process.platform !== "linux") throw Error("Process ownership supervision requires Linux /proc")
  const startedAt = Date.now()
  const ledger = new Map<string, ProcessIdentity>()
  const cleanup: ProcessCleanup = { status: "not_run", error: null, processes: [], runtimeDirectories: [], writer: null, capture_complete: true }
  const profile = input.profileDir ? await realpath(input.profileDir) : undefined
  const baseline = await snapshot()
  const existing = new Set(baseline.map(key))
  const oldDirectories = new Set(profile ? await runtimeDirectories(profile) : [])
  const browser = profile ? await browserIdentity(input.cmd, input.env) : undefined
  if (input.signal?.aborted) return { stdout: "", stderr: "", exitCode: -1, timedOut: false, interrupted: true,
    startedAt, durationMs: 0, processCleanup: cleanup }
  const marker = input.profileDir ? `${input.profileDir}.process-group` : undefined
  const registration = marker ? await open(marker, "wx", 0o600).catch(() => {
    throw Error("Registration unavailable before dispatch")
  }) : undefined
  const files = input.outDir ? await Promise.all(["events.jsonl", "stderr.txt"]
    .map((name) => open(path.join(input.outDir!, name), "w", 0o600))) : []
  let writing = Promise.resolve()
  const proc = spawn(input.cmd[0]!, input.cmd.slice(1), { cwd: input.cwd, env: input.env,
    detached: true, stdio: [input.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"] })
  const exited = new Promise<void>((resolve) => {
    proc.once("exit", () => resolve())
    proc.once("error", (error) => { cleanup.error = `Spawn failed: ${message(error)}`; resolve() })
  })
  if (input.stdin !== undefined) proc.stdin!.end(input.stdin)
  const stdout: Uint8Array[] = [], stderr: Uint8Array[] = []
  for (const [index, stream] of [proc.stdout!, proc.stderr!].entries()) {
    stream.on("data", (chunk: Buffer) => {
      (index === 0 ? stdout : stderr).push(chunk)
      if (files[index]) writing = writing.then(async () => { await files[index]!.write(chunk) }).catch(() => {
        cleanup.capture_complete = false; cleanup.error ??= "Output capture write failed"
      })
    })
  }
  const streams = Promise.all([proc.stdout!, proc.stderr!].map((stream) => new Promise<void>((resolve) => {
    stream.once("close", resolve)
    stream.once("end", resolve)
    stream.once("error", () => { cleanup.capture_complete = false; resolve() })
  })))
  const root = proc.pid ? await processView(proc.pid) : undefined
  if (root) ledger.set(key(root), identity(root))
  if (registration) {
    await registration.writeFile(String(proc.pid ?? "unidentified")).catch(() => { cleanup.error = "Process registration write failed" })
    await registration.close()
  }
  let scanning = Promise.resolve(), stopped = false, timedOut = false, interrupted = false
  const scan = async () => {
    const live = await snapshot([...ledger.values()])
    const directories = profile ? await runtimeDirectories(profile) : []
    cleanup.runtimeDirectories = directories.filter((directory) => !oldDirectories.has(directory))
    // Walk repeated levels from the same snapshot; do not infer an unseen parent.
    for (let pass = 0; pass < live.length; pass++) {
      const added = live.filter((entry) => !existing.has(key(entry)) && !ledger.has(key(entry)) && (
        root && entry.group === root.group && entry.session === root.session ||
        live.some((parent) => parent.pid === entry.parent && ledger.has(key(parent)))))
      if (!added.length) break
      added.forEach((entry) => ledger.set(key(entry), identity(entry)))
    }
    if (profile && root && live.some((entry) => key(entry) === key(root))) {
      const writer = await writerIdentity(profile)
      if (writer && !cleanup.writer) cleanup.writer = writer
      if (writer && cleanup.writer && JSON.stringify(writer) !== JSON.stringify(cleanup.writer)) throw Error("Writer identity changed")
    }
    if (browser) {
      const native = live.filter((entry) => entry.device === browser.device && entry.inode === browser.inode || inside(entry.executable, browser.directory))
      for (const entry of native) {
        if (existing.has(key(entry))) continue
        const data = entry.args.find((arg) => arg.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length)
        const own = data && cleanup.runtimeDirectories.some((directory) => data === path.join(directory, "browser-profile"))
        if (ledger.has(key(entry)) && data && (!own || entry.device !== browser.device || entry.inode !== browser.inode)) throw Error(`Browser binding differs PID ${entry.pid}`)
        if (!ledger.has(key(entry))) {
          const foreign = data && !inside(data, profile!)
          const foreignParent = live.some((parent) => parent.pid === entry.parent && parent.args.some((arg) => arg.startsWith("--user-data-dir=") && !inside(arg.slice(16), profile!)))
          if (!foreign && !foreignParent) throw Error(`Unexplained browser/helper PID ${entry.pid}`)
        }
      }
    }
    cleanup.processes = [...ledger.values()]
    return live.filter((entry) => ledger.has(key(entry)))
  }
  const checkedScan = () => {
    scanning = scanning.then(async () => { await scan() }).catch((error) => { cleanup.error ??= message(error) })
    return scanning
  }
  await checkedScan()
  const poll = setInterval(() => { if (!stopped) void checkedScan() }, 100)
  const signalOwned = async (signal: NodeJS.Signals) => {
    await checkedScan()
    for (const saved of ledger.values()) {
      try {
        const current = await processView(saved.pid)
        if (!current) continue
        if (key(current) !== key(saved) || current.uid !== saved.uid || current.device !== saved.device || current.inode !== saved.inode)
          throw Error(`Process identity changed PID ${saved.pid}`)
        // Individual signals avoid signaling a recycled PGID or an unknown member.
        process.kill(current.pid, signal)
      } catch (error) { if (!gone(error)) cleanup.error ??= message(error) }
    }
  }
  let budgetEnded: () => void = () => {}
  const budget = new Promise<void>((resolve) => { budgetEnded = resolve })
  const timer = setTimeout(() => { timedOut = true; budgetEnded() }, input.timeoutMs)
  const abort = () => { interrupted = true; budgetEnded() }
  input.signal?.addEventListener("abort", abort, { once: true })
  if (input.signal?.aborted) abort()
  await Promise.race([exited, budget])
  clearTimeout(timer)
  input.signal?.removeEventListener("abort", abort)
  const deadline = Date.now() + 60_000
  if (timedOut || interrupted) {
    await signalOwned("SIGINT")
    await Promise.race([exited, Bun.sleep(30_000)])
  }
  await signalOwned("SIGTERM")
  const remaining = async () => {
    await checkedScan()
    return (await Promise.all([...ledger.values()].map(async (saved) => {
      try {
        const current = await processView(saved.pid)
        if (current && key(current) !== key(saved)) throw Error(`Process identity changed PID ${saved.pid}`)
        return current
      } catch (error) { cleanup.error ??= message(error); return saved }
    }))).filter((entry) => entry !== undefined)
  }
  const soft = Math.min(deadline, Date.now() + 5_000)
  while ((await remaining()).length && Date.now() < soft) await Bun.sleep(100)
  if ((await remaining()).length) await signalOwned("SIGKILL")
  while ((await remaining()).length && Date.now() < deadline) await Bun.sleep(100)
  if ((await remaining()).length) cleanup.error ??= "Owned processes did not terminate"
  stopped = true
  clearInterval(poll)
  await scanning
  await checkedScan()
  await Bun.sleep(100)
  await checkedScan()
  if (!cleanup.error) cleanup.status = "confirmed"
  if (cleanup.status !== "confirmed") cleanup.status = "failed"
  if (marker && cleanup.status === "confirmed") await rm(marker, { force: true })
  await Promise.race([streams, Bun.sleep(1000).then(() => {
    if (!proc.stdout!.readableEnded || !proc.stderr!.readableEnded) {
      cleanup.capture_complete = false
      proc.stdout!.destroy(); proc.stderr!.destroy()
    }
  })])
  await writing
  for (const file of files) {
    await file.sync().catch(() => { cleanup.error ??= "Output capture sync failed"; cleanup.capture_complete = false })
    await file.close()
  }
  if (cleanup.error) cleanup.status = "failed"
  const result = { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"),
    exitCode: proc.exitCode ?? -1, timedOut, interrupted, startedAt, durationMs: Date.now() - startedAt,
    processCleanup: cleanup }
  if (input.outDir) {
    await Bun.write(path.join(input.outDir, "process-cleanup.json"), JSON.stringify(cleanup, null, 2))
  }
  return result
}
