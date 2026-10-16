import { expect, test } from "bun:test"
import path from "node:path"
import { tmpdir } from "node:os"
import { chmod, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { readAdminPackageInventory } from "../src/package-inventory"

const identity = { containerId: "a".repeat(64), startedAt: "2026-10-16T00:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-16T00:00:00Z", configurationHash: "d".repeat(64) }

test("package inventory reader binds the full native reply and preserves unknown reference/progress values", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "evals-package-inventory-")), directory = path.join(root, "admin-codec")
  await mkdir(path.join(directory, "commands"), { recursive: true, mode: 0o700 })
  const file = { controller: { stateDir: root } }, target = path.join(directory, "package-inventory-native.json")
  const commandFile = path.join(directory, "commands/native.json")
  // Data-only codec fixture; this does not qualify a server, operation or cleanup.
  const item = { objectId: "package-1", name: "draft", path: "", readOnly: false, referenceCount: -1, progress: null }
  const collections = [{ objectId: "row-1", name: "eval-a:1", sessionType: 0, packageCount: 1, packages: [item] }]
  const reply = { v: 1, id: "native", outcome: "confirmed", data: { identity, collections } }
  const command = { version: 1, kind: "loginom-admin-command", id: reply.id, op: "inspect", expectedIdentity: identity,
    desiredHash: hash({ packages: true }), replyHash: hash(reply), state: "confirmed", at: "2026-10-16T00:00:01Z", settledAt: "2026-10-16T00:00:02Z" }
  const receipt = { version: 2, kind: "admin-package-inventory", identity, reply, command: { path: commandFile, sha256: hash(command) } }
  await writeLeaseReceipt(commandFile, command)
  await writeLeaseReceipt(target, receipt)
  const source = { path: target, sha256: hash(receipt) }
  try {
    expect(await readAdminPackageInventory(file, identity, source)).toEqual({ identity, collections,
      observation: { startedAt: command.at, finishedAt: command.settledAt }, source })
    await writeLeaseReceipt(target, { ...receipt, reply: { ...reply, data: { identity, collections: [] } } })
    await expect(readAdminPackageInventory(file, identity, source)).rejects.toThrow("PACKAGE_INVENTORY_UNCONFIRMED")
    await writeLeaseReceipt(target, receipt)
    const changed = { ...receipt, reply: { ...reply, data: { identity, collections: [] } } }
    await writeLeaseReceipt(target, changed)
    await expect(readAdminPackageInventory(file, identity, { ...source, sha256: hash(changed) })).rejects.toThrow("PACKAGE_INVENTORY_UNCONFIRMED")
    await writeLeaseReceipt(target, receipt)
    for (const invalid of [{ ...command, desiredHash: hash({}) }, { ...command, state: "unknown" }, { ...command, settledAt: command.at.replace("01Z", "00Z") }]) {
      await writeLeaseReceipt(commandFile, invalid)
      const altered = { ...receipt, command: { path: commandFile, sha256: hash(invalid) } }
      await writeLeaseReceipt(target, altered)
      await expect(readAdminPackageInventory(file, identity, { ...source, sha256: hash(altered) })).rejects.toThrow("PACKAGE_INVENTORY_UNCONFIRMED")
    }
    await writeLeaseReceipt(commandFile, command)
    await writeLeaseReceipt(target, receipt)
    await expect(readAdminPackageInventory(file, { ...identity, serverEpoch: "f".repeat(64) }, source)).rejects.toThrow("PACKAGE_INVENTORY_UNCONFIRMED")
    expect(await readLeaseReceipt(target)).toEqual(receipt)
    const activeReply = { ...reply, data: { identity, collections: [{ ...collections[0]!, packages: [{ ...item,
      progress: { percent: 25, startedAt: "2026-10-15T21:00:01Z" } }] }] } }
    const activeCommand = { ...command, replyHash: hash(activeReply) }
    const active = { ...receipt, reply: activeReply, command: { path: commandFile, sha256: hash(activeCommand) } }
    await writeLeaseReceipt(commandFile, activeCommand)
    await writeLeaseReceipt(target, active)
    expect((await readAdminPackageInventory(file, identity, { ...source, sha256: hash(active) })).collections).toEqual(activeReply.data.collections)
    for (const invalid of [[{ ...collections[0]!, packageCount: 0 }], [collections[0], collections[0]],
      [{ ...collections[0]!, packages: [{ ...item, path: null }] }],
      [{ ...collections[0]!, packages: [{ ...item, referenceCount: -1.5 }] }],
      [{ ...collections[0]!, packages: [{ ...item, readOnly: "false" }] }],
      [{ ...collections[0]!, packages: [{ ...item, progress: { percent: 1, startedAt: "unknown" } }] }],
      [{ ...collections[0]!, packages: [{ ...item, progress: { percent: "1", startedAt: "2026-10-16T00:00:01Z" } }] }],
      [{ ...collections[0]!, packageCount: 2, packages: [item, item] }]]) {
      const malformed = { ...reply, data: { identity, collections: invalid } }, forged = { ...command, replyHash: hash(malformed) }
      const packet = { ...receipt, reply: malformed, command: { path: commandFile, sha256: hash(forged) } }
      await writeLeaseReceipt(commandFile, forged)
      await writeLeaseReceipt(target, packet)
      await expect(readAdminPackageInventory(file, identity, { ...source, sha256: hash(packet) })).rejects.toThrow("PACKAGE_INVENTORY_UNCONFIRMED")
    }
    await writeLeaseReceipt(commandFile, command)
    await writeLeaseReceipt(target, receipt)
    await chmod(target, 0o644)
    await expect(readAdminPackageInventory(file, identity, source)).rejects.toThrow("PACKAGE_INVENTORY_UNCONFIRMED")
    await chmod(target, 0o600)
    const alias = path.join(root, "admin-alias")
    await symlink(directory, alias)
    await expect(readAdminPackageInventory(file, identity, { ...source, path: path.join(alias, path.basename(target)) })).rejects.toThrow("PACKAGE_INVENTORY_UNCONFIRMED")
    expect(await readLeaseReceipt(target)).toEqual(receipt)
  } finally { await rm(root, { recursive: true }) }
})

function hash(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex")
}
