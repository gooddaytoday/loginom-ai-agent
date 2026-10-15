import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireSlotLease, finalizeReleasedSlot, loadSlots, parseSlots, recoverSlotLease } from "../src/slots"
import { globalLockRoot, readLeaseReceipt, readResourceReservation } from "../src/lease"
import { stageUserPreparation } from "../src/user-environment"

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

test("SlotLease: different users can hold slots on the same container", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 2)
  const a = await acquireSlotLease(file, file.slots[0]!, identity, path.join(item.root, "locks"))
  try {
    const b = await acquireSlotLease(file, file.slots[1]!, identity, path.join(item.root, "locks"))
    expect([a.slot.username, b.slot.username]).toEqual(["eval-a", "eval-b"])
    await b.close()
  } finally { await a.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: a duplicate user with another profile refuses admission and releases unused guards", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 2)
  const a = await acquireSlotLease(file, file.slots[0]!, identity, path.join(item.root, "locks"))
  try {
    const duplicate = parseSlots({ ...item.value, slots: [{ ...item.value.slots[1], username: "eval-a" }] }, 1)
    await expect(acquireSlotLease(duplicate, duplicate.slots[0]!, identity, path.join(item.root, "locks"))).rejects.toThrow("BUSY")
    const other = parseSlots({ ...item.value, slots: [{ ...item.value.slots[1], username: "eval-c" }] }, 1)
    const c = await acquireSlotLease(other, other.slots[0]!, identity, path.join(item.root, "locks"))
    await c.close()
  } finally { await a.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: release needs confirmed cleanup bound to this slot token and server epoch", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  const lease = await acquireSlotLease(file, file.slots[0]!, identity, path.join(item.root, "locks"))
  try {
    const proof = path.join(item.root, "cleanup.json")
    const evidence = { status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: identity.serverEpoch,
      processes: "confirmed", serverSessions: "confirmed", archive: "committed", storageDeletionAllowed: true, nextAdmissionAllowed: true }
    await writeFile(proof, JSON.stringify({ ...evidence, leaseToken: "foreign" }), { mode: 0o600 })
    await expect(lease.release(proof)).rejects.toThrow("SLOT_RELEASE_UNCONFIRMED")
    await writeFile(proof, JSON.stringify(evidence), { mode: 0o600 })
    await lease.release(proof)
    const next = await acquireSlotLease(file, file.slots[0]!, identity, path.join(item.root, "locks"))
    expect(next.token).not.toBe(lease.token)
    await next.close()
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: released resource proofs finish a missing composite tombstone without new ownership", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  const lockRoot = path.join(item.root, "locks")
  const lease = await acquireSlotLease(file, file.slots[0]!, identity, lockRoot)
  try {
    const original = await readLeaseReceipt(lease.receipt) as { resources: { receipt: string }[] }
    const cleanup = path.join(item.root, "cleanup.json")
    // Data-only cleanup codec fixture; these assertions do not qualify native server cleanup.
    await writeFile(cleanup, JSON.stringify({ status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: identity.serverEpoch,
      processes: "confirmed", serverSessions: "confirmed", archive: "committed", storageDeletionAllowed: true, nextAdmissionAllowed: true }), { mode: 0o600 })
    await lease.release(cleanup)
    const before = await Promise.all(original.resources.map(resource => Bun.file(resource.receipt).text()))
    // Reconstruct the reachable state between resource releases and the final composite write.
    await writeFile(lease.receipt, JSON.stringify(original), { mode: 0o600 })
    const admission = await acquireSlotLease(file, file.slots[0]!, identity, lockRoot)
      .then(next => ({ lease: next, error: null }), (error: unknown) => ({ lease: null, error }))
    await admission.lease?.close()
    expect(admission.error instanceof Error ? admission.error.message : null).toBe("RECOVERY_FINALIZATION_REQUIRED")
    expect(await finalizeReleasedSlot(file, file.slots[0]!, identity, lease.receipt, lockRoot)).toMatchObject({ status: "released", cleanupReceipt: cleanup })
    expect(await readLeaseReceipt(lease.receipt)).toMatchObject({ state: "released", cleanupReceipt: cleanup })
    expect(await Promise.all(original.resources.map(resource => Bun.file(resource.receipt).text()))).toEqual(before)
    expect(await finalizeReleasedSlot(file, file.slots[0]!, identity, lease.receipt, lockRoot)).toMatchObject({ status: "already_released" })
    const originalCleanup = await Bun.file(cleanup).text()
    await writeFile(cleanup, JSON.stringify({ ...JSON.parse(originalCleanup), changed: true }), { mode: 0o600 })
    await expect(finalizeReleasedSlot(file, file.slots[0]!, identity, lease.receipt, lockRoot)).rejects.toThrow("SLOT_RELEASE_UNCONFIRMED")
    await expect(acquireSlotLease(file, file.slots[0]!, identity, lockRoot)).rejects.toThrow("RECOVERY_FINALIZATION_REQUIRED")
    expect(await Promise.all(original.resources.map(resource => Bun.file(resource.receipt).text()))).toEqual(before)
    await writeFile(cleanup, originalCleanup, { mode: 0o600 })
    const next = await acquireSlotLease(file, file.slots[0]!, identity, lockRoot)
    try {
      await expect(finalizeReleasedSlot(file, file.slots[0]!, identity, lease.receipt, lockRoot)).rejects.toThrow("BUSY")
      await next.assertHeld()
    } finally { await next.close() }
    await expect(finalizeReleasedSlot(file, file.slots[0]!, identity, lease.receipt, lockRoot)).rejects.toThrow("SLOT_RELEASE_UNCONFIRMED")
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: release I/O failure preserves a partial reservation and finalization refuses it", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  const lockRoot = path.join(item.root, "locks")
  const lease = await acquireSlotLease(file, file.slots[0]!, identity, lockRoot)
  try {
    const original = await readLeaseReceipt(lease.receipt) as { resources: { key: string; receipt: string }[] }
    const cleanup = path.join(item.root, "cleanup.json")
    // Data-only cleanup; the real filesystem fault interrupts the actual release implementation.
    await writeFile(cleanup, JSON.stringify({ status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: identity.serverEpoch,
      processes: "confirmed", serverSessions: "confirmed", archive: "committed", storageDeletionAllowed: true, nextAdmissionAllowed: true }), { mode: 0o600 })
    await mkdir(`${lease.receipt}.${new Bun.CryptoHasher("sha256").update(original.resources[1]!.key).digest("hex")}.released.json`, { mode: 0o700 })
    await expect(lease.release(cleanup)).rejects.toThrow()
    await lease.close()
    expect((await readResourceReservation({ key: original.resources[0]!.key, lockRoot }))?.state).toBe("released")
    expect((await readResourceReservation({ key: original.resources[1]!.key, lockRoot }))?.state).toBe("retained")
    const before = await Promise.all(original.resources.map(resource => Bun.file(resource.receipt).text()))
    await expect(recoverSlotLease(file, file.slots[0]!, identity, lease.receipt, lockRoot)).rejects.toThrow("BUSY")
    await expect(finalizeReleasedSlot(file, file.slots[0]!, identity, lease.receipt, lockRoot)).rejects.toThrow("SLOT_RELEASE_UNCONFIRMED")
    expect(await Promise.all(original.resources.map(resource => Bun.file(resource.receipt).text()))).toEqual(before)
    expect(await readLeaseReceipt(lease.receipt)).toMatchObject({ state: "retained" })
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: dead-controller partial release is adopted only as recovery ownership", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  const lockRoot = path.join(item.root, "locks")
  try {
    const child = Bun.spawn([process.execPath, "-e", `const {acquireSlotLease}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});
      const {mkdir}=await import("node:fs/promises");const file=${JSON.stringify(file)};
      const lease=await acquireSlotLease(file,file.slots[0],${JSON.stringify(identity)},${JSON.stringify(lockRoot)});
      const manifest=await Bun.file(lease.receipt).json();const cleanup=${JSON.stringify(path.join(item.root, "cleanup.json"))};
      await Bun.write(cleanup,JSON.stringify({status:"confirmed",slotId:lease.slot.id,leaseToken:lease.token,serverEpoch:lease.identity.serverEpoch,
        processes:"confirmed",serverSessions:"confirmed",archive:"committed",storageDeletionAllowed:true,nextAdmissionAllowed:true}));
      const {chmod}=await import("node:fs/promises");await chmod(cleanup,0o600);
      await mkdir(lease.receipt+"."+new Bun.CryptoHasher("sha256").update(manifest.resources[1].key).digest("hex")+".released.json",{mode:0o700});
      const failed=await lease.release(cleanup).then(()=>false,()=>true);if(!failed)throw Error("fault not reached");
      console.log(lease.receipt);await lease.close()`], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    const incident = (await new Response(child.stdout).text()).trim()
    const original = await readLeaseReceipt(incident) as { resources: { key: string; token: string; revision: number }[] }
    expect((await readResourceReservation({ key: original.resources[0]!.key, lockRoot }))?.state).toBe("released")
    expect((await readResourceReservation({ key: original.resources[1]!.key, lockRoot }))?.state).toBe("retained")
    const before = await Promise.all(original.resources.map(resource => readResourceReservation({ key: resource.key, lockRoot })))
    const cleanup = path.join(item.root, "cleanup.json")
    const cleanupBytes = await Bun.file(cleanup).text()
    await writeFile(cleanup, JSON.stringify({ ...JSON.parse(cleanupBytes), changed: true }), { mode: 0o600 })
    await expect(recoverSlotLease(file, file.slots[0]!, identity, incident, lockRoot)).rejects.toThrow("SLOT_RELEASE_UNCONFIRMED")
    expect(await Promise.all(original.resources.map(resource => readResourceReservation({ key: resource.key, lockRoot })))).toEqual(before)
    await writeFile(cleanup, cleanupBytes, { mode: 0o600 })
    const recovered = await recoverSlotLease(file, file.slots[0]!, identity, incident, lockRoot)
    try {
      expect(recovered.recoveryOnly).toBe(true)
      await recovered.assertHeld()
      for (const resource of original.resources) {
        const current = await readResourceReservation({ key: resource.key, lockRoot })
        expect(current).toMatchObject({ state: "recovery-only", revision: resource.revision + 1,
          lineage: [{ token: resource.token, revision: resource.revision, identity }] })
      }
      await expect(stageUserPreparation(file, recovered, "e".repeat(64))).rejects.toThrow("SLOT_RECOVERY_ONLY")
      const terminal = path.join(item.root, "recovery-cleanup.json")
      await writeFile(terminal, JSON.stringify({ status: "confirmed", slotId: recovered.slot.id, leaseToken: recovered.token, serverEpoch: identity.serverEpoch,
        processes: "confirmed", serverSessions: "confirmed", archive: "committed", storageDeletionAllowed: true, nextAdmissionAllowed: true }), { mode: 0o600 })
      const recoveryManifest = await readLeaseReceipt(recovered.receipt)
      await recovered.release(terminal)
      // Codec reconstruction of a crash before the recovery composite's terminal write.
      await writeFile(recovered.receipt, JSON.stringify(recoveryManifest), { mode: 0o600 })
      const admission = await acquireSlotLease(file, file.slots[0]!, identity, lockRoot)
        .then(next => ({ lease: next, error: null }), (error: unknown) => ({ lease: null, error }))
      await admission.lease?.close()
      expect(admission.error instanceof Error ? admission.error.message : null).toBe("RECOVERY_FINALIZATION_REQUIRED")
      expect(await finalizeReleasedSlot(file, file.slots[0]!, identity, incident, lockRoot)).toMatchObject({ status: "released", cleanupReceipt: terminal })
      expect(await readLeaseReceipt(incident)).toMatchObject({ state: "released", releaseReceipt: recovered.receipt, cleanupReceipt: terminal })
      expect(await readLeaseReceipt(recovered.receipt)).toMatchObject({ state: "released", cleanupReceipt: terminal })
      expect(await finalizeReleasedSlot(file, file.slots[0]!, identity, incident, lockRoot)).toMatchObject({ status: "already_released" })
      const next = await acquireSlotLease(file, file.slots[0]!, identity, lockRoot)
      try {
        expect(next.recoveryOnly).toBe(false)
        await next.assertHeld()
        await expect(finalizeReleasedSlot(file, file.slots[0]!, identity, incident, lockRoot)).rejects.toThrow("BUSY")
      } finally { await next.close() }
      await expect(finalizeReleasedSlot(file, file.slots[0]!, identity, incident, lockRoot)).rejects.toThrow("SLOT_RELEASE_UNCONFIRMED")
    } finally { await recovered.close() }
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: recovery adopts a dead owner's complete slot inventory without admitting a new run", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  const lockRoot = path.join(item.root, "locks")
  try {
    const child = Bun.spawn([process.execPath, "-e", `const {acquireSlotLease}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});
      const file=${JSON.stringify(file)};const lease=await acquireSlotLease(file,file.slots[0],${JSON.stringify(identity)},${JSON.stringify(lockRoot)});
      console.log(lease.receipt);await lease.close()`], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    const incident = (await new Response(child.stdout).text()).trim()
    const original = await readLeaseReceipt(incident) as { token: string; resources: { key: string; token: string; revision: number }[] }
    const lease = await recoverSlotLease(file, file.slots[0]!, identity, incident, lockRoot)
    try {
      expect(lease.recoveryOnly).toBe(true)
      expect(lease.token).not.toBe(original.token)
      await lease.assertHeld()
      await expect(stageUserPreparation(file, lease, "e".repeat(64))).rejects.toThrow("SLOT_RECOVERY_ONLY")
      const recovered = await readLeaseReceipt(lease.receipt) as { state: string; incident: string; resources: { key: string; token: string }[] }
      expect(recovered).toMatchObject({ state: "recovery-only", incident })
      expect(recovered.resources).toHaveLength(2)
      for (const resource of original.resources) {
        const current = await readResourceReservation({ key: resource.key, lockRoot })
        expect(current).toMatchObject({ state: "recovery-only", revision: resource.revision + 1,
          lineage: [{ token: resource.token, revision: resource.revision, identity }] })
      }
      await expect(acquireSlotLease(file, file.slots[0]!, identity, lockRoot)).rejects.toThrow("BUSY")
    } finally { await lease.close() }
    await expect(acquireSlotLease(file, file.slots[0]!, identity, lockRoot)).rejects.toThrow("RECOVERY_REQUIRED")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: recovery refuses a live controller without changing either reservation", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  const lockRoot = path.join(item.root, "locks")
  const lease = await acquireSlotLease(file, file.slots[0]!, identity, lockRoot)
  try {
    const manifest = await readLeaseReceipt(lease.receipt) as { resources: { receipt: string }[] }
    const before = await Promise.all(manifest.resources.map(resource => Bun.file(resource.receipt).text()))
    await lease.close()
    await expect(recoverSlotLease(file, file.slots[0]!, identity, lease.receipt, lockRoot)).rejects.toThrow("BUSY")
    expect(await Promise.all(manifest.resources.map(resource => Bun.file(resource.receipt).text()))).toEqual(before)
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: replacing the composite token revokes held ownership before provisioning", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  const lease = await acquireSlotLease(file, file.slots[0]!, identity, path.join(item.root, "locks"))
  try {
    const original = await readLeaseReceipt(lease.receipt) as object
    await writeFile(lease.receipt, JSON.stringify({ ...original, token: "foreign-token" }), { mode: 0o600 })
    await expect(lease.assertHeld()).rejects.toThrow("LEASE_NOT_HELD")
    await expect(stageUserPreparation(file, lease, "e".repeat(64))).rejects.toThrow("LEASE_NOT_HELD")
    expect(await Bun.file(path.join(file.controller.stateDir, "prepare-a.json")).exists()).toBe(false)
    const proof = path.join(item.root, "cleanup.json")
    await writeFile(proof, JSON.stringify({ status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: identity.serverEpoch,
      processes: "confirmed", serverSessions: "confirmed", archive: "committed", storageDeletionAllowed: true, nextAdmissionAllowed: true }), { mode: 0o600 })
    await expect(lease.release(proof)).rejects.toThrow("LEASE_NOT_HELD")
    await writeFile(lease.receipt, JSON.stringify(original), { mode: 0o600 })
    await lease.assertHeld()
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: the original incident resumes recovery after the recovery controller exits", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  const lockRoot = path.join(item.root, "locks")
  const module = JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))
  try {
    const original = Bun.spawn([process.execPath, "-e", `const {acquireSlotLease}=await import(${module});const file=${JSON.stringify(file)};
      const lease=await acquireSlotLease(file,file.slots[0],${JSON.stringify(identity)},${JSON.stringify(lockRoot)});console.log(lease.receipt);await lease.close()`],
      { stdout: "pipe", stderr: "pipe" })
    expect(await original.exited).toBe(0)
    const incident = (await new Response(original.stdout).text()).trim()
    const recovery = Bun.spawn([process.execPath, "-e", `const {recoverSlotLease}=await import(${module});const file=${JSON.stringify(file)};
      const lease=await recoverSlotLease(file,file.slots[0],${JSON.stringify(identity)},${JSON.stringify(incident)},${JSON.stringify(lockRoot)});console.log(lease.receipt);await lease.close()`],
      { stdout: "pipe", stderr: "pipe" })
    expect(await recovery.exited).toBe(0)
    const previous = (await new Response(recovery.stdout).text()).trim()
    const lease = await recoverSlotLease(file, file.slots[0]!, identity, incident, lockRoot)
    try {
      await lease.assertHeld()
      const manifest = await readLeaseReceipt(lease.receipt) as { resources: { key: string }[] }
      for (const resource of manifest.resources) {
        const current = await readResourceReservation({ key: resource.key, lockRoot })
        expect(current).toMatchObject({ revision: 3, state: "recovery-only" })
        expect(current!.lineage.map(entry => entry.journal)).toEqual([path.join(file.controller.stateDir, "run-journal.json"), previous])
      }
    } finally { await lease.close() }
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: different containers cannot bypass a shared canonical profile guard", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  const a = await acquireSlotLease(file, file.slots[0]!, identity, path.join(item.root, "locks"))
  try {
    const other = parseSlots({ ...item.value, slots: [{ ...item.value.slots[1], profileDir: file.slots[0]!.profileDir }] }, 1)
    await expect(acquireSlotLease(other, other.slots[0]!, { ...identity, containerId: "f".repeat(64) }, path.join(item.root, "locks"))).rejects.toThrow("BUSY")
  } finally { await a.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: unconfigured slot identity is refused before guards or receipts", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  try {
    await expect(acquireSlotLease(file, { ...file.slots[0]!, id: "../foreign" }, identity, path.join(item.root, "locks"))).rejects.toThrow("SLOT_NOT_CONFIGURED")
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("SlotLease: another Bun process cannot reuse a leased user with a different profile", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 2)
  const lease = await acquireSlotLease(file, file.slots[0]!, identity, path.join(item.root, "locks"))
  try {
    const other = parseSlots({ ...item.value, slots: [{ ...item.value.slots[1], username: "eval-a" }] }, 1)
    const child = Bun.spawn([process.execPath, "-e", `const {acquireSlotLease}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});
      try {const file=${JSON.stringify(other)};const lease=await acquireSlotLease(file,file.slots[0],${JSON.stringify(identity)},${JSON.stringify(path.join(item.root, "locks"))});await lease.close();process.exitCode=4}
      catch(error) {console.log(error.message);process.exitCode=2}`], { stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(2)
    expect(await new Response(child.stdout).text()).toContain("BUSY")
  } finally { await lease.close(); await rm(item.root, { recursive: true, force: true }) }
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


test("environment leases: busy slot B leaves earlier slot and server unreserved", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 2)
  const lockRoot = path.join(item.root, "locks")
  const b = await acquireSlotLease(file, file.slots[1]!, identity, lockRoot)
  try {
    const journal = path.join(file.controller.stateDir, "prepare-command.json")
    await writeFile(journal, JSON.stringify({ version: 2, commandId: "prepare-command" }), { mode: 0o600 })
    const before = await Bun.file(path.join(file.controller.stateDir, "run-journal.json")).text()
    const manifests = await readdir(file.controller.stateDir)
    const { acquireEnvironmentLeases } = await import("../src/slots")
    await expect(acquireEnvironmentLeases(file, 2, identity, journal, lockRoot)).rejects.toThrow("BUSY")
    for (const key of [`server:${identity.containerId}`, `user:${identity.containerId}:${file.slots[0]!.username}:0`, `profile:${file.slots[0]!.profileDir}`])
      expect(await readResourceReservation({ key, lockRoot })).toBeUndefined()
    expect(await readdir(file.controller.stateDir)).toEqual(manifests)
    expect(await Bun.file(path.join(file.controller.stateDir, "run-journal.json")).text()).toBe(before)
    await b.assertHeld()
  } finally { await b.close(); await rm(item.root, { recursive: true, force: true }) }
})

test("environment leases: command-local journals survive another run journal during recovery", async () => {
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
    for (const [index, incident] of incidents.entries()) {
      expect(await readLeaseReceipt(incident)).toMatchObject({ journal, commandId: "prepare-command", state: "retained" })
      const lease = await recoverSlotLease(file, file.slots[index]!, identity, incident, lockRoot)
      try { await lease.assertHeld(); expect(lease.recoveryOnly).toBe(true) }
      finally { await lease.close() }
    }
    expect(await readResourceReservation({ key: `server:${identity.containerId}`, lockRoot })).toEqual(server)
  } finally { await rm(item.root, { recursive: true, force: true }) }
})

test("environment leases: terminal release reconciles against its command journal", async () => {
  const item = await fixture()
  const file = parseSlots(item.value, 1)
  const lockRoot = path.join(item.root, "locks")
  const journal = path.join(file.controller.stateDir, "prepare-command.json")
  await writeFile(journal, JSON.stringify({ version: 2, commandId: "prepare-command" }), { mode: 0o600 })
  const { acquireEnvironmentLeases } = await import("../src/slots")
  const environment = await acquireEnvironmentLeases(file, 1, identity, journal, lockRoot)
  const lease = environment.slots[0]!
  try {
    const original = await readLeaseReceipt(lease.receipt) as object
    const cleanup = path.join(file.controller.stateDir, "codec-cleanup.json")
    // Data-only cleanup proof tests the release codec; no native actor has been admitted.
    await writeFile(cleanup, JSON.stringify({ status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: identity.serverEpoch,
      processes: "confirmed", serverSessions: "confirmed", archive: "committed", storageDeletionAllowed: true, nextAdmissionAllowed: true }), { mode: 0o600 })
    await lease.release(cleanup)
    await writeFile(lease.receipt, JSON.stringify(original), { mode: 0o600 })
    expect(await finalizeReleasedSlot(file, lease.slot, identity, lease.receipt, lockRoot)).toMatchObject({ status: "released", cleanupReceipt: cleanup })
    expect(await finalizeReleasedSlot(file, lease.slot, identity, lease.receipt, lockRoot)).toMatchObject({ status: "already_released" })
    await environment.server.assertHeld()
    const next = await acquireSlotLease(file, lease.slot, identity, lockRoot)
    try { await next.assertHeld() } finally { await next.close() }
  } finally {
    await Promise.all([environment.server.close(), ...environment.slots.map(slot => slot.close())])
    await rm(item.root, { recursive: true, force: true })
  }
})

test("environment leases: recovery refuses an untrusted command journal without changing resources", async () => {
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
    await lease.close()
    for (const untrusted of [null, 42, foreign, alias, path.join(file.controller.stateDir, "run-journal.json")]) {
      await writeFile(lease.receipt, JSON.stringify({ ...original, journal: untrusted }), { mode: 0o600 })
      await expect(recoverSlotLease(file, lease.slot, identity, lease.receipt, lockRoot)).rejects.toThrow("SLOT_RECOVERY_LINEAGE_INVALID")
      expect(await Promise.all(original.resources.map(resource => Bun.file(resource.receipt).text()))).toEqual(before)
    }
    await environment.server.assertHeld()
  } finally {
    await Promise.all([environment.server.close(), ...environment.slots.map(slot => slot.close())])
    await rm(item.root, { recursive: true, force: true })
  }
})
