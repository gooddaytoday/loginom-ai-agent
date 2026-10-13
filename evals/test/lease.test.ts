import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireHarnessLease, acquireResourceLease, recoverResourceLease, retireRecordedHarnessLease, writeLeaseReceipt } from "../src/lease"
import type { Reservation } from "../src/lease"
import { superviseProcess } from "../src/process-supervisor"

async function resourceFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-lease-"))
  const lockRoot = path.join(root, "locks")
  await mkdir(lockRoot, { mode: 0o700 })
  const journal = path.join(root, "journal.json")
  await writeFile(journal, "{}", { mode: 0o600 })
  return { root, request: { key: "server:container", lockRoot, journal, commandId: "run-one" } }
}

test("resource lease: another Bun process cannot acquire the same OS guard", async () => {
  const item = await resourceFixture()
  const lease = await acquireResourceLease(item.request)
  try {
    const child = Bun.spawn([process.execPath, "-e", `const {acquireResourceLease}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/lease.ts"))});
      try {await acquireResourceLease(${JSON.stringify(item.request)});process.exit(4)} catch(error) {console.log(error.message);process.exit(2)}`], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(2)
    expect(await new Response(child.stdout).text()).toContain("BUSY")
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: SIGKILL frees guard but retained reservation blocks a new run", async () => {
  const item = await resourceFixture()
  const child = Bun.spawn([process.execPath, "-e", `const {acquireResourceLease}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/lease.ts"))});
    await acquireResourceLease(${JSON.stringify(item.request)});console.log("READY");setInterval(()=>{},1000)`], { stdout: "pipe", stderr: "pipe" })
  try {
    const reader = child.stdout.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("READY")
    reader.releaseLock()
    child.kill("SIGKILL")
    await child.exited
    await expect(acquireResourceLease(item.request)).rejects.toThrow("RECOVERY_REQUIRED")
  } finally { child.kill("SIGKILL"); await child.exited; await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: only matching confirmed evidence releases durable ownership", async () => {
  const item = await resourceFixture()
  const lease = await acquireResourceLease(item.request)
  try {
    const proof = path.join(item.root, "proof.json")
    await writeFile(proof, JSON.stringify({ version: 2, status: "unknown", key: item.request.key, token: lease.reservation.token, revision: lease.reservation.revision }), { mode: 0o600 })
    await expect(lease.release(proof)).rejects.toThrow("LEASE_RELEASE_UNCONFIRMED")
    await writeFile(proof, JSON.stringify({ version: 2, status: "confirmed", key: item.request.key, token: lease.reservation.token, revision: lease.reservation.revision }), { mode: 0o600 })
    await lease.release(proof)
    const next = await acquireResourceLease({ ...item.request, commandId: "run-two" })
    expect(next.reservation.token).not.toBe(lease.reservation.token)
    expect(next.reservation.revision).toBe(2)
    await next.close()
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: private canonical lock root and journal are required before acquisition", async () => {
  const item = await resourceFixture()
  try {
    await chmod(item.request.lockRoot, 0o755)
    await expect(acquireResourceLease(item.request)).rejects.toThrow("LEASE_LOCK_ROOT")
    await chmod(item.request.lockRoot, 0o700)
    await chmod(item.request.journal, 0o644)
    await expect(acquireResourceLease(item.request)).rejects.toThrow("LEASE_JOURNAL")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: replacing the guard inode cannot authorize release", async () => {
  const item = await resourceFixture()
  const lease = await acquireResourceLease(item.request)
  try {
    const guard = lease.guardFile
    await rename(guard, `${guard}.old`)
    await writeFile(guard, "", { mode: 0o600 })
    const proof = path.join(item.root, "proof.json")
    await writeFile(proof, JSON.stringify({ version: 2, status: "confirmed", key: item.request.key, token: lease.reservation.token, revision: lease.reservation.revision }), { mode: 0o600 })
    await expect(lease.release(proof)).rejects.toThrow("LEASE_GUARD_CHANGED")
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: corrupt or foreign released reservations never allow a new run", async () => {
  const item = await resourceFixture()
  const lease = await acquireResourceLease(item.request)
  await lease.close()
  try {
    for (const value of ["invalid json", JSON.stringify({ state: "released" }), JSON.stringify({ ...lease.reservation, state: "released", key: "foreign" })]) {
      await writeFile(lease.receipt, value, { mode: 0o600 })
      await expect(acquireResourceLease(item.request)).rejects.toThrow("LEASE_RESERVATION_INVALID")
    }
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: only one concurrent recovery CAS accepts the current token and revision", async () => {
  const item = await resourceFixture()
  try {
    const module = JSON.stringify(path.resolve(import.meta.dir, "../src/lease.ts"))
    const owner = Bun.spawn([process.execPath, "-e", `const {acquireResourceLease}=await import(${module});const lease=await acquireResourceLease(${JSON.stringify(item.request)});console.log(JSON.stringify(lease.reservation));await lease.close()`], { stdout: "pipe", stderr: "pipe" })
    const saved: Reservation = JSON.parse(await new Response(owner.stdout).text())
    expect(await owner.exited).toBe(0)
    const outcomes = await Promise.all(["recover-one", "recover-two"].map(async commandId => {
      const child = Bun.spawn([process.execPath, "-e", `const {recoverResourceLease}=await import(${module});try {
        const lease=await recoverResourceLease(${JSON.stringify({ ...item.request, commandId })},${JSON.stringify({ token: saved.token, revision: saved.revision })});
        console.log(JSON.stringify(lease.reservation));await lease.close()
      } catch(error) {console.log(error.message);process.exitCode=2}`], { stdout: "pipe", stderr: "pipe" })
      return { code: await child.exited, text: await new Response(child.stdout).text() }
    }))
    expect(outcomes.map(item => item.code).sort()).toEqual([0, 2])
    expect(JSON.parse(outcomes.find(item => item.code === 0)!.text).state).toBe("recovery-only")
    await expect(recoverResourceLease(item.request, { token: saved.token, revision: saved.revision })).rejects.toThrow("LEASE_CAS_STALE")
    await expect(acquireResourceLease(item.request)).rejects.toThrow("RECOVERY_REQUIRED")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: interrupted recovery keeps lineage and rejects a foreign incident", async () => {
  const item = await resourceFixture()
  try {
    const module = JSON.stringify(path.resolve(import.meta.dir, "../src/lease.ts"))
    const owner = Bun.spawn([process.execPath, "-e", `const {acquireResourceLease}=await import(${module});const lease=await acquireResourceLease(${JSON.stringify(item.request)});console.log(JSON.stringify(lease.reservation));await lease.close()`], { stdout: "pipe", stderr: "pipe" })
    const incident: Reservation = JSON.parse(await new Response(owner.stdout).text())
    expect(await owner.exited).toBe(0)
    const recovery = Bun.spawn([process.execPath, "-e", `const {recoverResourceLease}=await import(${module});const lease=await recoverResourceLease(${JSON.stringify(item.request)},${JSON.stringify({ token: incident.token, revision: incident.revision })});console.log(JSON.stringify(lease.reservation));await lease.close()`], { stdout: "pipe", stderr: "pipe" })
    const current: Reservation = JSON.parse(await new Response(recovery.stdout).text())
    expect(await recovery.exited).toBe(0)
    await expect(recoverResourceLease(item.request, { token: current.token, revision: current.revision, incidentToken: "foreign" })).rejects.toThrow("LEASE_LINEAGE_INVALID")
    const next = await recoverResourceLease(item.request, { token: current.token, revision: current.revision, incidentToken: incident.token })
    expect(next.reservation.state).toBe("recovery-only")
    expect(next.reservation.revision).toBe(3)
    expect(next.reservation.lineage[0]!.owner).toEqual(incident.owner)
    expect(next.reservation.lineage[0]!.commandId).toBe(incident.commandId)
    await next.close()
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: guard FD is not inherited by an executed child", async () => {
  const item = await resourceFixture()
  const lease = await acquireResourceLease(item.request)
  try {
    const child = Bun.spawn([process.execPath, "-e", `const {readdir,readlink}=await import('node:fs/promises');console.log(JSON.stringify(await Promise.all((await readdir('/proc/self/fd')).map(fd=>readlink('/proc/self/fd/'+fd).catch(()=>null)))))`], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    expect(await new Response(child.stdout).text()).not.toContain(lease.guardFile)
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: recovery checks live owner and missing original journal", async () => {
  const item = await resourceFixture()
  const lease = await acquireResourceLease(item.request)
  await lease.close()
  try {
    await expect(recoverResourceLease(item.request, { token: lease.reservation.token, revision: lease.reservation.revision })).rejects.toThrow("BUSY")
    const alternate = path.join(item.root, "recovery.json")
    await writeFile(alternate, "{}", { mode: 0o600 })
    await rm(item.request.journal)
    await expect(recoverResourceLease({ ...item.request, journal: alternate }, { token: lease.reservation.token, revision: lease.reservation.revision })).rejects.toThrow("LEASE_JOURNAL")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: a corrupt lineage cannot authorize recovery", async () => {
  const item = await resourceFixture()
  const lease = await acquireResourceLease(item.request)
  await lease.close()
  try {
    await writeFile(lease.receipt, JSON.stringify({ ...lease.reservation,
      lineage: [{ token: "foreign", revision: 999, journal: item.request.journal, commandId: item.request.commandId, owner: lease.reservation.owner }] }), { mode: 0o600 })
    await expect(recoverResourceLease(item.request, { token: lease.reservation.token, revision: lease.reservation.revision })).rejects.toThrow("LEASE_LINEAGE_INVALID")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: server restart with the same container ID cannot change the recovery fence", async () => {
  const item = await resourceFixture()
  const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
    studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }
  try {
    const owner = Bun.spawn([process.execPath, "-e", `const {acquireResourceLease}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/lease.ts"))});
      const lease=await acquireResourceLease(${JSON.stringify({ ...item.request, identity })});console.log(JSON.stringify(lease.reservation));await lease.close()`], { stdout: "pipe", stderr: "pipe" })
    const saved: Reservation = JSON.parse(await new Response(owner.stdout).text())
    expect(await owner.exited).toBe(0)
    const restarted = { ...identity, startedAt: "2026-10-13T11:00:00Z", serverEpoch: "e".repeat(64) }
    await expect(acquireResourceLease({ ...item.request, identity: restarted })).rejects.toThrow("RECOVERY_REQUIRED")
    await expect(recoverResourceLease({ ...item.request, identity: restarted }, { token: saved.token, revision: saved.revision })).rejects.toThrow("LEASE_SERVER_GENERATION_CHANGED")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test.each(["pid-reuse", "old-boot"])("resource lease: %s permits recovery-only ownership without treating a current process as its owner", async kind => {
  const item = await resourceFixture()
  const lease = await acquireResourceLease(item.request)
  await lease.close()
  try {
    await writeFile(lease.receipt, JSON.stringify({ ...lease.reservation, owner: { ...lease.reservation.owner,
      ...(kind === "pid-reuse" ? { starttime: String(BigInt(lease.reservation.owner.starttime) + 1n) } : { bootId: crypto.randomUUID() }) } }), { mode: 0o600 })
    const recovery = await recoverResourceLease(item.request, { token: lease.reservation.token, revision: lease.reservation.revision })
    expect(recovery.reservation.state).toBe("recovery-only")
    expect(recovery.reservation.owner.pid).toBe(process.pid)
    await recovery.close()
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: SIGKILL after durable release permits a new run", async () => {
  const item = await resourceFixture()
  const child = Bun.spawn([process.execPath, "-e", `const {acquireResourceLease,writeLeaseReceipt}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/lease.ts"))});
    const lease=await acquireResourceLease(${JSON.stringify(item.request)});const proof=${JSON.stringify(path.join(item.root, "proof.json"))};
    await writeLeaseReceipt(proof,{version:2,status:"confirmed",key:lease.reservation.key,token:lease.reservation.token,revision:lease.reservation.revision});
    await lease.release(proof);console.log("RELEASED");setInterval(()=>{},1000)`], { stdout: "pipe", stderr: "pipe" })
  try {
    const reader = child.stdout.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("RELEASED")
    reader.releaseLock()
    child.kill("SIGKILL")
    await child.exited
    const next = await acquireResourceLease({ ...item.request, commandId: "run-two" })
    expect(next.reservation.revision).toBe(2)
    await next.close()
  } finally { child.kill("SIGKILL"); await child.exited; await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: different servers cannot bypass one judge-home key", async () => {
  const item = await resourceFixture()
  const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
    studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }
  const request = { ...item.request, key: `judge:${path.join(item.root, "judge-home")}`, identity }
  const lease = await acquireResourceLease(request)
  try {
    const child = Bun.spawn([process.execPath, "-e", `const {acquireResourceLease}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/lease.ts"))});
      try {await acquireResourceLease(${JSON.stringify({ ...request, identity: { ...identity, containerId: "f".repeat(64) } })});process.exitCode=4}
      catch(error) {console.log(error.message);process.exitCode=2}`], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(2)
    expect(await new Response(child.stdout).text()).toContain("BUSY")
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("resource lease: a replaced owner snapshot cannot release with the old token", async () => {
  const item = await resourceFixture()
  const lease = await acquireResourceLease(item.request)
  try {
    await writeLeaseReceipt(lease.receipt, { ...lease.reservation, owner: { ...lease.reservation.owner, starttime: String(BigInt(lease.reservation.owner.starttime) + 1n) } })
    const proof = path.join(item.root, "proof.json")
    await writeFile(proof, JSON.stringify({ version: 2, status: "confirmed", key: item.request.key, token: lease.reservation.token, revision: lease.reservation.revision }), { mode: 0o600 })
    await expect(lease.release(proof)).rejects.toThrow("LEASE_RELEASE_UNCONFIRMED")
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("lease: второй harness не допускается, release проверяет свой owner", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-lease-"))
  const lease = await acquireHarnessLease(profile)
  try {
    await expect(acquireHarnessLease(profile)).rejects.toThrow("harness lease")
    expect(await Bun.file(path.join(profile, ".writer", "owner")).exists()).toBe(false)
    await lease.release()
    const next = await acquireHarnessLease(profile)
    await Bun.write(path.join(`${profile}.harness-lease`, "owner.json"), JSON.stringify({ nonce: "foreign" }))
    await expect(next.release()).rejects.toThrow("identity changed")
  } finally {
    await rm(`${profile}.harness-lease`, { recursive: true, force: true })
    await rm(profile, { recursive: true, force: true })
  }
})

test("recorded harness lease needs its exact admission and continuous cleanup proof after owner exit", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evals-lease-retire-"))
  const profile = path.join(directory, "profile")
  const receipt = path.join(directory, "admission.json")
  try {
    const module = path.resolve(import.meta.dir, "../src/lease.ts")
    const process = await superviseProcess({ cmd: [Bun.which("bun")!, "-e", `const {acquireHarnessLease}=await import(${JSON.stringify(module)});await acquireHarnessLease(${JSON.stringify(profile)},${JSON.stringify(receipt)});`],
      cwd: directory, env: { PATH: Bun.env.PATH! }, timeoutMs: 5_000 })
    expect(process.exitCode).toBe(0)
    await expect(retireRecordedHarnessLease(profile, receipt, { ...process.processCleanup, status: "failed" })).rejects.toThrow("cleanup")
    expect(await Bun.file(path.join(`${profile}.harness-lease`, "owner.json")).exists()).toBe(true)
    await retireRecordedHarnessLease(profile, receipt, process.processCleanup)
    const next = await acquireHarnessLease(profile)
    await next.release()
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("lease: путь профиля и его symlink не допускают два harness", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evals-lease-alias-"))
  const profile = path.join(directory, "profile")
  const alias = path.join(directory, "alias")
  await mkdir(profile)
  await symlink(profile, alias)
  const lease = await acquireHarnessLease(profile)
  try {
    await expect(acquireHarnessLease(alias)).rejects.toThrow("harness lease")
    await lease.release()
    const next = await acquireHarnessLease(alias)
    try {
      expect(next.directory).toBe(`${profile}.harness-lease`)
      await expect(acquireHarnessLease(profile)).rejects.toThrow("harness lease")
    } finally { await next.release() }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
