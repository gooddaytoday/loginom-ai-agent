import path from "node:path"
import { spawn } from "node:child_process"
import os from "node:os"
import { lstat, mkdtemp, open, readdir, readFile, readlink, realpath, stat, writeFile, rm } from "node:fs/promises"

export type ProcessIdentity = {
  pid: number; starttime: string; uid: number; parent: number; group: number; session: number
  executable: string; device: number; inode: number
}
type ProcessView = ProcessIdentity & { args: string[]; cwd: string; name: string }
export type WriterIdentity = { device: number; inode: number; owner: string }
export type ProcessCleanup = {
  status: "confirmed" | "failed" | "not_run"; error: string | null
  processes: ProcessIdentity[]; unknownProcesses?: ProcessIdentity[]; runtimeDirectories: string[]; writer: WriterIdentity | null
  capture_complete: boolean
  launcher?: { kind: "linux_subreaper"; pid: number; cli_pid: number | null; ready: boolean }
  browserBindings?: { process: ProcessIdentity; runtimeDirectory: string; observed_at: string }[]
  bindingRefusals?: { process: ProcessIdentity; has_data_dir: boolean; data_inside_profile: boolean; new_runtime_match: boolean; executable_match: boolean; ancestry_match: boolean }[]
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

async function processView(pid: number, required = true, owners: ProcessIdentity[] = [], retries = 2): Promise<ProcessView | undefined> {
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
    const executable = await readlink(path.join(directory, "exe"))
    const info = await stat(path.join(directory, "exe"))
    const args = (await readFile(path.join(directory, "cmdline"), "utf8")).split("\0").filter(Boolean)
    relevant ||= args.some((arg) => /(?:node-host\.mjs|standalone\.ts|loginom-ai-agent-cli)$/.test(arg))
    const finalExecutable = await stat(path.join(directory, "exe"))
    const finalRaw = await readFile(path.join(directory, "stat"), "utf8")
    const final = finalRaw.slice(finalRaw.lastIndexOf(")") + 2).split(" ")
    if (["Z", "X"].includes(final[0] ?? "")) return undefined
    if (final[19] !== fields[19]) throw Error("Process birth changed during read")
    // /proc files are separate observations. Avoid recording pre-exec argv with
    // a post-exec executable, or a PGID sampled before detached spawn settles.
    if (finalExecutable.dev !== info.dev || finalExecutable.ino !== info.ino || final[2] !== fields[2] || final[3] !== fields[3]) {
      if (retries) return processView(pid, relevant, owners, retries - 1)
      throw Error("Process identity did not settle during read")
    }
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

/** The syscall uses a PID only after a fresh birth/executable/group check.
 * A persisted numeric PGID never authorizes signaling its current members.
 */
export async function signalProcess(saved: ProcessIdentity, signal: NodeJS.Signals) {
  const current = await processView(saved.pid)
  if (!current) return
  if (key(current) !== key(saved) || current.uid !== saved.uid || current.device !== saved.device ||
    current.inode !== saved.inode || current.group !== saved.group || current.session !== saved.session)
    throw Error(`Process identity changed PID ${saved.pid}`)
  try { process.kill(current.pid, signal) } catch (error) { if (!gone(error)) throw error }
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
  const fake = cmd.some((arg) => arg.endsWith("/fixtures/fake-cli.ts"))
  if (fake && !env.EVAL_FAKE_BROWSER_BUNDLE) return undefined
  const binary = await realpath(Bun.which(cmd[0]!) ?? cmd[0]!)
  const resources = (fake ? env.EVAL_FAKE_BROWSER_BUNDLE : undefined) ?? env.LOGINOM_AI_AGENT_CLI_BUNDLE ??
    path.join(path.dirname(path.dirname(binary)), "resources", "loginom")
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
  const parents = new Map<string, string>()
  const boundBrowsers = new Set<string>()
  const denied = new Set<string>()
  const unknown = new Map<string, ProcessIdentity>()
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
  const capsule = await mkdtemp(path.join(os.tmpdir(), "evals-launcher-"))
  const nonce = crypto.randomUUID()
  await writeFile(path.join(capsule, "command.json"), JSON.stringify({ cmd: input.cmd, cwd: input.cwd, nonce }), { mode: 0o600 })
  const proc = spawn(process.execPath, [path.join(import.meta.dir, "process-launcher.ts"), capsule], { cwd: input.cwd, env: input.env,
    detached: true, stdio: [input.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"] })
  let cliExitCode: number | undefined, cliPid: number | undefined, reaperReady = false
  cleanup.launcher = { kind: "linux_subreaper", pid: proc.pid ?? -1, cli_pid: null, ready: false }
  let finish = () => {}
  const exited = new Promise<void>((resolve) => {
    finish = resolve
    proc.once("exit", () => {
      if (cliExitCode === undefined) cleanup.error ??= "Launcher ended without CLI exit receipt"
      resolve()
    })
    proc.once("error", (error) => { cleanup.error = `Spawn failed: ${message(error)}`; resolve() })
  })
  const readReceipt = async () => {
    const raw = await readFile(path.join(capsule, "state.json"), "utf8").catch((error) => {
      if (gone(error)) return undefined
      throw Error("Launcher receipt unreadable")
    })
    if (!raw) return
    const state = JSON.parse(raw) as { nonce: string; pid: number; ready: boolean; cli_pid: number | null; exit_code: number | null; error: string | null }
    if (state.nonce !== nonce || state.pid !== proc.pid) throw Error("Launcher receipt identity differs")
    reaperReady = state.ready
    cleanup.launcher!.ready = state.ready
    if (state.cli_pid !== null) { cliPid = state.cli_pid; cleanup.launcher!.cli_pid = state.cli_pid }
    if (state.error) cleanup.error ??= "Launcher admission failed"
    if (state.exit_code !== null && Number.isSafeInteger(state.exit_code)) { cliExitCode = state.exit_code; finish() }
  }
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
      added.forEach((entry) => {
        ledger.set(key(entry), identity(entry))
        const parent = live.find((candidate) => candidate.pid === entry.parent && ledger.has(key(candidate)))
        if (parent) parents.set(key(entry), key(parent))
      })
    }
    if (profile && root && live.some((entry) => key(entry) === key(root))) {
      const writer = await writerIdentity(profile)
      if (writer && !cleanup.writer) cleanup.writer = writer
      if (writer && cleanup.writer && JSON.stringify(writer) !== JSON.stringify(cleanup.writer)) cleanup.error ??= "Writer identity changed"
    }
    cleanup.processes = [...ledger.values()]
    if (browser) {
      const native = live.filter((entry) => entry.device === browser.device && entry.inode === browser.inode || inside(entry.executable, browser.directory))
      const dataDir = (entry: ProcessView) => entry.args.find((arg) => arg.startsWith("--user-data-dir="))?.slice(16)
      const bound = (entry: ProcessView) => entry.device === browser.device && entry.inode === browser.inode &&
        cleanup.runtimeDirectories.some((directory) => dataDir(entry) === path.join(directory, "browser-profile"))
      native.filter((entry) => ledger.has(key(entry)) && bound(entry)).forEach((entry) => {
        if (!boundBrowsers.has(key(entry))) {
          cleanup.browserBindings ??= []
          cleanup.browserBindings.push({ process: identity(entry), runtimeDirectory: path.dirname(dataDir(entry)!), observed_at: new Date().toISOString() })
        }
        boundBrowsers.add(key(entry))
      })
      // Session membership can only be inherited by fork. Require the bound
      // session leader to be alive with its observed birth/executable identity;
      // a historical SID/PGID cannot admit a newly observed orphan.
      const leaders = native.filter((entry) => boundBrowsers.has(key(entry)) && entry.pid === entry.session &&
        ledger.get(key(entry))?.inode === entry.inode && ledger.get(key(entry))?.device === entry.device)
      live.filter((entry) => !existing.has(key(entry)) && !ledger.has(key(entry))).forEach((entry) => {
        const leader = leaders.find((candidate) => entry.session === candidate.session && entry.uid === candidate.uid &&
          BigInt(entry.starttime) >= BigInt(candidate.starttime))
        if (!leader) return
        ledger.set(key(entry), identity(entry))
        parents.set(key(entry), key(leader))
      })
      const browserAncestor = (entry: ProcessView) => {
        let parent = parents.get(key(entry))
        const visited = new Set<string>()
        while (parent && !visited.has(parent)) {
          if (boundBrowsers.has(parent)) return true
          visited.add(parent); parent = parents.get(parent)
        }
        return false
      }
      for (const entry of native) {
        if (existing.has(key(entry))) continue
        const data = dataDir(entry)
        if (ledger.has(key(entry))) {
          // Chromium may clear argv while exiting. Birth-bound authority survives
          // that observation; every signal still rechecks executable/UID/starttime.
          const adopted = reaperReady && root && entry.parent === root.pid && entry.pid !== cliPid &&
            live.some((candidate) => key(candidate) === key(root)) && boundBrowsers.size > 0 &&
            (entry.device !== browser.device || entry.inode !== browser.inode || entry.args.some((arg) => arg.startsWith("--type=")))
          if (data ? !bound(entry) : !boundBrowsers.has(key(entry)) && !browserAncestor(entry) && !adopted) {
            if (!denied.has(key(entry))) {
              cleanup.bindingRefusals ??= []
              cleanup.bindingRefusals.push({ process: identity(entry), has_data_dir: Boolean(data), data_inside_profile: Boolean(data && inside(data, profile!)),
                new_runtime_match: cleanup.runtimeDirectories.some((directory) => data === path.join(directory, "browser-profile")),
                executable_match: entry.device === browser.device && entry.inode === browser.inode, ancestry_match: browserAncestor(entry) })
            }
            denied.add(key(entry)); unknown.set(key(entry), identity(entry)); cleanup.error ??= `Browser binding differs PID ${entry.pid}`
          }
          continue
        }
        const foreign = data && !inside(data, profile!)
        const foreignParent = live.some((parent) => parent.pid === entry.parent && dataDir(parent) && !inside(dataDir(parent)!, profile!))
        if (!foreign && !foreignParent) {
          denied.add(key(entry)); unknown.set(key(entry), identity(entry)); cleanup.error ??= `Unexplained browser/helper PID ${entry.pid}`
        }
      }
      cleanup.unknownProcesses = [...unknown.values()]
      cleanup.processes = [...ledger.values()]
    }
    return live.filter((entry) => ledger.has(key(entry)))
  }
  const checkedScan = () => {
    scanning = scanning.then(async () => { await readReceipt(); await scan() }).catch((error) => { cleanup.error ??= message(error) })
    return scanning
  }
  await checkedScan()
  // Browser launch argv can be replaced within tens of milliseconds. Sample
  // the admission window faster; do not enqueue stale scans when /proc is slow.
  let pollPending = false
  const poll = setInterval(() => {
    if (stopped || pollPending) return
    pollPending = true
    void checkedScan().finally(() => { pollPending = false })
  }, browser ? 10 : 100)
  const signalOwned = async (signal: NodeJS.Signals) => {
    await checkedScan()
    for (const saved of ledger.values()) {
      if (denied.has(key(saved)) || root && key(saved) === key(root)) continue
      try {
        // Individual signals avoid signaling a recycled PGID or an unknown member.
        await signalProcess(saved, signal)
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
    return (await Promise.all([...ledger.values()].filter((entry) => !denied.has(key(entry)) && (!root || key(entry) !== key(root))).map(async (saved) => {
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
  if (root) await signalProcess(identity(root), "SIGTERM").catch((error) => { cleanup.error ??= message(error) })
  const launcherDeadline = Math.min(deadline, Date.now() + 5_000)
  while (proc.exitCode === null && proc.signalCode === null && Date.now() < launcherDeadline) await Bun.sleep(100)
  if (root && proc.exitCode === null && proc.signalCode === null)
    await signalProcess(identity(root), "SIGKILL").catch((error) => { cleanup.error ??= message(error) })
  stopped = true
  clearInterval(poll)
  await scanning
  await checkedScan()
  await Bun.sleep(100)
  await checkedScan()
  if (!cleanup.error) cleanup.status = "confirmed"
  if (cleanup.status !== "confirmed") cleanup.status = "failed"
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
    exitCode: cliExitCode ?? proc.exitCode ?? -1, timedOut, interrupted, startedAt, durationMs: Date.now() - startedAt,
    processCleanup: cleanup }
  if (input.outDir) {
    await Bun.write(path.join(input.outDir, "process-cleanup.json"), JSON.stringify(cleanup, null, 2)).catch(() => {
      cleanup.status = "failed"; cleanup.error ??= "Process evidence persistence failed"
    })
  }
  if (marker && cleanup.status === "confirmed") await rm(marker, { force: true }).catch(() => {
    cleanup.status = "failed"; cleanup.error ??= "Process registration release failed"
  })
  await rm(path.join(capsule, "command.json"), { force: true })
  if (cleanup.status === "confirmed") await rm(capsule, { recursive: true, force: true })
  return result
}
