import { expect, test } from "bun:test"
import { validateTerminalPreparation } from "../src/terminal-preparation"

test("an untrusted terminal receipt cannot authorize cleanup", async () => {
  await expect(validateTerminalPreparation({ kind: "terminal-preparation", status: "confirmed" } as never, {} as never, {} as never))
    .rejects.toThrow("TERMINAL_PREPARATION_UNTRUSTED")
})

import { mkdtemp, mkdir, rename, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parallelFixture } from "./helpers/parallel-fixture"
import { reopenEnvironmentLeases } from "../src/slots"
import { writeLeaseReceipt } from "../src/lease"
import { observeTerminalPreparation } from "../src/terminal-preparation"
import { cleanupSlotStorage } from "../src/slot-storage"
import { observeTerminalPreparationUnit } from "../src/process-supervisor"

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("native failed preparation a leaves b recoverable only after matching terminal unit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-terminal-native-")), f = await parallelFixture(root)
  const unit = `evals-terminal-test-${crypto.randomUUID()}.service`, runDir = path.join(root, "run")
  const source = path.join(f.slots.controller.stateDir, "command.json"), ready = path.join(root, "ready"), finish = path.join(root, "finish")
  const identity = { containerId: "a".repeat(64), startedAt: "old", studioContainerId: "b".repeat(64), studioStartedAt: "old", serverEpoch: "c".repeat(64), configurationHash: "d".repeat(64) }
  let env: Awaited<ReturnType<typeof reopenEnvironmentLeases>>
  const script = `
    const {captureUnitBinding}=await import(${JSON.stringify(path.resolve(import.meta.dir,"../src/process-supervisor.ts"))});
    const {writeLeaseReceipt}=await import(${JSON.stringify(path.resolve(import.meta.dir,"../src/lease.ts"))});
    const {acquireEnvironmentLeases}=await import(${JSON.stringify(path.resolve(import.meta.dir,"../src/slots.ts"))});
    const {management}=await import(${JSON.stringify(path.resolve(import.meta.dir,"../src/profile.ts"))});
    const binding=await captureUnitBinding();
    await writeLeaseReceipt(${JSON.stringify(source)}, {version:2,kind:"unactivated-preparation",commandId:"native-test",identity:${JSON.stringify(identity)},phase:"cli_admitted",runDir:${JSON.stringify(runDir)},slotIds:["a","b"],attempts:[],unitBinding:binding});
    const env=await acquireEnvironmentLeases(${JSON.stringify(f.slots)},2,${JSON.stringify(identity)},${JSON.stringify(source)},${JSON.stringify(f.lockRoot)});
    const result=await management({mode:"fake",cmd:[process.execPath,"-e","process.exit(1)"],cwd:${JSON.stringify(root)},env:{PATH:process.env.PATH},cleanupDir:${JSON.stringify(path.join(runDir,"preparation/a"))}},["loginom","status"]);
    if(result.exitCode!==1||result.processCleanup.status!=="confirmed")throw Error("fixture preparation mismatch");
    await writeLeaseReceipt(${JSON.stringify(ready)},{binding,owner:env.server.reservation.owner});
    while(!await Bun.file(${JSON.stringify(finish)}).exists())await Bun.sleep(20);
    await Promise.all([env.server.close(),...env.slots.map(s=>s.close())]);process.exit(1);
  `
  try {
    const launch = Bun.spawn(["systemd-run","--user","--quiet",`--unit=${unit}`,"--property=Delegate=no",process.execPath,"-e",script], {stdout:"ignore",stderr:"pipe"})
    expect(await launch.exited).toBe(0)
    const deadline = Date.now()+15000
    while(!await Bun.file(ready).exists()) { if(Date.now()>deadline)throw Error("fixture not ready");await Bun.sleep(25) }
    const saved = await Bun.file(ready).json()
    await expect(observeTerminalPreparationUnit(saved.binding,saved.owner)).rejects.toThrow("TERMINAL_PREPARATION_UNIT_BUSY")
    await Bun.write(finish,"exit")
    while((await Bun.$`systemctl --user show ${unit} --property=ActiveState --value`.quiet()).text().trim()!=="failed") {if(Date.now()>deadline)throw Error("fixture did not exit");await Bun.sleep(25)}
    env = await reopenEnvironmentLeases(f.slots, identity, f.lockRoot)
    const b = env!.slots.find(s=>s.slot.id==="b")!, original = await Bun.file(source).text()
    const proof = await observeTerminalPreparation(env!.server,b)
    expect(proof.kind).toBe("terminal-preparation");expect(proof.passes).toHaveLength(2)
    expect("capture_complete" in proof).toBe(false)
    await validateTerminalPreparation(proof,env!.server,b)
    // This is the exported destructive consumer with an actual observer proof; scope refuses before any server call.
    await expect(cleanupSlotStorage(f.slots,env!.server,b,{identity} as never,proof,["foreign"],[])).rejects.toThrow("TERMINAL_PREPARATION_SCOPE")
    await expect(cleanupSlotStorage(f.slots,env!.server,b,{identity} as never,proof,[],["/foreign"])).rejects.toThrow("TERMINAL_PREPARATION_SCOPE")
    expect(await Bun.file(source).text()).toBe(original)
    await expect(observeTerminalPreparationUnit({...saved.binding,invocation:"0".repeat(32)},saved.owner)).rejects.toThrow()
    await expect(observeTerminalPreparationUnit(saved.binding,{...saved.owner,bootId:"different"})).rejects.toThrow()
    const command=JSON.parse(original)
    for(const attempts of [null,undefined,[{slotId:"a",purpose:"measurement"}]]) {
      await writeLeaseReceipt(source,{...command,attempts})
      await expect(observeTerminalPreparation(env!.server,b)).rejects.toThrow("TERMINAL_PREPARATION_SOURCE_INELIGIBLE")
    }
    await writeLeaseReceipt(source,command)
    await mkdir(path.join(runDir,"preparation/b"))
    await expect(observeTerminalPreparation(env!.server,b)).rejects.toThrow("TERMINAL_PREPARATION_PATH_PRESENT")
    await rm(path.join(runDir,"preparation/b"),{recursive:true})
    await Bun.write(`${b.slot.profileDir}.process-group`,"123")
    await expect(observeTerminalPreparation(env!.server,b)).rejects.toThrow("TERMINAL_PREPARATION_PATH_PRESENT")
    await rm(`${b.slot.profileDir}.process-group`)
    await Bun.write(path.join(b.slot.profileDir,"loginom/connection/pending.json"),"{}")
    await expect(observeTerminalPreparation(env!.server,b)).rejects.toThrow()
    await rm(path.join(b.slot.profileDir,"loginom/connection/pending.json"))
    const mutation = (async()=>{await Bun.sleep(75);await writeLeaseReceipt(source,{...command,attempts:[{}]})})()
    await expect(observeTerminalPreparation(env!.server,b)).rejects.toThrow("TERMINAL_PREPARATION_SOURCE_CHANGED")
    await mutation
    await writeLeaseReceipt(source,command)
    expect((await observeTerminalPreparation(env!.server,b)).passes).toHaveLength(2)
  } finally {
    await Promise.all([env?.server.close(),...env?.slots.map(s=>s.close())??[]])
    await Bun.write(finish,"exit")
    await Bun.$`systemctl --user stop ${unit}`.quiet().nothrow()
    await Bun.$`systemctl --user reset-failed ${unit}`.quiet().nothrow()
    await rm(root,{recursive:true,force:true})
  }
},30000)

test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")("dead producer does not authorize cleanup while its unit descendant survives", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-terminal-descendant-")), f = await parallelFixture(root)
  const unit = `evals-terminal-descendant-${crypto.randomUUID()}.service`, ready = path.join(root,"ready")
  const identity = { containerId:"a".repeat(64), startedAt:"old", studioContainerId:"b".repeat(64), studioStartedAt:"old", serverEpoch:"c".repeat(64), configurationHash:"d".repeat(64) }
  const script = `
    const {captureUnitBinding}=await import(${JSON.stringify(path.resolve(import.meta.dir,"../src/process-supervisor.ts"))});
    const {writeLeaseReceipt}=await import(${JSON.stringify(path.resolve(import.meta.dir,"../src/lease.ts"))});
    const {acquireEnvironmentLeases}=await import(${JSON.stringify(path.resolve(import.meta.dir,"../src/slots.ts"))});
    const binding=await captureUnitBinding();
    const source=${JSON.stringify(path.join(f.slots.controller.stateDir,"command.json"))};
    await writeLeaseReceipt(source,{version:2,kind:"unactivated-preparation",commandId:"descendant-test",identity:${JSON.stringify(identity)},phase:"cli_admitted",runDir:${JSON.stringify(path.join(root,"run"))},slotIds:["a","b"],attempts:[],unitBinding:binding});
    const env=await acquireEnvironmentLeases(${JSON.stringify(f.slots)},2,${JSON.stringify(identity)},source,${JSON.stringify(f.lockRoot)});
    const {spawn}=await import("node:child_process");
    const child=spawn("/bin/sleep",["120"],{stdio:"ignore"});child.unref();
    await writeLeaseReceipt(${JSON.stringify(ready)},{binding,owner:env.server.reservation.owner,child:child.pid});
    await Promise.all([env.server.close(),...env.slots.map(s=>s.close())]);process.exit(1);
  `
  try {
    const launch=Bun.spawn(["systemd-run","--user","--quiet",`--unit=${unit}`,"--property=Delegate=no","--property=KillMode=process",process.execPath,"-e",script],{stdout:"ignore",stderr:"pipe"})
    expect(await launch.exited).toBe(0)
    const deadline=Date.now()+15000
    while(!await Bun.file(ready).exists()) {if(Date.now()>deadline)throw Error("descendant fixture timeout");await Bun.sleep(25)}
    const saved=await Bun.file(ready).json()
    while((await Bun.$`systemctl --user show ${unit} --property=MainPID --value`.quiet()).text().trim()!=="0") {if(Date.now()>deadline)throw Error("producer did not exit");await Bun.sleep(25)}
    expect(await Bun.file(`/proc/${saved.child}/stat`).exists()).toBe(true)
    expect(await Bun.file(`/proc/${saved.owner.pid}/stat`).exists()).toBe(false)
    await expect(observeTerminalPreparationUnit(saved.binding,saved.owner)).rejects.toThrow()
  } finally {
    await Bun.$`systemctl --user kill --kill-who=all --signal=KILL ${unit}`.quiet().nothrow()
    await Bun.$`systemctl --user stop ${unit}`.quiet().nothrow()
    await Bun.$`systemctl --user reset-failed ${unit}`.quiet().nothrow()
    await rm(root,{recursive:true,force:true})
  }
},30000)

for (const operation of ["prepare", "verify"] as const) test.skipIf(process.env.EVAL_SYSTEMD_TESTS !== "1")(`standalone ${operation} recovers an untouched slot only after its exact native unit exits`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-terminal-standalone-")), f = await parallelFixture(root)
  const unit = `evals-terminal-standalone-${crypto.randomUUID()}.service`, commandId = crypto.randomUUID()
  const source = path.join(f.slots.controller.stateDir, `${operation}-command-${commandId}.json`)
  const ready = path.join(root, "ready"), finish = path.join(root, "finish")
  const identity = { containerId: "a".repeat(64), startedAt: "old", studioContainerId: "b".repeat(64), studioStartedAt: "old", serverEpoch: "c".repeat(64), configurationHash: "d".repeat(64) }
  let environment: Awaited<ReturnType<typeof reopenEnvironmentLeases>>
  const script = `
    const {captureUnitBinding}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/process-supervisor.ts"))});
    const {writeLeaseReceipt}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/lease.ts"))});
    const {acquireEnvironmentLeases}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/slots.ts"))});
    const {management}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/profile.ts"))});
    const {observeTerminalPreparation}=await import(${JSON.stringify(path.resolve(import.meta.dir, "../src/terminal-preparation.ts"))});
    const binding=await captureUnitBinding();
    await writeLeaseReceipt(${JSON.stringify(source)},{version:2,kind:"unactivated-preparation",commandId:${JSON.stringify(commandId)},identity:${JSON.stringify(identity)},phase:"unactivated",slotIds:["a","b"],unitBinding:binding});
    const environment=await acquireEnvironmentLeases(${JSON.stringify(f.slots)},2,${JSON.stringify(identity)},${JSON.stringify(source)},${JSON.stringify(f.lockRoot)});
    const result=await management({mode:"fake",cmd:[process.execPath,"-e","process.exit(1)"],cwd:${JSON.stringify(root)},env:{PATH:process.env.PATH},cleanupDir:${JSON.stringify(path.join(f.slots.controller.stateDir, `management-${commandId}-a`))}},["loginom","status"]);
    if(result.exitCode!==1||result.processCleanup.status!=="confirmed")throw Error("standalone fixture preparation mismatch");
    let liveRefused=false;
    try { await observeTerminalPreparation(environment.server,environment.slots.find(slot=>slot.slot.id==="b")); }
    catch(error) { if(error.message!=="TERMINAL_PREPARATION_UNIT_BUSY")throw error;liveRefused=true; }
    await writeLeaseReceipt(${JSON.stringify(ready)},{binding,owner:environment.server.reservation.owner,liveRefused});
    while(!await Bun.file(${JSON.stringify(finish)}).exists())await Bun.sleep(20);
    await Promise.all([environment.server.close(),...environment.slots.map(slot=>slot.close())]);process.exit(1);
  `
  try {
    const launch = Bun.spawn(["systemd-run", "--user", "--quiet", `--unit=${unit}`, "--property=Delegate=no", process.execPath, "-e", script],
      { stdout: "ignore", stderr: "pipe" })
    expect(await launch.exited).toBe(0)
    const deadline = Date.now() + 15000
    while (!await Bun.file(ready).exists()) { if (Date.now() > deadline) throw Error("standalone fixture not ready"); await Bun.sleep(25) }
    expect((await Bun.file(ready).json()).liveRefused).toBe(true)
    await Bun.write(finish, "exit")
    while ((await Bun.$`systemctl --user show ${unit} --property=ActiveState --value`.quiet()).text().trim() !== "failed") {
      if (Date.now() > deadline) throw Error("standalone fixture did not exit")
      await Bun.sleep(25)
    }
    environment = await reopenEnvironmentLeases(f.slots, identity, f.lockRoot)
    const slot = environment!.slots.find(slot => slot.slot.id === "b")!
    const proof = await observeTerminalPreparation(environment!.server, slot)
    expect(proof.kind).toBe("terminal-preparation")
    expect(proof.passes).toHaveLength(2)
    expect("capture_complete" in proof).toBe(false)
    await validateTerminalPreparation(proof, environment!.server, slot)
    await expect(observeTerminalPreparation(environment!.server, environment!.slots.find(slot => slot.slot.id === "a")!))
      .rejects.toThrow("TERMINAL_PREPARATION_PATH_PRESENT")
    await expect(cleanupSlotStorage(f.slots, environment!.server, slot, { identity } as never, proof, ["foreign"]))
      .rejects.toThrow("TERMINAL_PREPARATION_SCOPE")
    const command = await Bun.file(source).json()
    for (const change of [{ attempts: [] }, { attempts: null }, { attempts: [{ slotId: "b" }] }, { runDir: root }, { phase: "released" }]) {
      await writeLeaseReceipt(source, { ...command, ...change })
      await expect(observeTerminalPreparation(environment!.server, slot)).rejects.toThrow("TERMINAL_PREPARATION_SOURCE_INELIGIBLE")
    }
    await writeLeaseReceipt(source, command)
    const moved = `${f.slots.controller.stateDir}-moved`
    await rename(f.slots.controller.stateDir, moved)
    await symlink(moved, f.slots.controller.stateDir, "dir")
    try {
      await expect(validateTerminalPreparation(proof, environment!.server, slot)).rejects.toThrow("LEASE_NOT_HELD")
    } finally { await rm(f.slots.controller.stateDir); await rename(moved, f.slots.controller.stateDir) }
    const management = path.join(f.slots.controller.stateDir, `management-${commandId}-b`)
    await symlink(path.join(root, "missing"), management)
    try {
      await expect(validateTerminalPreparation(proof, environment!.server, slot)).rejects.toThrow("TERMINAL_PREPARATION_PATH_PRESENT")
    } finally { await rm(management) }
    const appeared = (async () => { await Bun.sleep(75); await mkdir(management) })()
    try {
      await expect(validateTerminalPreparation(proof, environment!.server, slot)).rejects.toThrow("TERMINAL_PREPARATION_PATH_PRESENT")
    } finally { await appeared; await rm(management, { recursive: true }) }
    const mutation = (async () => { await Bun.sleep(75); await writeLeaseReceipt(source, { ...command, phase: "released" }) })()
    try {
      await expect(observeTerminalPreparation(environment!.server, slot)).rejects.toThrow("TERMINAL_PREPARATION_SOURCE_CHANGED")
    } finally { await mutation; await writeLeaseReceipt(source, command) }
  } finally {
    await Promise.all([environment?.server.close(), ...environment?.slots.map(slot => slot.close()) ?? []])
    await Bun.write(finish, "exit")
    await Bun.$`systemctl --user stop ${unit}`.quiet().nothrow()
    await Bun.$`systemctl --user reset-failed ${unit}`.quiet().nothrow()
    await rm(root, { recursive: true, force: true })
  }
}, 30000)
