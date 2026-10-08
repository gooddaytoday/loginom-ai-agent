import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { evalsRoot } from "../src/config"
import { observeWriterReleaseSettlement, superviseProcess } from "../src/process-supervisor"

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-writer-settlement-"))
  const profile = path.join(root, "profile")
  const runtime = path.join(profile, "loginom/runtime/generations/1/chats/fixture/attempts/one")
  await mkdir(runtime, { recursive: true })
  await mkdir(path.join(profile, ".writer"))
  await Bun.write(path.join(profile, ".writer/owner"), "fixture-original-owner")
  const writer = await stat(path.join(profile, ".writer"))
  const acquired = new Date().toISOString()
  const run = await superviseProcess({ cmd: [process.execPath, "-e", "await Bun.sleep(100);process.exit(0)"], cwd: evalsRoot,
    env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5_000 })
  expect(run.processCleanup.status).toBe("confirmed")
  // Synthetic historical error only in this fixture; identities and ancestry are actual captures.
  const original = { ...run.processCleanup, status: "failed" as const, error: "Writer owner unavailable",
    runtimeDirectories: [runtime], writer: { device: writer.dev, inode: writer.ino, owner: "fixture-original-owner" } }
  await rm(path.join(profile, ".writer"), { recursive: true })
  return { root, profile, original, acquired, dispose: () => rm(root, { recursive: true, force: true }) }
}

test("writer-release settlement creates a separate fresh two-pass proof without changing the original error", async () => {
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

test("writer-release settlement refuses other errors, unknown identities and incomplete capture", async () => {
  const f = await fixture()
  try {
    for (const change of [{ error: "Process identity changed" }, { capture_complete: false },
      { unknownProcesses: [f.original.processes[0]!] }, { verification: [{ observed_at: new Date().toISOString(), owned_remaining: 1 }] }])
      await expect(observeWriterReleaseSettlement(f.profile, { ...f.original, ...change }, f.acquired)).rejects.toThrow("ineligible")
    await expect(observeWriterReleaseSettlement(f.profile, { ...f.original, admissions: [] }, f.acquired)).rejects.toThrow("ancestry")
  } finally { await f.dispose() }
})

test("writer-release settlement refuses a changed writer and unknown runtime directory", async () => {
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
    await expect(observeWriterReleaseSettlement(f.profile, f.original, f.acquired)).rejects.toThrow("busy or foreign")
    expect(child.exitCode).toBeNull()
  } finally { child.kill("SIGTERM"); await exited; await f.dispose() }
})

test("writer-release settlement refuses an inaccessible native process", async () => {
  const f = await fixture()
  const ready = path.join(f.root, "ready")
  const child = spawn(process.execPath, ["-e", `process.title='loginom-ai-protected';
    const {dlopen,ptr}=await import('bun:ffi'); const lib=dlopen('libc.so.6',{prctl:{args:['i32','u64','u64','u64','u64'],returns:'i32'}});
    const name=Buffer.from('loginom-ai-test\\0');
    if(lib.symbols.prctl(15,BigInt(ptr(name)),0,0,0)!==0 || lib.symbols.prctl(4,0,0,0,0)!==0)process.exit(2);
    await Bun.write(${JSON.stringify(ready)},'ready');setTimeout(()=>process.exit(0),1000);`], { stdio: "ignore" })
  const exited = new Promise(resolve => child.once("exit", resolve))
  try {
    while (!await Bun.file(ready).exists() && child.exitCode === null) await Bun.sleep(10)
    expect(await Bun.file(ready).exists()).toBe(true)
    await expect(observeWriterReleaseSettlement(f.profile, f.original, f.acquired)).rejects.toThrow("Cannot inspect process identity")
  } finally { await exited; await f.dispose() }
})
