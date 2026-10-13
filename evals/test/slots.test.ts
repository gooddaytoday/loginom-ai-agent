import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireSlotLease, loadSlots, parseSlots } from "../src/slots"

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
