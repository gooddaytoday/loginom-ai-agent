import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { createPair, destroyPair, verifyParallelPair } from "../src/parallel-pair"
import { parseSlots } from "../src/slots"
import { parallelFixture } from "./helpers/parallel-fixture"
import { storageCodecFixture } from "./helpers/storage-codec-fixture"

const integration = process.env.EVAL_PAIR_INTEGRATION === "1" ? test : test.skip

integration("fresh generation: ready pair restarts the same owned containers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "evals-ready-pair-"))
  const fixture = await parallelFixture(root)
  const name = `evals-ready-${crypto.randomUUID().slice(0, 8)}`
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${listener.port}/app/`
  listener.stop(true)
  const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`,
    network: name, alias: "loginom-server-7.4.2-test", url } }, 1)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: fixture.lockRoot }
  const created = await createPair(file, options).catch(error => { console.error(`pair fixture retained: ${root}`); throw error })
  try {
    const journal = await Bun.file(path.join(file.controller.stateDir, "pair.json")).text()
    const marker = (await Bun.$`docker exec ${created.identity.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet()).text()
    await Bun.$`docker stop ${created.identity.containerId} ${created.identity.studioContainerId}`.quiet()
    const incomplete = { ...JSON.parse(journal), resources: { network: created.resources.network, studio: created.resources.studio } }
    await writeLeaseReceipt(path.join(file.controller.stateDir, "pair.json"), incomplete)
    try {
      await expect(createPair(file, options)).rejects.toThrow("PAIR_OWNERSHIP")
      expect((await Bun.$`docker inspect --format ${"{{.State.Running}}"} ${created.identity.containerId} ${created.identity.studioContainerId}`.quiet()).text()).toBe("false\nfalse\n")
      expect(await readLeaseReceipt(path.join(file.controller.stateDir, "pair.json"))).toEqual(incomplete)
    } finally { await Bun.write(path.join(file.controller.stateDir, "pair.json"), journal) }
    const restarted = await createPair(file, options)
    expect(restarted.resources).toEqual(created.resources)
    expect(restarted.nonce).toBe(created.nonce)
    expect(restarted.identity.containerId).toBe(created.identity.containerId)
    expect(restarted.identity.studioContainerId).toBe(created.identity.studioContainerId)
    expect(restarted.identity.serverEpoch).not.toBe(created.identity.serverEpoch)
    expect(restarted.identity.startedAt).not.toBe(created.identity.startedAt)
    expect(restarted.identity.studioStartedAt).not.toBe(created.identity.studioStartedAt)
    expect(await verifyParallelPair(file, restarted.identity)).toEqual(restarted.identity)
    expect(await Bun.file(path.join(file.controller.stateDir, "pair.json")).text()).toBe(journal)
    expect((await Bun.$`docker exec ${created.identity.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet()).text()).toBe(marker)
  } finally {
    await destroyPair(file, options)
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)

integration("owned storage publication: held claims publish only a new root and preserve neighboring files", async () => {
  const fixture = await storageCodecFixture()
  const file = fixture.file, pair = fixture.pair, lease = fixture.lease, server = fixture.server, prepared = fixture.prepared
  try {
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
    await fixture.dispose()
    const { prepareUserStorage } = await import("../src/parallel-pair")
    await expect(prepareUserStorage(file, lease, prepared.secretFile, server)).rejects.toThrow("LEASE_NOT_HELD")
  }
}, 120_000)
