import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, readdir, rm, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createPair, destroyPair, prepareUserStorage, readServerIdentity } from "../src/parallel-pair"
import { loadConfig } from "../src/config"
import { agentCommand } from "../src/cli"
import { loadTasks } from "../src/task"
import { afterAttempt, runAttempt } from "../src/run"
import { globalLockRoot, readLeaseReceipt, readResourceReservation, writeLeaseReceipt } from "../src/lease"
import { storageCodecFixture } from "./helpers/storage-codec-fixture"
import { parallelFixture } from "./helpers/parallel-fixture"
import { acquireEnvironmentLeases, loadSlots, parseSlots } from "../src/slots"
import { recoverUnactivatedPreparation } from "../src/preparation-recovery"
import { finalizeUnactivatedEnvironment } from "../src/environment-finalization"
import { openLoginomAdmin, readAdminFinalization } from "../src/loginom-admin"

import { readManagementProcessInventory } from "../src/management-process-evidence"
import { management } from "../src/profile"

const integration = process.env.EVAL_PAIR_INTEGRATION === "1" ? test : test.skip

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
