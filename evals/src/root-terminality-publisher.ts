import path from "node:path"
import { closeSync, constants, fstatSync, fchmodSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from "node:fs"
import { dlopen } from "bun:ffi"
import { tryCampaignLock } from "./campaign-lock"
import { terminalCensus } from "./terminal-census"
import { validateWitnessSource } from "./witness-source"
import { assertFixedSources, assertStandalonePolicy, assertWitnessHost, digest, loadRootPolicy, parseRootWitness, witnessRoot, type RootPolicy, type RootWitness } from "./root-terminality-policy"

export async function requireInactiveUnits(policy: RootPolicy) {
  for (const unit of [policy.batchUnit, policy.campaignUnit]) {
    const properties = await unitProperties(unit)
    if (properties.ActiveState !== "inactive" || properties.MainPID !== "0") throw Error("ROOT_WITNESS_UNIT_BUSY")
  }
  try { lstatSync(policy.ownerFile); throw Error("ROOT_WITNESS_OWNER_PRESENT") }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
}
export async function publishRootTerminality(commandId: string) {
  if (process.getuid?.() !== 0 || process.geteuid?.() !== 0) throw Error("ROOT_PUBLISHER_REQUIRED")
  const { policy, policySha256 } = loadRootPolicy(commandId)
  assertWitnessHost(policy)
  const executable = (file: string, expected: string) => {
    protectedDirectory(path.dirname(file))
    const stat = lstatSync(file)
    if (!stat.isFile() || stat.uid !== 0 || stat.mode & 0o022 || stat.nlink !== 1 || digest(readFileSync(file)) !== expected)
      throw Error("ROOT_PUBLISHER_ARTIFACT")
  }
  executable(policy.observer.binary, policy.observer.binarySha256)
  executable(policy.observer.bundle, policy.observer.bundleSha256)
  if (process.execPath !== policy.observer.binary || process.argv[1] !== policy.observer.bundle || process.argv.length !== 3 ||
    process.argv[2] !== commandId || Object.keys(process.env).some(k => /^(LD_|BUN_OPTIONS$|NODE_OPTIONS$)/.test(k))) throw Error("ROOT_PUBLISHER_ARTIFACT")
  const invocation = process.env.INVOCATION_ID
  const properties = await unitProperties(policy.observer.unit)
  const cgroup = readFileSync("/proc/self/cgroup", "utf8").trim()
  if (!invocation || !/^[a-f0-9]{32}$/.test(invocation) || properties.InvocationID !== invocation || properties.Delegate !== "no" ||
    properties.MainPID !== String(process.pid) || properties.Id !== policy.observer.unit || !["active", "activating"].includes(properties.ActiveState ?? "") ||
    cgroup !== `0::/system.slice/${policy.observer.unit}` || properties.ControlGroup !== `/system.slice/${policy.observer.unit}`)
    throw Error("ROOT_PUBLISHER_INVOCATION")
  const group = `/sys/fs/cgroup${properties.ControlGroup}`
  protectedDirectory(group)
  for (let current = group; current.startsWith("/sys/fs/cgroup"); current = path.dirname(current)) {
    for (const name of ["cgroup.procs", "cgroup.threads"]) {
      const stat = lstatSync(path.join(current, name))
      if (stat.uid !== 0 || stat.mode & 0o022 || !stat.isFile()) throw Error("ROOT_PUBLISHER_DELEGATED")
    }
  }
  if (readFileSync(path.join(group, "cgroup.procs"), "utf8").trim() !== String(process.pid)) throw Error("ROOT_PUBLISHER_PEER")
  protectedDirectory(witnessRoot)
  validateWitnessSource(policy.controllerLock) // Never create a replacement lockfile.
  const release = await tryCampaignLock(policy.controllerLock.file)
  if (!release) throw Error("ROOT_WITNESS_LOCK_BUSY")
  try {
    validateWitnessSource(policy.controllerLock)
    await requireInactiveUnits(policy)
    assertStandalonePolicy(policy)
    validateWitnessSource(policy.server)
    for (const slot of policy.slots) {
      validateWitnessSource(slot.composite); validateWitnessSource(slot.reservation)
      if (slot.registration) validateWitnessSource(slot.registration)
      else requireAbsent(`${slot.profile}.process-group`)
    }
    // Libraries and native lock initialization are complete before the fence.
    // Only this independently root-provisioned invocation is exempt, never callers.
    const self = identity(process.pid), threads = threadIdentities()
    const census = terminalCensus("/proc", policy.owner.starttime, [self])
    if (JSON.stringify(threads) !== JSON.stringify(threadIdentities()) || JSON.stringify(self) !== JSON.stringify(identity(process.pid)) ||
      readFileSync(path.join(group, "cgroup.procs"), "utf8").trim() !== String(process.pid)) throw Error("ROOT_PUBLISHER_IDENTITY_CHANGED")
    assertWitnessHost(policy); assertFixedSources(policy)
    validateWitnessSource(policy.server)
    for (const slot of policy.slots) {
      validateWitnessSource(slot.composite); validateWitnessSource(slot.reservation)
      if (slot.registration) validateWitnessSource(slot.registration)
      else requireAbsent(`${slot.profile}.process-group`)
    }
    validateWitnessSource(policy.controllerLock)
    const witness = parseRootWitness({ version: 1, kind: "root-terminality", policySha256, invocation, observer: self, ...census })
    publishWitnessFile(path.join(witnessRoot, `${commandId}.json`), witness)
  } finally { await release() }
}

/** Publication only; callers establish root identity and provenance first. */
export function publishWitnessFile(file: string, witness: RootWitness) {
  if (process.getuid?.() !== 0 || path.dirname(file) !== witnessRoot) throw Error("ROOT_PUBLISHER_REQUIRED")
  parseRootWitness(witness)
  protectedDirectory(witnessRoot)
  const directory = openSync(witnessRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  const library = dlopen("libc.so.6", { renameat2: { args: ["i32", "cstring", "i32", "cstring", "u32"], returns: "i32" } })
  const temporary = `.${path.basename(file)}.${crypto.randomUUID()}.tmp`
  const temporaryFile = path.join(witnessRoot, temporary)
  try {
    const fd = openSync(temporaryFile, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644)
    try { writeFileSync(fd, JSON.stringify(witness)); fchmodSync(fd, 0o444); fsyncSync(fd) } finally { closeSync(fd) }
    if (library.symbols.renameat2(directory, Buffer.from(temporary + "\0"), directory, Buffer.from(path.basename(file) + "\0"), 1) !== 0)
      throw Error("ROOT_WITNESS_PUBLICATION_REFUSED")
    fsyncSync(directory)
    if (fstatSync(directory).ino !== lstatSync(witnessRoot).ino) throw Error("ROOT_WITNESS_DIRECTORY_CHANGED")
  } finally { library.close(); closeSync(directory) }
}
function protectedDirectory(directory: string) {
  if (!path.isAbsolute(directory) || realpathSync(directory) !== directory) throw Error("ROOT_PUBLISHER_PATH")
  for (let current = directory;; current = path.dirname(current)) {
    const stat = lstatSync(current)
    if (!stat.isDirectory() || stat.uid !== 0 || stat.mode & 0o022) throw Error("ROOT_PUBLISHER_PATH")
    if (current === "/") break
  }
}
function identity(pid: number, file = `/proc/${pid}/stat`) {
  const text = readFileSync(file, "utf8"), birth = text.slice(text.lastIndexOf(") ") + 2).split(/\s+/)[19]
  if (!text.startsWith(`${pid} (`) || !birth || !/^[0-9]+$/.test(birth)) throw Error("ROOT_PUBLISHER_IDENTITY")
  return { pid, starttime: birth }
}
function threadIdentities() {
  return readdirSync("/proc/self/task").map(tid => identity(Number(tid), `/proc/self/task/${tid}/stat`)).sort((a, b) => a.pid - b.pid)
}
function requireAbsent(file: string) {
  try { lstatSync(file); throw Error("ROOT_WITNESS_REGISTRATION_CHANGED") }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
}
export async function assertRecoveryInvocation() {
  const unit = "loginom-lab191-recovery.service", properties = await unitProperties(unit)
  if (properties.Id !== unit || properties.Delegate !== "no" || properties.MainPID !== String(process.pid) ||
    !/^[a-f0-9]{32}$/.test(process.env.INVOCATION_ID ?? "") || properties.InvocationID !== process.env.INVOCATION_ID ||
    !["active", "activating"].includes(properties.ActiveState ?? "") ||
    readFileSync("/proc/self/cgroup", "utf8").trim() !== `0::/system.slice/${unit}` || properties.ControlGroup !== `/system.slice/${unit}`)
    throw Error("ROOT_RECOVERY_INVOCATION")
  const group = `/sys/fs/cgroup${properties.ControlGroup}`
  protectedDirectory(group)
  for (let directory = group; directory.startsWith("/sys/fs/cgroup"); directory = path.dirname(directory))
    for (const name of ["cgroup.procs", "cgroup.threads"]) {
      const info = lstatSync(path.join(directory, name))
      if (!info.isFile() || info.uid !== 0 || info.mode & 0o022) throw Error("ROOT_RECOVERY_DELEGATED")
    }
}
async function unitProperties(unit: string) {
  const child = Bun.spawn(["/usr/bin/systemctl", "show", unit, "--property=Id,ActiveState,InvocationID,Delegate,MainPID,ControlGroup"],
    { env: { PATH: "/usr/bin:/bin", LC_ALL: "C" }, stdout: "pipe", stderr: "ignore", timeout: 5000 })
  const [code, text] = await Promise.all([child.exited, new Response(child.stdout).text()])
  if (code !== 0) throw Error("ROOT_WITNESS_UNIT_UNKNOWN")
  return Object.fromEntries(text.trim().split("\n").map(row => row.split("=")))
}
