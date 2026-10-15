import { expect, test } from "bun:test"
import path from "node:path"
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { verifyAdminRuntime } from "../src/preflight"
import { createJournaledAdminChannel, openLoginomAdmin, type AdminOperation } from "../src/loginom-admin"
import { createPair, destroyPair, readServerIdentity } from "../src/parallel-pair"
import { acquireSlotLease, loadSlots, parseSlots, recoverSlotLease, type SlotFile, type ServerIdentity } from "../src/slots"
import { acquireResourceLease, readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { parallelFixture } from "./helpers/parallel-fixture"
import { superviseProcess } from "../src/process-supervisor"
import { stageUserPreparation } from "../src/user-environment"

const integration = process.env.EVAL_ADMIN_INTEGRATION === "1" ? test : test.skip
const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

const liveIntegration = process.env.EVAL_ADMIN_LIVE_CONFIG ? test : test.skip

liveIntegration("trusted bridge: held user preparation without its pair journal is refused before dispatch", async () => {
  const source = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const credential = await readLeaseReceipt(source.controller.adminCredentialsFile) as { username: string }
  const root = await mkdtemp(path.join(tmpdir(), "evals-admin-pair-guard-"))
  const fixture = await parallelFixture(root)
  const file = parseSlots({ ...fixture.slots, server: source.server,
    controller: { ...fixture.slots.controller, adminCredentialsFile: source.controller.adminCredentialsFile },
    slots: [{ ...fixture.slots.slots[0]!, username: credential.username }] }, 1)
  const identity = await readServerIdentity(file)
  await writeLeaseReceipt(path.join(file.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
  const lease = await acquireSlotLease(file, file.slots[0]!, identity, fixture.lockRoot)
  try {
    const prepared = await stageUserPreparation(file, lease, "e".repeat(64))
    const connection = await openLoginomAdmin(file, identity)
    try {
      await expect(connection.inspectUnactivatedUser(lease, "/unreadable-secret"))
        .rejects.toThrow("SERVER_FENCE_UNCONFIRMED")
      await expect(connection.createBlockedUser(lease, prepared.secretFile)).rejects.toThrow("PAIR_OWNERSHIP")
      await writeLeaseReceipt(path.join(file.controller.stateDir, "pair.json"), await readLeaseReceipt(path.join(source.controller.stateDir, "pair.json")) as object)
      await expect(connection.createBlockedUser(lease, prepared.secretFile)).rejects.toThrow("SERVER_FENCE_UNCONFIRMED")
      const directory = (await readdir(file.controller.stateDir)).find(name => name.startsWith("admin-"))!
      const commands = path.join(file.controller.stateDir, directory, "commands")
      expect((await Promise.all((await readdir(commands)).map(name => Bun.file(path.join(commands, name)).json())))
        .some(command => command.op === "inspect")).toBe(false)
      expect((await Promise.all((await readdir(commands)).map(name => Bun.file(path.join(commands, name)).json())))
        .some(command => command.op === "reconcile-user")).toBe(false)
    } finally { await connection.dispose() }
    const serverLease = await acquireResourceLease({ key: `server:${identity.containerId}`, identity,
      journal: path.join(file.controller.stateDir, "run-journal.json"), commandId: "prepare", lockRoot: fixture.lockRoot })
    try {
      const fenced = await openLoginomAdmin(file, identity, { serverLease })
      try {
        await expect(fenced.inspectUnactivatedUser(lease, prepared.secretFile)).rejects.toThrow("USER_OWNERSHIP_CONFLICT")
        await expect(fenced.reconcileUser(lease, prepared.secretFile)).rejects.toThrow("ADMIN_USER_OWNERSHIP_CONFLICT")
        expect(await Bun.file(path.join(file.controller.stateDir, "user-a.json")).exists()).toBe(false)
      } finally { await fenced.dispose() }
    } finally { await serverLease.close() }
    expect(await readServerIdentity(file)).toEqual(identity)
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
}, 90_000)

liveIntegration("native user capability: creates one blocked account and refuses an unowned name on a disposable research pair", () => nativeUserCapability("sessions"), 120_000)
liveIntegration("native backup research: observes real autosave and preserves unqualified session-backup evidence", () => nativeUserCapability("backup"), 120_000)
liveIntegration("native effective storage: both users refuse neighbor and shared read, write and copy", () => nativeUserCapability("storage"), 120_000)
liveIntegration("native components: both users execute their own CSV and refuse neighbor and shared import/export", () => nativeUserCapability("components"), 120_000)

async function nativeUserCapability(mode: "sessions" | "backup" | "storage" | "components") {
  const source = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const root = await mkdtemp(path.join(tmpdir(), "evals-admin-user-"))
  const fixture = await parallelFixture(root)
  const name = `evals-admin-user-${crypto.randomUUID().slice(0, 8)}`
  const port = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${port.port}/app/`
  port.stop(true)
  const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`,
    network: name, alias: "loginom-server-7.4.2-test", url }, controller: { ...fixture.slots.controller, adminCredentialsFile: source.controller.adminCredentialsFile } }, 1)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: fixture.lockRoot }
  const pair = await createPair(file, options)
  try {
    const runtime = await verifyAdminRuntime(process.env.EVAL_CLI_BIN!)
    const profile = path.join(root, "admin-profile")
    const evidence = path.join(path.dirname(source.controller.stateDir), "evidence", `native-user-${crypto.randomUUID()}`)
    await mkdir(evidence, { mode: 0o700 })
    const journal = path.join(evidence, "commands")
    await mkdir(profile, { mode: 0o700 })
    await mkdir(journal, { mode: 0o700 })
    const credentials = { username: file.slots[0]!.username, password: "E-" + crypto.randomUUID() + "!" }
    const secretFile = path.join(root, "slot-secret.json")
    await writeLeaseReceipt(secretFile, credentials)
    const input = new TransformStream<Uint8Array, Uint8Array>()
    const output = new TransformStream<Uint8Array, Uint8Array>()
    const abort = new AbortController()
    const pending = superviseProcess({ cmd: [runtime.node, path.resolve(import.meta.dir, "../script/loginom-admin-driver.mjs")], cwd: root,
      env: { PATH: "/usr/bin:/bin", HOME: root, LANG: "C.UTF-8", LOGINOM_AI_AGENT_CLI_BUNDLE: runtime.resources },
      timeoutMs: 60_000, profileDir: profile, outDir: evidence, stdin: input.readable, stdout: output.writable, signal: abort.signal, owner: { kind: "admin", id: root } })
    const channel = createJournaledAdminChannel(output.readable, input.writable, journal)
    const request = async (op: AdminOperation, payload: unknown) => {
      if (op !== "dispose") expect(await readServerIdentity(file)).toEqual(pair.identity)
      return channel.request({ v: 1, id: crypto.randomUUID(), op, expectedIdentity: pair.identity, deadline: Date.now() + 30_000, payload })
    }
    let complete = false
    try {
      expect((await request("init", { resourceRoot: runtime.resources, manifestHash: runtime.manifestHash, url,
        credentialsFile: file.controller.adminCredentialsFile, profileDir: path.join(profile, "loginom/runtime/admin/attempts/context/browser-profile") })).outcome).toBe("confirmed")
      const payload = { phase: "blocked", slot: file.slots[0]!, secretFile, preparationNonce: crypto.randomUUID(), desiredHash: "e".repeat(64),
        secretHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(credentials)).digest("hex"), owned: null }
      const first = await request("reconcile-user", payload)
      expect(first).toMatchObject({ outcome: "confirmed" })
      const user = (first.data as { user: { objectId: string; name: string; userKind: number; blocked: boolean } }).user
      expect(user).toMatchObject({ name: credentials.username, userKind: 0, blocked: true })
      expect(user.objectId.length).toBeGreaterThan(0)
      const second = await request("reconcile-user", { ...payload, owned: { objectId: user.objectId, name: user.name, userKind: 0, preparationNonce: payload.preparationNonce } })
      expect(second).toMatchObject({ outcome: "confirmed", data: { created: false, user } })
      expect(await request("reconcile-user", payload)).toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_USER_OWNERSHIP_CONFLICT" } })
      const observation = await request("inspect", {})
      expect(observation.outcome).toBe("confirmed")
      const users = (observation.data as { users: { name: string }[] }).users.filter(user => user.name === credentials.username)
      expect(users).toHaveLength(1)
      expect(users[0]).toMatchObject({ userKind: 0, blocked: true })
      const owned = { objectId: user.objectId, name: user.name, userKind: 0, preparationNonce: payload.preparationNonce, secretHash: null }
      const configured = await request("reconcile-user", { ...payload, phase: "configure", owned })
      expect(configured).toMatchObject({ outcome: "confirmed", data: { passwordChanged: true, authModeChanged: true, secretHash: payload.secretHash,
        user: { objectId: user.objectId, name: credentials.username, userKind: 0, blocked: true, authMode: 1,
          isAdmin: false, isDesigner: true, isViewer: false, useGlobalFileStorage: false, schedulerFullAccess: false, allowPublish: false } } })
      const reused = await request("reconcile-user", { ...payload, phase: "configure", owned: { ...owned, secretHash: payload.secretHash } })
      expect(reused).toMatchObject({ outcome: "confirmed", data: { passwordChanged: false, authModeChanged: false, secretHash: payload.secretHash,
        user: (configured.data as { user: unknown }).user } })
      const policy = (observation.data as { sharedDirectories: { objectId: string; name: string; permissions: { objectId: string; name: string; userKind: number }[] }[] }).sharedDirectories
      expect(policy).toHaveLength(2)
      const acl = { ...payload, phase: "acl", owned: { ...owned, secretHash: payload.secretHash }, expectedPolicy: policy }
      expect(await request("reconcile-user", { ...acl, phase: "activate" })).toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_USER_POLICY_CHANGED" } })
      expect(await request("reconcile-user", { ...acl, expectedPolicy: [] })).toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_ACL_POLICY_CHANGED" } })
      const changed = await request("reconcile-user", acl)
      expect(changed).toMatchObject({ outcome: "confirmed", data: { removed: 2 } })
      const after = (changed.data as { policy: { objectId: string; name: string; permissions: unknown[] }[] }).policy
      expect(after).toHaveLength(2)
      expect(after.every(directory => directory.permissions.length === 0)).toBe(true)
      expect(await request("reconcile-user", { ...acl, expectedPolicy: after })).toMatchObject({ outcome: "confirmed", data: { removed: 0, policy: after } })
      const activation = { ...acl, phase: "activate", expectedPolicy: after }
      expect(await request("reconcile-user", { ...activation, owned })).toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_USER_POLICY_CHANGED" } })
      expect(await request("reconcile-user", activation)).toMatchObject({ outcome: "confirmed", data: { activated: true,
        user: { objectId: user.objectId, name: user.name, userKind: 0, blocked: false } } })
      expect(await request("reconcile-user", activation)).toMatchObject({ outcome: "confirmed", data: { activated: false,
        user: { objectId: user.objectId, name: user.name, userKind: 0, blocked: false } } })
      async function preparePeer() {
        const neighbor = { username: file.slots[1]!.username, password: "E-" + crypto.randomUUID() + "!" }
        const neighborSecret = path.join(root, "neighbor-secret.json")
        await writeLeaseReceipt(neighborSecret, neighbor)
        const neighborPayload = { ...payload, slot: file.slots[1]!, secretFile: neighborSecret, preparationNonce: crypto.randomUUID(),
          secretHash: new Bun.CryptoHasher("sha256").update(JSON.stringify(neighbor)).digest("hex") }
        const created = await request("reconcile-user", neighborPayload)
        expect(created.outcome).toBe("confirmed")
        const peer = (created.data as { user: typeof user }).user
        const peerOwned = { objectId: peer.objectId, name: peer.name, userKind: 0, preparationNonce: neighborPayload.preparationNonce, secretHash: null }
        expect(await request("reconcile-user", { ...neighborPayload, phase: "configure", owned: peerOwned }))
          .toMatchObject({ outcome: "confirmed", data: { user: { name: neighbor.username, blocked: true, isAdmin: false, isDesigner: true } } })
        const peerActivation = { ...neighborPayload, owned: { ...peerOwned, secretHash: neighborPayload.secretHash }, expectedPolicy: after }
        expect(await request("reconcile-user", { ...peerActivation, phase: "activate" })).toMatchObject({ outcome: "confirmed" })
        return { user: peer, activation: peerActivation }
      }
      if (mode === "components") {
        const neighbor = await preparePeer()
        const peer = neighbor.user
        const peerActivation = neighbor.activation
        const names = ["space name.csv", "tab\tname.csv", "line\nname.csv", "Юникод.csv", "-leading.csv", ".hidden.csv", "nested/file.csv", "copy.csv.autosave"]
        const files = ["component-input.csv", ...names.map(name => `component-input/${name}`)]
        const outputs = ["group_sum_qty.result.csv", ...names.map(name => `component-output/${name}.tsv`)]
        for (const [actor, csv] of [[user, "Item,Qty\nA,2\nA,7\nB,11\n"], [peer, "Item,Qty\nA,3\nA,8\nB,19\n"]] as const) {
          const storage = `${file.server.storageRoot}/${actor.name}`
          const input = path.join(root, `sales-${actor.name}.csv`)
          await writeFile(input, csv, { mode: 0o600 })
          await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} mkdir -p ${`${storage}/data`} ${`${storage}/component-input/nested`} ${`${storage}/component-output/nested`}`.quiet()
          await Bun.$`docker --host unix:///var/run/docker.sock cp ${path.resolve(import.meta.dir, "../fixtures/storage/fixture-group-sum-qty.lgp")} ${`${pair.identity.containerId}:${storage}/component-probe.lgp`}`.quiet()
          await Bun.$`docker --host unix:///var/run/docker.sock cp ${input} ${`${pair.identity.containerId}:${storage}/data/sales.csv`}`.quiet()
          await Bun.$`docker --host unix:///var/run/docker.sock cp ${input} ${`${pair.identity.containerId}:${storage}/component-input.csv`}`.quiet()
          for (const name of names) await Bun.$`docker --host unix:///var/run/docker.sock cp ${input} ${`${pair.identity.containerId}:${storage}/component-input/${name}`}`.quiet()
        }
        const shared = after.map(directory => directory.name).sort()
        expect(shared).toEqual(["common", "temp"])
        for (const name of shared) {
          await Bun.$`docker --host unix:///var/run/docker.sock cp ${path.join(root, `sales-${user.name}.csv`)} ${`${pair.identity.containerId}:${file.server.storageRoot}/${name}/component-input.csv`}`.quiet()
          await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} mkdir -p ${`${file.server.storageRoot}/${name}/component-input/nested`} ${`${file.server.storageRoot}/${name}/component-output/nested`}`.quiet()
          await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} cp -R -- ${`${file.server.storageRoot}/${user.name}/component-input/.`} ${`${file.server.storageRoot}/${name}/component-input`}`.quiet()
        }
        const actors = []
        for (const [owner, target, payload, expected] of [[user, peer, activation, "Item\tQty|Сумма\nA\t9\nB\t11\n"],
          [peer, user, peerActivation, "Item\tQty|Сумма\nA\t11\nB\t19\n"]] as const) {
          const baseline = await Promise.all([target.name, ...shared].map(async name => ({ name,
            hash: (await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${name}`} -type f -exec sha256sum -z -- ${"{}"} +`.quiet()).text(),
            entries: (await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${name}`} -mindepth 1 -printf ${"%P\\0%y\\0%s\\0"}`.quiet()).text() })))
          const probe = await request("reconcile-user", { ...payload, phase: "session-component-probe", peer: { name: target.name, objectId: target.objectId } })
          await writeLeaseReceipt(path.join(evidence, `component-probe-${owner.name}.json`), probe)
          expect(probe).toMatchObject({ outcome: "confirmed", data: { ownSession: { username: owner.name }, components: { finished: true, failed: false } } })
          const components = (probe.data as { components: { continued: boolean;
            positives: { file: string; output: string; finished: boolean; failed: boolean }[];
            denials: { pathKind: string; file: string; operation: string; finished: boolean; failed: boolean; targetStatus: number; denied: boolean }[] } }).components
          expect(components.continued).toBe(true)
          expect(components.positives.map(row => [row.file, row.output, row.finished, row.failed]))
            .toEqual(files.map((file, index) => [file, outputs[index]!, true, false]))
          expect(components.denials.map(row => [row.pathKind, row.file, row.operation])).toEqual(files.flatMap(file =>
            ["neighbor", ...shared.map(name => `shared:${name}`)].flatMap(scope =>
              ["virtual", "absolute", "traversal"].flatMap(kind => ["import", "export"].map(operation => [`${scope}:${kind}`, file, operation])))))
          expect(components.denials.every(row => row.denied)).toBe(true)
          expect(components.denials.map(row => [row.finished, row.failed, row.targetStatus])).toEqual(Array.from({ length: files.length * 18 }, () => [true, true, 3]))
          for (const before of baseline) {
            expect((await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${before.name}`} -type f -exec sha256sum -z -- ${"{}"} +`.quiet()).text()).toBe(before.hash)
            expect((await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${before.name}`} -mindepth 1 -printf ${"%P\\0%y\\0%s\\0"}`.quiet()).text()).toBe(before.entries)
          }
          const csv = (await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} cat ${`${file.server.storageRoot}/${owner.name}/group_sum_qty.result.csv`}`.quiet()).text()
          expect(csv.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")).toBe(expected)
          for (const output of outputs.slice(1)) {
            const csv = (await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} cat ${`${file.server.storageRoot}/${owner.name}/${output}`}`.quiet()).text()
            expect(csv.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")).toBe(expected)
          }
          expect(await request("close-session", { proofId: probe.id, session: (probe.data as { binding: unknown }).binding }))
            .toMatchObject({ outcome: "confirmed", data: { closed: true } })
          actors.push({ username: owner.name, peer: target.name, ...components, csvSha256: new Bun.CryptoHasher("sha256").update(csv).digest("hex") })
        }
        await writeLeaseReceipt(path.join(evidence, "component-probe.json"), { version: 1, kind: "native-component-isolation", identity: pair.identity, actors, liveQualified: false })
        complete = true
        return
      }
      if (mode === "storage") {
        const probe = await request("reconcile-user", { ...activation, phase: "session-storage-probe" })
        await writeLeaseReceipt(path.join(evidence, "storage-probe-reply.json"), probe)
        expect(probe.outcome).toBe("confirmed")
        const data = probe.data as { ownSession: { username: string }; binding: unknown;
          storage: { readConfirmed: boolean; size: number; copySize: number; unusual: { name: string; copied: boolean; written: boolean; readConfirmed: boolean; size: number }[] } }
        expect(data.ownSession.username).toBe(credentials.username)
        expect(data.storage.readConfirmed).toBe(true)
        expect(data.storage.size).toBeGreaterThan(0)
        expect(data.storage.copySize).toBe(data.storage.size)
        const names = ["space name.lgp", "tab\tname.lgp", "line\nname.lgp", "Юникод.lgp", "-leading.lgp", ".hidden.lgp", "nested/file.lgp", "copy.lgp.autosave"]
        expect(data.storage.unusual.map(row => row.name)).toEqual(names)
        expect(data.storage.unusual.map(row => [row.copied, row.written, row.readConfirmed, row.size]))
          .toEqual(names.map(() => [true, true, true, data.storage.size]))
        const unusualHashes = (await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} sha256sum -z -- ${`${file.server.storageRoot}/${credentials.username}/access-probe.lgp`} ${names.map(name => `${file.server.storageRoot}/${credentials.username}/access-positive/${name}`)}`.quiet()).text()
          .split("\0").filter(Boolean).map(row => row.split(" ")[0])
        expect(unusualHashes).toHaveLength(names.length + 1)
        expect(unusualHashes.every(hash => hash === unusualHashes[0] && /^[0-9a-f]{64}$/.test(hash!))).toBe(true)
        const writtenHashes = (await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} sha256sum -z -- ${names.map(name => `${file.server.storageRoot}/${credentials.username}/access-positive/${name}.write`)}`.quiet()).text()
          .split("\0").filter(Boolean).map(row => row.slice(0, 64))
        expect(writtenHashes).toEqual(names.map(() => new Bun.CryptoHasher("sha256").update("A").digest("hex")))
        const hashes = await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} sha256sum ${`${file.server.storageRoot}/${credentials.username}/access-probe.lgp`} ${`${file.server.storageRoot}/${credentials.username}/access-copy.lgp`}`.quiet()
        const digests = hashes.text().trim().split("\n").map(line => line.split(" ")[0])
        expect(digests).toHaveLength(2)
        expect(digests[0]).toMatch(/^[0-9a-f]{64}$/)
        expect(digests[1]).toBe(digests[0])
        expect(await request("close-session", { proofId: probe.id, session: data.binding }))
          .toMatchObject({ outcome: "confirmed", data: { closed: true } })
        const neighbor = await preparePeer()
        const peer = neighbor.user
        const peerActivation = neighbor.activation
        const peerProbe = await request("reconcile-user", { ...peerActivation, phase: "session-storage-probe" })
        expect(peerProbe).toMatchObject({ outcome: "confirmed", data: { ownSession: { username: peer.name }, storage: { readConfirmed: true } } })
        const peerData = peerProbe.data as typeof data
        expect(peerData.storage.unusual.map(row => row.name)).toEqual(names)
        expect(peerData.storage.unusual.map(row => [row.copied, row.written, row.readConfirmed, row.size]))
          .toEqual(names.map(() => [true, true, true, peerData.storage.size]))
        const peerHashes = (await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} sha256sum -z -- ${`${file.server.storageRoot}/${peer.name}/access-probe.lgp`} ${names.map(name => `${file.server.storageRoot}/${peer.name}/access-positive/${name}`)}`.quiet()).text()
          .split("\0").filter(Boolean).map(row => row.split(" ")[0])
        expect(peerHashes).toHaveLength(names.length + 1)
        expect(peerHashes.every(hash => hash === peerHashes[0] && /^[0-9a-f]{64}$/.test(hash!))).toBe(true)
        const peerWritten = (await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} sha256sum -z -- ${names.map(name => `${file.server.storageRoot}/${peer.name}/access-positive/${name}.write`)}`.quiet()).text()
          .split("\0").filter(Boolean).map(row => row.slice(0, 64))
        expect(peerWritten).toEqual(writtenHashes)
        expect(await request("close-session", { proofId: peerProbe.id, session: (peerProbe.data as { binding: unknown }).binding }))
          .toMatchObject({ outcome: "confirmed", data: { closed: true } })
        const shared = after.map(directory => directory.name).sort()
        expect(shared).toEqual(["common", "temp"])
        for (const name of shared) {
          expect((await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} test -d ${`${file.server.storageRoot}/${name}`}`.quiet().nothrow()).exitCode).toBe(0)
          await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} cp -- ${`${file.server.storageRoot}/${user.name}/access-probe.lgp`} ${`${file.server.storageRoot}/${name}/access-probe.lgp`}`.quiet()
          await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} cp -R -- ${`${file.server.storageRoot}/${user.name}/access-positive`} ${`${file.server.storageRoot}/${name}/access-positive`}`.quiet()
          expect((await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} sha256sum ${`${file.server.storageRoot}/${name}/access-probe.lgp`}`.quiet()).text().split(" ")[0]).toBe(digests[0])
        }
        const denials = []
        for (const [owner, target, payload] of [[user, peer, activation], [peer, user, peerActivation]] as const) {
          const sharedBefore = await Promise.all(shared.map(async name => ({ name,
            entries: (await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${name}`} -mindepth 1 -printf ${"%P\\0%y\\0%s\\0"}`.quiet()).text(),
            hash: (await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${name}`} -type f -exec sha256sum -z -- ${"{}"} +`.quiet()).text() })))
          const before = await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${target.name}`} -mindepth 1 -printf ${"%P\\0%y\\0%s\\0"}`.quiet()
          const hash = (await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${target.name}`} -type f -exec sha256sum -z -- ${"{}"} +`.quiet()).text()
          expect(await request("reconcile-user", { ...payload, phase: "session-storage-probe", peer: { name: target.name, objectId: "foreign" } }))
            .toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_PEER_IDENTITY_CHANGED" } })
          expect(await request("reconcile-user", { ...payload, phase: "session-storage-probe", peer: { name: "../neighbor", objectId: target.objectId } }))
            .toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_REQUEST_INVALID" } })
          expect(await request("reconcile-user", { ...payload, phase: "session-storage-probe", peer: { name: target.name, objectId: target.objectId },
            expectedPolicy: [{ ...after[0], name: "../common" }] })).toMatchObject({ outcome: "not_applied", data: { code: "ADMIN_CAPABILITY_UNSUPPORTED" } })
          const denied = await request("reconcile-user", { ...payload, phase: "session-storage-probe", peer: { name: target.name, objectId: target.objectId } })
          await writeLeaseReceipt(path.join(evidence, `storage-denials-${owner.name}.json`), denied)
          expect(denied.outcome).toBe("confirmed")
          const data = denied.data as { binding: unknown; storage: { readConfirmed: boolean; continued: boolean;
            denials: { pathKind: string; file: string; operation: string; denied: boolean }[] } }
          expect(data.storage.readConfirmed).toBe(true)
          expect(data.storage.continued).toBe(true)
          expect(data.storage.denials.map(row => [row.pathKind, row.file, row.operation])).toEqual(
            ["virtual", "absolute", "traversal", ...shared.flatMap(name => ["virtual", "absolute", "traversal"].map(kind => `shared:${name}:${kind}`))]
              .flatMap(pathKind => ["access-probe.lgp", ...names.map(name => `access-positive/${name}`)]
                .flatMap(file => ["read", "write", "copy-out", "copy-in"].map(operation => [pathKind, file, operation]))))
          expect(data.storage.denials.every(row => row.denied)).toBe(true)
          expect((await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${target.name}`} -type f -exec sha256sum -z -- ${"{}"} +`.quiet()).text()).toBe(hash)
          expect((await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${target.name}`} -mindepth 1 -printf ${"%P\\0%y\\0%s\\0"}`.quiet()).text()).toBe(before.text())
          for (const baseline of sharedBefore) {
            expect((await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${baseline.name}`} -mindepth 1 -printf ${"%P\\0%y\\0%s\\0"}`.quiet()).text()).toBe(baseline.entries)
            expect((await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} find ${`${file.server.storageRoot}/${baseline.name}`} -type f -exec sha256sum -z -- ${"{}"} +`.quiet()).text()).toBe(baseline.hash)
          }
          expect(await request("close-session", { proofId: denied.id, session: data.binding }))
            .toMatchObject({ outcome: "confirmed", data: { closed: true } })
          denials.push({ username: owner.name, peer: target.name, ...data.storage })
        }
        await writeLeaseReceipt(path.join(evidence, "storage-probe.json"), { version: 1, identity: pair.identity,
          username: credentials.username, positive: { ...data.storage, sha256: digests[0] }, peerPositive: { username: peer.name, ...peerData.storage, sha256: peerHashes[0] },
          sharedControls: shared.map(name => ({ name, sha256: digests[0] })), denials, liveQualified: false })
        complete = true
        return
      }
      if (mode === "backup") {
        const backupProbe = await request("reconcile-user", { ...activation, phase: "session-backup-probe" })
        await writeLeaseReceipt(path.join(evidence, "session-backup-reply.json"), backupProbe)
        const files = Bun.spawn(["docker", "--host", "unix:///var/run/docker.sock", "exec", pair.identity.containerId,
          "find", file.server.backupRoot, file.server.storageRoot, "-maxdepth", "4", "-printf", "%P\\0%y\\0%s\\0"], { stdout: "pipe", stderr: "pipe" })
        await writeLeaseReceipt(path.join(evidence, "session-backup-storage.json"), { identity: pair.identity, exitCode: await files.exited,
          stdout: await new Response(files.stdout).text(), stderr: await new Response(files.stderr).text() })
        expect(backupProbe.outcome).toBe("confirmed")
        const backupData = backupProbe.data as typeof observed & { backup: { periodMs: number; modified: boolean;
          before: { objectId: string; packageCount: number }[]; after: { objectId: string; packageCount: number; startTime: string; backupTime: string }[] } }
        await writeLeaseReceipt(path.join(evidence, "session-backup-probe.json"), { version: 1, identity: pair.identity, ...backupData })
        expect(backupData.backup).toMatchObject({ periodMs: 5000, before: [] })
        const autosave = path.join(evidence, "backup-probe.lgp.autosave")
        const artifact = Bun.spawn(["docker", "--host", "unix:///var/run/docker.sock", "cp",
          `${pair.identity.containerId}:${file.server.storageRoot}/${credentials.username}/backup-probe.lgp.autosave`, autosave], { stdout: "pipe", stderr: "pipe" })
        expect(await artifact.exited).toBe(0)
        const bytes = await Bun.file(autosave).bytes()
        expect(bytes.length).toBeGreaterThan(0)
        await writeLeaseReceipt(path.join(evidence, "autosave-evidence.json"), { identity: pair.identity, username: credentials.username,
          sessionGuid: backupData.ownSession.guid, periodMs: backupData.backup.periodMs, bytes: bytes.length,
          sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"), sessionBackupQualified: false })
        const stop = Bun.spawn(["docker", "--host", "unix:///var/run/docker.sock", "stop", "--time", "10", pair.identity.containerId], { stdout: "pipe", stderr: "pipe" })
        expect(await stop.exited).toBe(0)
        const backupDir = path.join(evidence, "server-shutdown-backup")
        await mkdir(backupDir, { mode: 0o700 })
        const copy = Bun.spawn(["docker", "--host", "unix:///var/run/docker.sock", "cp", `${pair.identity.containerId}:${file.server.backupRoot}/.`, backupDir], { stdout: "pipe", stderr: "pipe" })
        expect(await copy.exited).toBe(0)
        const backups = await readdir(backupDir)
        await writeLeaseReceipt(path.join(evidence, "server-shutdown-backup.json"), { identity: pair.identity, entries: backups })
        // This controlled recipe produces autosave; empty SessionBackup is not a disabled-policy proof.
        expect(backupData.backup.after).toHaveLength(0)
        expect(backups).toHaveLength(0)
        complete = true
        return
      }
      const probe = await request("reconcile-user", { ...activation, phase: "session-probe" })
      expect(probe.outcome).toBe("confirmed")
      const observed = probe.data as { ownSession: { guid: string; objectId: string; userObjectId: string; username: string; isAdmin: boolean; isDesigner: boolean };
        baseline: { objectId: string }[]; opened: { objectId: string; name: string; createdAt: string; packageCount: number }[];
        withPackage: { objectId: string; name: string; createdAt: string; packageCount: number }[];
        afterPackage: { objectId: string; name: string; createdAt: string; packageCount: number }[]; sessionIdentityQualified: boolean;
        afterDisconnect: { objectId: string; name: string; createdAt: string }[];
        binding: { remoteKey: string; userKey: string; username: string; serverEpoch: string; name: string; createdAt: string } }
      await writeLeaseReceipt(path.join(evidence, "session-probe.json"), { version: 1, identity: pair.identity, ...observed })
      expect(observed.ownSession).toMatchObject({ userObjectId: user.objectId, username: user.name, isAdmin: false, isDesigner: true })
      expect(observed.ownSession.guid).toBeString()
      expect(observed.sessionIdentityQualified).toBe(false)
      const candidate = observed.opened.filter(row => !observed.baseline.some(previous => previous.objectId === row.objectId))
      expect(candidate).toHaveLength(1)
      expect(candidate[0]!.name).toMatch(new RegExp(`^${user.name}:\\d+$`))
      expect(candidate[0]!.packageCount).toBe(0)
      expect(observed.withPackage.find(row => row.objectId === candidate[0]!.objectId)).toMatchObject({ ...candidate[0]!, packageCount: 1 })
      expect(observed.afterPackage.find(row => row.objectId === candidate[0]!.objectId)).toMatchObject(candidate[0]!)
      expect(await request("close-session", { proofId: crypto.randomUUID(), session: observed.binding })).toMatchObject({ outcome: "not_applied", data: { code: "SESSION_OWNERSHIP_UNCONFIRMED" } })
      expect(await request("close-session", { proofId: probe.id, session: { ...observed.binding, name: "eval-b:1" } })).toMatchObject({ outcome: "not_applied", data: { code: "SESSION_IDENTITY_CHANGED" } })
      expect(await request("close-session", { proofId: probe.id, session: { ...observed.binding, createdAt: "2026-10-13T00:00:00.000Z" } })).toMatchObject({ outcome: "not_applied", data: { code: "SESSION_IDENTITY_CHANGED" } })
      const close = await request("close-session", { proofId: probe.id, session: observed.binding })
      await writeLeaseReceipt(path.join(evidence, "session-close.json"), { version: 1, identity: pair.identity, ...close })
      expect(close).toMatchObject({ outcome: "confirmed", data: { closed: true } })
      expect(["observed_absent", "rpc_closed"]).toContain((close.data as { disposition: string }).disposition)
      expect(await request("close-session", { proofId: probe.id, session: observed.binding })).toMatchObject({ outcome: "confirmed", data: { closed: true, disposition: "observed_absent" } })
      const closed = await request("inspect", {})
      expect((closed.data as { rawSessions: { objectId: string }[] }).rawSessions.some(row => row.objectId === candidate[0]!.objectId)).toBe(false)
      const disconnected = await request("reconcile-user", { ...activation, phase: "session-crash-probe" })
      expect(disconnected.outcome).toBe("confirmed")
      const disconnectedData = disconnected.data as typeof observed
      await writeLeaseReceipt(path.join(evidence, "session-crash-probe.json"), { version: 1, identity: pair.identity, ...disconnectedData })
      expect(disconnectedData.afterDisconnect.find(row => row.name === disconnectedData.binding.name &&
        row.createdAt === disconnectedData.binding.createdAt)).toBeDefined()
      expect(await request("close-session", { proofId: disconnected.id, session: { ...disconnectedData.binding, name: "eval-b:1" } })).toMatchObject({ outcome: "not_applied", data: { code: "SESSION_IDENTITY_CHANGED" } })
      expect(await request("close-session", { proofId: disconnected.id, session: { ...disconnectedData.binding, createdAt: "2026-10-13T00:00:00.000Z" } })).toMatchObject({ outcome: "not_applied", data: { code: "SESSION_IDENTITY_CHANGED" } })
      const terminated = await request("close-session", { proofId: disconnected.id, session: disconnectedData.binding })
      await writeLeaseReceipt(path.join(evidence, "session-crash-close.json"), { version: 1, identity: pair.identity, ...terminated })
      expect(terminated).toMatchObject({ outcome: "confirmed", data: { closed: true, disposition: "rpc_closed" } })
      expect(await request("close-session", { proofId: disconnected.id, session: disconnectedData.binding })).toMatchObject({ outcome: "confirmed", data: { closed: true, disposition: "observed_absent" } })
      const reconnectProbe = await request("reconcile-user", { ...activation, phase: "session-crash-probe" })
      expect(reconnectProbe.outcome).toBe("confirmed")
      const reconnectData = reconnectProbe.data as typeof observed
      const reconnectSource = path.join(journal, `${reconnectProbe.id}.json`)
      // Native wire observation in the same private codec shape consumed by the parent ledger.
      const claim = { version: 2, kind: "owned-server-session", state: "observed", identity: pair.identity,
        binding: reconnectData.binding, source: { id: reconnectProbe.id, path: reconnectSource,
          sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(await readLeaseReceipt(reconnectSource))).digest("hex") },
        observation: { payload: { ...activation, phase: "session-crash-probe" }, reply: reconnectProbe } }
      const claimFile = path.join(evidence, `session-${reconnectProbe.id}.json`)
      await writeLeaseReceipt(claimFile, claim)
      const adminBaseline = await request("inspect", {})
      const reconnected = await nativeAdminPeer(runtime, file, pair.identity, root, evidence)
      try {
        expect(await reconnected.request("init", { resourceRoot: runtime.resources, manifestHash: runtime.manifestHash, url: file.server.url,
          credentialsFile: file.controller.adminCredentialsFile, profileDir: path.join(reconnected.profile, "loginom/runtime/admin/attempts/context/browser-profile") }))
          .toMatchObject({ outcome: "confirmed" })
        expect(await reconnected.request("close-session", { proofId: reconnectProbe.id, session: reconnectData.binding }))
          .toMatchObject({ outcome: "not_applied", data: { code: "SESSION_OWNERSHIP_UNCONFIRMED" } })
        const adopt = { receipt: claimFile, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(claim)).digest("hex") }
        expect(await reconnected.request("close-session", { proofId: reconnectProbe.id, session: reconnectData.binding,
          adopt: { ...adopt, sha256: "0".repeat(64) } })).toMatchObject({ outcome: "not_applied", data: { code: "SESSION_SOURCE_UNCONFIRMED" } })
        expect(await reconnected.request("close-session", { proofId: reconnectProbe.id, session: { ...reconnectData.binding, name: "eval-b:1" }, adopt }))
          .toMatchObject({ outcome: "not_applied", data: { code: "SESSION_SOURCE_UNCONFIRMED" } })
        await chmod(claimFile, 0o644)
        try {
          expect(await reconnected.request("close-session", { proofId: reconnectProbe.id, session: reconnectData.binding, adopt }))
            .toMatchObject({ outcome: "not_applied", data: { code: "SESSION_SOURCE_UNCONFIRMED" } })
        } finally { await chmod(claimFile, 0o600) }
        const originalCommand = await readLeaseReceipt(reconnectSource) as Record<string, unknown>
        await writeLeaseReceipt(reconnectSource, { ...originalCommand, settledAt: new Date(Date.parse(String(originalCommand.settledAt)) + 1).toISOString() })
        try {
          expect(await reconnected.request("close-session", { proofId: reconnectProbe.id, session: reconnectData.binding, adopt }))
            .toMatchObject({ outcome: "not_applied", data: { code: "SESSION_SOURCE_UNCONFIRMED" } })
        } finally { await writeLeaseReceipt(reconnectSource, originalCommand) }
        const resumed = await reconnected.request("close-session", { proofId: reconnectProbe.id, session: reconnectData.binding, adopt })
        await writeLeaseReceipt(path.join(evidence, "reconnected-session-close.json"), resumed)
        expect(resumed).toMatchObject({ outcome: "confirmed", data: { closed: true, disposition: "rpc_closed" } })
        expect(await reconnected.request("close-session", { proofId: reconnectProbe.id, session: reconnectData.binding, adopt }))
          .toMatchObject({ outcome: "confirmed", data: { closed: true, disposition: "observed_absent" } })
      } finally {
        const beforeDispose = await request("inspect", {}).catch(() => undefined)
        const disposed = await reconnected.dispose()
        expect(disposed).toMatchObject({ outcome: "confirmed", data: { disposed: true, transportDisconnect: "confirmed" } })
        expect(beforeDispose?.outcome).toBe("confirmed")
        const baseline = (adminBaseline.data as { rawSessions: { objectId: string }[] }).rawSessions
        const observedAdmin = beforeDispose!.data as { rawSessions: { objectId: string; name: string; createdAt: string; packageCount: number }[]; ownSession: { username: string } }
        const peerRows = observedAdmin.rawSessions.filter(row => !baseline.some(old => old.objectId === row.objectId))
        expect(peerRows).toHaveLength(1)
        expect(peerRows[0]).toMatchObject({ packageCount: 0 })
        expect(peerRows[0]!.name.startsWith(observedAdmin.ownSession.username + ":")).toBe(true)
        const deadline = Date.now() + 5000
        const afterDispose = async () => {
          const observed = await request("inspect", {})
          expect(observed.outcome).toBe("confirmed")
          return (observed.data as typeof observedAdmin).rawSessions
        }
        let after = await afterDispose()
        while (after.some(row => row.name === peerRows[0]!.name && row.createdAt === peerRows[0]!.createdAt) && Date.now() < deadline) {
          await Bun.sleep(100)
          after = await afterDispose()
        }
        await writeLeaseReceipt(path.join(evidence, "admin-disconnect-observation.json"), { identity: pair.identity,
          baseline: baseline.map(row => row.objectId), opened: observedAdmin.rawSessions, peer: peerRows[0], disposed, after })
        expect(after.some(row => row.name === peerRows[0]!.name && row.createdAt === peerRows[0]!.createdAt)).toBe(false)
      }
      const pendingPackage = await request("reconcile-user", { ...activation, phase: "session-package-crash-probe" })
      expect(pendingPackage.outcome).toBe("confirmed")
      const pendingPackageData = pendingPackage.data as typeof observed
      await writeLeaseReceipt(path.join(evidence, "session-package-crash-probe.json"), { version: 1, identity: pair.identity, ...pendingPackageData })
      expect(pendingPackageData.afterDisconnect.find(row => row.name === pendingPackageData.binding.name &&
        row.createdAt === pendingPackageData.binding.createdAt)).toMatchObject({ packageCount: 1, pendingDisconnect: true })
      expect(await request("close-session", { proofId: pendingPackage.id, session: { ...pendingPackageData.binding, name: "eval-b:1" } }))
        .toMatchObject({ outcome: "not_applied", data: { code: "SESSION_IDENTITY_CHANGED" } })
      expect(await request("close-session", { proofId: pendingPackage.id, session: { ...pendingPackageData.binding, createdAt: "2026-10-13T00:00:00.000Z" } }))
        .toMatchObject({ outcome: "not_applied", data: { code: "SESSION_IDENTITY_CHANGED" } })
      const closedPackage = await request("close-session", { proofId: pendingPackage.id, session: pendingPackageData.binding })
      await writeLeaseReceipt(path.join(evidence, "session-package-crash-close.json"), { version: 1, identity: pair.identity, ...closedPackage })
      expect(closedPackage).toMatchObject({ outcome: "confirmed", data: { closed: true, disposition: "rpc_closed" } })
      expect(await request("close-session", { proofId: pendingPackage.id, session: pendingPackageData.binding }))
        .toMatchObject({ outcome: "confirmed", data: { closed: true, disposition: "observed_absent" } })
      complete = true
    } finally {
      const disposed = await request("dispose", {}).catch(() => undefined)
      if (disposed?.outcome !== "confirmed") abort.abort()
      await channel.end().catch(() => abort.abort())
      const run = await pending
      await writeLeaseReceipt(path.join(evidence, "native-driver-result.json"), { exitCode: run.exitCode, stderr: run.stderr,
        processCleanup: run.processCleanup, timedOut: run.timedOut, interrupted: run.interrupted })
      await channel.close().catch(() => undefined)
      expect(run.processCleanup.status).toBe("confirmed")
      expect(run.processCleanup.capture_complete).toBe(true)
      expect(run.processCleanup.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
      if (complete) {
        expect(disposed?.outcome).toBe("confirmed")
        expect(run.exitCode).toBe(0)
        expect(run.stderr.split("\n").filter(line => line === "ADMIN_USER_WRITE_AUTHMODE")).toHaveLength(["storage", "components"].includes(mode) ? 2 : 1)
        expect(run.stderr.split("\n").filter(line => line === "ADMIN_USER_WRITE_PASSWORD")).toHaveLength(["storage", "components"].includes(mode) ? 2 : 1)
      }
    }
  } finally { await destroyPair(file, options); await rm(root, { recursive: true, force: true }) }
}

liveIntegration("trusted bridge: configured research admin login reads the role and disposes its native browser", async () => {
  const file = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const pair = await Bun.file(path.join(file.controller.stateDir, "pair.json")).json()
  expect({ purpose: pair.purpose, phase: pair.phase }).toEqual({ purpose: "research", phase: "ready" })
  const identity = await readServerIdentity(file)
  const previous = new Set(await readdir(file.controller.stateDir))
  const connection = await openLoginomAdmin(file, identity)
  try {
    expect(connection.identity).toEqual(identity)
    const policy = await connection.inspectPolicy()
    expect(policy.identity).toEqual(identity)
    expect(policy.sharedDirectories).toHaveLength(2)
    expect(policy.sharedDirectories.every(directory => directory.permissions.some(principal => principal.name === "Everyone" && principal.userKind === 2))).toBe(true)
    await expect(connection.inspect()).rejects.toThrow("SESSION_IDENTITY_UNSUPPORTED")
    const root = await mkdtemp(path.join(tmpdir(), "evals-admin-closed-lease-"))
    const fixture = await parallelFixture(root)
    await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
    const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
    try {
      await lease.close()
      await expect(connection.createBlockedUser(lease, path.join(root, "never-read.json"))).rejects.toThrow("LEASE_NOT_HELD")
      await expect(connection.configureOwnedUser(lease, path.join(root, "never-read.json"))).rejects.toThrow("LEASE_NOT_HELD")
      await expect(connection.reconcileOwnedAcl(lease, path.join(root, "never-read.json"))).rejects.toThrow("LEASE_NOT_HELD")
      await expect(connection.observeOwnedSession(lease, path.join(root, "never-read.json"), [])).rejects.toThrow("LEASE_NOT_HELD")
      await expect(connection.closeOwnedSession(lease, path.join(root, "never-read.json"), "never-read")).rejects.toThrow("LEASE_NOT_HELD")
      await expect(connection.reconcileUser(lease, path.join(root, "never-read.json"))).rejects.toThrow("LEASE_NOT_HELD")
    } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
    const recoveryRoot = await mkdtemp(path.join(tmpdir(), "evals-admin-recovery-only-"))
    const recoveryFixture = await parallelFixture(recoveryRoot)
    await writeLeaseReceipt(path.join(recoveryFixture.slots.controller.stateDir, "run-journal.json"), { commandId: "prepare" })
    try {
      const child = Bun.spawn([process.execPath, "-e", `const {acquireSlotLease}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});
        const file=${JSON.stringify(recoveryFixture.slots)};const lease=await acquireSlotLease(file,file.slots[0],${JSON.stringify(identity)},${JSON.stringify(recoveryFixture.lockRoot)});
        console.log(lease.receipt);await lease.close()`], { stdout: "pipe", stderr: "pipe" })
      expect(await child.exited).toBe(0)
      const incident = (await new Response(child.stdout).text()).trim()
      const recovered = await recoverSlotLease(recoveryFixture.slots, recoveryFixture.slots.slots[0]!, identity, incident, recoveryFixture.lockRoot)
      try {
        const secretFile = path.join(recoveryRoot, "never-read.json")
        await expect(connection.createBlockedUser(recovered, secretFile)).rejects.toThrow("SLOT_RECOVERY_ONLY")
        await expect(connection.configureOwnedUser(recovered, secretFile)).rejects.toThrow("SLOT_RECOVERY_ONLY")
        await expect(connection.reconcileOwnedAcl(recovered, secretFile)).rejects.toThrow("SLOT_RECOVERY_ONLY")
        await expect(connection.reconcileUser(recovered, secretFile)).rejects.toThrow("SLOT_RECOVERY_ONLY")
        await expect(connection.observeOwnedSession(recovered, secretFile, [])).rejects.toThrow("SLOT_RECOVERY_ONLY")
      } finally { await recovered.close() }
    } finally { await rm(recoveryRoot, { recursive: true, force: true }) }
  } finally { await connection.dispose() }
  const directories = (await readdir(file.controller.stateDir)).filter(name => name.startsWith("admin-") && !previous.has(name))
  expect(directories).toHaveLength(1)
  const receipt = await Bun.file(path.join(file.controller.stateDir, directories[0]!, "connection.json")).json()
  expect(receipt).toMatchObject({ kind: "loginom-admin-connection", status: "disposed", initialization: "confirmed", dispose: "confirmed", transportDisconnect: "confirmed",
    identity, processes: { status: "confirmed", error: null, observation_mode: "continuous", capture_complete: true } })
  const observation = await Bun.file(path.join(file.controller.stateDir, directories[0]!, "session-observations.json")).json()
  expect(observation).toMatchObject({ version: 1, kind: "admin-session-observations", identity, sessionIdentityQualified: false })
  expect(observation.ownSession.guid).toBeString()
  expect(observation.ownSession.objectId).toBeString()
  expect(observation.ownSession).toHaveProperty("managedObjectId")
  expect(observation.ownSession.isAdmin).toBe(true)
  expect(typeof observation.ownSession.isDesigner).toBe("boolean")
  expect(observation.users.length).toBeGreaterThan(0)
  const ownUser = observation.users.filter((user: { name: string }) => user.name === observation.ownSession.username)
  expect(ownUser).toHaveLength(1)
  expect(ownUser[0]).toMatchObject({ objectId: observation.ownSession.userObjectId, userKind: 0, isAdmin: true,
    isDesigner: observation.ownSession.isDesigner })
  expect(observation.users.every((user: Record<string, unknown>) => typeof user.name === "string" && user.name.length > 0 &&
    user.userKind === 0 && [user.isAdmin, user.isDesigner, user.isViewer, user.blocked, user.useGlobalFileStorage, user.schedulerFullAccess].every(value => typeof value === "boolean"))).toBe(true)
  expect(observation.sharedDirectories).toBeArray()
  expect(observation.sharedDirectories.every((directory: { objectId: string; name: string; permissions: { objectId: string; name: string; userKind: number }[] }) =>
    directory.objectId.length > 0 && directory.name.length > 0 && Array.isArray(directory.permissions) && directory.permissions.every(permission =>
      permission.objectId.length > 0 && permission.name.length > 0 && [0, 1, 2].includes(permission.userKind)))).toBe(true)
  expect(observation.sessions.length).toBeGreaterThan(0)
  expect(observation.sessions.every((row: Record<string, unknown>) => Object.hasOwn(row, "sessionGuid"))).toBe(true)
  expect(observation.sessions.every((row: { objectId: string }) => typeof row.objectId === "string" && row.objectId.length > 0)).toBe(true)
  expect(receipt.processes.browserBindings.length).toBeGreaterThan(0)
  expect(receipt.processes.verification.map((pass: { owned_remaining: number }) => pass.owned_remaining)).toEqual([0, 0])
  expect(await readServerIdentity(file)).toEqual(identity)
  const commands = await readdir(path.join(file.controller.stateDir, directories[0]!, "commands"))
  expect((await Promise.all(commands.map(name => Bun.file(path.join(file.controller.stateDir, directories[0]!, "commands", name)).json())))
    .some(command => command.op === "reconcile-user")).toBe(false)
}, 90_000)

integration("trusted bridge: failed initialization disposes the actual Node child with durable process proof", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "evals-admin-bridge-"))
  const name = `eval-admin-${crypto.randomUUID().slice(0, 8)}`
  const port = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${port.port}/app/`
  port.stop(true)
  const file = parseSlots({ version: 2,
    server: { container: `${name}-server`, studioContainer: `${name}-studio`, network: name, alias: "loginom-server-7.4.2-test", url,
      storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
    controller: { stateDir: `${root}/controller`, adminCredentialsFile: `${root}/secrets/missing.json` },
    judge: { codexHome: `${root}/judge` },
    slots: [{ id: "a", username: "eval-a", profileDir: `${root}/a/profile`, workspaceRoot: `${root}/a/work`, historyDir: `${root}/a/history` }],
  }, 1)
  await mkdir(`${root}/locks`, { mode: 0o700 })
  const options = { purpose: "research" as const, out: `${root}/evidence`, lockRoot: `${root}/locks` }
  const pair = await createPair(file, options)
  try {
    await expect(openLoginomAdmin(file, pair.identity, { binary: "/home/kiselev/.local/bin/loginom-ai-agent-cli" })).rejects.toThrow("ADMIN_CREDENTIAL_PRIVATE")
    const directory = (await readdir(file.controller.stateDir)).filter(name => name.startsWith("admin-"))
    expect(directory).toHaveLength(1)
    const receipt = await Bun.file(path.join(file.controller.stateDir, directory[0]!, "connection.json")).json()
    expect(receipt).toMatchObject({ version: 1, kind: "loginom-admin-connection", status: "disposed", identity: pair.identity,
      initialization: "not_applied", initializationCode: "ADMIN_CREDENTIAL_PRIVATE", initializationStage: null, dispose: "confirmed", disposeCode: null, processes: { status: "confirmed", error: null, observation_mode: "continuous", capture_complete: true } })
    expect(receipt.processes.verification.map((pass: { owned_remaining: number }) => pass.owned_remaining)).toEqual([0, 0])
    expect(receipt.processes.processes.some((entry: { executable: string }) => entry.executable.endsWith("/resources/loginom/bin/node"))).toBe(true)
    const journals = await Promise.all((await readdir(path.join(file.controller.stateDir, directory[0]!, "commands")))
      .map(name => Bun.file(path.join(file.controller.stateDir, directory[0]!, "commands", name)).json()))
    expect(journals.map(row => [row.op, row.state]).sort()).toEqual([["dispose", "confirmed"], ["init", "not_applied"]])
    expect(await Bun.file(`${root}/secrets/missing.json`).exists()).toBe(false)
    expect(receipt.processes.browserBindings).toEqual([])
    await expect(openLoginomAdmin(file, { ...pair.identity, serverEpoch: "e".repeat(64) }, { binary: "/home/kiselev/.local/bin/loginom-ai-agent-cli" }))
      .rejects.toThrow("SERVER_EPOCH_CHANGED")
    expect((await readdir(file.controller.stateDir)).filter(name => name.startsWith("admin-"))).toEqual(directory)
  } finally { await destroyPair(file, options); await rm(root, { recursive: true, force: true }) }
}, 60_000)

integration("real Node driver: rejects generic execution and disposes without starting a browser", async () => {
  const runtime = await verifyAdminRuntime("/home/kiselev/.local/bin/loginom-ai-agent-cli")
  const root = await mkdtemp(path.join(tmpdir(), "evals-admin-driver-"))
  try {
    const child = Bun.spawn([runtime.node, path.resolve(import.meta.dir, "../script/loginom-admin-driver.mjs")],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root, LANG: "C.UTF-8" } })
    const request = { v: 1, id: "driver-1", op: "evaluate", expectedIdentity: identity, deadline: Date.now() + 2000, payload: { javascript: "secret-canary-never-execute" } }
    child.stdin.write(JSON.stringify(request) + "\n" + JSON.stringify({ ...request, id: "driver-2", op: "dispose", payload: {} }) + "\n")
    child.stdin.end()
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(0)
    expect(stdout.trim().split("\n").map(line => JSON.parse(line))).toEqual([
      { v: 1, id: "driver-1", outcome: "not_applied", data: { code: "ADMIN_REQUEST_INVALID" } },
      { v: 1, id: "driver-2", outcome: "confirmed", data: { disposed: true } },
    ])
    expect(stdout + stderr).not.toContain("secret-canary")
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

integration("real Node driver: missing or malformed private credentials fail before browser launch", async () => {
  const runtime = await verifyAdminRuntime("/home/kiselev/.local/bin/loginom-ai-agent-cli")
  const root = await mkdtemp(path.join(tmpdir(), "evals-admin-credentials-"))
  try {
    await mkdir(`${root}/secrets`, { mode: 0o700 })
    await writeFile(`${root}/secrets/invalid.json`, '{"password":"secret-canary-invalid-json"', { mode: 0o600 })
    await writeFile(`${root}/secrets/format-only.json`, JSON.stringify({ username: "unused-fixture", password: "secret-canary-format" }), { mode: 0o600 })
    const child = Bun.spawn([runtime.node, path.resolve(import.meta.dir, "../script/loginom-admin-driver.mjs")],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root, LANG: "C.UTF-8" } })
    const request = { v: 1, id: "missing", op: "init", expectedIdentity: identity, deadline: Date.now() + 2000,
      payload: { resourceRoot: runtime.resources, manifestHash: runtime.manifestHash, url: "http://127.0.0.1:1/app/", credentialsFile: `${root}/secrets/missing.json`, profileDir: `${root}/profile` } }
    child.stdin.write(JSON.stringify(request) + "\n" + JSON.stringify({ ...request, id: "missing-parent", payload: { ...request.payload, credentialsFile: `${root}/absent/secret.json` } }) + "\n" +
      JSON.stringify({ ...request, id: "malformed", payload: { ...request.payload, credentialsFile: `${root}/secrets/invalid.json` } }) + "\n" +
      JSON.stringify({ ...request, id: "bad-runtime", payload: { ...request.payload, credentialsFile: `${root}/secrets/format-only.json`, manifestHash: "0".repeat(64) } }) + "\n" +
      JSON.stringify({ ...request, id: "dispose", op: "dispose", payload: {} }) + "\n")
    child.stdin.end()
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(0)
    expect(stdout.trim().split("\n").map(line => JSON.parse(line))).toEqual([
      { v: 1, id: "missing", outcome: "not_applied", data: { code: "ADMIN_CREDENTIAL_PRIVATE" } },
      { v: 1, id: "missing-parent", outcome: "not_applied", data: { code: "ADMIN_CREDENTIAL_PRIVATE" } },
      { v: 1, id: "malformed", outcome: "not_applied", data: { code: "ADMIN_CREDENTIAL_INVALID" } },
      { v: 1, id: "bad-runtime", outcome: "not_applied", data: { code: "ADMIN_RUNTIME_HASH" } },
      { v: 1, id: "dispose", outcome: "confirmed", data: { disposed: true } },
    ])
    expect(stdout + stderr).not.toContain("secret-canary")
    expect(await Bun.file(`${root}/profile`).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

async function nativeAdminPeer(runtime: Awaited<ReturnType<typeof verifyAdminRuntime>>, file: SlotFile, identity: ServerIdentity, root: string, evidence: string) {
  const directory = path.join(evidence, "reconnected")
  await mkdir(directory, { mode: 0o700 })
  await mkdir(path.join(directory, "commands"), { mode: 0o700 })
  const profile = path.join(root, "reconnected-profile")
  await mkdir(profile, { mode: 0o700 })
  const input = new TransformStream<Uint8Array, Uint8Array>(), output = new TransformStream<Uint8Array, Uint8Array>()
  const abort = new AbortController()
  const pending = superviseProcess({ cmd: [runtime.node, path.resolve(import.meta.dir, "../script/loginom-admin-driver.mjs")], cwd: root,
    env: { PATH: "/usr/bin:/bin", HOME: root, LANG: "C.UTF-8", LOGINOM_AI_AGENT_CLI_BUNDLE: runtime.resources },
    timeoutMs: 30_000, profileDir: profile, outDir: directory, stdin: input.readable, stdout: output.writable, signal: abort.signal,
    owner: { kind: "admin", id: directory } })
  const channel = createJournaledAdminChannel(output.readable, input.writable, path.join(directory, "commands"))
  const request = async (op: AdminOperation, payload: unknown) => {
    if (op !== "dispose") expect(await readServerIdentity(file)).toEqual(identity)
    return channel.request({ v: 1, id: crypto.randomUUID(), op, expectedIdentity: identity, deadline: Date.now() + 20_000, payload })
  }
  return { request, profile, async dispose() {
    const disposed = await request("dispose", {}).catch(() => undefined)
    if (disposed?.outcome !== "confirmed") abort.abort()
    await channel.end().catch(() => abort.abort())
    const result = await pending
    await writeLeaseReceipt(path.join(directory, "native-driver-result.json"), { exitCode: result.exitCode, processCleanup: result.processCleanup, stderr: result.stderr })
    await channel.close().catch(() => undefined)
    expect(result.exitCode).toBe(0)
    expect(result.processCleanup.status).toBe("confirmed")
    expect(result.processCleanup.capture_complete).toBe(true)
    return disposed
  } }
}

liveIntegration("parent preparation: blocked account, configuration, ACL and physical root compose without password rotation", async () => {
  const source = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const root = await mkdtemp(path.join(tmpdir(), "evals-parent-prepare-"))
  const fixture = await parallelFixture(root)
  const name = `evals-parent-${crypto.randomUUID().slice(0, 8)}`
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${listener.port}/app/`
  listener.stop(true)
  const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`,
    network: name, alias: "loginom-server-7.4.2-test", url }, controller: { ...fixture.slots.controller, adminCredentialsFile: source.controller.adminCredentialsFile } }, 1)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: fixture.lockRoot }
  const pair = await createPair(file, options)
  const journal = path.join(file.controller.stateDir, "prepare-command.json")
  await writeLeaseReceipt(journal, { version: 2, commandId: "parent-prepare" })
  const { acquireEnvironmentLeases } = await import("../src/slots")
  const environment = await acquireEnvironmentLeases(file, 1, pair.identity, journal, fixture.lockRoot)
  const lease = environment.slots[0]!
  let verified = false
  const observations: unknown[] = []
  try {
    const prepared = await stageUserPreparation(file, lease, "e".repeat(64))
    const connection = await openLoginomAdmin(file, pair.identity, { serverLease: environment.server })
    try {
      const inspect = () => (async () => {
        const value = await connection.inspectUnactivatedUser(lease, prepared.secretFile)
        const receipt = await readLeaseReceipt(value.source.path) as { command: { path: string; sha256: string }; observation: unknown }
        const command = await readLeaseReceipt(receipt.command.path) as { replyHash: string; op: string; state: string }
        expect(value.source.sha256).toBe(new Bun.CryptoHasher("sha256").update(JSON.stringify(receipt)).digest("hex"))
        expect(receipt.command.sha256).toBe(new Bun.CryptoHasher("sha256").update(JSON.stringify(command)).digest("hex"))
        expect(command).toMatchObject({ op: "inspect", state: "confirmed" })
        expect(command.replyHash).toBe(new Bun.CryptoHasher("sha256").update(JSON.stringify(receipt.observation)).digest("hex"))
        return { ...value, receipt, command }
      })().then(value => ({ value }), error => ({ error: error instanceof Error ? error.message : String(error) }))
      observations.push(await inspect())
      const admin = (await readdir(file.controller.stateDir)).find(name => name.startsWith("admin-"))!
      const commands = path.join(file.controller.stateDir, admin, "commands")
      const before = await readdir(commands)
      const activation = path.join(file.controller.stateDir, `activation-${lease.slot.id}.json`)
      // An invalid marker must fence observation too; this canary never dispatches activation.
      await writeLeaseReceipt(activation, { kind: "negative-activation-canary" })
      try { observations.push(await inspect()) }
      finally { await rm(activation) }
      expect(await readdir(commands)).toEqual(before)
      const first = await connection.reconcileUser(lease, prepared.secretFile)
      const { readUserOwnership, readUserConfiguration } = await import("../src/user-environment")
      const firstConfiguration = await readUserConfiguration(file, lease, prepared.secretFile)
      expect(firstConfiguration?.observation.reply.data).toMatchObject({ passwordChanged: true })
      const reserved = await readLeaseReceipt(path.join(file.controller.stateDir, "storage-a.reserve.json")) as { inode: number; device: string }
      const { prepareUserStorage } = await import("../src/parallel-pair")
      const storage = await prepareUserStorage(file, lease, prepared.secretFile, environment.server)
      expect(storage).toMatchObject({ inode: reserved.inode, device: reserved.device })
      const second = await connection.reconcileUser(lease, prepared.secretFile)
      expect(second).toEqual(first)
      expect(await prepareUserStorage(file, lease, prepared.secretFile, environment.server)).toEqual(storage)
      expect(await readUserOwnership(file, lease, prepared.secretFile)).toMatchObject({ everActivated: false, username: lease.slot.username })
      const configured = await readUserConfiguration(file, lease, prepared.secretFile)
      expect(configured?.observation.reply.data).toMatchObject({ passwordChanged: false, authModeChanged: false })
      const credential = await stageUserPreparation(file, lease, "e".repeat(64))
      expect(credential).toEqual(prepared)
      expect(await readdir(lease.slot.profileDir)).toEqual(["data"])
      expect(await Bun.file(path.join(file.controller.stateDir, `activation-${lease.slot.id}.json`)).exists()).toBe(false)
      observations.push(await inspect())
      verified = true
    } finally { await connection.dispose() }
    // No evaluated-user login is admitted: native read-back requires Blocked=true throughout.
    // The sole real admin transport and process have completed before this test-only release.
    expect(verified).toBe(true)
    const adminDirectory = (await readdir(file.controller.stateDir)).find(name => name.startsWith("admin-"))!
    const disposal = await readLeaseReceipt(path.join(file.controller.stateDir, adminDirectory, "connection.json")) as { status: string; transportDisconnect: string; processes: { status: string; capture_complete: boolean } }
    expect(disposal).toMatchObject({ status: "disposed", transportDisconnect: "confirmed", processes: { status: "confirmed", capture_complete: true } })
    const evidence = path.join(path.dirname(source.controller.stateDir), "evidence", `native-parent-${crypto.randomUUID()}`)
    await mkdir(evidence, { mode: 0o700 })
    await writeLeaseReceipt(path.join(evidence, "blocked-preparation.json"), { version: 2, kind: "native-parent-blocked-preparation", identity: pair.identity,
      slotId: lease.slot.id, accountBlockedThroughout: true, repeatedWithoutPasswordRotation: true, physicalRoot: await readLeaseReceipt(path.join(file.controller.stateDir, "storage-a.json")),
      admin: { status: disposal.status, transportDisconnect: disposal.transportDisconnect, processes: disposal.processes }, observations, liveQualified: false })
    const cleanup = path.join(file.controller.stateDir, "unactivated-test-cleanup.json")
    await writeLeaseReceipt(cleanup, { version: 2, kind: "native-unactivated-test-finalization", status: "confirmed", slotId: lease.slot.id,
      leaseToken: lease.token, serverEpoch: pair.identity.serverEpoch, processes: "confirmed", serverSessions: "confirmed", archive: "committed",
      storageDeletionAllowed: true, nextAdmissionAllowed: true })
    await lease.release(cleanup)
    const release = path.join(file.controller.stateDir, "test-server-release.json")
    await writeLeaseReceipt(release, { version: 2, status: "confirmed", key: environment.server.reservation.key,
      token: environment.server.reservation.token, revision: environment.server.reservation.revision, serverEpoch: pair.identity.serverEpoch })
    await environment.server.release(release)
    await destroyPair(file, options)
    await rm(root, { recursive: true, force: true })
    expect(observations).toMatchObject([
      { value: { identity: pair.identity, username: lease.slot.username, account: null, serverSessions: "absent",
        receipt: { kind: "unactivated-user-observation", slotId: lease.slot.id, leaseToken: lease.token } } },
      { error: "USER_IDLE_UNCONFIRMED" },
      { value: { identity: pair.identity, username: lease.slot.username, account: { name: lease.slot.username, blocked: true }, serverSessions: "absent",
        receipt: { kind: "unactivated-user-observation", slotId: lease.slot.id, leaseToken: lease.token } } },
    ])
  } finally { await Promise.all([environment.server.close(), lease.close()]) }
}, 120_000)
