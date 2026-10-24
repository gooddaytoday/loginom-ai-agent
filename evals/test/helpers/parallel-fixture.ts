import path from "node:path"
import { mkdir } from "node:fs/promises"
import type { SlotFile } from "../../src/slots"

export async function parallelFixture(root: string) {
  const slots: SlotFile = {
    version: 2,
    server: { container: "fixture-server", studioContainer: "fixture-studio", url: "http://127.0.0.1/app/",
      network: "fixture-network", alias: "fixture-server", storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
    controller: { stateDir: path.join(root, "controller"), adminCredentialsFile: path.join(root, "unused-admin.json") },
    judge: { codexHome: path.join(root, "judge") },
    slots: ["a", "b"].map(id => ({ id, username: `eval-${id}`, profileDir: path.join(root, `profile-${id}`),
      workspaceRoot: path.join(root, `work-${id}`), historyDir: path.join(root, `history-${id}`) })),
  }
  const lockRoot = path.join(root, "locks")
  const storage = path.join(root, "storage")
  await Promise.all([lockRoot, storage, slots.controller.stateDir, slots.judge.codexHome,
    ...slots.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir, path.join(storage, slot.id)])]
    .map(dir => mkdir(dir, { recursive: true, mode: 0o700 })))
  await Promise.all(slots.slots.map(slot => Bun.write(path.join(slot.profileDir, "data/auth.json"), '{"fake":{"type":"api","key":"fixture"}}')))
  return { slots, lockRoot }
}

// Exercises the current server/profile lease path for data-only codec tests.
export async function acquireFixtureSlot(file: SlotFile, slot: SlotFile["slots"][number], identity: import("../../src/slots").ServerIdentity, lockRoot: string) {
  const { acquireEnvironmentLeases } = await import("../../src/slots")
  const { writeLeaseReceipt } = await import("../../src/lease")
  const commandId = crypto.randomUUID(), journal = path.join(file.controller.stateDir, `unit-command-${commandId}.json`)
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId, identity, phase: "unactivated", slotIds: [slot.id] })
  const environment = await acquireEnvironmentLeases({ ...file, slots: [slot] }, 1, identity, journal, lockRoot)
  const lease = environment.slots[0]!
  return { ...lease, async close() { await Promise.all([lease.close(), environment.server.close()]) } }
}
