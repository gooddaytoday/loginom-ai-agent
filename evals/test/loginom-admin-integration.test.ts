import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { verifyAdminRuntime } from "../src/preflight"
import { createJournaledAdminChannel, openLoginomAdmin, type AdminOperation } from "../src/loginom-admin"
import { createPair, destroyPair, readServerIdentity } from "../src/parallel-pair"
import { acquireSlotLease, loadSlots, parseSlots, recoverSlotLease } from "../src/slots"
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
      await expect(connection.createBlockedUser(lease, prepared.secretFile)).rejects.toThrow("PAIR_OWNERSHIP")
      await writeLeaseReceipt(path.join(file.controller.stateDir, "pair.json"), await readLeaseReceipt(path.join(source.controller.stateDir, "pair.json")) as object)
      await expect(connection.createBlockedUser(lease, prepared.secretFile)).rejects.toThrow("SERVER_FENCE_UNCONFIRMED")
      const directory = (await readdir(file.controller.stateDir)).find(name => name.startsWith("admin-"))!
      const commands = path.join(file.controller.stateDir, directory, "commands")
      expect((await Promise.all((await readdir(commands)).map(name => Bun.file(path.join(commands, name)).json())))
        .some(command => command.op === "reconcile-user")).toBe(false)
    } finally { await connection.dispose() }
    const serverLease = await acquireResourceLease({ key: `server:${identity.containerId}`, identity,
      journal: path.join(file.controller.stateDir, "run-journal.json"), commandId: "prepare", lockRoot: fixture.lockRoot })
    try {
      const fenced = await openLoginomAdmin(file, identity, { serverLease })
      try {
        await expect(fenced.reconcileUser(lease, prepared.secretFile)).rejects.toThrow("ADMIN_USER_OWNERSHIP_CONFLICT")
        expect(await Bun.file(path.join(file.controller.stateDir, "user-a.json")).exists()).toBe(false)
      } finally { await fenced.dispose() }
    } finally { await serverLease.close() }
    expect(await readServerIdentity(file)).toEqual(identity)
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
}, 90_000)

liveIntegration("native user capability: creates one blocked account and refuses an unowned name on a disposable research pair", async () => {
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
      expect(await readServerIdentity(file)).toEqual(pair.identity)
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
      complete = true
    } finally {
      const disposed = await request("dispose", {}).catch(() => undefined)
      if (disposed?.outcome !== "confirmed") abort.abort()
      await channel.end().catch(() => abort.abort())
      const run = await pending
      await channel.close().catch(() => undefined)
      expect(run.processCleanup.status).toBe("confirmed")
      expect(run.processCleanup.capture_complete).toBe(true)
      expect(run.processCleanup.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
      if (complete) {
        expect(disposed?.outcome).toBe("confirmed")
        expect(run.exitCode).toBe(0)
        expect(run.stderr.split("\n").filter(line => line === "ADMIN_USER_WRITE_AUTHMODE")).toHaveLength(1)
        expect(run.stderr.split("\n").filter(line => line === "ADMIN_USER_WRITE_PASSWORD")).toHaveLength(1)
      }
    }
  } finally { await destroyPair(file, options); await rm(root, { recursive: true, force: true }) }
}, 120_000)

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
  expect(receipt).toMatchObject({ kind: "loginom-admin-connection", status: "disposed", initialization: "confirmed", dispose: "confirmed",
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
