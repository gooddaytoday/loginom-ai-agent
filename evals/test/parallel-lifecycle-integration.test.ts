import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, readFile, readdir, rm, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createPair, destroyPair, pairImages, prepareUserStorage, readServerIdentity } from "../src/parallel-pair"
import { loadConfig } from "../src/config"
import { agentCommand } from "../src/cli"
import { loadTasks } from "../src/task"
import { afterAttempt, runAttempt } from "../src/run"
import { globalLockRoot, readLeaseReceipt, readResourceReservation, writeLeaseReceipt } from "../src/lease"
import { storageCodecFixture } from "./helpers/storage-codec-fixture"
import { parallelFixture } from "./helpers/parallel-fixture"
import { acquireEnvironmentLeases, loadSlots, parseSlots } from "../src/slots"
import { recoverUnactivatedPreparation } from "../src/preparation-recovery"
import { archiveManagementEnvironment, finalizeUnactivatedEnvironment } from "../src/environment-finalization"
import { openLoginomAdmin, readAdminFinalization, readAdminSessionInventory, sealAdminProcessInventory } from "../src/loginom-admin"

import { readManagementProcessInventory } from "../src/management-process-evidence"
import { management } from "../src/profile"
import { readUserActivation, stageUserPreparation } from "../src/user-environment"
import { readManagementSession, recordManagementSession } from "../src/management-sessions"
import { signalProcess, supervisedProcesses, type ProcessIdentity } from "../src/process-supervisor"

const integration = process.env.EVAL_PAIR_INTEGRATION === "1" ? test : test.skip

for (const mode of ["manual", "finalizer", "interrupted-finalizer", "reconnected-finalizer", "unknown"] as const) test.skipIf(!process.env.EVAL_ADMIN_LIVE_CONFIG || !process.env.LOGINOM_DOCK_API_KEY)(`native CLI setup and check retain session observations during their own process lifetimes${mode === "manual" ? "" : mode === "finalizer" ? " with finalizer" : mode === "interrupted-finalizer" ? " with interrupted finalizer" : mode === "reconnected-finalizer" ? " with reconnected finalizer" : " with unknown session"}`, async () => {
  const source = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const root = await mkdtemp(path.join(tmpdir(), "evals-cli-sessions-")), fixture = await parallelFixture(root)
  const name = `evals-cli-${crypto.randomUUID().slice(0, 8)}`
  const port = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${port.port}/app/`
  port.stop(true)
  const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`,
    network: name, alias: "loginom-server-7.4.2-test", url }, controller: { ...fixture.slots.controller, adminCredentialsFile: source.controller.adminCredentialsFile } }, 1)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: globalLockRoot }
  const pair = await createPair(file, options)
  const evidence = path.join(path.dirname(source.controller.stateDir), "evidence", `native-cli-sessions-${crypto.randomUUID()}`)
  await mkdir(evidence, { mode: 0o700 })
  console.error(`native CLI session evidence: ${evidence}`)
  const journal = path.join(file.controller.stateDir, "cli-command.json"), inventoryFile = path.join(file.controller.stateDir, "management.json")
  const adminInventory = path.join(file.controller.stateDir, "admin-processes.json")
  // Temporary slot authority for external native research; no production release/readiness claim.
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "native-cli-sessions", identity: pair.identity,
    slotIds: [file.slots[0]!.id], phase: "unactivated", processInventory: adminInventory })
  await writeLeaseReceipt(adminInventory, { version: 2, kind: "admin-processes", commandId: "native-cli-sessions", journal, identity: pair.identity, connections: [] })
  const environment = await acquireEnvironmentLeases(file, 1, pair.identity, journal, fixture.lockRoot), lease = environment.slots[0]!
  const prepared = await stageUserPreparation(file, lease, "e".repeat(64)), secretFile = prepared.secretFile
  const credentials = await readLeaseReceipt(secretFile) as { username: string; password: string }
  const settlement = { cli: true, admin: false, preserve: false }
  try {
    const admin = await openLoginomAdmin(file, pair.identity, { serverLease: environment.server, processInventory: adminInventory })
    const peer = { admin: undefined as Awaited<ReturnType<typeof openLoginomAdmin>> | undefined }
    try {
      const claimed = await admin.createBlockedUser(lease, secretFile)
      const configured = await admin.configureOwnedUser(lease, secretFile)
      const acl = await admin.reconcileOwnedAcl(lease, secretFile)
      const storage = await prepareUserStorage(file, lease, secretFile, environment.server)
      const activated = await admin.activateOwnedUser(lease, secretFile)
      expect(activated).toMatchObject({ activated: true, userKey: claimed.userKey })
      expect(await Bun.file(path.join(file.controller.stateDir, "activate-a.receipt.json")).exists()).toBe(true)
      await writeLeaseReceipt(path.join(evidence, "authority.json"), { prepared, claimed, configured, acl, storage,
        activation: await readUserActivation(file, lease, secretFile), activated,
        receipt: await readLeaseReceipt(path.join(file.controller.stateDir, "activate-a.receipt.json")),
        published: await readLeaseReceipt(path.join(file.controller.stateDir, "storage-a.json")),
        commands: await Promise.all([claimed, configured, acl, activated].map(async entry => ({ source: entry.source,
          value: await readLeaseReceipt(entry.source.path) }))) })
      await rm(path.join(file.slots[0]!.profileDir, "data/auth.json"))
      await rmdir(path.join(file.slots[0]!.profileDir, "data"))
      await writeLeaseReceipt(inventoryFile, { version: 2, kind: "management-processes", commandId: "native-cli-sessions", journal, identity: pair.identity,
        leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, processes: [] })
      const commandIntent = await readLeaseReceipt(journal) as Record<string, unknown>
      await writeLeaseReceipt(journal, { ...commandIntent, phase: "cli_admitted" })
      const config = loadConfig(["--skip-judge"], { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: process.env.EVAL_CLI_BIN!, EVAL_PROFILE_DIR: lease.slot.profileDir,
        EVAL_AGENT_MODEL: "openai/gpt-6-luna", LOGINOM_DOCK_API_KEY: process.env.LOGINOM_DOCK_API_KEY! })
      const command = { ...agentCommand(config), cleanupDir: path.join(file.controller.stateDir, "captures"), cleanupSecrets: [credentials.password, config.dock.apiKey],
        managementEvidence: { file: inventoryFile, lease, admin } }
      const captures = []
      for (const operation of mode === "reconnected-finalizer" || mode === "interrupted-finalizer" ? ["setup"] as const : ["setup", "check"] as const) {
        settlement.cli = false
        const result = await management(command, ["loginom", operation, ...(operation === "setup" ? ["--stdin-json"] : []), "--format", "json"],
          operation === "setup" ? JSON.stringify({ url, ...credentials, apiKey: config.dock.apiKey }) : undefined, 60_000)
        settlement.cli = result.processCleanup.status === "confirmed" && result.processCleanup.capture_complete
        expect([result.stdout, result.stderr].some(value => command.cleanupSecrets.some(secret => value.includes(secret)))).toBe(false)
        expect({ code: result.exitCode, stderr: result.stderr, outputOnFailure: result.exitCode ? result.stdout : "" }).toEqual({ code: 0, stderr: "", outputOnFailure: "" })
        expect(JSON.parse(result.stdout)).toMatchObject(operation === "setup" ? { username: credentials.username, url, hasApiKey: true } :
          { ok: true, code: "LOGINOM_CONNECTION_VALID", browser: { state: "verified" } })
        const inventory = await readManagementProcessInventory({ file: inventoryFile, journal, commandId: "native-cli-sessions", identity: pair.identity,
          leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, producerPid: process.pid })
        const sessions = inventory.processes.at(-1)!.sessions!
        const execution = inventory.processes.at(-1)!.result!
        expect(execution).toMatchObject({ exitCode: 0, timedOut: false, interrupted: false,
          stdoutSha256: new Bun.CryptoHasher("sha256").update(result.stdout).digest("hex"), reply: operation === "setup" ?
            { username: credentials.username, url, browser: "verified" } : { ok: true, code: "LOGINOM_CONNECTION_VALID", browser: "verified" } })
        const session = await recordManagementSession(file, lease, secretFile, inventoryFile, inventory.processes.at(-1)!.owner.id)
        expect(session.binding.username).toBe(credentials.username)
        expect(await readManagementSession(file, lease, secretFile, session.id)).toEqual(session)
        captures.push({ operation, output: JSON.parse(result.stdout), inventory, manifest: await readLeaseReceipt(inventoryFile), processes: result.processCleanup,
          resultReceipt: await readLeaseReceipt(execution.source.path), session,
          sources: await Promise.all([sessions.before, ...sessions.during, sessions.after].map(async snapshot => {
            const value = await readLeaseReceipt(snapshot.source.path) as { command: { path: string } }
            return { source: snapshot.source, value, command: await readLeaseReceipt(value.command.path) }
          })) })
      }
      const readonly = []
      for (const operation of mode === "reconnected-finalizer" || mode === "interrupted-finalizer" ? [] : ["status", "recover"] as const) {
        settlement.cli = false
        const result = await management(command, ["loginom", operation, "--format", "json"], undefined, 60_000)
        settlement.cli = result.processCleanup.status === "confirmed" && result.processCleanup.capture_complete
        expect([result.stdout, result.stderr].some(value => command.cleanupSecrets.some(secret => value.includes(secret)))).toBe(false)
        expect({ code: result.exitCode, stderr: result.stderr }).toEqual({ code: 0, stderr: "" })
        const view = JSON.parse(result.stdout)
        expect(view).toMatchObject({ username: credentials.username, url, hasApiKey: true })
        expect(view.recoveries ?? []).toEqual([])
        const inventory = await readManagementProcessInventory({ file: inventoryFile, journal, commandId: "native-cli-sessions", identity: pair.identity,
          leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, producerPid: process.pid })
        const current = inventory.processes.at(-1)!, snapshots = current.sessions!
        expect(current.result?.stdoutSha256).toBe(new Bun.CryptoHasher("sha256").update(result.stdout).digest("hex"))
        expect([...snapshots.during, snapshots.after].flatMap(snapshot => snapshot.sessions.filter(row => row.name.startsWith(credentials.username + ":") &&
          !snapshots.before.sessions.some(previous => previous.objectId === row.objectId)))).toEqual([])
        await expect(recordManagementSession(file, lease, secretFile, inventoryFile, current.owner.id)).rejects.toThrow("MANAGEMENT_SESSION_UNCONFIRMED")
        readonly.push({ operation, view: { state: view.state, browser: view.browser, generation: view.generation }, inventory, manifest: await readLeaseReceipt(inventoryFile), resultReceipt: await readLeaseReceipt(current.result!.source.path),
          processes: result.processCleanup, sources: await Promise.all([snapshots.before, ...snapshots.during, snapshots.after].map(async snapshot => {
            const value = await readLeaseReceipt(snapshot.source.path) as { command: { path: string } }
            return { source: snapshot.source, value, command: await readLeaseReceipt(value.command.path) }
          })) })
      }
      await writeLeaseReceipt(path.join(evidence, "readonly.json"), { identity: pair.identity, observations: readonly })
      await writeLeaseReceipt(path.join(evidence, "cli.json"), { identity: pair.identity, captures, liveQualified: false })
      if (mode === "reconnected-finalizer") {
        await admin.dispose()
        peer.admin = await openLoginomAdmin(file, pair.identity, { serverLease: environment.server, processInventory: adminInventory })
        command.managementEvidence.admin = peer.admin
        const current = await peer.admin.inspectSessionInventory()
        const receipt = await readLeaseReceipt(current.source.path) as { command: { path: string } }
        const session = captures[0]!.session
        expect(current.sessions.some(row => row.name === session.binding.name && row.createdAt === session.binding.createdAt &&
          row.packageCount === 0 && row.objectId !== session.binding.remoteKey)).toBe(true)
        await writeLeaseReceipt(path.join(evidence, "reconnected-before-check.json"), { current, receipt,
          command: await readLeaseReceipt(receipt.command.path), admitted: (await readLeaseReceipt(inventoryFile) as { processes: unknown[] }).processes.length })
      }
      const admitted = (await readLeaseReceipt(inventoryFile) as { processes: unknown[] }).processes.length
      const abort = new AbortController(), stopped = { value: false }
      const suspension: { process?: ProcessIdentity; stoppedAt?: string; signalQueuedAt?: string; continuedAt?: string; continued?: boolean } = {}
      const selected = captures[0]!.processes.selectedCli
      const browser = captures[0]!.processes.processes.find(process => process.executable.endsWith("/chrome"))
      const node = captures[0]!.processes.processes.find(process => process.executable.endsWith("/bin/node"))
      if (mode === "interrupted-finalizer" && (!selected || !browser || !node)) throw Error("NATIVE_CLI_GRAPH_UNAVAILABLE")
      settlement.cli = false
      const interrupted = management(command, ["loginom", "check", "--format", "json"], undefined, 60_000, abort.signal)
        .finally(() => { stopped.value = true })
      const observed = (mode === "reconnected-finalizer" ? interrupted.then(async () => {
        const current = await observeCliSession(inventoryFile, admitted, credentials.username)
        if (!current) throw Error("CHECK_ROW_NOT_OBSERVED")
        return current
      }) : (async () => {
        try {
          const deadline = Date.now() + 30_000
          while (!stopped.value && Date.now() < deadline) {
            if (mode === "interrupted-finalizer" && !suspension.process) {
              const manifest = await Bun.file(inventoryFile).json() as { processes: { owner: { id: string }; state: string }[] }
              const entry = manifest.processes.at(-1)
              const scope = manifest.processes.length > admitted && entry?.state === "planned"
                ? supervisedProcesses().scopes.find(scope => scope.owner.id === entry.owner.id && scope.status === "observed") : undefined
              const cli = scope?.processes?.find(process => process.device === selected!.device && process.inode === selected!.inode)
              const independentBrowser = scope?.processes?.some(process => process.device === browser!.device && process.inode === browser!.inode &&
                scope.processes!.some(parent => parent.pid === process.parent && parent.device === node!.device && parent.inode === node!.inode))
              // The SDK host can finish connecting while its CLI caller remains alive and cannot publish a successful reply.
              if (cli && independentBrowser && await signalProcess(cli, "SIGSTOP")) {
                suspension.process = cli
                suspension.stoppedAt = new Date().toISOString()
              }
            }
            const current = await observeCliSession(inventoryFile, admitted, credentials.username)
            if (current?.state === "planned" && (mode !== "interrupted-finalizer" || suspension.process)) {
              abort.abort()
              if (suspension.process) {
                const deadline = Date.now() + 2000
                while (Date.now() < deadline && !stopped.value) {
                  const status = await readFile(`/proc/${suspension.process.pid}/status`, "utf8")
                  const pending = ["SigPnd", "ShdPnd"].reduce((bits, name) => bits | BigInt("0x" + (status.match(new RegExp(`^${name}:\\s+([a-f0-9]+)$`, "m"))?.[1] ?? "0")), 0n)
                  if (pending & 2n) { suspension.signalQueuedAt = new Date().toISOString(); break }
                  await Bun.sleep(10)
                }
              }
              return current
            }
            await Bun.sleep(25)
          }
          throw Error("CANCELLED_CHECK_ROW_NOT_OBSERVED")
        } finally {
          if (suspension.process) {
            suspension.continued = await signalProcess(suspension.process, "SIGCONT")
            suspension.continuedAt = new Date().toISOString()
          }
        }
      })()).catch(error => { abort.abort(); throw error })
      const cancelled = await Promise.allSettled([interrupted, observed])
      if (mode === "interrupted-finalizer") await writeLeaseReceipt(path.join(evidence, "interruption-control.json"), {
        suspension, observer: cancelled[1].status, process: cancelled[0].status === "fulfilled" ? {
          exitCode: cancelled[0].value.exitCode, interrupted: cancelled[0].value.interrupted, timedOut: cancelled[0].value.timedOut,
          proof: cancelled[0].value.processCleanup } : null,
        manifest: await readLeaseReceipt(inventoryFile).catch(() => null) })
      if (cancelled[0].status === "rejected") throw cancelled[0].reason
      settlement.cli = cancelled[0].value.processCleanup.status === "confirmed" && cancelled[0].value.processCleanup.capture_complete
      if (cancelled[1].status === "rejected") throw cancelled[1].reason
      const inventory = await readManagementProcessInventory({ file: inventoryFile, journal, commandId: "native-cli-sessions", identity: pair.identity,
        leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, producerPid: process.pid })
      const current = inventory.processes.at(-1)!, snapshots = current.sessions!
      const cancelledEvidence = { cancelRequested: mode !== "reconnected-finalizer", observed: cancelled[1].value, inventory, manifest: await readLeaseReceipt(inventoryFile), processes: cancelled[0].value.processCleanup,
        ...(mode === "interrupted-finalizer" ? { suspension } : {}),
        resultReceipt: await readLeaseReceipt(current.result!.source.path), sources: await Promise.all([snapshots.before, ...snapshots.during, snapshots.after].map(async snapshot => {
          const value = await readLeaseReceipt(snapshot.source.path) as { command: { path: string } }
          return { source: snapshot.source, value, command: await readLeaseReceipt(value.command.path) }
        })) }
      await writeLeaseReceipt(path.join(evidence, "cancelled-check.json"), cancelledEvidence)
      expect({ timedOut: cancelled[0].value.timedOut, settled: settlement.cli }).toEqual({ timedOut: false, settled: true })
      expect([cancelled[0].value.stdout, cancelled[0].value.stderr].some(value => command.cleanupSecrets.some(secret => value.includes(secret)))).toBe(false)
      expect(current.result).toMatchObject({ interrupted: cancelled[0].value.interrupted, timedOut: false })
      if (mode === "reconnected-finalizer") expect(cancelled[0].value.interrupted).toBe(false)
      if (mode === "interrupted-finalizer") {
        expect(cancelled[0].value.interrupted).toBe(true)
        expect(suspension).toMatchObject({ stoppedAt: expect.any(String), signalQueuedAt: expect.any(String), continuedAt: expect.any(String), continued: true })
        if (!suspension.process) throw Error("CLI_PAUSE_NOT_OBSERVED")
        expect(cancelled[0].value.processCleanup.processes).toContainEqual(suspension.process)
      }
      if (!current.result?.interrupted) expect(current.result).toMatchObject({ exitCode: 0,
        reply: { browser: "verified", ok: true, code: "LOGINOM_CONNECTION_VALID" } })
      // A completed check may win the abort race; an observed interruption grants no readiness.
      // Data-only failed-result controls restore the original producer receipts before actual close.
      const manifest = cancelledEvidence.manifest as { processes: Record<string, unknown>[] }
      for (const flags of [{ interrupted: false }, { timedOut: true }]) {
        const changed = { ...cancelledEvidence.resultReceipt as Record<string, unknown>, exitCode: 130, reply: null, interrupted: true, ...flags }
        await writeLeaseReceipt(current.result!.source.path, changed)
        await writeLeaseReceipt(inventoryFile, { ...manifest, processes: [...manifest.processes.slice(0, -1), { ...manifest.processes.at(-1),
          result: { path: current.result!.source.path, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(changed)).digest("hex") } }] })
        try { await expect(recordManagementSession(file, lease, secretFile, inventoryFile, current.owner.id)).rejects.toThrow("MANAGEMENT_SESSION_UNCONFIRMED") }
        finally {
          await writeLeaseReceipt(current.result!.source.path, cancelledEvidence.resultReceipt as Record<string, unknown>)
          await writeLeaseReceipt(inventoryFile, manifest)
        }
      }
      const cancelledSession = await recordManagementSession(file, lease, secretFile, inventoryFile, current.owner.id)
      expect(cancelledSession.binding.remoteKey).toBe(cancelled[1].value.row.objectId)
      const registeredCommand = await readLeaseReceipt(journal)
      expect(registeredCommand).toMatchObject({ managementInventories: [{ file: inventoryFile, leaseToken: lease.token,
        slotId: lease.slot.id, profileDir: lease.slot.profileDir }] })
      const registeredInventory = await readLeaseReceipt(inventoryFile)
      await writeLeaseReceipt(path.join(evidence, "registry.json"), { command: registeredCommand,
        source: { path: journal, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(registeredCommand)).digest("hex") },
        inventories: [{ value: registeredInventory, source: { path: inventoryFile,
          sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(registeredInventory)).digest("hex") } }] })
      const sealed = await sealAdminProcessInventory(file, environment.server,
        new Bun.CryptoHasher("sha256").update(JSON.stringify(registeredCommand)).digest("hex"), environment.slots)
      expect(sealed).toMatchObject({ phase: "finalizing", managementSources: [{ path: inventoryFile,
        sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(registeredInventory)).digest("hex") }] })
      await expect(management(command, ["loginom", "status", "--format", "json"], undefined, 60_000))
        .rejects.toThrow("MANAGEMENT_ADMISSION_UNCONFIRMED")
      await expect(openLoginomAdmin(file, pair.identity, { serverLease: environment.server, processInventory: adminInventory,
        binary: "/unreadable-runtime" })).rejects.toThrow("ADMIN_PROCESS_INVENTORY_SEALED")
      expect(await readLeaseReceipt(inventoryFile)).toEqual(registeredInventory)
      expect(await readLeaseReceipt(journal)).toEqual(sealed)
      await writeLeaseReceipt(path.join(evidence, "sealed.json"), { value: sealed, source: { path: journal,
        sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(sealed)).digest("hex") } })
      if (mode === "unknown") {
        // Genuine legacy client outside the registered producer set; no ownership is inferred for its server row.
        const baseline = await admin.inspectSessionInventory()
        settlement.cli = false
        const external = await management({ ...command, managementEvidence: undefined }, ["loginom", "check", "--format", "json"], undefined, 60_000)
        settlement.cli = external.processCleanup.status === "confirmed" && external.processCleanup.capture_complete
        expect({ code: external.exitCode, settled: settlement.cli }).toEqual({ code: 0, settled: true })
        expect(JSON.parse(external.stdout)).toMatchObject({ ok: true, browser: { state: "verified" } })
        expect([external.stdout, external.stderr].some(value => command.cleanupSecrets.some(secret => value.includes(secret)))).toBe(false)
        const receipt = await readLeaseReceipt(baseline.source.path) as { command: { path: string } }
        await writeLeaseReceipt(path.join(evidence, "unregistered.json"), { baseline: { value: baseline, receipt, command: await readLeaseReceipt(receipt.command.path) },
          process: external.processCleanup, result: { exitCode: external.exitCode, timedOut: external.timedOut, interrupted: external.interrupted,
            stdoutSha256: new Bun.CryptoHasher("sha256").update(external.stdout).digest("hex") } })
      }
      // Data-only archive canary; all native CLI and session operations remain genuine.
      const canary = path.join(lease.slot.profileDir, "archive-order-probe")
      expect(await Bun.file(canary).exists()).toBe(false)
      await Bun.write(canary, "native-archive-order")
      const archived = await archiveManagementEnvironment(file, environment)
      expect(await Bun.file(canary).exists()).toBe(false)
      expect(await Bun.file(path.join(archived.profiles[0]!.archive, "archive-order-probe")).text()).toBe("native-archive-order")
      const archiveManifest = await readLeaseReceipt(archived.profiles[0]!.journal)
      expect(archiveManifest).toMatchObject({ status: "committed", profile: lease.slot.profileDir })
      const beforeClose = await (peer.admin ?? admin).inspectSessionInventory()
      expect([...captures.map(capture => capture.session), cancelledSession].every(session =>
        beforeClose.sessions.some(row => row.name === session.binding.name && row.createdAt === session.binding.createdAt &&
          (mode === "reconnected-finalizer" || row.objectId === session.binding.remoteKey)))).toBe(true)
      if (mode === "unknown") {
        const known = [...captures.map(capture => capture.session), cancelledSession]
        const unknown = beforeClose.sessions.filter(row => row.name.startsWith(credentials.username + ":") && !known.some(session => session.binding.remoteKey === row.objectId))
        expect(unknown).toHaveLength(1)
        const { finalizeManagementEnvironment } = await import("../src/environment-finalization")
        await expect(finalizeManagementEnvironment(file, environment, admin)).rejects.toThrow("MANAGEMENT_SESSION_UNKNOWN")
        const after = await admin.inspectSessionInventory()
        const rows = (snapshot: typeof after) => snapshot.sessions.filter(row => row.name.startsWith(credentials.username + ":"))
          .map(row => ({ objectId: row.objectId, name: row.name, createdAt: row.createdAt, packageCount: row.packageCount }))
          .sort((a, b) => a.objectId.localeCompare(b.objectId))
        expect(rows(after)).toEqual(rows(beforeClose))
        for (const session of known) expect(await Bun.file(path.join(file.controller.stateDir, `management-session-${session.id}.closed.json`)).exists()).toBe(false)
        const directory = (await readLeaseReceipt(adminInventory) as { connections: { directory: string }[] }).connections[0]!.directory
        const commands = await Promise.all((await readdir(path.join(directory, "commands"))).map(name => readLeaseReceipt(path.join(directory, "commands", name))))
        expect(commands.some(value => value !== null && typeof value === "object" && "op" in value && value.op === "close-session")).toBe(false)
        expect(await Bun.file(`${journal}.management-finalization.json`).exists()).toBe(false)
        await environment.server.assertHeld()
        await lease.assertHeld()
        await writeLeaseReceipt(path.join(evidence, "unknown-finalizer.json"), { unknown, known, archived,
          archiveReceipt: await readLeaseReceipt(archived.source.path), archiveManifest,
          observations: await Promise.all([beforeClose, after].map(async value => {
            const receipt = await readLeaseReceipt(value.source.path) as { command: { path: string } }
            return { value, receipt, command: await readLeaseReceipt(receipt.command.path) }
          })), commands, storageDeletionAllowed: false, nextAdmissionAllowed: false })
        return
      }
      const { collectManagementSessions } = await import("../src/management-sessions")
      const accounted = await collectManagementSessions(file, lease, secretFile, inventoryFile, beforeClose.source)
      expect(accounted.sessions.map(session => session.id).sort()).toEqual([...captures.map(capture => capture.session.id), cancelledSession.id].sort())
      expect(accounted.source).toEqual({ path: inventoryFile, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(registeredInventory)).digest("hex") })
      const beforeCloseReceipt = await readLeaseReceipt(beforeClose.source.path) as { command: { path: string }; sessions: typeof beforeClose.sessions }
      // Data-only snapshot controls around genuine native sources; restore before any server close.
      const ownRow = beforeClose.sessions.find(row => row.name === cancelledSession.binding.name && row.createdAt === cancelledSession.binding.createdAt)!
      for (const changed of [
        { ...beforeCloseReceipt, sessions: [...beforeCloseReceipt.sessions, { ...ownRow, objectId: "unaccounted", name: credentials.username + ":999" }] },
        { ...beforeCloseReceipt, sessions: beforeCloseReceipt.sessions.map(row => row.objectId === ownRow.objectId ? { ...row, packageCount: 1 } : row) },
      ]) {
        await writeLeaseReceipt(beforeClose.source.path, changed)
        try { await expect(collectManagementSessions(file, lease, secretFile, inventoryFile, { path: beforeClose.source.path,
          sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(changed)).digest("hex") })).rejects.toThrow("MANAGEMENT_SESSION_UNKNOWN") }
        finally { await writeLeaseReceipt(beforeClose.source.path, beforeCloseReceipt) }
      }
      await writeLeaseReceipt(path.join(evidence, "accounted.json"), { value: accounted, records: await Promise.all(accounted.sessions.map(async session => {
        const target = path.join(file.controller.stateDir, `management-session-${session.id}.json`), value = await readLeaseReceipt(target)
        return { value, source: { path: target, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex") } }
      })) })
      await writeLeaseReceipt(path.join(evidence, "archived.json"), { source: archived.source, value: await readLeaseReceipt(archived.source.path),
        profiles: [{ source: { path: archived.profiles[0]!.journal, sha256: archived.profiles[0]!.sha256 }, value: archiveManifest }],
        beforeClose: { value: beforeClose, receipt: beforeCloseReceipt, command: await readLeaseReceipt(beforeCloseReceipt.command.path) } })
      if (mode === "finalizer" || mode === "interrupted-finalizer" || mode === "reconnected-finalizer") {
        const { finalizeManagementEnvironment } = await import("../src/environment-finalization")
        if (peer.admin) {
          const current = await peer.admin.inspectSessionInventory()
          const receipt = await readLeaseReceipt(current.source.path) as { command: { path: string }; sessions: typeof current.sessions }
          await writeLeaseReceipt(path.join(evidence, "reconnected-before-finalizer.json"), { accounted, current, receipt,
            command: await readLeaseReceipt(receipt.command.path) })
          expect(accounted.sessions.every(session => current.sessions.some(row => row.name === session.binding.name &&
            row.createdAt === session.binding.createdAt && row.packageCount === 0))).toBe(true)
          expect(accounted.sessions.some(session => current.sessions.some(row => row.name === session.binding.name &&
            row.createdAt === session.binding.createdAt && row.objectId !== session.binding.remoteKey))).toBe(true)
          const duplicate = { ...receipt, sessions: [...receipt.sessions,
            { ...current.sessions.find(row => row.name === accounted.sessions[0]!.binding.name)!, objectId: "duplicate" }] }
          await writeLeaseReceipt(current.source.path, duplicate)
          try { await expect(collectManagementSessions(file, lease, secretFile, inventoryFile, { path: current.source.path,
            sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(duplicate)).digest("hex") })).rejects.toThrow("MANAGEMENT_SESSION_UNKNOWN") }
          finally { await writeLeaseReceipt(current.source.path, receipt) }
          await writeLeaseReceipt(path.join(evidence, "reconnected-duplicate.json"), { dataOnly: true, rejected: true,
            original: current.source, changed: duplicate })
          expect((await collectManagementSessions(file, lease, secretFile, inventoryFile, current.source)).sessions).toEqual(accounted.sessions)
        }
        const finalized = await finalizeManagementEnvironment(file, environment, peer.admin ?? admin)
        expect(finalized).toMatchObject({ status: "sessions_closed", slots: [{ slotId: lease.slot.id, sessions: expect.arrayContaining(
          accounted.sessions.map(session => expect.objectContaining({ id: session.id, state: "closed" }))) }] })
        await environment.server.assertHeld()
        await lease.assertHeld()
        const terminal = await readLeaseReceipt(finalized.source.path)
        expect(terminal).toMatchObject({ storageDeletionAllowed: false, nextAdmissionAllowed: false })
        const finalization = terminal as { before: { path: string; sha256: string }; processInventory: { path: string } }
        const finalBefore = await readAdminSessionInventory(file, pair.identity, finalization.before)
        const finalBeforeReceipt = await readLeaseReceipt(finalBefore.source.path) as { command: { path: string } }
        await writeLeaseReceipt(path.join(evidence, "finalizer.json"), { value: terminal, result: finalized,
          processInventory: await readLeaseReceipt(finalization.processInventory.path),
          before: { value: finalBefore, receipt: finalBeforeReceipt, command: await readLeaseReceipt(finalBeforeReceipt.command.path) } })
        const closed = await readManagementSession(file, lease, secretFile, cancelledSession.id)
        if (closed.state !== "closed") throw Error("MANAGEMENT_CLOSE_EXPECTED")
        const survivors = await readLeaseReceipt(finalized.after.path) as { command: { path: string } }
        const observed = await readAdminSessionInventory(file, pair.identity, finalized.after)
        expect(observed.sessions.some(row => row.name.toLowerCase().startsWith(credentials.username.toLowerCase() + ":"))).toBe(false)
        await writeLeaseReceipt(path.join(evidence, "cancelled-check.json"), { ...cancelledEvidence, session: cancelledSession, closed,
          survivors: { value: observed, receipt: survivors, command: await readLeaseReceipt(survivors.command.path) },
          terminal: await readLeaseReceipt(path.join(file.controller.stateDir, `management-session-${cancelledSession.id}.closed.json`)),
          command: await readLeaseReceipt(closed.close.path) })
        await writeLeaseReceipt(path.join(evidence, "closed-sessions.json"), { sessions: await Promise.all(captures.map(async capture => {
          const closed = await readManagementSession(file, lease, secretFile, capture.session.id)
          if (closed.state !== "closed") throw Error("MANAGEMENT_CLOSE_EXPECTED")
          return { observed: capture.session, closed, terminal: await readLeaseReceipt(path.join(file.controller.stateDir, `management-session-${capture.session.id}.closed.json`)),
            command: await readLeaseReceipt(closed.close.path) }
        })) })
        if (mode === "reconnected-finalizer") {
          const { readResourceNativeCensus, readResourceProcessWindows, freezeResourceBudget, freezeResourceManifest, writeResourceSummary } = await import("../src/parallel-resource-evidence")
          const { collectHostResources, sampleHostResources } = await import("../src/parallel-resources")
          const { checkResourceEvidence } = await import("../src/parallel-acceptance")
          const { resourceBudgetFixture } = await import("./helpers/resource-budget-fixture")
          const containers = (["server", "studio"] as const).map(role => ({ role, image: pairImages[role], nonce: pair.nonce, purpose: "research",
            id: role === "server" ? pair.identity.containerId : pair.identity.studioContainerId,
            startedAt: role === "server" ? pair.identity.startedAt : pair.identity.studioStartedAt,
            name: file.server[role === "server" ? "container" : "studioContainer"] }))
          const request = { manifest: { state_dir: file.controller.stateDir, run_id: "native-cli-sessions", command_journal: journal,
            slots: [lease.slot], coverage: { containers } }, source: { file: finalized.source.path, sha256: finalized.source.sha256, producerPid: process.pid } }
          const census = await readResourceNativeCensus(request)
          expect(census.proofs.map(proof => proof.sha256)).toEqual(inventory.processes.map(process => process.source.sha256))
          expect(census.adminWindows).toHaveLength(2)
          expect(census.adminSources).toHaveLength(2)
          expect(census.adminWindows.every(window => window.kind === "admin" && window.producerPid === process.pid)).toBe(true)
          await writeLeaseReceipt(path.join(evidence, "native-resource-census.json"), census)
          await expect(readResourceNativeCensus({ ...request, source: { ...request.source, producerPid: process.pid + 1 } }))
            .rejects.toThrow("MANAGEMENT_PROCESS_PROOF_UNCONFIRMED")
          await expect(readResourceNativeCensus({ ...request, manifest: { ...request.manifest, coverage: {
            containers: containers.map(container => ({ ...container, startedAt: "2026-10-14T00:00:00.000Z" })) } } }))
            .rejects.toThrow("RESOURCE_NATIVE_CENSUS_UNCONFIRMED")
          const slotsFile = path.join(evidence, "resource-slots.json"), paths = [file.controller.stateDir, lease.slot.profileDir, lease.slot.workspaceRoot, lease.slot.historyDir]
          await writeLeaseReceipt(slotsFile, file)
          const budget = await freezeResourceBudget({ out: path.join(evidence, "resource-budget.json"), runId: "native-cli-sessions",
            bounds: resourceBudgetFixture(paths, containers) })
          while (Date.now() <= Date.parse(budget.budget.fixed_at)) await Bun.sleep(1)
          const view = (await sampleHostResources(paths)).collector_cgroup.view
          if (!view) throw Error("RESOURCE_VIEW_UNAVAILABLE")
          const frozen = await freezeResourceManifest({ out: path.join(evidence, "resource-manifest.json"), slotsFile, parallel: 1, runId: "native-cli-sessions",
            judgeEnabled: false, commandJournal: journal, containers, view, budget: budget.source })
          while (Date.now() <= Date.parse(frozen.manifest.fixed_at)) await Bun.sleep(1)
          const samplesFile = path.join(evidence, "resource-samples.jsonl"), samplingAbort = new AbortController()
          const collecting = collectHostResources({ paths, out: samplesFile, intervalMs: 1000, runId: "native-cli-sessions", phase: "run", signal: samplingAbort.signal })
          try {
            const deadline = Date.now() + 5000
            while (!await Bun.file(samplesFile).exists() || (await Bun.file(samplesFile).text()).trim().split("\n").length < 2) {
              if (Date.now() > deadline) throw Error("RESOURCE_FRAMES_UNAVAILABLE")
              await Bun.sleep(10)
            }
          } finally { samplingAbort.abort(); await collecting }
          const frames = (await Bun.file(samplesFile).text()).trim().split("\n").map(line => JSON.parse(line))
          const summary = path.join(evidence, "resource-summary.json")
          await writeResourceSummary({ samplesFile, out: summary })
          const windows = [...await readResourceProcessWindows(census.proofs), ...census.adminWindows]
          const result = await checkResourceEvidence({ file: summary, samplesFile, runId: "native-cli-sessions", startedAt: frames[0].host.observed_at,
            finishedAt: frames.at(-1).host.observed_at, coverage: { paths: [], containers: [], owners: windows }, processWindows: [],
            view, budget: budget.source, manifest: frozen.source, nativeCensus: census.source })
          expect(result.checks.nativeCensus).toEqual({ status: "passed", codes: [] })
          expect(result.native_census_source).toEqual(census.source)
          expect(result.admin_process_sources).toEqual(census.adminSources)
          expect(result.process_sources).toEqual(census.proofs)
          // These after-only host frames exercise source composition, without claiming full run resource coverage.
          expect(result.status).not.toBe("passed")
          await writeLeaseReceipt(path.join(evidence, "native-resource-coordinator.json"), { completeRunCoverage: false, dataOnlyBudget: true, frozen, result })
        }
        return
      }
      await admin.closeManagementSession(lease, secretFile, cancelledSession.id)
      const cancelledClosed = await readManagementSession(file, lease, secretFile, cancelledSession.id)
      if (cancelledClosed.state !== "closed") throw Error("MANAGEMENT_CLOSE_EXPECTED")
      const survivors = await admin.inspectSessionInventory()
      expect(survivors.sessions.some(row => row.objectId === cancelledSession.binding.remoteKey)).toBe(false)
      expect(captures.every(capture => survivors.sessions.some(row => row.objectId === capture.session.binding.remoteKey))).toBe(true)
      const survivorSource = await readLeaseReceipt(survivors.source.path) as { command: { path: string } }
      await writeLeaseReceipt(path.join(evidence, "cancelled-check.json"), { ...cancelledEvidence, session: cancelledSession, closed: cancelledClosed,
        survivors: { value: survivors, receipt: survivorSource, command: await readLeaseReceipt(survivorSource.command.path) },
        terminal: await readLeaseReceipt(path.join(file.controller.stateDir, `management-session-${cancelledSession.id}.closed.json`)),
        command: await readLeaseReceipt(cancelledClosed.close.path) })
      for (const capture of captures) {
        expect(await readManagementSession(file, lease, secretFile, capture.session.id)).toEqual(capture.session)
        expect(await recordManagementSession(file, lease, secretFile, inventoryFile, capture.session.actor.owner.id)).toEqual(capture.session)
        const sessions = capture.inventory.processes.at(-1)!.sessions!
        const created = sessions.during.flatMap(snapshot => snapshot.sessions.filter(row => row.name.startsWith(credentials.username + ":") &&
          !sessions.before.sessions.some(previous => previous.objectId === row.objectId)))
        expect(new Set(created.map(row => row.objectId)).size).toBe(1)
        expect(created.every(row => row.name === created[0]!.name && row.createdAt === created[0]!.createdAt && row.packageCount === 0)).toBe(true)
        expect(created[0]!.createdAt).toBeString()
      }
      const ledgerFile = path.join(file.controller.stateDir, `management-session-${captures[0]!.session.id}.json`)
      const saved = await readLeaseReceipt(ledgerFile) as { binding: { name: string } }
      await writeLeaseReceipt(ledgerFile, { ...saved, binding: { ...saved.binding, name: credentials.username + ":999" } })
      await expect(readManagementSession(file, lease, secretFile, captures[0]!.session.id)).rejects.toThrow("MANAGEMENT_SESSION_UNCONFIRMED")
      await writeLeaseReceipt(ledgerFile, saved)
      const setupSession = captures[0]!.session, checkSession = captures[1]!.session
      await admin.closeManagementSession(lease, secretFile, checkSession.id)
      expect(await readManagementSession(file, lease, secretFile, checkSession.id)).toMatchObject({ state: "closed" })
      const remaining = await admin.inspectSessionInventory()
      expect(remaining.sessions.some(row => row.objectId === checkSession.binding.remoteKey)).toBe(false)
      expect(remaining.sessions.some(row => row.objectId === setupSession.binding.remoteKey)).toBe(true)
      await admin.closeManagementSession(lease, secretFile, setupSession.id)
      const closedFile = path.join(file.controller.stateDir, `management-session-${setupSession.id}.closed.json`)
      const closedBytes = await Bun.file(closedFile).text()
      const commands = await readdir(path.join((await readLeaseReceipt(adminInventory) as { connections: { directory: string }[] }).connections[0]!.directory, "commands"))
      await admin.closeManagementSession(lease, secretFile, setupSession.id)
      await Bun.write(closedFile, "null")
      await expect(readManagementSession(file, lease, secretFile, setupSession.id)).rejects.toThrow()
      await Bun.write(closedFile, closedBytes)
      const closed = await readManagementSession(file, lease, secretFile, setupSession.id)
      if (closed.state !== "closed") throw Error("MANAGEMENT_CLOSE_EXPECTED")
      const closeCommand = await Bun.file(closed.close.path).text()
      await writeLeaseReceipt(closed.close.path, { ...await readLeaseReceipt(closed.close.path) as Record<string, unknown>, replyHash: "0".repeat(64) })
      await expect(readManagementSession(file, lease, secretFile, setupSession.id)).rejects.toThrow("SESSION_CLOSE_UNCONFIRMED")
      await Bun.write(closed.close.path, closeCommand)
      expect(await Bun.file(closedFile).text()).toBe(closedBytes)
      expect(await readdir(path.join((await readLeaseReceipt(adminInventory) as { connections: { directory: string }[] }).connections[0]!.directory, "commands"))).toEqual(commands)
      expect((await admin.inspectSessionInventory()).sessions.some(row => row.name.startsWith(credentials.username + ":"))).toBe(false)
      await writeLeaseReceipt(path.join(evidence, "closed-sessions.json"), { sessions: await Promise.all(captures.map(async capture => {
        const closed = await readManagementSession(file, lease, secretFile, capture.session.id)
        if (closed.state !== "closed") throw Error("MANAGEMENT_CLOSE_EXPECTED")
        return { observed: capture.session, closed, terminal: await readLeaseReceipt(path.join(file.controller.stateDir, `management-session-${capture.session.id}.closed.json`)),
          command: await readLeaseReceipt(closed.close.path) }
      })) })
    } catch (error) {
      settlement.preserve = error instanceof Error && error.message === "ARCHIVE_TOPOLOGY"
      await writeLeaseReceipt(path.join(evidence, "native-primary-failure.json"), {
        code: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "NATIVE_ASSERTION_FAILED",
        topology: error instanceof Error && error.message === "ARCHIVE_TOPOLOGY" ? error.cause ?? null : null,
        location: error instanceof Error ? error.stack?.match(/parallel-lifecycle-integration\.test\.ts:\d+:\d+/)?.[0] ?? null : null })
      throw error
    } finally {
      await peer.admin?.dispose()
      await admin.dispose()
      const connections = await readLeaseReceipt(adminInventory) as { connections: { directory: string }[] }
      const directory = connections.connections[0]!.directory
      const finalization = await readAdminFinalization(file, pair.identity, directory, process.pid)
      const connection = await readLeaseReceipt(finalization.source.path) as { finalization: { command: { path: string } } }
      const peers = await Promise.all(connections.connections.slice(1).map(async entry => {
        const finalization = await readAdminFinalization(file, pair.identity, entry.directory, process.pid)
        const connection = await readLeaseReceipt(finalization.source.path) as { finalization: { command: { path: string } } }
        return { finalization, connection, disposeCommand: await readLeaseReceipt(connection.finalization.command.path) }
      }))
      await writeLeaseReceipt(path.join(evidence, "admin.json"), { finalization, connection, disposeCommand: await readLeaseReceipt(connection.finalization.command.path), peers })
      settlement.admin = true
    }
  } finally {
    await Promise.all([environment.server.close(), lease.close()])
    if (settlement.cli && settlement.admin && !settlement.preserve) {
      await destroyPair(file, options)
      await rm(root, { recursive: true, force: true })
    } else console.error(`native CLI session fixture retained: ${root}`)
  }
  // Bounded CLI calls plus native provisioning/teardown and durable evidence writes.
}, 360_000)

async function observeCliSession(inventoryFile: string, admitted: number, username: string) {
  // This live cancellation hint can race atomic replacement; settled evidence is validated strictly below.
  const raw = await Bun.file(inventoryFile).json() as { processes: { state: string; sessions?: { before: { path: string }; during?: { path: string }[] } }[] }
  const current = raw.processes.at(-1)
  if (raw.processes.length <= admitted || !current?.sessions?.during?.length) return
  const before = await readLeaseReceipt(current.sessions.before.path) as { sessions: { objectId: string }[] }
  const source = current.sessions.during.at(-1)!
  const snapshot = await readLeaseReceipt(source.path) as { sessions: { objectId: string; name: string }[] }
  const row = snapshot.sessions.find(row => row.name.startsWith(username + ":") && !before.sessions.some(previous => previous.objectId === row.objectId))
  if (row) return { source, row, state: current.state }
}

for (const partialRelease of [false, true]) test.skipIf(!process.env.EVAL_ADMIN_LIVE_CONFIG)(`mixed native recovery: released A survives B ${partialRelease ? "partial release and recovery SIGKILL" : "dirty root"} and B reuses its committed history`, async () => {
  const source = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const root = await mkdtemp(path.join(tmpdir(), "evals-recover-mixed-")), fixture = await parallelFixture(root)
  const name = `evals-mixed-${crypto.randomUUID().slice(0, 8)}`
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${listener.port}/app/`
  listener.stop(true)
  const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`,
    network: name, alias: "loginom-server-7.4.2-test", url }, controller: { ...fixture.slots.controller, adminCredentialsFile: source.controller.adminCredentialsFile } }, 2)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: globalLockRoot }
  const pair = await createPair(file, options)
  const slotsFile = path.join(root, "slots.json"), journal = path.join(file.controller.stateDir, "prepare-command.json")
  const inventory = path.join(file.controller.stateDir, "processes-original.json")
  await writeLeaseReceipt(slotsFile, file)
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "mixed-native", identity: pair.identity,
    slotIds: ["a", "b"], phase: "unactivated", processInventory: inventory })
  await writeLeaseReceipt(inventory, { version: 2, kind: "admin-processes", commandId: "mixed-native", journal, identity: pair.identity, connections: [] })
  const child = Bun.spawn([process.execPath, "-e", `const {acquireEnvironmentLeases,loadSlots}=await import("./src/slots");
    const {openLoginomAdmin}=await import("./src/loginom-admin");const {stageUserPreparation}=await import("./src/user-environment");
    const {prepareUserStorage}=await import("./src/parallel-pair");const {finalizeUnactivatedEnvironment}=await import("./src/environment-finalization");
    const {mkdir,rmdir}=await import("node:fs/promises");
    const file=await loadSlots(process.argv[1],2),identity=JSON.parse(process.argv[2]);
    const environment=await acquireEnvironmentLeases(file,2,identity,process.argv[3]);
    const admin=await openLoginomAdmin(file,identity,{serverLease:environment.server,processInventory:process.argv[4]});
    for(const lease of environment.slots){const prepared=await stageUserPreparation(file,lease,"e".repeat(64));
      await admin.reconcileUser(lease,prepared.secretFile);await prepareUserStorage(file,lease,prepared.secretFile,environment.server);
      await Bun.write(lease.slot.profileDir+"/data/mixed-history","history-"+lease.slot.id)}
    const b=environment.slots[1],manifest=await Bun.file(b.receipt).json();
    const faultPath=b.receipt+"."+new Bun.CryptoHasher("sha256").update(manifest.resources[1].key).digest("hex")+".released.json";
    if(${partialRelease})await mkdir(faultPath);
    if(!${partialRelease}){const fault=Bun.spawn(["docker","exec",identity.containerId,"sh","-c",'printf blocked > "$1"',"mixed-fault","/workdir/UserStorage/eval-b/blocked"]);
      if(await fault.exited!==0)throw Error("fault creation failed")}
    try{await finalizeUnactivatedEnvironment(file,environment,admin);throw Error("fault not reached")}
    catch(error){if(${partialRelease}?error.code!=="EISDIR":error.message!=="USER_STORAGE_NOT_EMPTY")throw error}
    if(${partialRelease})await rmdir(faultPath);
    if((await Bun.file(environment.slots[0].receipt).json()).state!=="released"||(await Bun.file(environment.slots[1].receipt).json()).state!=="retained")throw Error("wrong mixed boundary");
    await Bun.write(Bun.stdout,JSON.stringify(environment.slots.map(lease=>lease.receipt))+"\\n");process.kill(process.pid,"SIGKILL");`,
    slotsFile, JSON.stringify(pair.identity), journal, inventory], { cwd: path.resolve(import.meta.dir, ".."), stdin: "ignore", stdout: "pipe", stderr: "pipe",
      env: { PATH: process.env.PATH ?? "", HOME: root, EVAL_CLI_BIN: process.env.EVAL_CLI_BIN! } })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stderr }).toEqual({ code: 137, stderr: "" })
  const incidents = JSON.parse(stdout) as string[]
  const originalA = await readLeaseReceipt(incidents[0]!) as { resources: { receipt: string }[] }
  const beforeA = await Promise.all(originalA.resources.map(resource => Bun.file(resource.receipt).text()))
  const archiveB = await readLeaseReceipt(`${incidents[1]}.archive.json`) as { archive: string; status: string }
  expect(archiveB.status).toBe("committed")
  const fromCLI = async (out: string, binary = process.env.EVAL_CLI_BIN!) => {
    const command = Bun.spawn([process.execPath, path.resolve(import.meta.dir, "../script/parallel-env.ts"), "recover", "--config", slotsFile,
      "--incident", journal, "--out", out], { cwd: path.resolve(import.meta.dir, ".."), stdin: "ignore", stdout: "pipe", stderr: "pipe",
      env: { PATH: process.env.PATH ?? "", HOME: root, EVAL_CLI_BIN: binary } })
    const [code, stdout, stderr] = await Promise.all([command.exited, new Response(command.stdout).text(), new Response(command.stderr).text()])
    return { code, stdout, stderr }
  }
  const completed = { released: false }
  try {
    if (partialRelease) {
      const manifestB = await readLeaseReceipt(incidents[1]!) as { resources: { receipt: string }[] }
      expect(await Promise.all(manifestB.resources.map(async resource => (await readLeaseReceipt(resource.receipt) as { state: string }).state)))
        .toEqual(["released", "retained"])
      const adopter = Bun.spawn([process.execPath, "-e", `const {loadSlots}=await import("./src/slots");
        const {recoverPreparationLeases}=await import("./src/preparation-recovery");
        const environment=await recoverPreparationLeases(await loadSlots(process.argv[1],2),JSON.parse(process.argv[2]),process.argv[3]);
        if(environment.slots.length!==1||environment.slots[0].slot.id!=="b")throw Error("wrong adoption");
        await environment.server.assertHeld();await environment.slots[0].assertHeld();process.kill(process.pid,"SIGKILL");`,
        slotsFile, JSON.stringify(pair.identity), journal], { cwd: path.resolve(import.meta.dir, ".."), stdin: "ignore", stdout: "pipe", stderr: "pipe" })
      const [code, stdout, stderr] = await Promise.all([adopter.exited, new Response(adopter.stdout).text(), new Response(adopter.stderr).text()])
      expect({ code, stdout, stderr }).toEqual({ code: 137, stdout: "", stderr: "" })
      expect(await Promise.all(manifestB.resources.map(async resource => readLeaseReceipt(resource.receipt))))
        .toMatchObject([{ state: "recovery-only", revision: 2 }, { state: "recovery-only", revision: 2 }])
    }
    if (!partialRelease) {
      const failed = await fromCLI(path.join(root, "failed-recovery"))
      expect({ code: failed.code, stdout: failed.stdout, stderr: failed.stderr.trim() }).toEqual({ code: 2, stdout: "", stderr: "USER_STORAGE_NOT_EMPTY" })
      expect((await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/UserStorage/eval-b/blocked`.quiet()).text()).toBe("blocked")
      // Remove only the test-injected canary from this never-activated account; production cleanup must have refused it.
      await Bun.$`docker exec ${pair.identity.containerId} rm -- /workdir/UserStorage/eval-b/blocked`.quiet()
    }
    expect(await Promise.all(originalA.resources.map(resource => Bun.file(resource.receipt).text()))).toEqual(beforeA)
    expect(await readResourceReservation({ key: `server:${pair.identity.containerId}` })).toMatchObject({ state: "recovery-only" })
    const retried = await fromCLI(path.join(root, "retried-recovery"))
    expect({ code: retried.code, stderr: retried.stderr, output: retried.code ? retried.stdout : "" }).toEqual({ code: 0, stderr: "", output: "" })
    const result = JSON.parse(retried.stdout) as Awaited<ReturnType<typeof recoverUnactivatedPreparation>>
    completed.released = result.status === "released"
    expect(result.finalization.slots.map(slot => slot.slotId)).toEqual(["a", "b"])
    expect(result.finalization.slots[0]!.cleanup.path).toBe(`${incidents[0]}.cleanup.json`)
    expect(await Promise.all(originalA.resources.map(resource => Bun.file(resource.receipt).text()))).toEqual(beforeA)
    const cleanupB = await readLeaseReceipt(result.finalization.slots[1]!.cleanup.path) as { profileArchive: { archive: string; journal: string } }
    expect(cleanupB.profileArchive).toMatchObject({ archive: archiveB.archive, journal: `${incidents[1]}.archive.json` })
    expect(await Bun.file(path.join(archiveB.archive, "data/mixed-history")).text()).toBe("history-b")
    const beforeServer = await readResourceReservation({ key: `server:${pair.identity.containerId}` })
    const beforeDirectories = await readdir(file.controller.stateDir)
    const completionBytes = await Bun.file(`${journal}.completion.json`).text()
    await rm(result.receipt)
    await rm(`${journal}.completion.json`)
    const reconciled = await fromCLI(path.join(root, "reconciled-recovery"), "/unreadable-runtime")
    expect({ code: reconciled.code, stderr: reconciled.stderr }).toEqual({ code: 0, stderr: "" })
    expect(JSON.parse(reconciled.stdout)).toEqual({ ...result, status: "already_released" })
    expect(await Bun.file(`${journal}.completion.json`).text()).toBe(completionBytes)
    expect(await readResourceReservation({ key: `server:${pair.identity.containerId}` })).toEqual(beforeServer)
    expect(await Promise.all(originalA.resources.map(resource => Bun.file(resource.receipt).text()))).toEqual(beforeA)
    expect(await readdir(file.controller.stateDir)).toEqual(beforeDirectories)
    const completion = await readLeaseReceipt(`${journal}.completion.json`) as { proofs: { path: string; sha256: string }[] }
    const evidence = path.join(path.dirname(source.controller.stateDir), "evidence", `native-mixed-${crypto.randomUUID()}`)
    await mkdir(evidence, { mode: 0o700 })
    await writeLeaseReceipt(path.join(evidence, "mixed.json"), { version: 2, identity: pair.identity, partialRelease, child: { pid: child.pid, code: 137 }, incidents,
      originalA, releasedASnapshots: beforeA.map(value => JSON.parse(value)), archiveB, result, completion,
      sources: await Promise.all(completion.proofs.map(async source => ({ ...source, value: await readLeaseReceipt(source.path) }))), liveQualified: false })
  } catch (error) { if (!completed.released) console.error(`mixed recovery fixture retained: ${root}`); throw error }
  finally { if (completed.released) { await destroyPair(file, options); await rm(root, { recursive: true, force: true }) } }
}, 120_000)

test.skipIf(!process.env.EVAL_ADMIN_LIVE_CONFIG)("server fence after last slot: SIGKILL recovery preserves released user and profile reservations", async () => {
  const source = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const root = await mkdtemp(path.join(tmpdir(), "evals-recover-tail-")), fixture = await parallelFixture(root)
  const name = `evals-tail-${crypto.randomUUID().slice(0, 8)}`
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${listener.port}/app/`
  listener.stop(true)
  const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`,
    network: name, alias: "loginom-server-7.4.2-test", url }, controller: { ...fixture.slots.controller, adminCredentialsFile: source.controller.adminCredentialsFile } }, 1)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: globalLockRoot }
  const pair = await createPair(file, options)
  const slotsFile = path.join(root, "slots.json"), journal = path.join(file.controller.stateDir, "prepare-command.json")
  const inventory = path.join(file.controller.stateDir, "processes-original.json")
  await writeLeaseReceipt(slotsFile, file)
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "tail-fence", identity: pair.identity,
    slotIds: ["a"], phase: "unactivated", processInventory: inventory })
  await writeLeaseReceipt(inventory, { version: 2, kind: "admin-processes", commandId: "tail-fence", journal, identity: pair.identity, connections: [] })
  const child = Bun.spawn([process.execPath, "-e", `const {mkdir,rmdir}=await import("node:fs/promises");
    const {acquireEnvironmentLeases,loadSlots}=await import("./src/slots");const {openLoginomAdmin}=await import("./src/loginom-admin");
    const {stageUserPreparation}=await import("./src/user-environment");const {prepareUserStorage}=await import("./src/parallel-pair");
    const {finalizeUnactivatedEnvironment}=await import("./src/environment-finalization");
    const file=await loadSlots(process.argv[1],1),identity=JSON.parse(process.argv[2]),journal=process.argv[3];
    const environment=await acquireEnvironmentLeases(file,1,identity,journal),lease=environment.slots[0];
    const admin=await openLoginomAdmin(file,identity,{serverLease:environment.server,processInventory:process.argv[4]});
    const prepared=await stageUserPreparation(file,lease,"e".repeat(64));
    await admin.reconcileUser(lease,prepared.secretFile);await prepareUserStorage(file,lease,prepared.secretFile,environment.server);
    await Bun.write(lease.slot.profileDir+"/data/tail-history","preserve-tail-history");
    await mkdir(journal+".server-finalization.json");
    try{await finalizeUnactivatedEnvironment(file,environment,admin);throw Error("fault not reached")}
    catch(error){if(error.code!=="EISDIR")throw error}
    await rmdir(journal+".server-finalization.json");
    if((await Bun.file(lease.receipt).json()).state!=="released"||(await Bun.file(environment.server.receipt).json()).state!=="retained")throw Error("wrong crash boundary");
    await Bun.write(Bun.stdout,lease.receipt+"\\n");process.kill(process.pid,"SIGKILL");`,
    slotsFile, JSON.stringify(pair.identity), journal, inventory], { cwd: path.resolve(import.meta.dir, ".."), stdin: "ignore", stdout: "pipe", stderr: "pipe",
      env: { PATH: process.env.PATH ?? "", HOME: root, EVAL_CLI_BIN: process.env.EVAL_CLI_BIN! } })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stderr }).toEqual({ code: 137, stderr: "" })
  const incident = stdout.trim(), originalSlot = await readLeaseReceipt(incident) as { resources: { receipt: string }[] }
  const before = await Promise.all(originalSlot.resources.map(resource => Bun.file(resource.receipt).text()))
  const originalServer = await readResourceReservation({ key: `server:${pair.identity.containerId}` })
  expect(originalServer).toMatchObject({ state: "retained", owner: { pid: child.pid } })
  const adminDirectories = (await readdir(file.controller.stateDir)).filter(name => name.startsWith("admin-"))
  const fromCLI = async (out: string) => {
    const command = Bun.spawn([process.execPath, path.resolve(import.meta.dir, "../script/parallel-env.ts"), "recover", "--config", slotsFile,
      "--incident", journal, "--out", out], { cwd: path.resolve(import.meta.dir, ".."), stdin: "ignore", stdout: "pipe", stderr: "pipe",
      env: { PATH: process.env.PATH ?? "", HOME: root, EVAL_CLI_BIN: "/unreadable-runtime" } })
    const [code, stdout, stderr] = await Promise.all([command.exited, new Response(command.stdout).text(), new Response(command.stderr).text()])
    return { pid: command.pid, code, stdout, stderr }
  }
  const completed = { released: false }
  try {
    const connection = path.join(file.controller.stateDir, adminDirectories[0]!, "connection.json")
    const bytes = await Bun.file(connection).text(), receipt = JSON.parse(bytes)
    await writeLeaseReceipt(connection, { ...receipt, processes: { ...receipt.processes, capture_complete: false } })
    try {
      const refused = await fromCLI(path.join(root, "refused-recovery"))
      expect({ code: refused.code, stdout: refused.stdout, stderr: refused.stderr.trim() }).toEqual({ code: 2, stdout: "", stderr: "ADMIN_FINALIZATION_UNCONFIRMED" })
      expect(await readResourceReservation({ key: `server:${pair.identity.containerId}` })).toMatchObject({ state: "recovery-only",
        revision: originalServer!.revision + 1, owner: { pid: refused.pid } })
      expect(await Promise.all(originalSlot.resources.map(resource => Bun.file(resource.receipt).text()))).toEqual(before)
    } finally { await writeLeaseReceipt(connection, JSON.parse(bytes)) }
    const retainedAfterRefusal = await readResourceReservation({ key: `server:${pair.identity.containerId}` })
    const command = await fromCLI(path.join(root, "recovery-output"))
    expect({ code: command.code, stderr: command.stderr, output: command.code ? command.stdout : "" }).toEqual({ code: 0, stderr: "", output: "" })
    const result = JSON.parse(command.stdout) as Awaited<ReturnType<typeof recoverUnactivatedPreparation>>
    completed.released = result.status === "released"
    expect(await Promise.all(originalSlot.resources.map(resource => Bun.file(resource.receipt).text()))).toEqual(before)
    expect((await readdir(file.controller.stateDir)).filter(name => name.startsWith("admin-"))).toEqual(adminDirectories)
    expect(await readResourceReservation({ key: `server:${pair.identity.containerId}` })).toMatchObject({ state: "released", revision: originalServer!.revision + 2,
      lineage: [{ journal, owner: { pid: child.pid } }, { journal: retainedAfterRefusal!.journal, owner: retainedAfterRefusal!.owner }] })
    const cleanup = await readLeaseReceipt(result.finalization.slots[0]!.cleanup.path) as { profileArchive: { archive: string } }
    expect(await Bun.file(path.join(cleanup.profileArchive.archive, "data/tail-history")).text()).toBe("preserve-tail-history")
    const completion = await readLeaseReceipt(`${journal}.completion.json`) as { proofs: { path: string; sha256: string }[] }
    const evidence = path.join(path.dirname(source.controller.stateDir), "evidence", `native-tail-${crypto.randomUUID()}`)
    await mkdir(evidence, { mode: 0o700 })
    await writeLeaseReceipt(path.join(evidence, "tail.json"), { version: 2, identity: pair.identity, child: { pid: child.pid, code: 137 }, originalServer, retainedAfterRefusal,
      originalSlot, releasedResourceSnapshots: before.map(value => JSON.parse(value)), result, completion,
      sources: await Promise.all(completion.proofs.map(async source => ({ ...source, value: await readLeaseReceipt(source.path) }))), liveQualified: false })
  } catch (error) { if (!completed.released) console.error(`tail recovery fixture retained: ${root}`); throw error }
  finally { if (completed.released) { await destroyPair(file, options); await rm(root, { recursive: true, force: true }) } }
}, 120_000)

test.skipIf(!process.env.EVAL_ADMIN_LIVE_CONFIG)("preparation recovery: native blocked account releases after its controller exits", async () => {
  const source = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const root = await mkdtemp(path.join(tmpdir(), "evals-recover-preparation-")), fixture = await parallelFixture(root)
  const name = `evals-recover-${crypto.randomUUID().slice(0, 8)}`
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${listener.port}/app/`
  listener.stop(true)
  const file = parseSlots({ ...fixture.slots, server: { ...fixture.slots.server, container: `${name}-server`, studioContainer: `${name}-studio`,
    network: name, alias: "loginom-server-7.4.2-test", url }, controller: { ...fixture.slots.controller, adminCredentialsFile: source.controller.adminCredentialsFile } }, 1)
  const options = { purpose: "research" as const, out: path.join(root, "evidence"), lockRoot: globalLockRoot }
  const pair = await createPair(file, options)
  const slotsFile = path.join(root, "slots.json"), journal = path.join(file.controller.stateDir, "prepare-command.json")
  const inventory = path.join(file.controller.stateDir, "processes-original.json")
  await writeLeaseReceipt(slotsFile, file)
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "recovery-native", identity: pair.identity,
    slotIds: ["a"], phase: "unactivated", processInventory: inventory })
  await writeLeaseReceipt(inventory, { version: 2, kind: "admin-processes", commandId: "recovery-native", journal, identity: pair.identity, connections: [] })
  const child = Bun.spawn([process.execPath, "-e", `const {acquireEnvironmentLeases,loadSlots}=await import("./src/slots");
    const {openLoginomAdmin}=await import("./src/loginom-admin");const {stageUserPreparation}=await import("./src/user-environment");
    const {prepareUserStorage}=await import("./src/parallel-pair");const file=await loadSlots(process.argv[1],1),identity=JSON.parse(process.argv[2]);
    const environment=await acquireEnvironmentLeases(file,1,identity,process.argv[3]);
    try {const admin=await openLoginomAdmin(file,identity,{serverLease:environment.server,processInventory:process.argv[4]});
      try {const lease=environment.slots[0],prepared=await stageUserPreparation(file,lease,"e".repeat(64));
        await admin.reconcileUser(lease,prepared.secretFile);await prepareUserStorage(file,lease,prepared.secretFile,environment.server);
        await Bun.write(lease.slot.profileDir+"/data/recovery-history","preserve-native-recovery");console.log(lease.receipt);
      }finally{await admin.dispose()}
    }finally{await Promise.all([environment.server.close(),...environment.slots.map(lease=>lease.close())])}`,
    slotsFile, JSON.stringify(pair.identity), journal, inventory],
    { cwd: path.resolve(import.meta.dir, ".."), env: { PATH: process.env.PATH ?? "", HOME: root, EVAL_CLI_BIN: process.env.EVAL_CLI_BIN! },
      stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  const incident = stdout.trim()
  await Bun.$`docker exec ${pair.identity.containerId} sh -c ${'mkdir /workdir/UserStorage/eval-b; printf preserve > /workdir/UserStorage/eval-b/recovery-control'}`.quiet()
  const completed = { released: false }
  try {
    const recovered = await recoverUnactivatedPreparation({ slotsFile, incident: journal })
    const result = recovered.finalization
    completed.released = result.status === "released"
    const recoverySlot = result.slots[0]!.cleanup.path.slice(0, -".cleanup.json".length)
    expect(result.status).toBe("released")
    expect(await readLeaseReceipt(incident)).toMatchObject({ state: "released", releaseReceipt: recoverySlot })
    const cleanup = await readLeaseReceipt(result.slots[0]!.cleanup.path) as { profileArchive: { archive: string }; recoveryProcessInventories: unknown[] }
    expect(await Bun.file(path.join(cleanup.profileArchive.archive, "data/recovery-history")).text()).toBe("preserve-native-recovery")
    expect(cleanup.recoveryProcessInventories).toHaveLength(1)
    expect((await Bun.$`docker exec ${pair.identity.containerId} cat /workdir/UserStorage/eval-b/recovery-control`.quiet()).text()).toBe("preserve")
    const fromCLI = async (out: string) => {
      const command = Bun.spawn([process.execPath, path.resolve(import.meta.dir, "../script/parallel-env.ts"), "recover", "--config", slotsFile,
        "--incident", journal, "--out", out], { cwd: path.resolve(import.meta.dir, ".."), stdin: "ignore", stdout: "pipe", stderr: "pipe",
        env: { PATH: process.env.PATH ?? "", HOME: root, EVAL_CLI_BIN: "/unreadable-runtime" } })
      const [code, stdout, stderr] = await Promise.all([command.exited, new Response(command.stdout).text(), new Response(command.stderr).text()])
      return { code, stdout, stderr }
    }
    const beforeRepeat = await readdir(file.controller.stateDir)
    const terminalFiles = [recovered.receipt, `${journal}.completion.json`]
    const terminalBytes = await Promise.all(terminalFiles.map(file => Bun.file(file).text()))
    await Promise.all(terminalFiles.map(file => rm(file)))
    try {
      const bytes = await Bun.file(result.server.path).text()
      await writeLeaseReceipt(result.server.path, { ...JSON.parse(bytes), status: "unknown" })
      try {
        const refused = await fromCLI(path.join(root, "refused-reconciliation"))
        expect({ code: refused.code, stdout: refused.stdout, stderr: refused.stderr.trim() }).toEqual({ code: 2, stdout: "", stderr: "PREPARATION_COMPLETION_UNCONFIRMED" })
        expect(await Promise.all(terminalFiles.map(file => Bun.file(file).exists()))).toEqual([false, false])
      } finally { await writeLeaseReceipt(result.server.path, JSON.parse(bytes)) }
      const reconciled = await fromCLI(path.join(root, "reconciled-recovery"))
      expect({ code: reconciled.code, stderr: reconciled.stderr, output: reconciled.code ? reconciled.stdout : "" }).toEqual({ code: 0, stderr: "", output: "" })
      expect(JSON.parse(reconciled.stdout)).toMatchObject({ status: "already_released", finalization: result })
      expect(await Promise.all(terminalFiles.map(file => Bun.file(file).text()))).toEqual(terminalBytes)
    } finally {
      await Promise.all(terminalFiles.map((file, index) => writeLeaseReceipt(file, JSON.parse(terminalBytes[index]!))))
    }
    expect(await readdir(file.controller.stateDir)).toEqual(beforeRepeat)
    const repeated = await fromCLI(path.join(root, "repeated-recovery"))
    expect({ code: repeated.code, stderr: repeated.stderr, output: repeated.code ? repeated.stdout : "" }).toEqual({ code: 0, stderr: "", output: "" })
    expect(JSON.parse(repeated.stdout)).toMatchObject({ status: "already_released", ready: false, journal: recovered.journal, finalization: result })
    expect(await readdir(file.controller.stateDir)).toEqual(beforeRepeat)
    const completion = await readLeaseReceipt(`${journal}.completion.json`) as { proofs: { path: string; sha256: string }[] }
    const retainedSources = await Promise.all(completion.proofs.map(async source => ({ ...source, value: await readLeaseReceipt(source.path) })))
    const bytes = await Bun.file(result.server.path).text()
    await writeLeaseReceipt(result.server.path, { ...JSON.parse(bytes), status: "unknown" })
    try { await expect(recoverUnactivatedPreparation({ slotsFile, incident: journal })).rejects.toThrow("PREPARATION_COMPLETION_UNCONFIRMED") }
    finally { await writeLeaseReceipt(result.server.path, JSON.parse(bytes)) }
    expect(await readdir(file.controller.stateDir)).toEqual(beforeRepeat)
    const nextJournal = path.join(file.controller.stateDir, "next-command.json"), nextInventory = path.join(file.controller.stateDir, "processes-next.json")
    await writeLeaseReceipt(nextJournal, { version: 2, kind: "unactivated-preparation", commandId: "next-preparation", identity: pair.identity,
      slotIds: ["a"], phase: "unactivated", processInventory: nextInventory })
    await writeLeaseReceipt(nextInventory, { version: 2, kind: "admin-processes", commandId: "next-preparation", journal: nextJournal, identity: pair.identity, connections: [] })
    const next = await acquireEnvironmentLeases(file, 1, pair.identity, nextJournal)
    const nextManifest = await readLeaseReceipt(next.slots[0]!.receipt) as { resources: { receipt: string }[] }
    const reserved = [next.server.receipt, ...nextManifest.resources.map(resource => resource.receipt)]
    const beforeNext = await Promise.all(reserved.map(file => Bun.file(file).text()))
    const nextNames = await readdir(file.controller.stateDir)
    try {
      expect(await recoverUnactivatedPreparation({ slotsFile, incident: journal })).toMatchObject({ status: "already_released", finalization: result })
      expect(await Promise.all(reserved.map(file => Bun.file(file).text()))).toEqual(beforeNext)
      expect(await readdir(file.controller.stateDir)).toEqual(nextNames)
    } finally {
      try {
        const admin = await openLoginomAdmin(file, pair.identity, { serverLease: next.server, processInventory: nextInventory })
        try {
          const finalized = await finalizeUnactivatedEnvironment(file, next, admin)
          expect(await recoverUnactivatedPreparation({ slotsFile, incident: nextJournal })).toMatchObject({ status: "already_released", finalization: finalized })
          const names = await readdir(file.controller.stateDir)
          expect(await recoverUnactivatedPreparation({ slotsFile, incident: nextJournal })).toMatchObject({ status: "already_released", finalization: finalized })
          expect(await readdir(file.controller.stateDir)).toEqual(names)
        }
        finally { await admin.dispose() }
      } catch (error) { completed.released = false; throw error }
      finally { await Promise.all([next.server.close(), ...next.slots.map(lease => lease.close())]) }
    }
    const evidence = path.join(path.dirname(source.controller.stateDir), "evidence", `native-recovery-${crypto.randomUUID()}`)
    await mkdir(evidence, { mode: 0o700 })
    await writeLeaseReceipt(path.join(evidence, "recovery.json"), { version: 2, identity: pair.identity, result, cleanup,
      command: await readLeaseReceipt(recovered.journal), original: await readLeaseReceipt(journal), incident: await readLeaseReceipt(incident),
      recoverySlot: await readLeaseReceipt(recoverySlot), server: await readLeaseReceipt(result.server.path), completion, retainedSources,
      recovered, terminalReceipts: terminalBytes.map(value => JSON.parse(value)), repeated: JSON.parse(repeated.stdout),
      historicalRepeatPreservedNextReservations: beforeNext.map(value => JSON.parse(value)), liveQualified: false })
  } catch (error) {
    if (!completed.released) console.error(`recovery fixture retained: ${root}`)
    throw error
  } finally {
    if (completed.released) { await destroyPair(file, options); await rm(root, { recursive: true, force: true }) }
  }
}, 120_000)

integration("runAttempt: native slot leftovers forbid dispatch while B files remain intact", async () => {
  const fixture = await slotAttemptFixture()
  try {
    await Bun.$`docker exec ${fixture.pair.identity.containerId} sh -c ${'mkdir /workdir/UserStorage/eval-b; printf B > /workdir/UserStorage/eval-b/control; printf A > /workdir/UserStorage/eval-a/leftover.csv'}`.quiet()
    const input = fixture.input
    const result = await runAttempt(input)
    expect(result.result).toMatchObject({ status: "harness_error", exit_code: null, harness_error: expect.stringContaining("USER_STORAGE_NOT_EMPTY") })
    expect(result.stop).toBe(true)
    expect(await Bun.file(path.join(input.runDir, input.task.id, "1/run.json")).exists()).toBe(false)
    expect((await Bun.$`docker exec ${fixture.pair.identity.containerId} cat /workdir/UserStorage/eval-a/leftover.csv`.quiet()).text()).toBe("A")
    expect((await Bun.$`docker exec ${fixture.pair.identity.containerId} cat /workdir/UserStorage/eval-b/control`.quiet()).text()).toBe("B")
    await Bun.$`docker exec ${fixture.pair.identity.containerId} rm -- /workdir/UserStorage/eval-a/leftover.csv`.quiet()
    const clean = await runAttempt({ ...input, attempt: 2 })
    expect(clean.result).toMatchObject({ status: "completed", slot_id: "a", harness_error: null })
    expect(clean.stop).toBe(false)
    expect((await Bun.$`docker exec ${fixture.pair.identity.containerId} cat /workdir/UserStorage/eval-b/control`.quiet()).text()).toBe("B")
    const foreignSource = await runAttempt({ ...input, attempt: 3, source: { ...input.source, storageDir: "/workdir/UserStorage/eval-b" } })
    expect(foreignSource.result.harness_error).toContain("SLOT_STORAGE_SOURCE_MISMATCH")
    expect(foreignSource.result.exit_code).toBeNull()
    const foreignProfile = await runAttempt({ ...input, attempt: 4, command: { ...input.command,
      env: { ...input.command.env, LOGINOM_AI_AGENT_CLI_PROFILE: fixture.file.slots[1]!.profileDir } } })
    expect(foreignProfile.result.harness_error).toContain("SLOT_CONTEXT_MISMATCH")
    expect(foreignProfile.result.exit_code).toBeNull()
    const receipt = path.join(fixture.file.controller.stateDir, "storage-a.json")
    const published = await readLeaseReceipt(receipt) as Record<string, unknown>
    await writeLeaseReceipt(receipt, { ...published, inode: Number(published.inode) + 1 })
    try {
      const drift = await runAttempt({ ...input, attempt: 5 })
      expect(drift.result.harness_error).toContain("USER_STORAGE_OWNERSHIP")
      expect(drift.result.exit_code).toBeNull()
    } finally { await writeLeaseReceipt(receipt, published) }
  } finally { await fixture.dispose() }
}, 120_000)

for (const artifact of [false, true]) {
  integration(`runAttempt: v2 preserves ${artifact ? "LGP and CSV" : "CSV without LGP"} before the server session fence`, async () => {
    const fixture = await slotAttemptFixture()
    const abort = new AbortController()
    const input = { ...fixture.input, runId: "deferred", signal: abort.signal,
      command: { ...fixture.input.command, env: { ...fixture.input.command.env, EVAL_FAKE_SLEEP_MS: "5000" } } }
    const pending = runAttempt(input)
    try {
      const trace = path.join(fixture.lease.slot.workspaceRoot, input.runId, input.task.id, String(input.attempt), "parallel-trace.json")
      const deadline = Date.now() + 15_000
      while (!await Bun.file(trace).exists() && Date.now() < deadline) await Bun.sleep(20)
      expect(await Bun.file(trace).exists()).toBe(true)
      const name = `eval-${input.runId}-${input.task.id}-${input.attempt}`
      const csv = "Region,A\nN,1\n"
      await Bun.$`docker exec ${fixture.pair.identity.containerId} sh -c ${'printf %s "$1" > "$2"'} slot-output ${csv} ${`${input.source.storageDir}/${name}.result.csv`}`.quiet()
      if (artifact) {
        await Bun.$`docker cp ${path.resolve(import.meta.dir, "../fixtures/storage/fixture-group-sum-qty.lgp")} ${`${fixture.pair.identity.containerId}:${input.source.storageDir}/${name}.lgp`}`.quiet()
        await Bun.$`docker exec ${fixture.pair.identity.containerId} chown ${`${fixture.storage.uid}:${fixture.storage.gid}`} ${`${input.source.storageDir}/${name}.lgp`}`.quiet()
      }
      const completed = await pending
      expect(completed.result.status).toBe("completed")
      expect((await Bun.$`docker exec ${fixture.pair.identity.containerId} test -f ${`${input.source.storageDir}/${name}.result.csv`}`.quiet().nothrow()).exitCode).toBe(0)
      if (artifact) expect((await Bun.$`docker exec ${fixture.pair.identity.containerId} test -f ${`${input.source.storageDir}/${name}.lgp`}`.quiet().nothrow()).exitCode).toBe(0)
      const out = path.join(input.runDir, input.task.id, String(input.attempt))
      expect(await Bun.file(path.join(out, artifact ? "artifact/results" : "storage-outputs", `${name}.result.csv`)).text()).toBe(csv)
      expect(await Bun.file(path.join(out, "storage-cleanup.json")).json()).toMatchObject({ status: "pending", removed: false, verified_absent: false, deletion_deferred: true })
      expect(await Bun.file(path.join(out, "cleanup.json")).json()).toMatchObject({ serverSessions: "unknown", storageDeletionAllowed: false, nextAdmissionAllowed: false })
      const blocked = await runAttempt({ ...input, attempt: 2 })
      expect(blocked.result.harness_error).toContain("USER_STORAGE_NOT_EMPTY")
      expect(blocked.result.exit_code).toBeNull()
      expect(await afterAttempt(input.config, input.command, completed.result, out)).toEqual({ stop: "SLOT_CLEANUP_REQUIRED" })
      expect(completed.result).toMatchObject({ status: "completed", environment_cleanup: { status: "failed" } })
      expect(await Bun.file(path.join(out, "cleanup.json")).json()).toMatchObject({ serverSessions: "unknown", storageDeletionAllowed: false, nextAdmissionAllowed: false })
    } finally {
      abort.abort()
      await pending
      await fixture.dispose()
    }
  }, 120_000)
}

async function slotAttemptFixture() {
  const fixture = await storageCodecFixture()
  const storage = await prepareUserStorage(fixture.file, fixture.lease, fixture.prepared.secretFile, fixture.server)
  const config = { ...loadConfig(["--dry-run", "--skip-judge", "--tasks", path.join(fixture.root, "tasks")], {
    EVAL_PROFILE_DIR: fixture.lease.slot.profileDir, EVAL_WORKSPACE_ROOT: fixture.lease.slot.workspaceRoot,
  }), dryRun: false, loginom: { url: fixture.file.server.url, username: fixture.lease.slot.username, password: "", container: fixture.pair.identity.containerId, storageDir: storage.root } }
  const [task] = await loadTasks(config.tasksDir, ["parallel-fast"])
  const input = { config, command: agentCommand(config), source: { kind: "docker" as const, container: fixture.pair.identity.containerId, storageDir: storage.root },
    task: task!, attempt: 1, runId: "admission", runDir: path.join(fixture.root, "results"), signal: new AbortController().signal,
    profileRecovered: false, slotId: fixture.lease.slot.id, skipJudge: true,
    slot: { file: fixture.file, lease: fixture.lease, secretFile: fixture.prepared.secretFile } }
  return { ...fixture, storage, input }
}

for (const sessions of [false, true]) test.skipIf(!process.env.EVAL_CLI_BIN || sessions && !process.env.EVAL_ADMIN_LIVE_CONFIG)(`installed CLI management publishes continuous slot evidence for an unconfigured status${sessions ? " with native session snapshots" : ""}`, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "evals-management-native-")), fixture = await parallelFixture(root)
  const source = sessions ? await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1) : undefined
  const slots = source ? parseSlots({ ...fixture.slots, server: source.server,
    controller: { ...fixture.slots.controller, adminCredentialsFile: source.controller.adminCredentialsFile } }, 1) : fixture.slots
  const serverIdentity = source ? await readServerIdentity(slots) : { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
    studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }
  // Native CLI initializes its own marker and requires an empty fresh profile.
  await rm(path.join(fixture.slots.slots[0]!.profileDir, "data/auth.json"))
  await rmdir(path.join(fixture.slots.slots[0]!.profileDir, "data"))
  const journal = path.join(fixture.slots.controller.stateDir, "command.json")
  // Slot authority is a data-only fixture; this control makes no Loginom login or readiness claim.
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "native-management", identity: serverIdentity, phase: "cli_admitted" })
  const environment = await acquireEnvironmentLeases(slots, 1, serverIdentity, journal, fixture.lockRoot), lease = environment.slots[0]!
  const file = path.join(fixture.slots.controller.stateDir, "management-a.json")
  await writeLeaseReceipt(file, { version: 2, kind: "management-processes", commandId: "native-management", journal, identity: serverIdentity,
    leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, processes: [] })
  const admin = source ? await openLoginomAdmin(slots, serverIdentity) : undefined
  const captures: unknown[] = []
  let confirmed = false
  try {
    const config = loadConfig(["--skip-judge"], { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: process.env.EVAL_CLI_BIN!,
      EVAL_PROFILE_DIR: lease.slot.profileDir, EVAL_AGENT_MODEL: "openai/gpt-6-luna", LOGINOM_DOCK_API_KEY: "unused-metadata-control" })
    const command = { ...agentCommand(config), cleanupDir: path.join(fixture.slots.controller.stateDir, "captures"), managementEvidence: { file, lease, admin } }
    const result = await management(command, ["loginom", "status", "--format", "json"])
    expect({ code: result.exitCode, stderr: result.stderr, outputOnFailure: result.exitCode ? result.stdout : "" })
      .toEqual({ code: 0, stderr: "", outputOnFailure: "" })
    expect(JSON.parse(result.stdout)).toMatchObject({ state: "unconfigured", hasApiKey: false })
    const inventory = await readManagementProcessInventory({ file, journal, commandId: "native-management", identity: serverIdentity, leaseToken: lease.token,
      slotId: lease.slot.id, profileDir: lease.slot.profileDir, producerPid: process.pid })
    expect(inventory.processes).toHaveLength(1)
    expect(inventory.processes[0]!.identities.length).toBeGreaterThan(1)
    confirmed = result.processCleanup.status === "confirmed" && result.processCleanup.capture_complete
    expect(confirmed).toBe(true)
    if (sessions) {
      const snapshots = inventory.processes[0]!.sessions!
      expect(snapshots.before.sessionIdentityQualified).toBe(false)
      expect(snapshots.after.sessionIdentityQualified).toBe(false)
      expect(snapshots.before.source.path).not.toBe(snapshots.after.source.path)
      expect(Date.parse(snapshots.before.observation.finishedAt)).toBeLessThanOrEqual(Date.parse(result.processCleanup.lifetime!.started_at))
      expect(Date.parse(snapshots.after.observation.startedAt)).toBeGreaterThanOrEqual(Date.parse(result.processCleanup.lifetime!.finished_at!))
      const original = await readLeaseReceipt(file) as { processes: { sessions: { before: unknown; after: unknown } }[] }
      const reversed = structuredClone(original)
      reversed.processes[0]!.sessions = { before: original.processes[0]!.sessions.after, after: original.processes[0]!.sessions.before }
      await writeLeaseReceipt(file, reversed)
      await expect(readManagementProcessInventory({ file, journal, commandId: "native-management", identity: serverIdentity, leaseToken: lease.token,
        slotId: lease.slot.id, profileDir: lease.slot.profileDir, producerPid: process.pid })).rejects.toThrow("MANAGEMENT_SESSION_SCOPE_INVALID")
      await writeLeaseReceipt(file, original)
      const snapshot = await readLeaseReceipt(snapshots.before.source.path)
      await writeLeaseReceipt(snapshots.before.source.path, { ...snapshot as Record<string, unknown>, sessions: [] })
      await expect(readManagementProcessInventory({ file, journal, commandId: "native-management", identity: serverIdentity, leaseToken: lease.token,
        slotId: lease.slot.id, profileDir: lease.slot.profileDir, producerPid: process.pid })).rejects.toThrow("SESSION_INVENTORY_UNCONFIRMED")
      await writeLeaseReceipt(snapshots.before.source.path, snapshot as Record<string, unknown>)
      captures.push({ inventory, manifest: await readLeaseReceipt(file), process: result.processCleanup, journal: await readLeaseReceipt(journal),
        sources: await Promise.all([snapshots.before, snapshots.after].map(async snapshot => {
          const value = await readLeaseReceipt(snapshot.source.path) as { command: { path: string } }
          return { source: snapshot.source, value, command: await readLeaseReceipt(value.command.path) }
        })) })
    }
  } finally {
    await admin?.dispose()
    if (source && confirmed && captures.length) {
      const directory = path.join(slots.controller.stateDir, (await readdir(slots.controller.stateDir)).find(name => name.startsWith("admin-"))!)
      const finalization = await readAdminFinalization(slots, serverIdentity, directory, process.pid)
      const connection = await readLeaseReceipt(finalization.source.path) as { finalization: { command: { path: string } } }
      const evidence = path.join(path.dirname(source.controller.stateDir), "evidence", `native-management-sessions-${crypto.randomUUID()}`)
      await mkdir(evidence, { mode: 0o700 })
      await writeLeaseReceipt(path.join(evidence, "management.json"), { kind: "native-management-session-snapshots", identity: serverIdentity, captures,
        finalization, connection, disposeCommand: await readLeaseReceipt(connection.finalization.command.path), liveQualified: false })
    }
    await Promise.all([environment.server.close(), lease.close()])
    if (confirmed) await rm(root, { recursive: true, force: true })
  }
}, 30000)
