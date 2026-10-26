import { beforeAll, expect, test } from "bun:test"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { childEnvironment } from "../src/child-environment"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { closeUserSessions, openLoginomAdmin } from "../src/loginom-admin"
import { inspectUserStorage, readServerIdentity } from "../src/parallel-pair"
import { verifyAdminRuntime } from "../src/preflight"
import { superviseProcess } from "../src/process-supervisor"
import { assertSessionBackupEmpty, cleanupSlotStorage } from "../src/slot-storage"
import { acquireEnvironmentLeases, loadSlots } from "../src/slots"
import { readUserPreparation } from "../src/user-environment"

const live = process.env.EVAL_ADMIN_LIVE_CONFIG ? test : test.skip
const results = { isolation: false, peer: false, cleanup: false, unknown: false }

beforeAll(async () => {
  if (!process.env.EVAL_ADMIN_LIVE_CONFIG) return
  const binary = process.env.EVAL_CLI_BIN!
  const file = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG, 2)
  const identity = await readServerIdentity(file), runtime = await verifyAdminRuntime(binary)
  const commandId = crypto.randomUUID(), runId = `live-ab-${commandId}`
  const root = path.join(path.dirname(file.controller.stateDir), "evidence", runId)
  await mkdir(root, { mode: 0o700 })
  console.error(`Live A/B evidence: ${root}`)
  const journal = path.join(file.controller.stateDir, `run-command-${commandId}.json`)
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId, identity,
    phase: "cli_admitted", runDir: root, slotIds: file.slots.map(slot => slot.id),
    attempts: file.slots.map((slot, index) => ({ slotId: slot.id, taskId: "probe", attempt: index + 1 })) })
  const environment = await acquireEnvironmentLeases(file, 2, identity, journal)
  const clients: Promise<Awaited<ReturnType<typeof superviseProcess>>>[] = []
  const cleanups: { lease: typeof environment.slots[number]; proof: string }[] = []
  let admin: Awaited<ReturnType<typeof openLoginomAdmin>> | undefined
  const prefix = (index: number) => `eval-${runId}-probe-${index + 1}`
  const name = (index: number) => `${prefix(index)}.csv`
  const wait = async (target: string) => {
    const deadline = Date.now() + 60000
    while (!await Bun.file(target).exists()) {
      if (Date.now() > deadline) throw Error(`Live barrier missing: ${path.basename(target)}`)
      await Bun.sleep(50)
    }
  }
  const storage = async (index: number) => {
    const lease = environment.slots[index]!
    const prepared = await readUserPreparation(file, lease, path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`))
    return inspectUserStorage(file, identity, lease.slot, prepared.nonce)
  }
  try {
    admin = await openLoginomAdmin(file, identity, { binary, serverLease: environment.server })
    await admin.inspectPoolPolicy()
    await assertSessionBackupEmpty(file, identity)
    for (const [index, lease] of environment.slots.entries()) {
      expect((await storage(index)).entries).toEqual([])
      const directory = path.join(root, lease.slot.id)
      await mkdir(directory, { mode: 0o700 })
      const attempt = path.join(root, "probe", String(index + 1))
      await mkdir(attempt, { recursive: true, mode: 0o700 })
      const secretFile = path.join(file.controller.stateDir, `prepare-${lease.slot.id}.secret.json`)
      const credentials = await readLeaseReceipt(secretFile) as { password: string }
      const spec = path.join(directory, "client.json")
      await writeLeaseReceipt(spec, { resources: runtime.resources, browser: runtime.browser, url: file.server.url,
        secretFile, directory,
        peerDirectory: path.join(root, environment.slots[1 - index]!.slot.id), peer: environment.slots[1 - index]!.slot.username,
        name: name(index), peerName: name(1 - index), checkPeerSurvival: index === 1 })
      const pending = superviseProcess({ cmd: [runtime.node, path.resolve(import.meta.dir, "../fixtures/parallel-slot-client.mjs"), spec],
        cwd: root, env: { ...childEnvironment(process.env), HOME: root, TMPDIR: "/home/kiselev/storage/tmp" }, timeoutMs: 120000,
        outDir: directory, captureSecrets: [credentials.password], owner: { kind: "slot", id: lease.slot.id } })
        .then(async result => { await writeLeaseReceipt(path.join(attempt, "cleanup.json"), { processes: result.processCleanup }); return result })
      void pending.catch(() => {})
      clients.push(pending)
    }
    const [a, b] = environment.slots
    for (const lease of environment.slots) {
      await wait(path.join(root, lease.slot.id, "isolation.json"))
      expect(await Bun.file(path.join(root, lease.slot.id, "isolation.json")).json()).toEqual({ denied: [true, true, true], own: [65, 66, 67] })
    }
    results.isolation = true
    const before = (await admin.inspectSessionInventory()).sessions.map(row => row.name).sort()
    expect(before.some(value => value.startsWith(a!.slot.username + ":"))).toBe(true)
    expect(before.some(value => value.startsWith(b!.slot.username + ":"))).toBe(true)
    await Bun.write(path.join(root, a!.slot.id, "stop"), "stop")
    const completed = await clients[0]!
    expect(completed.exitCode).toBe(0)
    expect(completed.processCleanup.status).toBe("confirmed")
    await expect(cleanupSlotStorage(file, environment.server, a!, admin,
      { ...completed.processCleanup, unknownProcesses: [completed.processCleanup.processes[0]!] }, [prefix(0)]))
      .rejects.toThrow("SLOT_PROCESS_CLEANUP_UNCONFIRMED")
    expect((await storage(0)).entries.map(entry => entry.name)).toEqual([name(0)])
    expect((await storage(1)).entries.map(entry => entry.name)).toEqual([name(1)])
    results.unknown = true
    const retained = (await admin.inspectSessionInventory()).sessions.filter(row => row.name.startsWith(a!.slot.username + ":"))
    expect(retained.length).toBeGreaterThan(0)
    expect(retained.every(row => row.pendingDisconnect)).toBe(true)
    await closeUserSessions(admin, a!.slot.username)
    const after = (await admin.inspectSessionInventory()).sessions.map(row => row.name).sort()
    expect(after).toEqual(before.filter(value => !value.startsWith(a!.slot.username + ":")))
    expect((await storage(0)).entries.map(entry => entry.name)).toEqual([name(0)])
    const cleaned = await cleanupSlotStorage(file, environment.server, a!, admin, completed.processCleanup, [prefix(0)])
    expect(cleaned.removed).toEqual([name(0)])
    expect((await storage(0)).entries).toEqual([])
    results.cleanup = true
    await Bun.write(path.join(root, b!.slot.id, "check"), "check")
    await wait(path.join(root, b!.slot.id, "survived.json"))
    expect(await Bun.file(path.join(root, b!.slot.id, "survived.json")).json()).toEqual({ size: 3, bytes: [65, 66, 67], username: b!.slot.username })
    results.peer = true
    await Bun.write(path.join(root, b!.slot.id, "stop"), "stop")
    const peer = await clients[1]!
    expect(peer.exitCode).toBe(0)
    expect(peer.processCleanup.status).toBe("confirmed")
    await cleanupSlotStorage(file, environment.server, b!, admin, peer.processCleanup, [prefix(1)])
    for (const lease of environment.slots) {
      const proof = path.join(root, `cleanup-${lease.slot.id}.json`)
      await writeLeaseReceipt(proof, { version: 2, status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token,
        serverEpoch: identity.serverEpoch, processes: "confirmed", serverSessions: "confirmed", archive: "committed",
        storageDeletionAllowed: true, nextAdmissionAllowed: true })
      cleanups.push({ lease, proof })
    }
    await writeLeaseReceipt(path.join(root, "result.json"), { identity, results })
  } finally {
    await Promise.all(environment.slots.map(lease => Bun.write(path.join(root, lease.slot.id, "stop"), "stop").catch(() => {})))
    await Promise.allSettled(clients)
    await admin?.dispose()
    for (const cleanup of cleanups) await cleanup.lease.release(cleanup.proof)
    if (cleanups.length === 2) {
      const proof = path.join(root, "cleanup-server.json")
      await writeLeaseReceipt(proof, { version: 2, status: "confirmed", key: environment.server.reservation.key,
        token: environment.server.reservation.token, revision: environment.server.reservation.revision, serverEpoch: identity.serverEpoch })
      await environment.server.release(proof)
    }
    await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())])
  }
}, 180000)

live("A/B cannot read each other's real server files", () => { expect(results.isolation).toBe(true) })
live("closing A preserves B session and readable canary", () => { expect(results.peer).toBe(true) })
live("A deletion follows its session close and readback", () => { expect(results.cleanup).toBe(true) })
live("unknown process ownership leaves both real file sets unchanged", () => { expect(results.unknown).toBe(true) })
