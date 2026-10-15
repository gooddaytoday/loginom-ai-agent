import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { acquireSlotLease, parseSlots } from "../src/slots"
import { acquireResourceLease, readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { createPair, destroyPair } from "../src/parallel-pair"
import { claimUserOwnership, stageUserPreparation } from "../src/user-environment"
import { parallelFixture } from "./helpers/parallel-fixture"

const integration = process.env.EVAL_PAIR_INTEGRATION === "1" ? test : test.skip

integration("owned storage publication: held claims publish only a new root and preserve neighboring files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "evals-user-storage-"))
  const fixture = await parallelFixture(root)
  const name = `evals-storage-${crypto.randomUUID().slice(0, 8)}`
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${listener.port}/app/`
  listener.stop(true)
  const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`,
    network: name, alias: "loginom-server-7.4.2-test", url } }, 2)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: fixture.lockRoot }
  const pair = await createPair(file, options)
  const journal = path.join(file.controller.stateDir, "run-journal.json")
  await writeLeaseReceipt(journal, { commandId: "storage-codec-control" })
  const server = await acquireResourceLease({ key: `server:${pair.identity.containerId}`, identity: pair.identity, journal, commandId: "storage-codec-control", lockRoot: fixture.lockRoot })
  const lease = await acquireSlotLease(file, file.slots[0]!, pair.identity, fixture.lockRoot)
  try {
    const prepared = await stageUserPreparation(file, lease, "e".repeat(64))
    // Data-only protected ownership codec. No native user or session is simulated.
    const reply = { v: 1 as const, id: "storage-create", outcome: "confirmed" as const,
      data: { created: true, user: { objectId: "storage-codec-user", name: lease.slot.username, userKind: 0, blocked: true } } }
    const payload = { phase: "blocked", slot: lease.slot, secretFile: prepared.secretFile, preparationNonce: prepared.nonce,
      desiredHash: prepared.desiredHash, secretHash: prepared.secretHash, owned: null }
    const command = path.join(file.controller.stateDir, `${reply.id}.json`)
    await writeLeaseReceipt(command, { version: 1, kind: "loginom-admin-command", id: reply.id, op: "reconcile-user", expectedIdentity: pair.identity,
      desiredHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(payload)).digest("hex"), state: "confirmed", at: new Date().toISOString(),
      replyHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(reply)).digest("hex"), settledAt: new Date().toISOString() })
    await claimUserOwnership(file, lease, prepared.secretFile, command, reply)
    await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'mkdir -p /workdir/UserStorage/eval-b; printf preserve > /workdir/UserStorage/eval-b/control'}`.quiet()
    const { prepareUserStorage } = await import("../src/parallel-pair")
    const markerBefore = (await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet()).text()
    await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'mkdir /workdir/UserStorage/eval-a; printf foreign > /workdir/UserStorage/eval-a/control'}`.quiet()
    await expect(prepareUserStorage(file, lease, prepared.secretFile, server)).rejects.toThrow("USER_STORAGE_OWNERSHIP")
    expect((await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/UserStorage/eval-a/control`.quiet()).text()).toBe("foreign")
    expect((await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet()).text()).toBe(markerBefore)
    await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'rm /workdir/UserStorage/eval-a/control; rmdir /workdir/UserStorage/eval-a'}`.quiet()
    const observed = await prepareUserStorage(file, lease, prepared.secretFile, server)
    expect(observed).toMatchObject({ username: "eval-a", ownerNonce: prepared.nonce, root: "/workdir/UserStorage/eval-a", entries: [] })
    expect(await prepareUserStorage(file, lease, prepared.secretFile, server)).toEqual(observed)
    expect((await readLeaseReceipt(path.join(file.controller.stateDir, "storage-a.json")) as { state: string }).state).toBe("published")
    expect((await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/UserStorage/eval-b/control`.quiet()).text()).toBe("preserve")
    const source = path.join(file.controller.stateDir, "storage-a.json")
    const published = await readLeaseReceipt(source) as Record<string, unknown>
    const markerPublished = (await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet()).text()
    // Persisted crash boundary, with a different root replacing the journaled inode.
    await writeLeaseReceipt(source, { ...published, state: "created" })
    await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'mv /workdir/UserStorage/eval-a /workdir/UserStorage/eval-a.original; mkdir /workdir/UserStorage/eval-a; printf %s "$1" > /workdir/.loginom-evals-isolated.json'} user-storage ${markerBefore}`.quiet()
    try {
      await expect(prepareUserStorage(file, lease, prepared.secretFile, server)).rejects.toThrow("USER_STORAGE_OWNERSHIP")
      expect((await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet()).text()).toBe(markerBefore)
    } finally {
      await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'rmdir /workdir/UserStorage/eval-a; mv /workdir/UserStorage/eval-a.original /workdir/UserStorage/eval-a; printf %s "$1" > /workdir/.loginom-evals-isolated.json'} user-storage ${markerPublished}`.quiet()
      await writeLeaseReceipt(source, published)
    }
    // Crash after writing the private temporary marker, before its atomic rename.
    const temporary = `/workdir/.loginom-evals-isolated.json.${prepared.nonce}.tmp`
    await writeLeaseReceipt(source, { ...published, state: "created" })
    await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'umask 077; printf %s "$1" > /workdir/.loginom-evals-isolated.json; printf %s "$2" > "$3"'} user-storage ${markerBefore} ${markerPublished} ${temporary}`.quiet()
    // A conflicting temporary marker remains unchanged; it is not discarded for retry.
    await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'printf conflict > "$1"'} user-storage ${temporary}`.quiet()
    await expect(prepareUserStorage(file, lease, prepared.secretFile, server)).rejects.toThrow("USER_STORAGE_UNVERIFIED")
    expect((await Bun.$`docker exec ${pair.identity.containerId} cat ${temporary}`.quiet()).text()).toBe("conflict")
    const mirror = "/workdir/storage-marker-control.json"
    await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'rm "$1"; printf %s "$2" > "$3"; ln -s "$3" "$1"'} user-storage ${temporary} ${markerPublished} ${mirror}`.quiet()
    try {
      await expect(prepareUserStorage(file, lease, prepared.secretFile, server)).rejects.toThrow("USER_STORAGE_UNVERIFIED")
      expect((await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet()).text()).toBe(markerBefore)
      expect((await Bun.$`docker exec ${pair.identity.containerId} readlink ${temporary}`.quiet()).text().trim()).toBe(mirror)
    } finally {
      await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'rm -f -- "$1" "$2"; if test -L /workdir/.loginom-evals-isolated.json; then rm /workdir/.loginom-evals-isolated.json; fi; umask 077; printf %s "$3" > /workdir/.loginom-evals-isolated.json'} user-storage ${temporary} ${mirror} ${markerBefore}`.quiet()
    }
    await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'umask 077; printf %s "$1" > "$2"'} user-storage ${markerPublished} ${temporary}`.quiet()
    expect(await prepareUserStorage(file, lease, prepared.secretFile, server)).toEqual(observed)
    expect((await readLeaseReceipt(source) as { state: string }).state).toBe("published")
    // Crash after marker rename, before publishing the private terminal state.
    await writeLeaseReceipt(source, { ...published, state: "created" })
    expect(await prepareUserStorage(file, lease, prepared.secretFile, server)).toEqual(observed)
    expect((await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet()).text()).toBe(markerPublished)
    await Bun.write(source, "null")
    await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'printf %s "$1" > /workdir/.loginom-evals-isolated.json'} user-storage ${markerBefore}`.quiet()
    try {
      await expect(prepareUserStorage(file, lease, prepared.secretFile, server)).rejects.toThrow("USER_STORAGE_OWNERSHIP")
      expect(await readLeaseReceipt(source)).toBeNull()
    } finally {
      await writeLeaseReceipt(source, published)
      await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'printf %s "$1" > /workdir/.loginom-evals-isolated.json'} user-storage ${markerPublished}`.quiet()
    }

  } finally {
    // Only codec authority is exercised here; the pair has no admitted Loginom actors.
    // These receipts do not qualify production server/session/backup cleanup.
    const proof = path.join(root, "codec-cleanup.json")
    await writeLeaseReceipt(proof, { status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: pair.identity.serverEpoch,
      processes: "confirmed", serverSessions: "confirmed", archive: "committed", storageDeletionAllowed: true, nextAdmissionAllowed: true })
    await lease.release(proof)
    const { prepareUserStorage } = await import("../src/parallel-pair")
    await expect(prepareUserStorage(file, lease, path.join(file.controller.stateDir, "prepare-a.secret.json"), server)).rejects.toThrow("LEASE_NOT_HELD")
    const released = path.join(root, "codec-server-release.json")
    await writeLeaseReceipt(released, { version: 2, status: "confirmed", key: server.reservation.key, token: server.reservation.token, revision: server.reservation.revision, serverEpoch: pair.identity.serverEpoch })
    await server.release(released)
    await destroyPair(file, options)
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
