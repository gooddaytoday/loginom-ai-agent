import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { loadSlots, parseSlots, reopenEnvironmentLeases } from "../src/slots"
import { globalLockRoot, readLeaseReceipt, readResourceReservation } from "../src/lease"


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
