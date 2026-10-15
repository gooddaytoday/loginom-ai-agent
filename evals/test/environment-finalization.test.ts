import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { archiveManagementEnvironment, archiveManagementSlot } from "../src/environment-finalization"
import { acquireEnvironmentLeases } from "../src/slots"
import { readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { sealManagementProcessInventories, superviseManagementProcess } from "../src/management-process-evidence"
import { management } from "../src/profile"
import { agentCommand } from "../src/cli"
import { loadConfig } from "../src/config"
import { parallelFixture } from "./helpers/parallel-fixture"

const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

test("management slot archive commits A without stopping an active B", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "evals-management-slot-archive-")), fixture = await parallelFixture(root)
  const journal = path.join(fixture.slots.controller.stateDir, "command.json")
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", commandId: "slot-archive", identity,
    slotIds: ["a", "b"], phase: "cli_admitted" })
  const environment = await acquireEnvironmentLeases(fixture.slots, 2, identity, journal, fixture.lockRoot)
  try {
    const contexts = []
    for (const lease of environment.slots) {
      const file = path.join(fixture.slots.controller.stateDir, `management-${lease.slot.id}.json`)
      await writeLeaseReceipt(file, { version: 2, kind: "management-processes", commandId: "slot-archive", journal, identity,
        leaseToken: lease.token, slotId: lease.slot.id, profileDir: lease.slot.profileDir, processes: [] })
      contexts.push({ file, lease })
    }
    const a = contexts[0]!, b = contexts[1]!
    const command = { ...agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: a.lease.slot.profileDir }),
      cleanupDir: path.join(fixture.slots.controller.stateDir, "captures-a"), managementEvidence: a }
    expect((await management(command, ["loginom", "status", "--format", "json"])).exitCode).toBe(0)
    const history = ["data/loginom-ai-agent.db", "data/loginom-ai-agent.db-wal", "data/loginom-ai-agent.db-shm", "loginom/inputs/input.csv"]
    for (const context of contexts) for (const relative of history) await Bun.write(path.join(context.lease.slot.profileDir, relative), `${context.lease.slot.id}:${relative}`)
    const auth = await Bun.file(path.join(a.lease.slot.profileDir, "data/auth.json")).text()
    await Bun.write(path.join(b.lease.slot.historyDir, "keep.txt"), "B history")
    const directory = path.join(fixture.slots.controller.stateDir, "capture-b"), bundle = path.join(root, "bundle")
    await mkdir(directory, { mode: 0o700 }); await mkdir(bundle, { mode: 0o700 })
    await Bun.write(path.join(bundle, "browser"), Bun.file("/usr/bin/true"))
    await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "browser" }))
    const ready = path.join(root, "ready"), finish = path.join(root, "finish"), running = { done: false }
    // An actual OS producer supplies the barrier; this is not a native Loginom session.
    const pending = superviseManagementProcess({ cmd: [process.execPath, "-e", `await Bun.write(${JSON.stringify(ready)},"ready");
      const until=Date.now()+20000;while(!await Bun.file(${JSON.stringify(finish)}).exists()&&Date.now()<until)await Bun.sleep(10);
      if(!await Bun.file(${JSON.stringify(finish)}).exists())throw Error("BARRIER_NOT_RELEASED");console.log("released")`],
      cwd: root, env: { PATH: process.env.PATH ?? "", LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
        LOGINOM_AI_AGENT_CLI_PROFILE: b.lease.slot.profileDir }, profileDir: b.lease.slot.profileDir, timeoutMs: 25000 },
      { ...b, directory, operation: ["loginom", "status"] }).finally(() => { running.done = true })
    void pending.catch(() => {})
    try {
      const deadline = Date.now() + 5000
      while (!await Bun.file(ready).exists() && Date.now() < deadline) await Bun.sleep(10)
      expect(await Bun.file(ready).exists()).toBe(true)
      const archived = await archiveManagementSlot(fixture.slots, environment.server, a.lease, a.file)
      expect(running.done).toBe(false)
      for (const relative of history) {
        expect(await Bun.file(path.join(archived.profile.archive, relative)).text()).toBe(`a:${relative}`)
        expect(await Bun.file(path.join(a.lease.slot.profileDir, relative)).exists()).toBe(false)
        expect(await Bun.file(path.join(b.lease.slot.profileDir, relative)).text()).toBe(`b:${relative}`)
      }
      expect(await Bun.file(path.join(a.lease.slot.profileDir, "data/auth.json")).text()).toBe(auth)
      expect(await Bun.file(path.join(b.lease.slot.historyDir, "keep.txt")).text()).toBe("B history")
      const bytes = await Bun.file(archived.source.path).text(), manifest = await Bun.file(archived.profile.journal).text()
      expect(await readLeaseReceipt(archived.source.path)).toMatchObject({ kind: "management-slot-archive", slotId: "a",
        leaseToken: a.lease.token, identity, storageDeletionAllowed: false, nextAdmissionAllowed: false })
      expect(await archiveManagementSlot(fixture.slots, environment.server, a.lease, a.file)).toEqual(archived)
      expect(await Bun.file(archived.source.path).text()).toBe(bytes)
      expect(await Bun.file(archived.profile.journal).text()).toBe(manifest)
      await expect(management(command, ["loginom", "status", "--format", "json"])).rejects.toThrow("MANAGEMENT_PROCESS_INVENTORY_SEALED")
      await expect(a.lease.release(archived.source.path)).rejects.toThrow("SLOT_RELEASE_UNCONFIRMED")
      await a.lease.assertHeld(); await environment.server.assertHeld()
      expect(running.done).toBe(false)
      await Bun.write(finish, "done")
      expect((await pending).exitCode).toBe(0)
      expect((await pending).processCleanup.status).toBe("confirmed")
      expect((await readLeaseReceipt(journal) as { phase: string }).phase).toBe("cli_admitted")
      await sealManagementProcessInventories(fixture.slots, environment.server, environment.slots,
        new Bun.CryptoHasher("sha256").update(JSON.stringify(await readLeaseReceipt(journal))).digest("hex"))
      const all = await archiveManagementEnvironment(fixture.slots, environment)
      expect(all.profiles[0]!.archive).toBe(archived.profile.archive)
      expect(await Bun.file(archived.profile.journal).text()).toBe(manifest)
      expect(await Bun.file(path.join(all.profiles[1]!.archive, history[0]!)).text()).toBe(`b:${history[0]}`)
    } finally { await Bun.write(finish, "done"); await pending }
  } finally { await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())]); await rm(root, { recursive: true, force: true }) }
})
