import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rename, rm, stat, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { releaseStaleWriter } from "../src/profile"
import { superviseProcess, type OwnedRegistration } from "../src/process-supervisor"
import { evalsRoot } from "../src/config"
import { spawn } from "node:child_process"

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-owned-registration-"))
  const profile = path.join(root, "profile")
  const runtime = path.join(profile, "loginom/runtime/generations/1/chats/fixture/attempts/one")
  await mkdir(runtime, { recursive: true, mode: 0o700 }); await chmod(profile, 0o700)
  await Bun.write(path.join(profile, ".writer/owner"), "original-owner")
  const writer = await stat(path.join(profile, ".writer"))
  const acquiredAt = new Date().toISOString()
  const run = await superviseProcess({ cmd: [process.execPath, "-e", "await Bun.sleep(100)"], cwd: evalsRoot,
    env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000 })
  expect(run.processCleanup.status).toBe("confirmed")
  // Synthetic historical error in fixture only. All process/registration identities are real.
  const original = { ...run.processCleanup, status: "failed" as const, error: "Writer owner unavailable", runtimeDirectories: [runtime],
    writer: { device: writer.dev, inode: writer.ino, owner: "original-owner" } }
  await rm(path.join(profile, ".writer"), { recursive: true })
  const marker = `${profile}.process-group`
  await Bun.write(marker, String(original.launcher!.pid)); await chmod(marker, 0o600)
  const info = await stat(marker, { bigint: true })
  const registration: OwnedRegistration = { profile, acquiredAt, original, marker: {
    device: Number(info.dev), inode: Number(info.ino), uid: Number(info.uid), mode: Number(info.mode),
    bytes: String(original.launcher!.pid), mtimeNs: String(info.mtimeNs), ctimeNs: String(info.ctimeNs) } }
  return { root, profile, marker, registration, dispose: () => rm(root, { recursive: true, force: true }) }
}

test("owned registration releases the attested original marker with an already absent writer", async () => {
  const f = await fixture()
  try {
    const bytes = JSON.stringify(f.registration.original)
    expect(await releaseStaleWriter(f.profile, f.registration.original.writer, f.registration)).toBe(true)
    expect(await Bun.file(f.marker).exists()).toBe(false)
    expect(JSON.stringify(f.registration.original)).toBe(bytes)
  } finally { await f.dispose() }
})

for (const change of ["symlink", "replaced", "bytes", "mode", "owner", "foreign-pid", "foreign-profile", "missing-birth", "unknown-cleanup", "ancestry"])
  test(`owned registration refuses ${change} without deleting the marker`, async () => {
    const f = await fixture()
    try {
      const proof = structuredClone(f.registration)
      if (change === "symlink" || change === "replaced") {
        await rename(f.marker, f.marker+".original")
        if (change === "symlink") await symlink(f.marker+".original", f.marker)
        else { await Bun.write(f.marker, proof.marker.bytes); await chmod(f.marker, 0o600) }
      } else if (change === "bytes") await Bun.write(f.marker, proof.marker.bytes+"\n")
      else if (change === "mode") await chmod(f.marker, 0o644)
      else if (change === "owner") proof.marker.uid++
      else if (change === "foreign-pid") proof.marker.bytes="123456789"
      else if (change === "foreign-profile") proof.profile=f.root
      else if (change === "missing-birth") proof.original.processes.find(p=>p.pid===proof.original.launcher!.pid)!.starttime=""
      else if (change === "unknown-cleanup") proof.original.capture_complete=false
      else if (change === "ancestry") proof.original.origins=[]
      await expect(releaseStaleWriter(f.profile, proof.original.writer, proof)).rejects.toThrow()
      expect(await Bun.file(f.marker).exists()).toBe(true)
    } finally { await f.dispose() }
  })

test("owned registration refuses a profile alias and preserves the canonical marker", async () => {
  const f=await fixture()
  try {
    const alias=path.join(f.root,"alias");await symlink(f.profile,alias)
    await expect(releaseStaleWriter(alias,f.registration.original.writer,f.registration)).rejects.toThrow()
    expect(await Bun.file(f.marker).exists()).toBe(true)
  } finally { await f.dispose() }
})

test("owned registration refuses a live owner and never signals it", async () => {
  const f=await fixture()
  const ready=path.join(f.root,"ready")
  const child=spawn(process.execPath,["-e",`await Bun.write(${JSON.stringify(ready)},'ready');await Bun.sleep(60000)`],
    {cwd:f.profile,env:{PATH:process.env.PATH??""},stdio:"ignore",detached:true})
  const exited=new Promise(resolve=>child.once("exit",resolve))
  try {
    while(!await Bun.file(ready).exists())await Bun.sleep(10)
    await expect(releaseStaleWriter(f.profile,f.registration.original.writer,f.registration)).rejects.toThrow()
    expect(child.exitCode).toBeNull();expect(await Bun.file(f.marker).exists()).toBe(true)
  } finally { child.kill("SIGTERM");await exited;await f.dispose() }
})

test("owned registration refuses a reused launcher PID with different birth identity", async () => {
  const f=await fixture()
  try {
    const proof=structuredClone(f.registration),oldPid=proof.original.launcher!.pid
    // Current real PID stands in for reuse; the saved birth identity remains the exited launcher's.
    proof.original.launcher!.pid=process.pid
    for(const p of proof.original.processes)if(p.pid===oldPid)p.pid=process.pid
    for(const o of proof.original.origins!){if(o.pid===oldPid)o.pid=process.pid;if(o.parent_pid===oldPid)o.parent_pid=process.pid}
    for(const a of proof.original.admissions!)if(a.pid===oldPid)a.pid=process.pid
    await Bun.write(f.marker,String(process.pid));await chmod(f.marker,0o600)
    const info=await stat(f.marker,{bigint:true})
    proof.marker={...proof.marker,bytes:String(process.pid),mtimeNs:String(info.mtimeNs),ctimeNs:String(info.ctimeNs)}
    await expect(releaseStaleWriter(f.profile,proof.original.writer,proof)).rejects.toThrow()
    expect(await Bun.file(f.marker).exists()).toBe(true)
  } finally { await f.dispose() }
})

test("ordinary absent-writer cleanup cannot remove an unqualified registration", async () => {
  const f=await fixture()
  try {expect(await releaseStaleWriter(f.profile)).toBe(false);expect(await Bun.file(f.marker).exists()).toBe(true)}
  finally {await f.dispose()}
})
