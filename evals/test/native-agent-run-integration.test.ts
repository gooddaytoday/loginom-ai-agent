import { expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import path from "node:path"
import { tmpdir } from "node:os"
import { cp, mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises"
import { agentCommand, runAgent } from "../src/cli"
import { finalizeSlotAttempt } from "../src/attempt-finalization"
import { loadConfig } from "../src/config"
import { pauseAgentProcessInventory, readAgentProcess, readAgentProcessInventory, sealAgentProcessInventory } from "../src/agent-process-evidence"
import { readAgentArchive, readAgentSession, recordAgentSessions } from "../src/agent-sessions"
import { qualifyClosedProcessEvidence } from "../src/closed-process-evidence"
import { globalLockRoot, readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { openLoginomAdmin, readAdminSessionInventory } from "../src/loginom-admin"
import { collectManagementSessions, collectSlotSessions } from "../src/management-sessions"
import { sealManagementProcessInventory } from "../src/management-process-evidence"
import { createPair, destroyPair, prepareUserStorage, readServerIdentity } from "../src/parallel-pair"
import { archiveProfileEvidence } from "../src/profile-archive"
import { signalProcess, supervisedProcesses } from "../src/process-supervisor"
import { ensureProfile, profileHistory, releaseStaleWriter } from "../src/profile"
import { readServerFiles } from "../src/server-files"
import { acquireEnvironmentLeases, loadSlots, parseSlots } from "../src/slots"
import { stageUserPreparation } from "../src/user-environment"
import { loginomReplayProvider } from "./helpers/loginom-replay-provider"

for (const finalizer of [false, true, "interrupted", "killed"] as const) for (const browser of [true, false]) {
  const active = typeof finalizer === "string"
  if (active && !browser) continue
  test.skipIf(!process.env.EVAL_CLI_BIN || !process.env.EVAL_ADMIN_LIVE_CONFIG || !process.env.LOGINOM_DOCK_API_KEY)(
  `native agent replay: actual sandboxed CLI ${active ? `is ${finalizer === "killed" ? "killed" : "interrupted"} during server execution` : browser ? "activates Loginom through a local provider" : "finishes without a browser"}${finalizer ? " with slot finalizer" : ""}`, async () => {
    const source = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
    const root = await mkdtemp(path.join(tmpdir(), "evals-native-agent-"))
    const history = await mkdtemp(path.join(tmpdir(), "evals-native-history-"))
    const name = `evals-agent-${crypto.randomUUID().slice(0, 8)}`
    const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
    const url = `http://127.0.0.1:${listener.port}/app/`
    listener.stop(true)
    const file = parseSlots({ version: 2,
      server: { container: `${name}-server`, studioContainer: `${name}-studio`, network: name, alias: "loginom-server-7.4.2-test", url,
        storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
      controller: { stateDir: path.join(root, "controller"), adminCredentialsFile: source.controller.adminCredentialsFile },
      judge: { codexHome: path.join(root, "judge") }, slots: [{ id: "a", username: "eval-a", profileDir: path.join(root, "profile"),
        workspaceRoot: path.join(root, "work"), historyDir: history }],
    }, 1)
    await Promise.all([file.controller.stateDir, file.judge.codexHome, path.join(root, "locks"),
      ...file.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])].map(dir => mkdir(dir, { recursive: true, mode: 0o700 })))
    const evidence = path.join(path.dirname(source.controller.stateDir), "evidence", `native-agent-replay-${crypto.randomUUID()}`)
    await mkdir(evidence, { mode: 0o700 })
    console.error(`native agent replay evidence: ${evidence}`)
    const sources = await Promise.all(["native-agent-run-integration.test.ts", "helpers/loginom-replay-provider.ts", "../src/cli.ts",
      "../src/attempt-finalization.ts", "../src/server-files.ts", "../fixtures/server-files.sh", "../src/agent-process-evidence.ts", "../src/agent-sessions.ts", "../src/management-sessions.ts", "../src/management-process-evidence.ts", "../src/profile-archive.ts", "../src/process-supervisor.ts", "../src/profile.ts", "../src/sandbox.ts", "../src/loginom-admin.ts",
      "../script/loginom-admin-driver.mjs", "../src/parallel-pair.ts", "../fixtures/interrupt-probe.lgp", "../fixtures/interrupt-probe.js", process.env.EVAL_CLI_BIN!].map(async file => {
      const source = path.resolve(import.meta.dir, file)
      return { path: source, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(source).bytes()).digest("hex") }
    }))
    await writeLeaseReceipt(path.join(evidence, "source-pins.json"), { sources })
    const options = { purpose: "research" as const, out: path.join(root, "pair-evidence"), lockRoot: globalLockRoot }
    const pair = await createPair(file, options)
    const journal = path.join(file.controller.stateDir, "command.json"), processInventory = path.join(file.controller.stateDir, "admin-processes.json")
    const commandId = crypto.randomUUID()
    await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId, identity: pair.identity,
      slotIds: ["a"], phase: "unactivated", processInventory })
    await writeLeaseReceipt(processInventory, { version: 2, kind: "admin-processes", commandId, journal, identity: pair.identity, connections: [] })
    const environment = await acquireEnvironmentLeases(file, 1, pair.identity, journal, path.join(root, "locks")), lease = environment.slots[0]!
    const prepared = await stageUserPreparation(file, lease, "e".repeat(64))
    const credentials = await readLeaseReceipt(prepared.secretFile) as { username: string; password: string }
    const settlement = { cli: true, admin: false }
    const provider = loginomReplayProvider(active ? "active" : browser ? "prepare" : "text")
    try {
      const admin = await openLoginomAdmin(file, pair.identity, { serverLease: environment.server, processInventory })
      try {
        await admin.createBlockedUser(lease, prepared.secretFile)
        await admin.configureOwnedUser(lease, prepared.secretFile)
        await admin.reconcileOwnedAcl(lease, prepared.secretFile)
        const storage = await prepareUserStorage(file, lease, prepared.secretFile, environment.server)
        await admin.activateOwnedUser(lease, prepared.secretFile)
        if (active) {
          expect((await Bun.$`docker --host unix:///var/run/docker.sock cp ${path.resolve(import.meta.dir, "../fixtures/interrupt-probe.lgp")} ${`${pair.identity.containerId}:${storage.root}/interrupt-probe.lgp`}`.quiet()).exitCode).toBe(0)
          expect((await Bun.$`docker --host unix:///var/run/docker.sock exec ${pair.identity.containerId} chown ${`${storage.uid}:${storage.gid}`} ${`${storage.root}/interrupt-probe.lgp`}`.quiet()).exitCode).toBe(0)
        }
        await writeLeaseReceipt(journal, { ...await readLeaseReceipt(journal) as Record<string, unknown>, phase: "cli_admitted" })
        const management = path.join(file.controller.stateDir, "management.json")
        await writeLeaseReceipt(management, { version: 2, kind: "management-processes", commandId, journal, identity: pair.identity,
          leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, processes: [] })
        const config = loadConfig(["--skip-judge"], { EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: process.env.EVAL_CLI_BIN!,
          EVAL_PROFILE_DIR: lease.slot.profileDir, EVAL_WORKSPACE_ROOT: lease.slot.workspaceRoot, EVAL_AGENT_MODEL: "native-replay/replay",
          EVAL_AGENT_PROVIDER_ID: "native-replay", EVAL_AGENT_PROVIDER_MODEL_ID: "replay", EVAL_AGENT_PROVIDER_API_KEY: "native-fixture-only",
          EVAL_AGENT_PROVIDER_BASE_URL: provider.server.url.href, LOGINOM_URL: url, LOGINOM_USERNAME: credentials.username,
          LOGINOM_PASSWORD: credentials.password, LOGINOM_DOCK_API_KEY: process.env.LOGINOM_DOCK_API_KEY! })
        const command = { ...agentCommand(config), cleanupDir: path.join(file.controller.stateDir, "management"),
          cleanupSecrets: [credentials.password, config.dock.apiKey, config.agent.provider!.apiKey],
          managementEvidence: { file: management, lease, admin } }
        settlement.cli = false
        await ensureProfile(config, command)
        settlement.cli = true
        await sealManagementProcessInventory(file, environment.server, lease, management)
        const settings = path.join(lease.slot.profileDir, "config/loginom-ai-agent.json")
        await Bun.write(settings, JSON.stringify({ ...await Bun.file(settings).json(), permission: { "loginom_*": "allow", skill: "allow" }, model: config.agent.model,
          small_model: config.agent.model, enabled_providers: ["native-replay"] }))
        await mkdir(path.join(lease.slot.historyDir, "initial"), { mode: 0o700 })
        await archiveProfileEvidence(lease.slot.profileDir, path.join(lease.slot.historyDir, "initial"), path.join(file.controller.stateDir, "initial.archive.json"))
        const agents = path.join(file.controller.stateDir, "agents.json")
        await writeLeaseReceipt(agents, { version: 2, kind: "eval-agent-processes", commandId, slotId: "a", producerPid: process.pid, state: "open", processes: [] })
        await writeLeaseReceipt(journal, { ...await Bun.file(journal).json(), agentInventories: [
          { file: agents, slotId: lease.slot.id, leaseToken: lease.token, profileDir: lease.slot.profileDir }] })
        const agentEvidence = { file: agents, commandId, slotId: "a", assertHeld: lease.assertHeld }
        const before = await admin.inspectSessionInventory()
        const during: Awaited<ReturnType<typeof admin.inspectSessionInventory>>[] = []
        const state = { done: false }
        const interruption = new AbortController()
        const kill = { sent: false }
        const packages: Awaited<ReturnType<typeof admin.inspectPackageInventory>>[] = []
        await mkdir(path.join(file.controller.stateDir, "agent-result"), { mode: 0o700 })
        settlement.cli = false
        const pending = runAgent({ command: { ...command, agentEvidence }, taskId: "native-replay", model: config.agent.model,
          prompt: "Activate the bundled Loginom skill and return Native replay complete.", files: [], workdir: lease.slot.workspaceRoot,
          timeoutMs: active ? 120_000 : 60_000, outDir: path.join(file.controller.stateDir, "agent-result"), profileDir: lease.slot.profileDir, slotId: "a",
          signal: interruption.signal })
          .finally(() => { state.done = true })
        const observed = (async () => {
          while (!state.done) {
            during.push(await admin.inspectSessionInventory())
            if (active) {
              const snapshot = await admin.inspectPackageInventory()
              packages.push(snapshot)
              if (snapshot.collections.some(row => row.name.startsWith(credentials.username + ":") &&
                row.packages.some(item => item.path === `/${credentials.username}/interrupt-probe.lgp` && item.progress !== null))) {
                if (finalizer === "interrupted") interruption.abort()
                if (finalizer === "killed" && !kill.sent) {
                  const selected = await stat(await realpath(process.env.EVAL_CLI_BIN!))
                  const scopes = supervisedProcesses().scopes.filter(scope => scope.owner.kind === "slot" && scope.owner.id === lease.slot.id && scope.status === "observed")
                  if (scopes.length !== 1) throw Error("KILL_CLI_SCOPE_UNCONFIRMED")
                  const targets = scopes[0]!.processes!.filter(process => process.device === selected.dev && process.inode === selected.ino)
                  if (targets.length !== 1) throw Error("KILL_CLI_IDENTITY_UNCONFIRMED")
                  const intent = { owner: scopes[0]!.owner, launcher: scopes[0]!.launcher, process: targets[0]!, signal: "SIGKILL",
                    trigger: snapshot.source, at: new Date().toISOString() }
                  await writeLeaseReceipt(path.join(evidence, "kill-control.json"), { intent, status: "planned" })
                  kill.sent = await signalProcess(intent.process, "SIGKILL")
                  await writeLeaseReceipt(path.join(evidence, "kill-control.json"), { intent, status: kill.sent ? "sent" : "not_sent", settledAt: new Date().toISOString() })
                  if (!kill.sent) throw Error("KILL_CLI_NOT_SENT")
                }
              }
            }
            if (!state.done) await Bun.sleep(100)
          }
        })()
        const settled = await Promise.allSettled([pending, observed])
        if (settled[0].status === "rejected") throw settled[0].reason
        const run = settled[0].value
        settlement.cli = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
        const after = settlement.cli ? await admin.inspectSessionInventory() : null
        const backendAfterCli = active && settlement.cli ? await admin.inspectPackageInventory() : null
        await writeLeaseReceipt(path.join(evidence, "observation.json"), { version: 1, kind: "native-agent-replay", identity: pair.identity,
          root, commandId, run, before, during, after, packages, backendAfterCli, requests: provider.requests, liveQualified: false, sessionOwnershipQualified: false })
        expect(settlement.cli).toBe(true)
        expect(settled[1].status).toBe("fulfilled")
        if (!active) expect(run).toMatchObject({ exitCode: 0, timedOut: false, interrupted: false, finalText: "Native replay complete" })
        const qualified = qualifyClosedProcessEvidence(run.processCleanup, { owner: { kind: "slot", id: "a" }, producerPid: process.pid })
        expect(qualified).toBeDefined()
        const entry = await readAgentProcess({ ...agentEvidence, producerPid: process.pid }, (await Bun.file(agents).json()).processes[0].id)
        const references = { process: entry.entrySource, before: before.source, after: after!.source,
          during: during.filter(snapshot => Date.parse(snapshot.observation.startedAt) <= Date.parse(qualified!.finishedAt) &&
            Date.parse(snapshot.observation.finishedAt) >= Date.parse(qualified!.startedAt)).map(snapshot => snapshot.source) }
        if (active) {
          const inputs = { management, agents: { file: agents, observations: [references] } }
          const completed = await finalizeSlotAttempt(file, environment.server, lease, inputs, admin)
          const closed = await admin.inspectSessionInventory()
          await writeLeaseReceipt(path.join(evidence, "attempt-finalization.json"), { inputs, completed, after: closed })
          expect(await readLeaseReceipt(completed.source.path)).toHaveProperty("serverFiles")
          const files = await readServerFiles(file, environment.server, lease, completed.serverFiles)
          const absence = await readAdminSessionInventory(file, pair.identity, completed.after)
          expect(Date.parse(files.snapshot.startedAt)).toBeGreaterThanOrEqual(Date.parse(absence.observation.finishedAt))
          expect(files.snapshot.files.some(entry => entry.target === storage.root || entry.target.startsWith(`${storage.root}/`))).toBe(false)
          expect((await finalizeSlotAttempt(file, environment.server, lease, inputs, admin)).source).toEqual(completed.source)
          await writeLeaseReceipt(path.join(evidence, "finalization-files.json"), { files, absence,
            server: environment.server.reservation, storageDeletionAllowed: false, nextAdmissionAllowed: false })
          await sealAgentProcessInventory(agentEvidence)
          expect(completed.sessions).toHaveLength(2)
          expect(completed.sessions.every(session => session.state === "closed")).toBe(true)
          expect(closed.sessions.some(row => row.name.startsWith(credentials.username + ":"))).toBe(false)
          expect(await archivedSession(completed.archived.archive, run.sessionId!)).toBe(true)
          expect(backendAfterCli?.collections.some(row => row.name.startsWith(credentials.username + ":") && row.packages.some(item =>
            item.path === `/${credentials.username}/interrupt-probe.lgp` && item.progress !== null))).toBe(true)
          expect(interruption.signal.aborted).toBe(finalizer === "interrupted")
          if (finalizer === "killed") {
            expect(kill.sent).toBe(true)
            expect(await readLeaseReceipt(path.join(evidence, "kill-control.json"))).toMatchObject({ status: "sent", intent: {
              owner: { kind: "slot", id: lease.slot.id }, signal: "SIGKILL" } })
          }
          expect(run).toMatchObject(finalizer === "killed" ? { exitCode: 137, timedOut: false, interrupted: false } : { timedOut: false, interrupted: true })
          expect(await readServerIdentity(file)).toEqual(pair.identity)
          expect(await Promise.all(sources.map(async source => new Bun.CryptoHasher("sha256").update(await Bun.file(source.path).bytes()).digest("hex"))))
            .toEqual(sources.map(source => source.sha256))
          return
        }
        if (finalizer) {
          const inputs = { management, agents: { file: agents, observations: [references] } }
          await expect(finalizeSlotAttempt(file, environment.server, { ...lease, recoveryOnly: true }, inputs, admin))
            .rejects.toThrow("SLOT_RECOVERY_ONLY")
          await expect(finalizeSlotAttempt(file, environment.server, lease, { ...inputs, agents: { file: agents, observations: [] } }, admin))
            .rejects.toThrow("AGENT_SESSION_INVENTORY_INCOMPLETE")
          expect(await Bun.file(path.join(lease.slot.profileDir, "data/loginom-ai-agent.db")).exists()).toBe(true)
          expect(await Bun.file(path.join(file.controller.stateDir, `agent-archive-${entry.entrySource.id}.json`)).exists()).toBe(false)
          const untouched = await admin.inspectSessionInventory()
          expect(untouched.sessions.filter(row => row.name.startsWith(credentials.username + ":")).map(row => JSON.stringify([row.name, row.createdAt])).sort())
            .toEqual(after!.sessions.filter(row => row.name.startsWith(credentials.username + ":")).map(row => JSON.stringify([row.name, row.createdAt])).sort())
          const accounted = await collectSlotSessions(file, lease, prepared.secretFile, inputs, untouched.source)
          const absenceOnly = await admin.closeManagementSession(lease, prepared.secretFile, accounted.management[0]!.id, "confirm-absent")
            .then(() => "unexpected confirmation", (error: Error) => error.message)
          const completed = await finalizeSlotAttempt(file, environment.server, lease, inputs, admin)
          expect(completed.sessions).toHaveLength(browser ? 2 : 1)
          expect(completed.sessions.every(session => session.state === "closed")).toBe(true)
          expect(await readLeaseReceipt(completed.source.path)).toMatchObject({ status: "sessions_closed", slotId: lease.slot.id,
            leaseToken: lease.token, storageDeletionAllowed: false, nextAdmissionAllowed: false })
          const closed = await admin.inspectSessionInventory()
          expect(closed.sessions.some(row => row.name.startsWith(credentials.username + ":"))).toBe(false)
          expect((await Bun.file(agents).json()).state).toBe("paused")
          expect(run.sessionId).toBeDefined()
          expect(await archivedSession(completed.archived.archive, run.sessionId!)).toBe(true)
          if (!browser) {
            const files = await readServerFiles(file, environment.server, lease, completed.serverFiles)
            const absence = await readAdminSessionInventory(file, pair.identity, completed.after)
            const terminal = await readLeaseReceipt(completed.source.path) as Record<string, unknown>
            const raw = await readLeaseReceipt(completed.serverFiles.path) as { frame: typeof files.snapshot.frame }
            await writeLeaseReceipt(completed.serverFiles.path, { ...raw, kind: "changed-kernel-source" })
            const changed = await finalizeSlotAttempt(file, environment.server, lease, inputs, admin)
              .then(() => "unexpected success", (error: Error) => error.message).finally(() => writeLeaseReceipt(completed.serverFiles.path, raw))
            expect(changed).toBe("SERVER_FILE_SOURCE_UNCONFIRMED")
            const at = new Date(Date.parse(absence.observation.startedAt) - 1).toISOString()
            const early = { ...raw, frame: { ...raw.frame, startedAt: at, finishedAt: at } }
            await writeLeaseReceipt(completed.serverFiles.path, early)
            await writeLeaseReceipt(completed.source.path, { ...terminal, serverFiles: { ...completed.serverFiles,
              sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(early)).digest("hex") } })
            const reordered = await finalizeSlotAttempt(file, environment.server, lease, inputs, admin)
              .then(() => "unexpected success", (error: Error) => error.message).finally(async () => {
                await writeLeaseReceipt(completed.serverFiles.path, raw)
                await writeLeaseReceipt(completed.source.path, terminal)
              })
            expect(reordered).toBe("ATTEMPT_FINALIZATION_UNCONFIRMED")
            await writeLeaseReceipt(path.join(evidence, "finalization-files.json"), { files, absence, server: environment.server.reservation,
              controls: { changed, reordered }, storageDeletionAllowed: false, nextAdmissionAllowed: false })
          }
          expect((await finalizeSlotAttempt(file, environment.server, lease, inputs, admin)).source).toEqual(completed.source)
          await writeLeaseReceipt(path.join(evidence, "attempt-finalization.json"), { inputs, completed, after: closed })
          expect(absenceOnly).toBe("SESSION_STILL_PRESENT")
          const original = path.join(evidence, "original-finalization.json")
          await cp(completed.source.path, original)
          const selected = completed.sessions.find(session => session.kind === (browser ? "agent" : "management"))!
          const previousClose = path.join(evidence, "original-session-close.json")
          await cp(selected.closed.path, previousClose)
          await rm(selected.closed.path)
          await expect(finalizeSlotAttempt(file, environment.server, lease, inputs, admin)).rejects.toThrow("ATTEMPT_FINALIZATION_PENDING")
          await rm(completed.source.path)
          const reconciled = await finalizeSlotAttempt(file, environment.server, lease, inputs, admin).finally(async () => {
            if (!await Bun.file(selected.closed.path).exists()) await cp(previousClose, selected.closed.path)
          })
          const confirmed = await readLeaseReceipt(selected.closed.path) as { source: { path: string }; reply: { data: { disposition: string } } }
          expect(confirmed.reply.data.disposition).toBe("observed_absent")
          expect(await readLeaseReceipt(confirmed.source.path)).toMatchObject({ op: "confirm-session-absent", state: "confirmed" })
          expect(reconciled.sessions.every(session => session.state === "closed")).toBe(true)
          expect((await finalizeSlotAttempt(file, environment.server, lease, inputs, admin)).source).toEqual(reconciled.source)
          await writeLeaseReceipt(path.join(evidence, "attempt-finalization.json"), { inputs, completed: reconciled, after: await admin.inspectSessionInventory(),
            recovery: { absenceOnly, original: { path: original, sha256: completed.source.sha256 }, selected: selected.id, previousClose } })
          await sealAgentProcessInventory(agentEvidence)
          expect(await readServerIdentity(file)).toEqual(pair.identity)
          expect(await Promise.all(sources.map(async source => new Bun.CryptoHasher("sha256").update(await Bun.file(source.path).bytes()).digest("hex"))))
            .toEqual(sources.map(source => source.sha256))
          return
        }
        if (!browser) {
          expect(run.tools).toEqual([])
          expect(run.processCleanup.browserBindings).toEqual([])
          expect(run.processCleanup.runtimeDirectories).toEqual([])
          expect(provider.requests.every(row => !row.activation && !row.preparation && row.model === "replay")).toBe(true)
          await releaseStaleWriter(lease.slot.profileDir, run.processCleanup.writer)
          const archived = await archiveProfileEvidence(lease.slot.profileDir, await mkdtemp(path.join(lease.slot.historyDir, "agent-")),
            path.join(file.controller.stateDir, `agent-archive-${entry.entrySource.id}.json`))
          await writeLeaseReceipt(path.join(evidence, "empty-agent.json"), { references, archived })
          expect(await recordAgentSessions(file, lease, prepared.secretFile, references)).toEqual([])
          const boundary = await pauseAgentProcessInventory(agentEvidence)
          const inputs = { management, agents: { file: agents, observations: [references] } }
          const accounted = await collectSlotSessions(file, lease, prepared.secretFile, inputs, after!.source)
          expect(accounted.management).toHaveLength(1)
          expect(accounted.agents).toEqual([])
          expect(accounted.sources.agents).toEqual(boundary)
          expect(run.sessionId).toBeDefined()
          expect(await archivedSession(archived.archive, run.sessionId!)).toBe(true)
          await writeLeaseReceipt(path.join(evidence, "slot-sessions.json"), { inputs, accounted })
          await sealAgentProcessInventory(agentEvidence)
          expect(await readServerIdentity(file)).toEqual(pair.identity)
          expect(await Promise.all(sources.map(async source => new Bun.CryptoHasher("sha256").update(await Bun.file(source.path).bytes()).digest("hex"))))
            .toEqual(sources.map(source => source.sha256))
          return
        }
        expect(run.tools).toContainEqual(expect.objectContaining({ tool: "skill", status: "completed" }))
        expect(run.tools).toContainEqual(expect.objectContaining({ tool: "loginom_dock_prepare", status: "completed" }))
        expect(provider.requests.some(row => row.activation)).toBe(true)
        expect(provider.requests.some(row => row.toolReply)).toBe(true)
        expect(provider.requests.every(row => row.model === "replay")).toBe(true)
        expect(run.processCleanup.browserBindings?.length ?? 0).toBeGreaterThan(0)
        expect(during.some(snapshot => snapshot.sessions.some(row => row.name.startsWith(credentials.username + ":") &&
          !before.sessions.some(previous => previous.objectId === row.objectId)))).toBe(true)
        const sessions = await recordAgentSessions(file, lease, prepared.secretFile, references)
        expect(sessions).toHaveLength(1)
        expect(sessions[0]).toMatchObject({ kind: "owned-agent-session", actor: { kind: "agent", runId: commandId, attemptId: entry.entrySource.id },
          binding: { username: credentials.username, serverEpoch: pair.identity.serverEpoch } })
        expect(await readAgentSession(file, lease, prepared.secretFile, sessions[0]!.id)).toEqual(sessions[0]!)
        const inputs = { management, agents: { file: agents, observations: [references] } }
        await expect(collectSlotSessions(file, lease, prepared.secretFile, inputs, after!.source)).rejects.toThrow("AGENT_PROCESS_INVENTORY_UNSEALED")
        const boundary = await pauseAgentProcessInventory(agentEvidence)
        const archiveFile = path.join(file.controller.stateDir, `agent-archive-${entry.entrySource.id}.json`)
        await expect(admin.closeAgentSession(lease, prepared.secretFile, sessions[0]!.id, { path: archiveFile, sha256: "0".repeat(64) }))
          .rejects.toThrow("AGENT_ARCHIVE_UNCONFIRMED")
        const initialArchive = await readLeaseReceipt(path.join(file.controller.stateDir, "initial.archive.json")) as object
        await writeLeaseReceipt(archiveFile, initialArchive)
        await expect(admin.closeAgentSession(lease, prepared.secretFile, sessions[0]!.id,
          { path: archiveFile, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(initialArchive)).digest("hex") }))
          .rejects.toThrow("AGENT_ARCHIVE_UNCONFIRMED")
        await rm(archiveFile)
        await releaseStaleWriter(lease.slot.profileDir, run.processCleanup.writer)
        const archived = await archiveProfileEvidence(lease.slot.profileDir,
          await mkdtemp(path.join(lease.slot.historyDir, "agent-")), archiveFile)
        const archive = { path: archiveFile, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(await readLeaseReceipt(archiveFile))).digest("hex") }
        expect(await readAgentArchive(file, lease, prepared.secretFile, sessions[0]!.id, archive)).toEqual(archive)
        expect(run.sessionId).toBeDefined()
        expect(await archivedSession(archived.archive, run.sessionId!)).toBe(true)
        const accounted = await collectSlotSessions(file, lease, prepared.secretFile, inputs, after!.source)
        expect(accounted.management).toHaveLength(1)
        expect(accounted.agents).toEqual(sessions)
        expect(accounted.sources.agents).toEqual(boundary)
        await expect(collectManagementSessions(file, lease, prepared.secretFile, management, after!.source)).rejects.toThrow("MANAGEMENT_SESSION_UNKNOWN")
        await expect(collectSlotSessions(file, lease, prepared.secretFile, { ...inputs, agents: { file: agents, observations: [] } }, after!.source))
          .rejects.toThrow("AGENT_SESSION_INVENTORY_INCOMPLETE")
        const directory = await mkdtemp(path.join(file.controller.stateDir, "agent-process-no-browser-"))
        const omittedProof = { ...run.processCleanup, browserBindings: [], runtimeDirectories: [] }
        const proofFile = path.join(directory, "process-cleanup.json"), negativeFile = path.join(file.controller.stateDir, "agents-no-browser.json")
        await writeLeaseReceipt(proofFile, omittedProof)
        const originalInventory = await Bun.file(agents).json()
        await writeLeaseReceipt(negativeFile, { ...originalInventory, processes: [{ ...originalInventory.processes[0], directory,
          proof: { path: proofFile, sha256: new Bun.CryptoHasher("sha256").update(JSON.stringify(omittedProof)).digest("hex") } }] })
        const omitted = await readAgentProcess({ ...agentEvidence, file: negativeFile, producerPid: process.pid }, entry.entrySource.id)
        await writeLeaseReceipt(path.join(evidence, "browser-omission.json"), { kind: "negative-browser-omission", original: references,
          omitted: { ...references, process: omitted.entrySource } })
        await expect(recordAgentSessions(file, lease, prepared.secretFile, { ...references, process: omitted.entrySource }))
          .rejects.toThrow("AGENT_SESSION_BROWSER_UNCONFIRMED")
        expect(await Array.fromAsync(new Bun.Glob("agent-session-*.json").scan({ cwd: file.controller.stateDir }))).toHaveLength(1)
        expect(await readLeaseReceipt(entry.source.path)).toEqual(run.processCleanup)
        await admin.closeAgentSession(lease, prepared.secretFile, sessions[0]!.id, archive)
        const closed = await readAgentSession(file, lease, prepared.secretFile, sessions[0]!.id)
        expect(closed.state).toBe("closed")
        const closedSnapshot = await admin.inspectSessionInventory()
        expect(closedSnapshot.sessions.some(row => row.objectId === sessions[0]!.binding.remoteKey)).toBe(false)
        expect(before.sessions.filter(row => row.name.startsWith(credentials.username + ":")).every(previous =>
          closedSnapshot.sessions.some(row => row.objectId === previous.objectId && row.name === previous.name && row.createdAt === previous.createdAt))).toBe(true)
        await admin.closeAgentSession(lease, prepared.secretFile, sessions[0]!.id, archive)
        expect(await readAgentSession(file, lease, prepared.secretFile, sessions[0]!.id)).toEqual(closed)
        const completed = await collectSlotSessions(file, lease, prepared.secretFile, inputs, closedSnapshot.source)
        expect(completed.agents).toEqual([closed])
        expect(completed.management).toEqual(accounted.management)
        await writeLeaseReceipt(path.join(evidence, "slot-sessions.json"), { inputs, before: accounted, after: completed })
        await writeLeaseReceipt(path.join(evidence, "agent-close.json"), { archived, archive, closed, after: closedSnapshot })
        await expect(recordAgentSessions(file, lease, prepared.secretFile, { ...references, process: { ...references.process, sha256: "0".repeat(64) } }))
          .rejects.toThrow("AGENT_SESSION_PROCESS_CHANGED")
        await expect(recordAgentSessions(file, lease, prepared.secretFile, { ...references, after: before.source }))
          .rejects.toThrow("AGENT_SESSION_WINDOW_INVALID")
        await writeLeaseReceipt(path.join(evidence, "agent-sessions.json"), { sessions, references })
        const sealed = await sealAgentProcessInventory(agentEvidence)
        expect((await readAgentProcessInventory({ ...agentEvidence, producerPid: process.pid })).source).toEqual(sealed)
        expect(await readAgentSession(file, lease, prepared.secretFile, sessions[0]!.id)).toEqual(closed)
        expect(await readServerIdentity(file)).toEqual(pair.identity)
        expect(await Promise.all(sources.map(async source => new Bun.CryptoHasher("sha256").update(await Bun.file(source.path).bytes()).digest("hex"))))
          .toEqual(sources.map(source => source.sha256))
      } finally {
        await admin.dispose()
        settlement.admin = true
      }
    } finally {
      provider.server.stop(true)
      await cp(file.controller.stateDir, path.join(evidence, "controller"), { recursive: true, filter: source =>
        !source.endsWith(".secret.json") && !path.relative(file.controller.stateDir, source).split(path.sep).includes("profile") })
      const historyArchived = await profileHistory(lease.slot.profileDir).then(files => files.length === 0, () => false)
      await writeLeaseReceipt(path.join(evidence, "settlement.json"), { settlement, historyArchived, identity: pair.identity, resources: pair.resources, root, historyDir: history,
        liveQualified: false, normalRelease: false, deletionAllowed: false })
      await Promise.all([...environment.slots.map(slot => slot.close()), environment.server.close()])
      if (settlement.cli && settlement.admin && historyArchived) {
        await destroyPair(file, options)
        await rm(root, { recursive: true })
      }
      if (!historyArchived) console.error(`native agent history retained: ${root}`)
    }
  }, active ? 300_000 : finalizer ? 240_000 : 180_000,
)
}

async function archivedSession(archive: string, id: string) {
  // SQLite may recover/checkpoint WAL even for reads; inspect a private copy of the whole family.
  const root = await mkdtemp(path.join(tmpdir(), "evals-archived-session-"))
  try {
    await Promise.all(["", "-wal", "-shm"].map(async suffix => {
      const source = path.join(archive, `data/loginom-ai-agent.db${suffix}`)
      if (await Bun.file(source).exists()) await cp(source, path.join(root, `loginom-ai-agent.db${suffix}`))
    }))
    const database = new Database(path.join(root, "loginom-ai-agent.db"), { readonly: true })
    try { return Boolean(database.query("SELECT id FROM session WHERE id = ?").get(id)) } finally { database.close() }
  } finally { await rm(root, { recursive: true }) }
}
