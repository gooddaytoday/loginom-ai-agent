import path from "node:path"
import { spawn } from "node:child_process"
import os from "node:os"
import { constants } from "node:fs"
import { lstat, mkdtemp, open, readdir, readFile, readlink, realpath, stat, writeFile, rm } from "node:fs/promises"

export type ProcessIdentity = {
  pid: number; starttime: string; uid: number; parent: number; group: number; session: number
  executable: string; device: number; inode: number
}
type ProcessView = ProcessIdentity & { args: string[]; cwd: string; name: string }
type ProcessOrigin = { via: "launcher" | "cli" | "parent" | "subreaper"; parent?: string; observed_at: string }
type ProcessEntry = {
  process: ProcessIdentity; origin?: ProcessOrigin; admission: "pending" | "allowed" | "refused"
  binding?: { runtimeDirectory: string; observed_at: string }; helper?: boolean; foreign?: boolean
}
export type WriterIdentity = { device: number; inode: number; owner: string }
export type ProcessCleanup = {
  status: "confirmed" | "failed" | "not_run"; error: string | null
  processes: ProcessIdentity[]; unknownProcesses?: ProcessIdentity[]; runtimeDirectories: string[]; writer: WriterIdentity | null
  capture_complete: boolean
  observation_mode?: "continuous" | "unit_after_exit" | "writer_release_settlement"
  verification?: { observed_at: string; owned_remaining: number }[]
  origins?: { pid: number; starttime: string; via: ProcessOrigin["via"]; parent_pid: number | null; parent_starttime: string | null; observed_at: string }[]
  observations?: { count: number; max_duration_ms: number }
  polling?: { interval_ms: number; observed_at: string }[]
  settlement?: { started_at: string; source_processes: number; passes: { observed_at: string; inspected: number; owned_remaining: number; native_remaining: number }[] }
  admissions?: { pid: number; starttime: string; status: ProcessEntry["admission"] }[]
  selectedCli?: { executable: string; device: number; inode: number }
  launcher?: { kind: "linux_subreaper"; pid: number; cli_pid: number | null; ready: boolean }
  browserBindings?: { process: ProcessIdentity; runtimeDirectory: string; observed_at: string }[]
  bindingRefusals?: { process: ProcessIdentity; has_data_dir: boolean; data_inside_profile: boolean; new_runtime_match: boolean; executable_match: boolean; ancestry_match: boolean }[]
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const gone = (error: unknown) => ["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")
const key = (process: ProcessIdentity) => `${process.pid}:${process.starttime}`
const inside = (file: string, root: string) => file === root || file.startsWith(root + path.sep)

export async function writerIdentity(profile: string): Promise<WriterIdentity | null> {
  const directory = path.join(profile, ".writer")
  const info = await lstat(directory).catch((error) => {
    if (gone(error)) return undefined
    throw error
  })
  if (!info) return null
  if (!info.isDirectory() || info.isSymbolicLink()) throw Error("Writer is not a private directory")
  const ownerPath = path.join(directory, "owner")
  const ownerBefore = await lstat(ownerPath).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw Error("Writer owner unavailable")
    await observeWriterRelease(directory, info)
    return undefined
  })
  if (!ownerBefore) return null
  if (!ownerBefore.isFile() || ownerBefore.isSymbolicLink()) throw Error("Writer owner is not a private file")
  const file = await open(ownerPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    .catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw Error("Writer owner unavailable")
      await observeWriterRelease(directory, info)
      return undefined
    })
  if (!file) return null
  try {
    const ownerInfo = await file.stat()
    if (!ownerInfo.isFile() || ownerInfo.dev !== ownerBefore.dev || ownerInfo.ino !== ownerBefore.ino)
      throw Error("Writer owner identity changed during read")
    const owner = await file.readFile("utf8")
    const observed = await Promise.all([lstat(directory), lstat(ownerPath)]).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
      await observeWriterRelease(directory, info)
      return undefined
    })
    if (!observed) return null
    const [current, currentOwner] = observed
    if (current.dev !== info.dev || current.ino !== info.ino || current.isSymbolicLink() ||
      currentOwner.dev !== ownerInfo.dev || currentOwner.ino !== ownerInfo.ino || currentOwner.isSymbolicLink())
      throw Error("Writer owner identity changed during read")
    return { device: info.dev, inode: info.ino, owner }
  } finally { await file.close() }
}

/** CLI release unlinks owner before rmdir. Only that bounded ENOENT window is retried. */
async function observeWriterRelease(directory: string, expected: Awaited<ReturnType<typeof lstat>>) {
  let absent = 0
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (current) {
      absent = 0
      if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== expected.dev || current.ino !== expected.ino)
        throw Error("Writer directory identity changed during release")
      const owner = await lstat(path.join(directory, "owner")).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined
        throw error
      })
      if (owner) throw Error("Writer owner identity changed during release")
    } else if (++absent === 2) return
    if (attempt < 5) await Bun.sleep(20)
  }
  throw Error("Writer owner unavailable")
}

async function processView(pid: number, required = true, owners: ProcessIdentity[] = [], retries = 2): Promise<ProcessView | undefined> {
  let relevant = required
  try {
    const directory = `/proc/${pid}`
    const owner = await stat(directory)
    if (owner.uid !== process.getuid?.()) {
      if (required || owners.some((entry) => entry.pid === pid)) throw Error("Process UID changed")
      return undefined
    }
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
    if (finalExecutable.dev !== info.dev || finalExecutable.ino !== info.ino || final[1] !== fields[1] || final[2] !== fields[2] || final[3] !== fields[3]) {
      if (retries) {
        await Bun.sleep(20)
        return processView(pid, relevant, owners, retries - 1)
      }
      throw Error("Process identity did not settle during read")
    }
    return { pid, uid: owner.uid, starttime: fields[19]!, parent: Number(fields[1]),
      group: Number(fields[2]), session: Number(fields[3]), executable, device: info.dev, inode: info.ino,
      name, args,
      cwd: await readlink(path.join(directory, "cwd")) }
  } catch (error) {
    if (gone(error)) return undefined
    const denied = ["EACCES", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")
    if (!relevant && denied) return undefined
    // exec can briefly reset dumpability. A fresh complete read must still
    // establish identity; persistent denial consumes the same bounded budget.
    if (relevant && denied && retries) {
      await Bun.sleep(20)
      return processView(pid, relevant, owners, retries - 1)
    }
    throw Error(`Cannot inspect process identity PID ${pid}`)
  }
}

async function snapshot(owners: ProcessIdentity[] = []) {
  return (await Promise.all((await readdir("/proc")).filter((name) => /^\d+$/.test(name))
    .map((pid) => processView(Number(pid), false, owners)))).filter((entry) => entry !== undefined)
}

/** No signals or CLI execution. A new proof of absence for the sole writer-release error. */
export async function observeWriterReleaseSettlement(profile: string, original: ProcessCleanup, acquiredAt: string): Promise<ProcessCleanup> {
  if (original?.status !== "failed" || original.error !== "Writer owner unavailable" || original.capture_complete !== true ||
    original.observation_mode !== "continuous" || !Array.isArray(original.unknownProcesses) || original.unknownProcesses.length ||
    !original.writer || !original.writer.owner || !Number.isSafeInteger(original.writer.device) || !Number.isSafeInteger(original.writer.inode) ||
    !original.launcher?.ready || !original.selectedCli || !original.processes?.length || !original.runtimeDirectories?.length ||
    !original.verification || original.verification.length < 2 || original.verification.some(pass => pass.owned_remaining !== 0 ||
      !Number.isFinite(Date.parse(pass.observed_at)) || Date.parse(pass.observed_at) < Date.parse(acquiredAt)))
    throw Error("Writer-release source proof ineligible")
  const ids = new Set(original.processes.map(key))
  if (ids.size !== original.processes.length || original.processes.some(identity =>
    identity.uid !== process.getuid?.() || !Number.isSafeInteger(identity.pid) || identity.pid <= 0 ||
    !/^\d+$/.test(identity.starttime) || !Number.isSafeInteger(identity.group) || identity.group <= 0 ||
    !Number.isSafeInteger(identity.session) || identity.session <= 0 || !Number.isSafeInteger(identity.device) || identity.device <= 0 ||
    !Number.isSafeInteger(identity.inode) || identity.inode <= 0 || !path.isAbsolute(identity.executable) ||
    original.admissions?.filter(entry => entry.pid === identity.pid && entry.starttime === identity.starttime && entry.status === "allowed").length !== 1 ||
    original.origins?.filter(entry => entry.pid === identity.pid && entry.starttime === identity.starttime &&
      ["launcher", "cli", "parent", "subreaper"].includes(entry.via) && Number.isFinite(Date.parse(entry.observed_at)) && Date.parse(entry.observed_at) >= Date.parse(acquiredAt) &&
      (entry.via === "launcher" ? entry.pid === original.launcher?.pid && entry.parent_pid === null && entry.parent_starttime === null :
        ids.has(`${entry.parent_pid}:${entry.parent_starttime}`))).length !== 1))
    throw Error("Writer-release ancestry unconfirmed")
  const cli = original.processes.find(identity => identity.pid === original.launcher?.cli_pid)
  if (original.origins?.length !== original.processes.length || original.admissions?.length !== original.processes.length ||
    !cli || cli.executable !== original.selectedCli.executable || cli.device !== original.selectedCli.device || cli.inode !== original.selectedCli.inode ||
    original.origins.find(entry => entry.pid === cli.pid)?.via !== "cli") throw Error("Writer-release ancestry unconfirmed")
  for (const identity of original.processes) {
    const visited = new Set<string>()
    let current: string | undefined = key(identity)
    while (current) {
      if (visited.has(current)) throw Error("Writer-release ancestry unconfirmed")
      visited.add(current)
      const entry = original.origins!.find(entry => `${entry.pid}:${entry.starttime}` === current)
      if (!entry) throw Error("Writer-release ancestry unconfirmed")
      current = entry.via === "launcher" ? undefined : `${entry.parent_pid}:${entry.parent_starttime}`
    }
  }
  const canonical = await realpath(profile)
  if (canonical !== profile || original.runtimeDirectories.some(directory => !inside(directory, profile) || directory === profile))
    throw Error("Writer-release profile ownership differs")
  const started_at = new Date().toISOString()
  const passes: NonNullable<ProcessCleanup["settlement"]>["passes"] = []
  for (let pass = 0; pass < 2; pass++) {
    const current = await snapshot(original.processes)
    const owned = current.filter(process => ids.has(key(process)) || original.processes.some(saved => saved.pid === process.pid || saved.group === process.group) ||
      inside(process.cwd, profile) || process.args.some(arg => arg === profile || arg.startsWith(profile + path.sep)))
    const native = current.filter(process => /^(?:loginom-ai-|chrome|chromium)/.test(process.name) ||
      process.args.some(arg => /(?:node-host\.mjs|standalone\.ts|loginom-ai-agent-cli)$/.test(arg)) ||
      /^(?:chrome|chromium)(?:[-_]|$)/.test(path.basename(process.executable)))
    if (owned.length || native.length) throw Error("Writer-release processes busy or foreign")
    if (await writerIdentity(profile)) throw Error("Writer-release writer identity differs")
    const directories = await runtimeDirectories(profile, true)
    if (JSON.stringify([...directories].sort()) !== JSON.stringify([...original.runtimeDirectories].sort()) ||
      (await Promise.all(directories.map(directory => realpath(directory)))).some((actual, index) => actual !== directories[index]))
      throw Error("Writer-release runtime directories differ")
    passes.push({ observed_at: new Date().toISOString(), inspected: current.length, owned_remaining: owned.length, native_remaining: native.length })
    if (!pass) await Bun.sleep(100)
  }
  return { status: "confirmed", error: null, processes: original.processes, unknownProcesses: [],
    runtimeDirectories: original.runtimeDirectories, writer: original.writer, capture_complete: true,
    observation_mode: "writer_release_settlement", selectedCli: original.selectedCli, launcher: original.launcher,
    origins: original.origins, admissions: original.admissions, browserBindings: original.browserBindings,
    verification: passes.map(pass => ({ observed_at: pass.observed_at, owned_remaining: pass.owned_remaining })),
    settlement: { started_at, source_processes: original.processes.length, passes } }
}

function identity(view: ProcessIdentity): ProcessIdentity {
  return { pid: view.pid, starttime: view.starttime, uid: view.uid, parent: view.parent,
    group: view.group, session: view.session, executable: view.executable, device: view.device, inode: view.inode }
}

function sameIdentity(current: ProcessIdentity, saved: ProcessIdentity) {
  return key(current) === key(saved) && current.uid === saved.uid && current.device === saved.device &&
    current.inode === saved.inode && current.group === saved.group && current.session === saved.session
}

/** The syscall uses a PID only after a fresh birth/executable/group check.
 * A persisted numeric PGID never authorizes signaling its current members.
 */
export async function signalProcess(saved: ProcessIdentity, signal: NodeJS.Signals) {
  const current = await processView(saved.pid)
  if (!current) return false
  if (!sameIdentity(current, saved))
    throw Error(`Process identity changed PID ${saved.pid}`)
  try { process.kill(current.pid, signal); return true } catch (error) { if (!gone(error)) throw error; return false }
}

async function runtimeDirectories(profile: string, strict = false): Promise<string[]> {
  const walk = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
      if (gone(error)) return []
      throw error
    })
    if (strict && entries.some(entry => entry.isSymbolicLink())) throw Error("Writer-release runtime directories differ")
    return (await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map(async (entry) => {
      const file = path.join(directory, entry.name)
      if (path.basename(directory) === "attempts") return [file]
      if (entry.name === "browser-profile") return []
      return walk(file)
    }))).flat()
  }
  return (await Promise.all(["runtime", "validation"].map((namespace) =>
    walk(path.join(profile, "loginom", namespace))))).flat()
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
  const directory = path.dirname(executable)
  const helpers = await Promise.all(["chrome_crashpad_handler"].map(async (name) => {
    const file = path.join(directory, name)
    const helper = await stat(file).catch((error) => { if (gone(error)) return undefined; throw error })
    if (!helper) return undefined
    const actual = await realpath(file)
    if (!inside(actual, await realpath(resources))) throw Error("Browser helper escapes bundle")
    return { executable: actual, device: helper.dev, inode: helper.ino }
  }))
  return { executable, device: info.dev, inode: info.ino, directory, helpers: helpers.filter((entry) => entry !== undefined), fake }
}

/** Own ancestry is captured before reparent/setsid; argv is never a kill authority.
 * Unknown native children block continuation rather than becoming guessed owners.
 */
export async function superviseProcess(input: {
  cmd: string[]; cwd: string; env: Record<string, string>; timeoutMs: number
  profileDir?: string; outDir?: string; stdin?: string; signal?: AbortSignal; sandbox?: string[]
  observationMode?: "continuous" | "unit_after_exit"
}) {
  if (process.platform !== "linux") throw Error("Process ownership supervision requires Linux /proc")
  if (input.observationMode !== undefined && input.observationMode !== "continuous" && input.observationMode !== "unit_after_exit")
    throw Error("Unknown process observation mode")
  if (input.observationMode === "unit_after_exit" && (input.cmd.length !== 2 || input.cmd[0] !== process.execPath ||
    !["test", "typecheck"].includes(input.cmd[1]!) || path.basename(input.cwd) !== "evals" ||
    input.profileDir !== undefined || input.sandbox !== undefined || await realpath(input.cwd) !== input.cwd))
    throw Error("Trusted unit observation requires Bun test/typecheck in evals without profile or sandbox")
  const startedAt = Date.now()
  const ledger = new Map<string, ProcessEntry>()
  const cleanup: ProcessCleanup = { status: "not_run", error: null, processes: [], runtimeDirectories: [], writer: null, capture_complete: true,
    observation_mode: input.observationMode ?? "continuous" }
  const profile = input.profileDir ? await realpath(input.profileDir) : undefined
  const baseline = await snapshot()
  const existing = new Set(baseline.map(key))
  const oldDirectories = new Set(profile ? await runtimeDirectories(profile) : [])
  const browser = profile ? await browserIdentity(input.cmd, input.env) : undefined
  const cliExecutable = await realpath(Bun.which(input.cmd[0]!) ?? input.cmd[0]!)
  const cliInfo = await stat(cliExecutable)
  const wrapper = input.sandbox ? await stat(await realpath(input.sandbox[0]!)) : undefined
  const isWrapper = (entry: ProcessIdentity) => Boolean(wrapper && entry.device === wrapper.dev && entry.inode === wrapper.ino)
  cleanup.selectedCli = { executable: cliExecutable, device: cliInfo.dev, inode: cliInfo.ino }
  if (input.signal?.aborted) return { stdout: "", stderr: "", exitCode: -1, timedOut: false, interrupted: true,
    startedAt, durationMs: 0, processCleanup: cleanup, sandboxError: null as string | null }
  const marker = profile ? `${profile}.process-group` : undefined
  const registration = marker ? await open(marker, "wx", 0o600).catch(() => {
    throw Error("Registration unavailable before dispatch")
  }) : undefined
  const files = input.outDir ? await Promise.all(["events.jsonl", "stderr.txt"]
    .map((name) => open(path.join(input.outDir!, name), "w", 0o600))) : []
  let writing = Promise.resolve()
  const capsule = await mkdtemp(path.join(os.tmpdir(), "evals-launcher-"))
  const nonce = crypto.randomUUID()
  await writeFile(path.join(capsule, "command.json"), JSON.stringify({ cmd: input.sandbox ?? input.cmd, cwd: input.cwd, nonce,
    sandbox: Boolean(input.sandbox) }), { mode: 0o600 })
  const proc = spawn(process.execPath, [path.join(import.meta.dir, "process-launcher.ts"), capsule], { cwd: input.cwd, env: input.env,
    detached: true, stdio: [input.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"] })
  let cliExitCode: number | undefined, cliPid: number | undefined, reaperReady = false
  let sandboxStarted = false, namespacePid: number | null = null, sandboxExitCode: number | null = null, sandboxError: string | null = null
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
  let lastReceipt: string | undefined
  const readReceipt = async () => {
    const raw = await readFile(path.join(capsule, "state.json"), "utf8").catch((error) => {
      if (gone(error)) return undefined
      throw Error("Launcher receipt unreadable")
    })
    if (!raw || raw === lastReceipt) return
    const observed = root ? await processView(root.pid) : undefined
    if (!root || !observed || !sameIdentity(observed, root)) throw Error("Launcher receipt lacks verified live identity")
    const state = (() => {
      try { return JSON.parse(raw) as { nonce: string; pid: number; ready: boolean; cli_pid: number | null; exit_code: number | null; error: string | null;
        sandbox_started: boolean; sandbox_pid: number | null; sandbox_exit_code: number | null; sandbox_error: string | null } }
      catch { throw Error("Launcher receipt invalid") }
    })()
    if (!state || typeof state.ready !== "boolean" ||
      state.cli_pid !== null && (!Number.isSafeInteger(state.cli_pid) || state.cli_pid <= 0) ||
      state.exit_code !== null && !Number.isSafeInteger(state.exit_code) ||
      state.error !== null && typeof state.error !== "string" || typeof state.sandbox_started !== "boolean" ||
      state.sandbox_pid !== null && (!Number.isSafeInteger(state.sandbox_pid) || state.sandbox_pid <= 0) ||
      state.sandbox_exit_code !== null && !Number.isSafeInteger(state.sandbox_exit_code) ||
      state.sandbox_error !== null && typeof state.sandbox_error !== "string") throw Error("Launcher receipt invalid")
    if (state.nonce !== nonce || state.pid !== proc.pid) throw Error("Launcher receipt identity differs")
    lastReceipt = raw
    reaperReady = state.ready
    cleanup.launcher!.ready = state.ready
    if (state.cli_pid !== null) { cliPid = state.cli_pid; if (!input.sandbox) cleanup.launcher!.cli_pid = state.cli_pid }
    sandboxStarted = state.sandbox_started
    namespacePid = state.sandbox_pid
    sandboxExitCode = state.sandbox_exit_code
    sandboxError = state.sandbox_error
    if (state.error) cleanup.error ??= "Launcher admission failed"
    if (state.exit_code !== null && Number.isSafeInteger(state.exit_code)) { cliExitCode = state.exit_code; finish() }
  }
  if (input.stdin !== undefined) {
    proc.stdin!.on("error", () => { cleanup.error ??= "Command stdin delivery failed" })
    proc.stdin!.end(input.stdin)
  }
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
  const root = proc.pid ? await processView(proc.pid).catch(() => {
    cleanup.error ??= "Launcher identity unavailable after dispatch"
    return undefined
  }) : undefined
  const track = (entry: ProcessIdentity, via: ProcessOrigin["via"], parent?: ProcessIdentity) => {
    // Adoption retains launcher ownership, but loses the browser parent chain.
    // Keep it unadmitted until CLI identity or native admission resolves it.
    const tracked: ProcessEntry = ledger.get(key(entry)) ?? { process: identity(entry),
      admission: browser && via === "subreaper" ? "pending" : "allowed" }
    if (tracked.foreign) {
      tracked.foreign = false; tracked.admission = "refused"
      cleanup.error ??= `Browser binding differs PID ${entry.pid}`
    }
    tracked.origin = { via, parent: parent ? key(parent) : undefined, observed_at: new Date().toISOString() }
    ledger.set(key(entry), tracked)
  }
  if (root) track(root, "launcher")
  if (registration) {
    await registration.writeFile(String(proc.pid ?? "unidentified")).catch(() => { cleanup.error = "Process registration write failed" })
    await registration.close().catch(() => { cleanup.error ??= "Process registration close failed" })
  }
  let scanning = Promise.resolve(), stopped = false, timedOut = false, interrupted = false
  let lastOwn: ProcessIdentity[] = []
  const scan = async () => {
    const live = await snapshot([...ledger.values()].filter((entry) => entry.origin).map((entry) => entry.process))
    for (const entry of ledger.values()) {
      if (!entry.origin) continue
      const current = live.find((candidate) => candidate.pid === entry.process.pid)
      if (current && !sameIdentity(current, entry.process)) {
        entry.admission = "refused"
        cleanup.error ??= `Process identity changed PID ${entry.process.pid}`
      }
    }
    const directories = profile ? await runtimeDirectories(profile) : []
    // Validation deletes its temporary directory after closing the browser.
    // Keep observed paths as birth-bound evidence after that product cleanup.
    cleanup.runtimeDirectories = [...new Set([...cleanup.runtimeDirectories,
      ...directories.filter((directory) => !oldDirectories.has(directory))])]
    // Only a fresh live parent chain or kernel adoption proves provenance.
    // Group/session numbers are evidence, never a second admission algorithm.
    for (let pass = 0; pass < live.length; pass++) {
      const added = live.filter((entry) => !existing.has(key(entry)) && !ledger.get(key(entry))?.origin &&
        // bwrap publishes child-pid before setsid/mount/exec completes. Admit
        // the namespace reaper only after --new-session has settled, and the
        // CLI after exec, preserving immutable identities once admitted.
        (!input.sandbox || !(isWrapper(entry) && (entry.pid === namespacePid
          ? entry.group !== entry.pid || entry.session !== entry.pid
          : live.some((parent) => parent.pid === entry.parent && isWrapper(parent)) &&
            (namespacePid === null || cleanup.launcher!.cli_pid === null)))) &&
        live.some((parent) => parent.pid === entry.parent && ledger.get(key(parent))?.origin &&
          sameIdentity(parent, ledger.get(key(parent))!.process) && (parent.pid !== root?.pid || reaperReady)))
      if (!added.length) break
      added.forEach((entry) => {
        const parent = live.find((candidate) => candidate.pid === entry.parent && ledger.get(key(candidate))?.origin)!
        const via = input.sandbox
          ? entry.parent === namespacePid && entry.device === cliInfo.dev && entry.inode === cliInfo.ino &&
            (cleanup.launcher!.cli_pid === null || cleanup.launcher!.cli_pid === entry.pid) ? "cli"
            : parent.pid === namespacePid || parent.pid === root?.pid && entry.pid !== cliPid ? "subreaper" : "parent"
          : entry.pid === cliPid && parent.pid === root?.pid ? "cli" : parent.pid === root?.pid ? "subreaper" : "parent"
        track(entry, via, parent)
        if (input.sandbox && isWrapper(entry) && (entry.pid === cliPid || entry.pid === namespacePid))
          ledger.get(key(entry))!.admission = "allowed"
        if (input.sandbox && via === "cli") cleanup.launcher!.cli_pid = entry.pid
        if (input.sandbox && entry.pid === cliPid && parent.pid === root?.pid &&
          (entry.device !== wrapper!.dev || entry.inode !== wrapper!.ino)) {
          ledger.get(key(entry))!.admission = "refused"; cleanup.error ??= `Sandbox executable identity differs PID ${entry.pid}`
        }
        if (via === "cli" && (entry.device !== cliInfo.dev || entry.inode !== cliInfo.ino)) {
          ledger.get(key(entry))!.admission = "refused"; cleanup.error ??= `CLI executable identity differs PID ${entry.pid}`
        }
      })
    }
    const cli = live.find((entry) => (input.sandbox
      ? entry.parent === namespacePid && entry.device === cliInfo.dev && entry.inode === cliInfo.ino &&
        (cleanup.launcher!.cli_pid === null || cleanup.launcher!.cli_pid === entry.pid)
      : entry.pid === cliPid && entry.parent === root?.pid) && ledger.has(key(entry)))
    if (cli && cli.device === cliInfo.dev && cli.inode === cliInfo.ino && ledger.get(key(cli))!.origin!.via !== "cli") {
      if (input.sandbox) cleanup.launcher!.cli_pid = cli.pid
      ledger.get(key(cli))!.origin!.via = "cli"
      if (ledger.get(key(cli))!.admission === "pending") ledger.get(key(cli))!.admission = "allowed"
    }
    // The private receipt may arrive after the first ancestry observation.
    // Only the two identified wrapper processes can leave pending this way.
    if (input.sandbox) for (const entry of ledger.values()) {
      if (entry.origin && entry.admission === "pending" && isWrapper(entry.process) &&
        [cliPid, namespacePid].includes(entry.process.pid) && live.some((current) => sameIdentity(current, entry.process)))
        entry.admission = "allowed"
    }
    if (profile && root && live.some((entry) => key(entry) === key(root))) {
      const writer = await writerIdentity(profile)
      if (writer && !cleanup.writer) cleanup.writer = writer
      if (writer && cleanup.writer && JSON.stringify(writer) !== JSON.stringify(cleanup.writer)) cleanup.error ??= "Writer identity changed"
    }
    if (browser) {
      // Chromium rewrites argv into one space-separated process title. Read
      // its explicit flags in both observed forms; keep the same identity gates.
      const dataDir = (entry: ProcessView) => entry.args.find((arg) => arg.startsWith("--user-data-dir="))?.slice(16) ??
        (entry.args.length === 1 ? entry.args[0]?.match(/(?:^|\s)--user-data-dir=(.*?)(?=\s--|$)/)?.[1] : undefined)
      const browserAncestor = (entry: ProcessEntry, requireBinding = true) => {
        let parent = entry.origin?.parent
        const visited = new Set<string>()
        while (parent && !visited.has(parent)) {
          const candidate = ledger.get(parent)
          if (candidate?.binding || !requireBinding && candidate &&
            (candidate.process.device === browser.device && candidate.process.inode === browser.inode || inside(candidate.process.executable, browser.directory) ||
              cliPid !== undefined && candidate.origin?.via === "subreaper" && candidate.process.pid !== cliPid)) return true
          visited.add(parent); parent = candidate?.origin?.parent
        }
        return false
      }
      // An adopted process with a lost chain may be a browser helper outside the
      // bundle. Adoption cannot bypass executable admission, including its children.
      const native = live.filter((entry) => !isWrapper(entry) && (entry.device === browser.device && entry.inode === browser.inode ||
        inside(entry.executable, browser.directory) || ledger.has(key(entry)) &&
          (browserAncestor(ledger.get(key(entry))!, false) || cliPid !== undefined && entry.pid !== cliPid && ledger.get(key(entry))!.origin?.via === "subreaper")))
      // Establish exact root bindings first. Helpers cannot supply a missing
      // root proof, even when the kernel has adopted them to our launcher.
      for (const current of native) {
        if (existing.has(key(current))) continue
        const entry = ledger.get(key(current)) ?? { process: identity(current), admission: "pending" as const }
        ledger.set(key(current), entry)
        if (!sameIdentity(current, entry.process)) {
          entry.admission = "refused"; cleanup.error ??= `Process identity changed PID ${current.pid}`
          continue
        }
        const data = dataDir(current)
        const runtime = cleanup.runtimeDirectories.find((directory) => data === path.join(directory, "browser-profile"))
        const mainExecutable = current.device === browser.device && current.inode === browser.inode
        const type = current.args.find((arg) => arg.startsWith("--type="))?.slice(7) ??
          (current.args.length === 1 ? current.args[0]?.match(/(?:^|\s)--type=(\S+)/)?.[1] : undefined)
        const knownType = type && ["zygote", "gpu-process", "utility", "renderer", "broker", ...(browser.fake ? ["parent", "helper"] : [])].includes(type)
        const knownExecutable = browser.helpers.some((helper) => current.device === helper.device && current.inode === helper.inode)
        if (!entry.origin) {
          const parent = live.find((candidate) => candidate.pid === current.parent)
          const parentData = parent ? dataDir(parent) : undefined
          entry.foreign ||= Boolean(data && !inside(data, profile!) || parentData && !inside(parentData, profile!))
          entry.admission = entry.foreign ? "refused" : "pending"
          continue
        }
        if (entry.admission === "refused") continue
        if (entry.foreign || entry.binding && data && data !== path.join(entry.binding.runtimeDirectory, "browser-profile") || data && (!runtime || !mainExecutable) || mainExecutable && type && !knownType || !mainExecutable && !knownExecutable) {
          entry.admission = "refused"
          cleanup.bindingRefusals ??= []
          cleanup.bindingRefusals.push({ process: identity(current), has_data_dir: Boolean(data), data_inside_profile: Boolean(data && inside(data, profile!)),
            new_runtime_match: Boolean(runtime), executable_match: mainExecutable, ancestry_match: browserAncestor(entry) })
          cleanup.error ??= `Browser binding differs PID ${current.pid}`
          continue
        }
        if (mainExecutable && !type && runtime) {
          entry.binding ??= { runtimeDirectory: runtime, observed_at: new Date().toISOString() }
          entry.admission = "allowed"
          continue
        }
        entry.helper ||= Boolean(knownExecutable || knownType || mainExecutable && browserAncestor(entry))
        entry.admission = entry.binding || entry.helper && [...ledger.values()].some((candidate) => candidate.binding && candidate.origin)
          ? "allowed" : "pending"
      }
      // Binding may appear later than a helper in the same snapshot.
      for (const entry of ledger.values()) {
        if (entry.origin && entry.admission === "pending" && entry.helper &&
          [...ledger.values()].some((candidate) => candidate.binding && candidate.origin)) entry.admission = "allowed"
      }
    }
    const owned = [...ledger.values()].filter((entry) => entry.origin)
    cleanup.processes = owned.map((entry) => entry.process)
    cleanup.unknownProcesses = [...ledger.values()].filter((entry) => !entry.foreign && entry.admission !== "allowed").map((entry) => entry.process)
    cleanup.browserBindings = owned.filter((entry) => entry.binding).map((entry) => ({ process: entry.process, ...entry.binding! }))
    cleanup.admissions = [...ledger.values()].map((entry) => ({ pid: entry.process.pid, starttime: entry.process.starttime, status: entry.admission }))
    cleanup.origins = owned.map((entry) => {
      const parent = ledger.get(entry.origin!.parent ?? "")?.process
      return { pid: entry.process.pid, starttime: entry.process.starttime, via: entry.origin!.via,
        parent_pid: parent?.pid ?? null, parent_starttime: parent?.starttime ?? null, observed_at: entry.origin!.observed_at }
    })
    lastOwn = live.filter((entry) => ledger.get(key(entry))?.origin).map(identity)
    return lastOwn
  }
  // Trusted fixtures intentionally make their own /proc unreadable. The private
  // live subreaper receipt retains the boundary until strict shutdown scans.
  let unitActive = input.observationMode === "unit_after_exit"
  const checkedScan = () => {
    let confirmed = false
    scanning = scanning.then(async () => {
      const started = Date.now()
      try { await readReceipt(); if (!unitActive) await scan(); confirmed = true }
      finally {
        cleanup.observations ??= { count: 0, max_duration_ms: 0 }
        cleanup.observations.count++
        cleanup.observations.max_duration_ms = Math.max(cleanup.observations.max_duration_ms, Date.now() - started)
      }
    }).catch((error) => { cleanup.error ??= message(error) })
    return scanning.then(() => confirmed)
  }
  await checkedScan()
  // Browser launch argv can be replaced within tens of milliseconds. Sample
  // the admission window faster; do not enqueue stale scans when /proc is slow.
  let pollPending = false, nextPoll = 0
  const poll = setInterval(() => {
    if (stopped || pollPending || Date.now() < nextPoll) return
    pollPending = true
    const started = Date.now()
    void checkedScan().finally(() => {
      const fast = ![...ledger.values()].some((entry) => entry.origin?.via === "cli") ||
        browser && (!cleanup.browserBindings?.length || cleanup.runtimeDirectories.some((directory) =>
          !cleanup.browserBindings?.some((binding) => binding.runtimeDirectory === directory)) || cleanup.unknownProcesses?.length)
      const interval = fast ? 10 : 100
      cleanup.polling ??= []
      if (cleanup.polling.at(-1)?.interval_ms !== interval)
        cleanup.polling.push({ interval_ms: interval, observed_at: new Date().toISOString() })
      nextPoll = started + interval
      pollPending = false
    })
  }, 10)
  let sandboxTerminated = false
  const signalOwned = async (signal: NodeJS.Signals, wrappers = false) => {
    // A fresh full pass before each syscall checks membership as well as birth.
    // Newly admitted descendants are handled by the next shutdown pass.
    if (!await checkedScan()) return
    const candidates = [...ledger.keys()]
    for (const candidate of candidates) {
      if (Date.now() >= deadline) { cleanup.error ??= "Process cleanup deadline exceeded"; return }
      if (!await checkedScan()) return
      const tracked = ledger.get(candidate)!
      const saved = tracked.process
      if (tracked.admission !== "allowed" || !tracked.origin || root && key(saved) === key(root)) continue
      // bwrap does not forward signals. Killing either reaper first bypasses
      // the CLI's package cleanup through --die-with-parent.
      if (isWrapper(saved) !== wrappers) continue
      try {
        // Individual signals avoid signaling a recycled PGID or an unknown member.
        const signaled = await signalProcess(saved, signal)
        if (wrappers && saved.pid === cliPid && signaled) sandboxTerminated = true
      } catch (error) {
        if (!gone(error)) { tracked.admission = "refused"; cleanup.error ??= message(error) }
      }
    }
  }
  let budgetEnded: () => void = () => {}
  const budget = new Promise<void>((resolve) => { budgetEnded = resolve })
  const timer = setTimeout(() => { timedOut = true; budgetEnded() }, input.timeoutMs)
  const abort = () => { interrupted = true; budgetEnded() }
  input.signal?.addEventListener("abort", abort, { once: true })
  if (input.signal?.aborted) abort()
  await Promise.race([exited, budget])
  unitActive = false
  clearTimeout(timer)
  input.signal?.removeEventListener("abort", abort)
  const deadline = Date.now() + 60_000
  if (timedOut || interrupted) {
    await signalOwned("SIGINT")
    await Promise.race([exited, Bun.sleep(30_000)])
  }
  await signalOwned("SIGTERM")
  const remaining = async (wrappers = false) => {
    // A failed pass is not an empty proof. Refuse the transition without
    // waiting on a stale snapshot or signaling identities we cannot inspect.
    if (!await checkedScan()) return []
    return lastOwn.filter((entry) => (!root || key(entry) !== key(root)) && ledger.get(key(entry))?.admission === "allowed" && isWrapper(entry) === wrappers)
  }
  const soft = Math.min(deadline, Date.now() + 5_000)
  while ((await remaining()).length && Date.now() < soft) await Bun.sleep(100)
  if ((await remaining()).length) await signalOwned("SIGKILL")
  while ((await remaining()).length && Date.now() < deadline) await Bun.sleep(100)
  if ((await remaining()).length) cleanup.error ??= "Owned processes did not terminate"
  if (wrapper) {
    await signalOwned("SIGTERM", true)
    const wrapperDeadline = Math.min(deadline, Date.now() + 5_000)
    while ((await remaining(true)).length && Date.now() < wrapperDeadline) await Bun.sleep(100)
    if ((await remaining(true)).length) await signalOwned("SIGKILL", true)
    while ((await remaining(true)).length && Date.now() < deadline) await Bun.sleep(100)
    if ((await remaining(true)).length) cleanup.error ??= "Sandbox processes did not terminate"
  }
  await checkedScan()
  if (root) await signalProcess(identity(root), "SIGTERM").catch((error) => { cleanup.error ??= message(error) })
  const launcherDeadline = Math.min(deadline, Date.now() + 5_000)
  while (proc.exitCode === null && proc.signalCode === null && Date.now() < launcherDeadline) await Bun.sleep(100)
  if (root && proc.exitCode === null && proc.signalCode === null) {
    await checkedScan()
    await signalProcess(identity(root), "SIGKILL").catch((error) => { cleanup.error ??= message(error) })
  }
  stopped = true
  clearInterval(poll)
  await scanning
  cleanup.verification = []
  for (const pass of [0, 1]) {
    if (pass) await Bun.sleep(100)
    await checkedScan()
    cleanup.verification.push({ observed_at: new Date().toISOString(), owned_remaining: lastOwn.length })
    if (lastOwn.length) cleanup.error ??= "Owned process remains at final verification"
  }
  if (cleanup.unknownProcesses?.length) cleanup.error ??= `Unexplained browser/helper PID ${cleanup.unknownProcesses[0]!.pid}`
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
    await file.close().catch(() => { cleanup.error ??= "Output capture close failed"; cleanup.capture_complete = false })
  }
  if (cleanup.error) cleanup.status = "failed"
  const result = { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"),
    exitCode: cliExitCode ?? proc.exitCode ?? -1, timedOut, interrupted, startedAt, durationMs: Date.now() - startedAt,
    processCleanup: cleanup,
    sandboxError: input.sandbox ? sandboxError ?? (!sandboxStarted ||
      (sandboxExitCode === null || sandboxExitCode !== cliExitCode) &&
      !(sandboxTerminated && (timedOut || interrupted) && cliExitCode !== undefined && cliExitCode >= 128)
      ? "SANDBOX_EXECUTION_FAILED" : null) : null }
  if (input.outDir) {
    await Bun.write(path.join(input.outDir, "process-cleanup.json"), JSON.stringify(cleanup, null, 2)).catch(() => {
      cleanup.status = "failed"; cleanup.error ??= "Process evidence persistence failed"
    })
  }
  await rm(path.join(capsule, "command.json"), { force: true }).catch(() => {
    cleanup.status = "failed"; cleanup.error ??= "Private command transport release failed"
  })
  if (cleanup.status === "confirmed") await rm(capsule, { recursive: true, force: true }).catch(() => {
    cleanup.status = "failed"; cleanup.error ??= "Launcher transport release failed"
  })
  if (marker && cleanup.status === "confirmed") await rm(marker, { force: true }).catch(() => {
    cleanup.status = "failed"; cleanup.error ??= "Process registration release failed"
  })
  return result
}
