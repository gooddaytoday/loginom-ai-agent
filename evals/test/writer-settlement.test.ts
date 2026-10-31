import { expect, test } from "bun:test"

const processDenial = process.env.EVAL_PROCESS_DENIAL_TESTS === "1" ? test : test.skip
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, readlink, rm, stat } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { evalsRoot } from "../src/config"
import { observeWriterReleaseSettlement, supervisedProcesses, superviseProcess } from "../src/process-supervisor"

// Successful settlement and later validation branches require a clean native stand.
// Foreign-process rejection is covered below and must still run on a busy host.
const nativeBusy = (await Bun.$`ps -u ${process.getuid?.() ?? ""} -o comm=`.quiet().nothrow()).text()
  .split("\n").some(name => /^(?:loginom-ai-|chrome|chromium)/.test(name.trim()))

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-writer-settlement-"))
  const profile = path.join(root, "profile")
  const runtime = path.join(profile, "loginom/runtime/generations/1/chats/fixture/attempts/one")
  await mkdir(runtime, { recursive: true })
  await mkdir(path.join(profile, ".writer"))
  await Bun.write(path.join(profile, ".writer/owner"), "fixture-original-owner")
  const writer = await stat(path.join(profile, ".writer"))
  const acquired = new Date().toISOString()
  // A short-lived CLI can exit before the source proof captures its ancestry.
  const input = new TransformStream<Uint8Array, Uint8Array>()
  const writerInput = input.writable.getWriter()
  const pending = superviseProcess({ cmd: [process.execPath, "-e", "await Bun.stdin.text()"], cwd: evalsRoot,
    env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5_000, outDir: root, stdin: input.readable, owner: { kind: "command", id: root } })
  try {
    const deadline = Date.now() + 5000
    while (!supervisedProcesses().scopes.some(scope => scope.owner.id === root && scope.processes?.some(entry =>
      entry.pid !== scope.launcher.pid && entry.executable === process.execPath))) {
      if (Date.now() > deadline) throw Error("Writer fixture CLI admission did not arrive")
      await Bun.sleep(10)
    }
  } finally { await writerInput.close(); await pending }
  const run = await pending
  expect(run.processCleanup.status).toBe("confirmed")
  expect(run.processCleanup.origins?.map(entry => entry.via)).toContain("cli")
  // Synthetic historical error only in this fixture; identities and ancestry are actual captures.
  const original = { ...run.processCleanup, status: "failed" as const, error: "Writer owner unavailable",
    runtimeDirectories: [runtime], writer: { device: writer.dev, inode: writer.ino, owner: "fixture-original-owner" } }
  await rm(path.join(profile, ".writer"), { recursive: true })
  return { root, profile, original, acquired, dispose: () => rm(root, { recursive: true, force: true }) }
}

test.skipIf(nativeBusy)("writer-release settlement creates a separate fresh two-pass proof without changing the original error", async () => {
  const f = await fixture()
  try {
    const before = JSON.stringify(f.original)
    const fresh = await observeWriterReleaseSettlement(f.profile, f.original, f.acquired)
    expect(fresh.status).toBe("confirmed")
    expect(fresh.observation_mode).toBe("writer_release_settlement")
    expect(fresh.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
    expect(fresh.settlement?.passes.map(pass => pass.native_remaining)).toEqual([0, 0])
    expect(fresh.verification?.every(pass => Date.parse(pass.observed_at) >= Date.parse(f.acquired))).toBe(true)
    expect(JSON.stringify(f.original)).toBe(before)
  } finally { await f.dispose() }
})

test("writer-release settlement refuses cyclic ancestry even with zero old final passes", async () => {
  const f = await fixture()
  try {
    const processes = f.original.processes
    const original = { ...f.original, origins: processes.map((p, i) => ({ pid: p.pid, starttime: p.starttime,
      via: "parent" as const, parent_pid: processes[(i + 1) % processes.length]!.pid,
      parent_starttime: processes[(i + 1) % processes.length]!.starttime, observed_at: new Date().toISOString() })) }
    await expect(observeWriterReleaseSettlement(f.profile, original, f.acquired)).rejects.toThrow("ancestry")
  } finally { await f.dispose() }
})

test.skipIf((await stat("/proc/1")).uid === process.getuid?.())("writer-release refusal records the foreign proc UID and birth without signaling it", async () => {
  const f = await fixture()
  try {
    const info = await stat("/proc/1"), raw = await readFile("/proc/1/stat", "utf8")
    const birth = raw.slice(raw.lastIndexOf(")") + 2).split(" ")[19]!
    expect(info.uid).not.toBe(process.getuid!())
    // A false historical claim must be refused by this read-only API; PID 1 is never signaled.
    const foreign = { ...f.original.processes[0]!, pid: 1, starttime: birth, parent: 0, group: 1, session: 1 }
    const source = { ...f.original, processes: [...f.original.processes, foreign],
      admissions: [...f.original.admissions!, { pid: 1, starttime: birth, status: "allowed" as const }],
      origins: [...f.original.origins!, { pid: 1, starttime: birth, via: "parent" as const,
        parent_pid: f.original.launcher!.pid, parent_starttime: f.original.processes.find(p => p.pid === f.original.launcher!.pid)!.starttime,
        observed_at: new Date().toISOString() }] }
    const before = JSON.stringify(source)
    await expect(observeWriterReleaseSettlement(f.profile, source, f.acquired)).rejects.toThrow(new RegExp(
      `Cannot inspect process identity PID 1: Process UID changed \\(proc_uid=${info.uid}, starttime=${birth}, state=[A-Z]\\)`))
    expect(JSON.stringify(source)).toBe(before)
    expect((await stat("/proc/1")).uid).toBe(info.uid)
  } finally { await f.dispose() }
})

test("writer-release settlement refuses other errors, unknown identities and incomplete capture", async () => {
  const f = await fixture()
  try {
    for (const change of [{ error: "Process identity changed" }, { capture_complete: false },
      { unknownProcesses: [f.original.processes[0]!] }, { verification: [{ observed_at: new Date().toISOString(), owned_remaining: 1 }] }])
      await expect(observeWriterReleaseSettlement(f.profile, { ...f.original, ...change }, f.acquired)).rejects.toThrow("ineligible")
    await expect(observeWriterReleaseSettlement(f.profile, { ...f.original, admissions: [] }, f.acquired)).rejects.toThrow("ancestry")
  } finally { await f.dispose() }
})

test.skipIf(nativeBusy)("writer-release settlement refuses a changed writer and unknown runtime directory", async () => {
  const f = await fixture()
  try {
    await Bun.write(path.join(f.profile, ".writer/owner"), "foreign-owner")
    await expect(observeWriterReleaseSettlement(f.profile, f.original, f.acquired)).rejects.toThrow("writer identity")
    await rm(path.join(f.profile, ".writer"), { recursive: true })
    await mkdir(path.join(f.profile, "loginom/runtime/generations/1/chats/fixture/attempts/foreign"))
    await expect(observeWriterReleaseSettlement(f.profile, f.original, f.acquired)).rejects.toThrow("runtime directories")
  } finally { await f.dispose() }
})

test("writer-release settlement refuses a live foreign native process without signaling it", async () => {
  const f = await fixture()
  const ready = path.join(f.root, "ready")
  const child = spawn(Bun.which("node")!, ["-e", `process.title='loginom-ai-foreign'; require('node:fs').writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000)`], { stdio: "ignore" })
  const exited = new Promise(resolve => child.once("exit", resolve))
  try {
    while (!await Bun.file(ready).exists()) await Bun.sleep(10)
    expect(child.exitCode).toBeNull()
    // On a busy host an unreadable native process can refuse the census before the readable child.
    await expect(observeWriterReleaseSettlement(f.profile, f.original, f.acquired)).rejects.toThrow(
      /^(?:Writer-release processes busy or foreign$|Cannot inspect process identity PID \d+:)/)
    expect(child.exitCode).toBeNull()
  } finally { child.kill("SIGTERM"); await exited; await f.dispose() }
})

processDenial("writer-release settlement refuses an inaccessible native process", async () => {
  const f = await fixture()
  const ready = path.join(f.root, "ready")
  const child = spawn(process.execPath, ["-e", `process.title='loginom-ai-protected';
    const {dlopen,ptr}=await import('bun:ffi'); const lib=dlopen('libc.so.6',{prctl:{args:['i32','u64','u64','u64','u64'],returns:'i32'}});
    const name=Buffer.alloc(16);name.write('loginom-ai-test');
    if(lib.symbols.prctl(15,BigInt(ptr(name)),0,0,0)!==0 || lib.symbols.prctl(4,0,0,0,0)!==0)process.exit(2);
    process.stdin.resume();process.stdin.on('end',()=>process.exit(0));
    setTimeout(()=>process.exit(3),10000);await Bun.write(${JSON.stringify(ready)},'ready');`], { stdio: ["pipe", "ignore", "ignore"] })
  const exited = new Promise(resolve => child.once("exit", resolve))
  try {
    while (!await Bun.file(ready).exists() && child.exitCode === null) await Bun.sleep(10)
    expect(await Bun.file(ready).exists()).toBe(true)
    expect(child.exitCode).toBeNull()
    expect((await stat(`/proc/${child.pid}`)).uid).toBe(process.getuid!())
    const raw = await readFile(`/proc/${child.pid}/stat`, "utf8")
    expect(raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")"))).toBe("loginom-ai-test")
    const fields = raw.slice(raw.lastIndexOf(")") + 2).split(" ")
    expect(["Z", "X"]).not.toContain(fields[0])
    await expect(readlink(`/proc/${child.pid}/exe`)).rejects.toMatchObject({ code: "EACCES" })
    await expect(observeWriterReleaseSettlement(f.profile, f.original, f.acquired)).rejects.toThrow("Cannot inspect process identity")
    expect(child.exitCode).toBeNull()
    const after = await readFile(`/proc/${child.pid}/stat`, "utf8")
    expect(after.slice(after.lastIndexOf(")") + 2).split(" ")[19]).toBe(fields[19])
    await expect(readlink(`/proc/${child.pid}/exe`)).rejects.toMatchObject({ code: "EACCES" })
  } finally { child.stdin!.end(); await exited; await f.dispose() }
})
