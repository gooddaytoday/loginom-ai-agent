import { expect, test } from "bun:test"
import path from "node:path"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { storageCodecFixture } from "./helpers/storage-codec-fixture"

const integration = process.env.EVAL_PAIR_INTEGRATION === "1" ? test : test.skip

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
