import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { acquireResourceLease, globalLockRoot, readLeaseReceipt, readResourceReservation, writeLeaseReceipt } from "../src/lease"
import { createPair, destroyPair, readServerIdentity, verifyParallelPair } from "../src/parallel-pair"
import { loadSlots, parseSlots, type ServerIdentity } from "../src/slots"
import { loadConfig } from "../src/config"
import { prepareEnvironment, verifyEnvironment } from "../src/environment-preparation"
import { tryCampaignLock } from "../src/campaign-lock"
import { isQualityResult, type AttemptResult } from "../src/report"
import { verifyAdminRuntime } from "../src/preflight"
import type { CampaignServerConfig } from "../script/run-campaign"
import { parallelFixture } from "./helpers/parallel-fixture"
import { storageCodecFixture } from "./helpers/storage-codec-fixture"

const integration = process.env.EVAL_PAIR_INTEGRATION === "1" ? test : test.skip

test.skipIf(process.env.EVAL_PAIR_INTEGRATION !== "1" || !process.env.EVAL_CAMPAIGN_LIVE_SERVER)(
  "fresh generation reuses profile after owned pair restart", async () => {
    const server = await readLeaseReceipt(process.env.EVAL_CAMPAIGN_LIVE_SERVER!) as CampaignServerConfig
    const unlock = await tryCampaignLock(server.controllerLock)
    expect(Boolean(unlock)).toBe(true)
    if (!unlock) return
    try {
      expect(await Bun.file(path.join(server.stateRoot, "owner.json")).exists()).toBe(false)
      const source = await loadSlots(server.slotsFile, 1)
      const parallel = source.slots.length
      for (const count of Array.from({ length: parallel }, (_, index) => index + 1)) {
        const unit = server.batchUnit.replace("{parallel}", String(count))
        const state = await Bun.$`systemctl show --property=ActiveState --value ${unit}`.quiet()
        expect(["inactive", "failed"].includes(state.text().trim())).toBe(true)
      }
      const config = loadConfig(["--skip-judge"], { ...process.env, EVAL_SLOTS_FILE: server.slotsFile })
      expect(config.agent.cliMode).toBe("binary")
      const fingerprint = async (file: string) => {
        const hash = new Bun.CryptoHasher("sha256")
        for await (const chunk of Bun.file(file).stream()) hash.update(chunk)
        return hash.digest("hex")
      }
      const pins = await readLeaseReceipt(server.experimentPinsFile) as { cli: string; cliBinarySha256: string }
      expect(config.agent.cliBin === pins.cli).toBe(true)
      expect(await fingerprint(config.agent.cliBin!) === pins.cliBinarySha256).toBe(true)
      await verifyAdminRuntime(config.agent.cliBin!)
      const previous = await readLeaseReceipt(path.join(source.controller.stateDir, `prepare-${source.slots[0]!.id}.json`)) as { identity: ServerIdentity }
      let identity = await readServerIdentity(source)
      await verifyParallelPair(source, identity)
      const recovering = await Bun.file(path.join(server.stateRoot, "environment-generations", identity.serverEpoch, "slots.json")).exists()
      for (const key of [`judge:${source.judge.codexHome}`, ...(!recovering ?
        [`server:${identity.containerId}`, ...source.slots.map(slot => `profile:${slot.profileDir}`)] : [])]) {
        const reservation = await readResourceReservation({ key })
        expect(reservation?.state === "released" && Boolean(reservation.releaseEvidence)).toBe(true)
        const proof = await readLeaseReceipt(reservation!.releaseEvidence!.path)
        expect(new Bun.CryptoHasher("sha256").update(JSON.stringify(proof)).digest("hex") === reservation!.releaseEvidence!.sha256).toBe(true)
      }
      const saved: string[] = [server.slotsFile, server.experimentPinsFile, server.corpusPinsFile, server.resourceBudgetFile]
      for await (const name of new Bun.Glob("**/*.json").scan({ cwd: source.controller.stateDir, onlyFiles: true }))
        saved.push(path.join(source.controller.stateDir, name))
      for (const directory of [...source.slots.map(slot => slot.historyDir), ...(source.auth ? [source.auth.sharedDir] : [])])
        for await (const name of new Bun.Glob("**/*").scan({ cwd: directory, onlyFiles: true, dot: true })) saved.push(path.join(directory, name))
      for (const slot of source.slots) {
        const auth = path.join(slot.profileDir, "data/auth.json")
        if (await Bun.file(auth).exists()) saved.push(auth)
      }
      const quality: string[] = []
      for (const name of (await readdir(source.controller.stateDir)).filter(name => /^run-command-.*\.json$/.test(name))) {
        const command = await readLeaseReceipt(path.join(source.controller.stateDir, name)) as { runDir?: string }
        if (!command.runDir) continue
        for await (const result of new Bun.Glob("*/*/result.json").scan({ cwd: command.runDir, onlyFiles: true })) {
          const file = path.join(command.runDir, result)
          if (isQualityResult(await Bun.file(file).json() as AttemptResult)) quality.push(file)
        }
        for await (const name of new Bun.Glob("**/*").scan({ cwd: command.runDir, onlyFiles: true, dot: true })) saved.push(path.join(command.runDir, name))
      }
      expect(quality.length > 0).toBe(true)
      const before: string[] = []
      for (const file of saved) before.push(await fingerprint(file))
      try {
        const pair = await readLeaseReceipt(path.join(source.controller.stateDir, "pair.json")) as { purpose: "research" | "acceptance" }
        const options = { purpose: pair.purpose, out: path.join(server.stateRoot, "pair-recovery"), lockRoot: globalLockRoot }
        if (identity.serverEpoch === previous.identity.serverEpoch) {
          await createPair(source, options)
          await Bun.$`docker stop ${identity.containerId} ${identity.studioContainerId}`.quiet()
          identity = (await createPair(source, options)).identity
        }
        expect(identity.containerId).toBe(previous.identity.containerId)
        expect(identity.studioContainerId).toBe(previous.identity.studioContainerId)
        expect(identity.serverEpoch).not.toBe(previous.identity.serverEpoch)
        const root = path.join(server.stateRoot, "environment-generations", identity.serverEpoch)
        const file = parseSlots({ ...source, controller: { ...source.controller, stateDir: path.join(root, "state") },
          slots: source.slots.map(slot => ({ ...slot, username: "eval-" + new Bun.CryptoHasher("sha256").update(identity.serverEpoch + ":" + slot.id).digest("hex").slice(0, 48) })) }, parallel)
        await mkdir(file.controller.stateDir, { recursive: true, mode: 0o700 })
        const slotsFile = path.join(root, "slots.json")
        for (const [target, value] of [[slotsFile, file], [path.join(file.controller.stateDir, "pair.json"), pair]] as const) {
          if (await Bun.file(target).exists()) expect(JSON.stringify(await readLeaseReceipt(target)) === JSON.stringify(value)).toBe(true)
          else await writeLeaseReceipt(target, value)
        }
        console.error(`native generation evidence: ${root}`)
        const input = { slotsFile, parallel, previousSlotsFile: server.slotsFile, config: { ...config, slotsFile } }
        expect((await prepareEnvironment(input)).ready).toBe(true)
        expect((await verifyEnvironment({ slotsFile, parallel, config: input.config })).ready).toBe(true)
        const inventory = (await Bun.$`docker exec ${identity.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet()).text()
        const secrets = await Promise.all(source.slots.map(slot => Bun.file(path.join(file.controller.stateDir, `prepare-${slot.id}.secret.json`)).text()))
        expect((await prepareEnvironment(input)).changedUsers).toEqual([])
        expect((await verifyEnvironment({ slotsFile, parallel, config: input.config })).ready).toBe(true)
        expect((await Bun.$`docker exec ${identity.containerId} cat /workdir/.loginom-evals-isolated.json`.quiet()).text() === inventory).toBe(true)
        expect((await Promise.all(source.slots.map(slot => Bun.file(path.join(file.controller.stateDir, `prepare-${slot.id}.secret.json`)).text()))).every((value, index) => value === secrets[index])).toBe(true)
      } finally {
        const after: (string | null)[] = []
        for (const file of saved) after.push(await fingerprint(file).catch(() => null))
        expect(after.every((value, index) => value === before[index])).toBe(true)
      }
    } finally { await unlock() }
  }, 1_200_000,
)

test.skipIf(process.env.EVAL_PAIR_INTEGRATION !== "1" || !process.env.EVAL_CAMPAIGN_LIVE_SERVER)(
  "fresh generation rejects unchanged epoch before resource admission", async () => {
    const server = await readLeaseReceipt(process.env.EVAL_CAMPAIGN_LIVE_SERVER!) as CampaignServerConfig
    const unlock = await tryCampaignLock(server.controllerLock)
    expect(Boolean(unlock)).toBe(true)
    if (!unlock) return
    try {
      expect(await Bun.file(path.join(server.stateRoot, "owner.json")).exists()).toBe(false)
      const identity = await readServerIdentity(await loadSlots(server.slotsFile, 1))
      const previousSlotsFile = path.join(server.stateRoot, "environment-generations", identity.serverEpoch, "slots.json")
      const previous = await loadSlots(previousSlotsFile, 1)
      const root = await mkdtemp(path.join(server.stateRoot, "epoch-probe-"))
      const file = parseSlots({ ...previous, controller: { ...previous.controller, stateDir: path.join(root, "state") },
        slots: previous.slots.map(slot => ({ ...slot, username: "probe-" + slot.username })) }, 1)
      await mkdir(file.controller.stateDir, { mode: 0o700 })
      const slotsFile = path.join(root, "slots.json")
      await writeLeaseReceipt(slotsFile, file)
      await writeLeaseReceipt(path.join(file.controller.stateDir, "pair.json"), await readLeaseReceipt(path.join(previous.controller.stateDir, "pair.json")) as object)
      const commandId = crypto.randomUUID(), journal = path.join(previous.controller.stateDir, `epoch-probe-${commandId}.json`)
      await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId, identity, phase: "unactivated", slotIds: [] })
      const lease = await acquireResourceLease({ key: `server:${identity.containerId}`, lockRoot: globalLockRoot, journal, commandId, identity })
      try {
        const config = loadConfig(["--skip-judge"], { ...process.env, EVAL_SLOTS_FILE: slotsFile })
        await expect(prepareEnvironment({ slotsFile, parallel: 1, config, previousSlotsFile })).rejects.toThrow("PREPARATION_GENERATION_MISMATCH")
      } finally {
        try {
          const proof = path.join(previous.controller.stateDir, `epoch-probe-release-${commandId}.json`)
          await writeLeaseReceipt(proof, { version: 2, status: "confirmed", key: lease.reservation.key, token: lease.reservation.token,
            revision: lease.reservation.revision, serverEpoch: identity.serverEpoch, reason: "not-used" })
          await lease.release(proof)
        } finally { await lease.close() }
        await rm(root, { recursive: true, force: true })
      }
    } finally { await unlock() }
  }, 90_000,
)

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
