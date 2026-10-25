import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireEnvironmentLeases, loadSlots, parseSlots, reopenEnvironmentLeases } from "../src/slots"
import { globalLockRoot, readLeaseReceipt, readResourceReservation, writeLeaseReceipt } from "../src/lease"


const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-slots-"))
  const value = {
    version: 2,
    server: { container: "server", studioContainer: "studio", url: "http://127.0.0.1:32771/app/", network: "eval", alias: "loginom-server-7.4.2-test", storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
    controller: { stateDir: `${root}/controller`, adminCredentialsFile: `${root}/secrets/admin.json` },
    judge: { codexHome: `${root}/judge` },
    slots: ["a", "b"].map(id => ({ id, username: `eval-${id}`, profileDir: `${root}/${id}/profile`, workspaceRoot: `${root}/${id}/work`, historyDir: `${root}/${id}/history` })),
  }
  await Promise.all([value.controller.stateDir, path.dirname(value.controller.adminCredentialsFile), value.judge.codexHome,
    ...value.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])].map(dir => mkdir(dir, { recursive: true, mode: 0o700 })))
  await writeFile(value.controller.adminCredentialsFile, "{}", { mode: 0o600 })
  await writeFile(path.join(value.controller.stateDir, "run-journal.json"), JSON.stringify({ version: 2, commandId: "slot-run" }), { mode: 0o600 })
  await mkdir(path.join(root, "locks"), { mode: 0o700 })
  return { root, value }
}

test("startup reopens only the exact prepared environment without changing its tokens", async () => {
  const item = await fixture()
  const locks = path.join(item.root, "locks")
  const journal = path.join(item.value.controller.stateDir, "prepare-command.json")
  await writeFile(journal, JSON.stringify({ version: 2, kind: "unactivated-preparation", phase: "unactivated", commandId: "startup-fixture", identity, slotIds: ["a", "b"] }), { mode: 0o600 })
  try {
    const child = Bun.spawn([process.execPath, "-e", `const {acquireEnvironmentLeases}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});const env=await acquireEnvironmentLeases(${JSON.stringify(item.value)},2,${JSON.stringify(identity)},${JSON.stringify(journal)},${JSON.stringify(locks)});await Promise.all([env.server.close(),...env.slots.map(s=>s.close())])`], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    const before = await Promise.all((await readdir(item.value.controller.stateDir)).filter(name => name.endsWith(".lease.json")).map(name => Bun.file(path.join(item.value.controller.stateDir, name)).text()))
    const reopened = (await reopenEnvironmentLeases(parseSlots(item.value, 2), identity, locks))!
    try {
      expect(reopened.slots.map(slot => slot.slot.id)).toEqual(["a", "b"])
      await Promise.all(reopened.slots.map(slot => slot.assertHeld()))
      expect((await Promise.all(reopened.slots.map(slot => Bun.file(slot.receipt).text()))).sort()).toEqual(before.sort())
      expect(reopened.server.reservation.lineage).toEqual([])
    } finally { await Promise.all([reopened.server.close(), ...reopened.slots.map(slot => slot.close())]) }
    await expect(reopenEnvironmentLeases(parseSlots(item.value, 2), { ...identity, serverEpoch: "changed" }, locks)).rejects.toThrow("STARTUP_OWNERSHIP_UNCONFIRMED")
  } finally { await rm(item.root, { recursive: true }) }
})

test("slots: two different users share one server", async () => {
  const item = await fixture()
  try {
    expect(parseSlots(item.value, 2).slots.map(slot => slot.username)).toEqual(["eval-a", "eval-b"])
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("slots: profile roots cannot expose permanent global guards", async () => {
  const item = await fixture()
  try {
    for (const profileDir of [globalLockRoot, path.dirname(globalLockRoot), path.join(globalLockRoot, "profile")])
      await expect(() => parseSlots({ ...item.value, slots: item.value.slots.map((slot, index) =>
        index === 0 ? { ...slot, profileDir } : slot) }, 2)).toThrow("SLOT_PATH_OVERLAP")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("slots: a duplicate user in an inactive slot is refused", async () => {
  const item = await fixture()
  try {
    expect(() => parseSlots({ ...item.value, slots: item.value.slots.map(slot => ({ ...slot, username: "eval-a" })) }, 1)).toThrow("SLOT_USER_DUPLICATE")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("slots: unsupported versions and slot counts fail admission", async () => {
  const item = await fixture()
  try {
    expect(() => parseSlots({ ...item.value, version: 1 }, 2)).toThrow("SLOTS_VERSION")
    expect(() => parseSlots(item.value, 3)).toThrow("SLOT_COUNT")
    expect(() => parseSlots(item.value, 0)).toThrow("SLOT_COUNT")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("slots: malformed configuration and unsafe user identities fail with exit 2", async () => {
  const item = await fixture()
  try {
    const invalid = [null, {}, { ...item.value, server: null }, { ...item.value, slots: null },
      { ...item.value, slots: item.value.slots.map(slot => ({ ...slot, username: "../user" })) },
      { ...item.value, slots: item.value.slots.map(slot => ({ ...slot, id: "same" })) }]
    invalid.forEach(value => expect(() => parseSlots(value, 1)).toThrow(expect.objectContaining({ exitCode: 2 })))
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("slots: all private paths must be absolute and disjoint", async () => {
  const item = await fixture()
  try {
    expect(() => parseSlots({ ...item.value, controller: { ...item.value.controller, stateDir: "relative" } }, 2)).toThrow("SLOT_PATH_ABSOLUTE")
    expect(() => parseSlots({ ...item.value, judge: { codexHome: item.value.slots[0]!.profileDir + "/nested" } }, 2)).toThrow("SLOT_PATH_OVERLAP")
    expect(() => parseSlots({ ...item.value, auth: { sharedDir: item.value.slots[1]!.historyDir } }, 1)).toThrow("SLOT_PATH_OVERLAP")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("loadSlots: symlink aliases cannot hide an inactive overlapping root", async () => {
  const item = await fixture()
  try {
    const alias = path.join(item.root, "alias")
    await symlink(item.value.slots[0]!.profileDir, alias)
    await writeFile(path.join(item.root, "slots.json"), JSON.stringify({ ...item.value,
      slots: [item.value.slots[0], { ...item.value.slots[1], workspaceRoot: `${alias}/new/work` }] }), { mode: 0o600 })
    await expect(loadSlots(path.join(item.root, "slots.json"), 1)).rejects.toThrow("SLOT_PATH_OVERLAP")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("loadSlots: private configuration and credentials are required without creating roots", async () => {
  const item = await fixture()
  try {
    const file = path.join(item.root, "slots.json")
    await writeFile(file, JSON.stringify(item.value), { mode: 0o644 })
    await expect(loadSlots(file, 2)).rejects.toThrow("SLOTS_FILE_PRIVATE")
    await chmod(file, 0o600)
    expect((await loadSlots(file, 2)).slots).toEqual(item.value.slots)
    await chmod(item.value.controller.adminCredentialsFile, 0o644)
    await expect(loadSlots(file, 2)).rejects.toThrow("SLOT_PATH_PRIVATE")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("loadSlots: a credential symlink is refused even when its target is private", async () => {
  const item = await fixture()
  try {
    const alias = path.join(item.root, "admin-alias.json")
    await symlink(item.value.controller.adminCredentialsFile, alias)
    const file = path.join(item.root, "slots.json")
    await writeFile(file, JSON.stringify({ ...item.value, controller: { ...item.value.controller, adminCredentialsFile: alias } }), { mode: 0o600 })
    await expect(loadSlots(file, 2)).rejects.toThrow("SLOT_PATH_PRIVATE")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("loadSlots: canonicalizes missing children without filesystem mutations", async () => {
  const item = await fixture()
  try {
    const file = path.join(item.root, "slots.json")
    const slots = item.value.slots.map(slot => ({ ...slot, workspaceRoot: `${slot.workspaceRoot}/new/../pending/work` }))
    await writeFile(file, JSON.stringify({ ...item.value, slots }), { mode: 0o600 })
    expect((await loadSlots(file, 2)).slots[0]!.workspaceRoot).toBe(`${item.value.slots[0]!.workspaceRoot}/pending/work`)
    expect(await Bun.file(`${item.value.slots[0]!.workspaceRoot}/pending/work`).exists()).toBe(false)
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("loadSlots: agent paths cannot contain installed resources or the slots file", async () => {
  const item = await fixture()
  try {
    const file = path.join(item.root, "slots.json")
    await writeFile(file, JSON.stringify(item.value), { mode: 0o600 })
    await expect(loadSlots(file, 2, `${item.value.slots[0]!.profileDir}/install`)).rejects.toThrow("SLOT_PATH_OVERLAP")
    const inside = path.join(item.value.slots[0]!.profileDir, "slots.json")
    await writeFile(inside, JSON.stringify(item.value), { mode: 0o600 })
    await expect(loadSlots(inside, 2)).rejects.toThrow("SLOT_PATH_OVERLAP")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("slots: server roots and route cannot expose credentials or arbitrary cleanup roots", async () => {
  const item = await fixture()
  try {
    const invalid = [{ storageRoot: "/" }, { backupRoot: "/workdir" }, { url: "http://admin:secret@localhost/app/" }, { url: "file:///tmp/studio" }, { url: "invalid" }]
    invalid.forEach(server => expect(() => parseSlots({ ...item.value, server: { ...item.value.server, ...server } }, 2)).toThrow("SLOTS_SERVER"))
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("loadSlots: a profile symlink is refused even with a private disjoint target", async () => {
  const item = await fixture()
  try {
    const alias = path.join(item.root, "profile-alias")
    await symlink(item.value.slots[0]!.profileDir, alias)
    const file = path.join(item.root, "slots.json")
    await writeFile(file, JSON.stringify({ ...item.value, slots: [{ ...item.value.slots[0], profileDir: alias }, item.value.slots[1]] }), { mode: 0o600 })
    await expect(loadSlots(file, 2)).rejects.toThrow("SLOT_PATH_PRIVATE")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("environment leases: a stopped controller retains run reservations without slot recovery", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 2)
  const lockRoot = path.join(item.root, "locks")
  try {
    const journal = path.join(file.controller.stateDir, "prepare-command.json")
    await writeFile(journal, JSON.stringify({ version: 2, commandId: "prepare-command" }), { mode: 0o600 })
    const before = await Bun.file(path.join(file.controller.stateDir, "run-journal.json")).text()
    const child = Bun.spawn([process.execPath, "-e", `const {acquireEnvironmentLeases}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});
      const env=await acquireEnvironmentLeases(${JSON.stringify(file)},2,${JSON.stringify(identity)},${JSON.stringify(journal)},${JSON.stringify(lockRoot)});
      await env.server.assertHeld();for(const slot of env.slots)await slot.assertHeld();
      console.log(JSON.stringify(env.slots.map(slot=>slot.receipt)));
      await env.server.close();for(const slot of env.slots)await slot.close()`], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    expect(await new Response(child.stderr).text()).toBe("")
    const incidents: string[] = JSON.parse(await new Response(child.stdout).text())
    expect(incidents).toHaveLength(2)
    expect(await Bun.file(path.join(file.controller.stateDir, "run-journal.json")).text()).toBe(before)
    const server = await readResourceReservation({ key: `server:${identity.containerId}`, lockRoot })
    expect(server).toMatchObject({ state: "retained", journal, commandId: "prepare-command" })
    for (const incident of incidents)
      expect(await readLeaseReceipt(incident)).toMatchObject({ journal, commandId: "prepare-command", state: "retained" })
    const { acquireEnvironmentLeases } = await import("../src/slots")
    await expect(acquireEnvironmentLeases(file, 2, identity, journal, lockRoot)).rejects.toThrow("RECOVERY_REQUIRED")
    expect(await readResourceReservation({ key: `server:${identity.containerId}`, lockRoot })).toEqual(server)
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("environment leases: a clean profile releases while its peer and the server remain guarded", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 2)
  const lockRoot = path.join(item.root, "locks")
  const journal = path.join(file.controller.stateDir, "run-journal.json")
  const { acquireEnvironmentLeases } = await import("../src/slots")
  const environment = await acquireEnvironmentLeases(file, 2, identity, journal, lockRoot)
  const lease = environment.slots[0]!
  try {
    const cleanup = path.join(file.controller.stateDir, "codec-cleanup.json")
    // Data-only cleanup tests the release codec; no native actor has been admitted.
    await writeFile(cleanup, JSON.stringify({ status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: identity.serverEpoch,
      processes: "confirmed", serverSessions: "confirmed", archive: "committed", storageDeletionAllowed: true, nextAdmissionAllowed: true }), { mode: 0o600 })
    await lease.release(cleanup)
    expect(await readLeaseReceipt(lease.receipt)).toMatchObject({ state: "released", cleanupReceipt: cleanup })
    expect(await readResourceReservation({ key: `profile:${lease.slot.profileDir}`, lockRoot })).toMatchObject({ state: "released" })
    await environment.slots[1]!.assertHeld()
    await environment.server.assertHeld()
    await expect(acquireEnvironmentLeases(file, 2, identity, journal, lockRoot)).rejects.toThrow("BUSY")
  } finally {
    await Promise.all([environment.server.close(), ...environment.slots.map(slot => slot.close())])
    await rm(item.root, { recursive: true, force: true })
  }
})

test("environment leases: a changed command binding revokes slot authority without changing reservations", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  const lockRoot = path.join(item.root, "locks")
  const journal = path.join(file.controller.stateDir, "prepare-command.json")
  await writeFile(journal, JSON.stringify({ version: 2, commandId: "prepare-command" }), { mode: 0o600 })
  const { acquireEnvironmentLeases } = await import("../src/slots")
  const environment = await acquireEnvironmentLeases(file, 1, identity, journal, lockRoot)
  const lease = environment.slots[0]!
  try {
    const original = await readLeaseReceipt(lease.receipt) as { resources: { receipt: string }[] }
    const before = await Promise.all(original.resources.map(resource => Bun.file(resource.receipt).text()))
    const foreign = path.join(item.root, "foreign.json")
    const alias = path.join(file.controller.stateDir, "alias.json")
    await writeFile(foreign, JSON.stringify({ version: 2, commandId: "prepare-command" }), { mode: 0o600 })
    await symlink(foreign, alias)
    for (const untrusted of [null, 42, foreign, alias, path.join(file.controller.stateDir, "run-journal.json")]) {
      await writeFile(lease.receipt, JSON.stringify({ ...original, journal: untrusted }), { mode: 0o600 })
      await expect(lease.assertHeld()).rejects.toThrow("LEASE_NOT_HELD")
      expect(await Promise.all(original.resources.map(resource => Bun.file(resource.receipt).text()))).toEqual(before)
    }
    await writeFile(lease.receipt, JSON.stringify(original), { mode: 0o600 })
    await lease.assertHeld()
    await environment.server.assertHeld()
  } finally {
    await Promise.all([environment.server.close(), ...environment.slots.map(slot => slot.close())])
    await rm(item.root, { recursive: true, force: true })
  }
})

test("environment leases: run owns only server and profiles and slots require the server guard", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 2)
  const lockRoot = path.join(item.root, "locks")
  const journal = path.join(file.controller.stateDir, "run-journal.json")
  const { acquireEnvironmentLeases } = await import("../src/slots")
  const environment = await acquireEnvironmentLeases(file, 2, identity, journal, lockRoot)
  try {
    const reservations = await Array.fromAsync(new Bun.Glob("*.reservation.json").scan({ cwd: lockRoot, absolute: true }))
    const rows = await Promise.all(reservations.map(file => Bun.file(file).json() as Promise<{ key: string }>))
    expect(rows.map(row => row.key).sort()).toEqual([`server:${identity.containerId}`, ...file.slots.map(slot => `profile:${slot.profileDir}`)].sort())
    await expect(acquireEnvironmentLeases(file, 2, identity, journal, lockRoot)).rejects.toThrow("BUSY")
    for (const lease of environment.slots) await lease.assertHeld()
    await environment.server.close()
    await expect(environment.slots[0]!.assertHeld()).rejects.toThrow("LEASE_NOT_HELD")
  } finally {
    await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())])
    await rm(item.root, { recursive: true, force: true })
  }
})

test("admission finalizes a confirmed profile release interrupted before its slot receipt", async () => {
  const item = await interruptedSlotRelease()
  try {
    const previous = (await readResourceReservation({ key: `profile:${item.file.slots[0]!.profileDir}`, lockRoot: item.lockRoot }))!
    const proof = await Bun.file(previous.releaseEvidence!.path).text()
    await releaseFixtureServer(item)
    expect(await reopenEnvironmentLeases(item.file, identity, item.lockRoot)).toBeUndefined()
    const next = await acquireEnvironmentLeases(item.file, 1, identity, item.journal, item.lockRoot)
    try {
      await next.slots[0]!.assertHeld()
      expect(await readLeaseReceipt(item.receipt)).toMatchObject({ state: "released", cleanupReceipt: item.cleanup })
      expect(await Bun.file(previous.releaseEvidence!.path).text()).toBe(proof)
      expect(await readResourceReservation({ key: previous.key, lockRoot: item.lockRoot })).toMatchObject({
        state: "retained", revision: previous.revision + 1, lineage: [],
      })
    } finally { await Promise.all([next.server.close(), ...next.slots.map(slot => slot.close())]) }
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("admission preserves an interrupted slot when its cleanup or release binding is unconfirmed", async () => {
  const item = await interruptedSlotRelease()
  try {
    await releaseFixtureServer(item)
    const previous = (await readResourceReservation({ key: `profile:${item.file.slots[0]!.profileDir}`, lockRoot: item.lockRoot }))!
    const reservation = path.join(item.lockRoot, `${new Bun.CryptoHasher("sha256").update(previous.key).digest("hex")}.reservation.json`)
    const proof = await readLeaseReceipt(previous.releaseEvidence!.path) as Record<string, unknown>
    const cleanup = await readLeaseReceipt(item.cleanup) as Record<string, unknown>
    const composite = await Bun.file(item.receipt).text()
    for (const change of [{ cleanup: { ...cleanup, processes: "unknown" }, proof }, { cleanup, proof: { ...proof, token: "foreign" } },
      { cleanup: { ...cleanup, leaseToken: "foreign" }, proof }, { cleanup, proof: { ...proof, serverEpoch: "foreign" } }]) {
      await writeLeaseReceipt(item.cleanup, change.cleanup)
      const changed = { ...change.proof, cleanupReceiptHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(change.cleanup)).digest("hex") }
      await writeLeaseReceipt(previous.releaseEvidence!.path, changed)
      await writeLeaseReceipt(reservation, { ...previous, releaseEvidence: { path: previous.releaseEvidence!.path,
        sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(changed)).digest("hex") } })
      await expect(acquireEnvironmentLeases(item.file, 1, identity, item.journal, item.lockRoot)).rejects.toThrow("RECOVERY_FINALIZATION_REQUIRED")
      expect(await Bun.file(item.receipt).text()).toBe(composite)
      expect(await readResourceReservation({ key: `server:${identity.containerId}`, lockRoot: item.lockRoot })).toMatchObject({ state: "released" })
    }
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

async function releaseFixtureServer(item: Awaited<ReturnType<typeof interruptedSlotRelease>>) {
  const reopened = (await reopenEnvironmentLeases(item.file, identity, item.lockRoot))!
  try {
    expect(reopened.slots).toEqual([])
    // No native actors were admitted; exercise the same release used after startup cleanup.
    const cleanup = path.join(item.file.controller.stateDir, "startup-server.json")
    await writeLeaseReceipt(cleanup, { version: 2, status: "confirmed", key: reopened.server.reservation.key,
      token: reopened.server.reservation.token, revision: reopened.server.reservation.revision, serverEpoch: identity.serverEpoch })
    await reopened.server.release(cleanup)
  } finally { await reopened.server.close() }
}

async function interruptedSlotRelease(terminal = false) {
  const item = await fixture(), file = parseSlots(item.value, 1), lockRoot = path.join(item.root, "locks")
  const journal = path.join(file.controller.stateDir, "prepare-command.json")
  const cleanup = path.join(file.controller.stateDir, "slot-cleanup.json")
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "interrupted-release", identity, slotIds: ["a"] })
  const child = Bun.spawn([process.execPath, "-e", `
    const {acquireEnvironmentLeases}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});
    const {readLeaseReceipt,writeLeaseReceipt}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/lease.ts"))});
    const environment=await acquireEnvironmentLeases(${JSON.stringify(file)},1,${JSON.stringify(identity)},${JSON.stringify(journal)},${JSON.stringify(lockRoot)});
    const slot=environment.slots[0], retained=await readLeaseReceipt(slot.receipt);
    await writeLeaseReceipt(${JSON.stringify(cleanup)},{status:"confirmed",slotId:slot.slot.id,leaseToken:slot.token,serverEpoch:slot.identity.serverEpoch,
      processes:"confirmed",serverSessions:"confirmed",archive:"committed",storageDeletionAllowed:true,nextAdmissionAllowed:true,
      ...${JSON.stringify(terminal ? { version: 2, kind: "unused-verify-cancellation", commandId: "interrupted-release", archive: "unchanged-clean", storageDeletionAllowed: false, nextAdmissionAllowed: false, terminalOnly: true, profileClean: true, ownedStorageEmpty: true, serverFilesClosed: true, backupEmpty: true, adminDisposed: true } : {})}});
    await slot.release(${JSON.stringify(cleanup)});
    // Restore the last slot snapshot durable before a crash between resource.release and the final slot write.
    await writeLeaseReceipt(slot.receipt,retained);
    await environment.server.close();
    console.log(JSON.stringify({receipt:slot.receipt}));
  `], { stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  return { ...item, file, lockRoot, journal, cleanup, receipt: (JSON.parse(stdout) as { receipt: string }).receipt }
}

test("terminal verify cancellation releases a slot without benchmark readiness", async () => {
  const item = await fixture(), locks = path.join(item.root, "locks")
  const file = parseSlots(item.value, 1), journal = path.join(file.controller.stateDir, "verify-command-terminal.json")
  try {
    await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "terminal", identity, phase: "unactivated", slotIds: ["a"] })
    const env = await acquireEnvironmentLeases(file, 1, identity, journal, locks)
    const lease = env.slots[0]!, proof = path.join(file.controller.stateDir, "terminal-a.json")
    const evidence = { version: 2, kind: "unused-verify-cancellation", status: "confirmed", commandId: "terminal",
      slotId: "a", leaseToken: lease.token, serverEpoch: identity.serverEpoch, processes: "confirmed", serverSessions: "confirmed",
      archive: "unchanged-clean", storageDeletionAllowed: false, nextAdmissionAllowed: false,
      terminalOnly: true, profileClean: true, ownedStorageEmpty: true, serverFilesClosed: true, backupEmpty: true, adminDisposed: true }
    try {
      for (const invalid of [{ ...evidence, commandId: "foreign" }, { ...evidence, ownedStorageEmpty: false },
        { ...evidence, nextAdmissionAllowed: true }, { ...evidence, storageDeletionAllowed: true }, { ...evidence, adminDisposed: false }]) {
        await writeLeaseReceipt(proof, invalid)
        await expect(lease.release(proof)).rejects.toThrow("SLOT_RELEASE_UNCONFIRMED")
      }
      await writeLeaseReceipt(proof, evidence)
      await lease.release(proof)
      expect((await readResourceReservation({ key: `profile:${lease.slot.profileDir}`, lockRoot: locks }))?.state).toBe("released")
      expect(await readLeaseReceipt(proof)).toEqual(evidence)
    } finally { await lease.close(); await env.server.close() }
  } finally { await rm(item.root, { recursive: true }) }
})

test("admission finishes interrupted terminal release but does not change its readiness flags", async () => {
  const item = await interruptedSlotRelease(true)
  try {
    await releaseFixtureServer(item)
    const before = await Bun.file(item.cleanup).text()
    const env = await acquireEnvironmentLeases(item.file, 1, identity, item.journal, item.lockRoot)
    try { expect((await readLeaseReceipt(item.receipt) as { state: string }).state).toBe("released") }
    finally { await env.slots[0]!.close(); await env.server.close() }
    expect(await Bun.file(item.cleanup).text()).toBe(before)
  } finally { await rm(item.root, { recursive: true }) }
})
