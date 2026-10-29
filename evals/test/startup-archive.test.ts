import { expect, test } from "bun:test"
import { mkdtemp, rm, mkdir } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { startupArchiveInventory } from "../src/startup-archive"

test("partial archive inventory detects content changes and records symlinks without following them", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-partial-archive-"))
  try {
    await mkdir(path.join(root, "archive"), { mode: 0o700 })
    await Bun.write(path.join(root, "archive", "history.json"), "old history")
    const before = await startupArchiveInventory(root, path.join(root, "archive"))
    await Bun.write(path.join(root, "archive", "history.json"), "new history")
    expect(await startupArchiveInventory(root, path.join(root, "archive"))).not.toEqual(before)
    const { symlink } = await import("node:fs/promises")
    await symlink(path.join(root, "archive", "history.json"), path.join(root, "archive", "link"))
    expect((await startupArchiveInventory(root, path.join(root, "archive"))).find(row => row.name === "link")).toMatchObject({ kind: "link", target: path.join(root, "archive", "history.json") })
  } finally { await rm(root, { recursive: true }) }
})

import { parallelFixture } from "./helpers/parallel-fixture"
import { acquireEnvironmentLeases } from "../src/slots"
import { writeLeaseReceipt } from "../src/lease"
import { readStartupArchive, validateStartupArchive, sealLegacyStartupArchive } from "../src/startup-archive"

test("partial startup proof reentry preserves archive and detects changed proof/content/token", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-partial-proof-")), f = await parallelFixture(root)
  const identity = { containerId: "a".repeat(64), startedAt: "old", studioContainerId: "b".repeat(64), studioStartedAt: "old", serverEpoch: "c".repeat(64), configurationHash: "d".repeat(64) }
  const journal = path.join(f.slots.controller.stateDir, "command.json")
  await writeLeaseReceipt(journal, { version: 2, kind: "unactivated-preparation", phase: "cli_admitted", commandId: "partial", identity, slotIds: ["a"], attempts: [] })
  const env = await acquireEnvironmentLeases(f.slots, 1, identity, journal, f.lockRoot), lease = env.slots[0]!
  try {
    const archive = path.join(lease.slot.historyDir, "original")
    await mkdir(archive, { mode: 0o700 }); await Bun.write(path.join(archive, "history"), "original")
    const file = path.join(f.slots.controller.stateDir, `startup-${lease.token}.json`)
    const original = { version: 2, status: "confirmed", slotId: lease.slot.id, leaseToken: lease.token, serverEpoch: identity.serverEpoch,
      processes: "confirmed", serverSessions: "confirmed", archive: "committed", profileArchive: archive, unused: false,
      attemptDirs: [], storageDeletionAllowed: true, nextAdmissionAllowed: true }
    const inventory = await startupArchiveInventory(lease.slot.historyDir, archive)
    Object.assign(original, { archiveInventory: inventory })
    await writeLeaseReceipt(file, original)
    const anchored = JSON.parse(await Bun.file(file).text())
    const legacy = { ...anchored }; delete legacy.archiveInventory
    await writeLeaseReceipt(file, legacy)
    await expect(readStartupArchive(file, env.server, lease)).rejects.toThrow("STARTUP_ARCHIVE_ANCHOR_REQUIRED")
    const evidenceFile = path.join(root, "history-before.json")
    const historyHash = new Bun.CryptoHasher("sha256").update("original").digest("hex")
    await writeLeaseReceipt(evidenceFile, { history: [{ slotId: lease.slot.id, profileDir: lease.slot.profileDir,
      files: [{ file: path.join(lease.slot.profileDir, "history"), sha256: historyHash }] }] })
    const evidenceHash = new Bun.CryptoHasher("sha256").update(await Bun.file(evidenceFile).arrayBuffer()).digest("hex")
    await expect(sealLegacyStartupArchive(file, env.server, lease, evidenceFile, "0".repeat(64))).rejects.toThrow("STARTUP_ARCHIVE_HISTORY_UNCONFIRMED")
    await sealLegacyStartupArchive(file, env.server, lease, evidenceFile, evidenceHash)
    const anchorBytes = await Bun.file(`${file}.archive-anchor.json`).text()
    await expect(sealLegacyStartupArchive(file, env.server, lease, evidenceFile, evidenceHash)).rejects.toThrow()
    expect(await Bun.file(`${file}.archive-anchor.json`).text()).toBe(anchorBytes)
    expect(await Bun.file(file).json()).toEqual(legacy)
    const bytes = await Bun.file(file).text(), a = (await readStartupArchive(file, env.server, lease))!
    await validateStartupArchive(a, env.server, lease)
    const b = (await readStartupArchive(file, env.server, lease))!
    expect(b).toEqual(a)
    expect(await Bun.file(file).text()).toBe(bytes)
    expect(await Bun.file(path.join(archive, "history")).text()).toBe("original")
    await Bun.write(path.join(archive, "history"), "changed")
    await expect(validateStartupArchive(a, env.server, lease)).rejects.toThrow("STARTUP_ARCHIVE_CHANGED")
    await expect(readStartupArchive(file, env.server, lease)).rejects.toThrow("STARTUP_ARCHIVE_CHANGED")
    await writeLeaseReceipt(file, { ...original, leaseToken: "other" })
    await expect(readStartupArchive(file, env.server, lease)).rejects.toThrow("STARTUP_ARCHIVE_UNCONFIRMED")
    await writeLeaseReceipt(file, { ...original, serverEpoch: "other" })
    await expect(readStartupArchive(file, env.server, lease)).rejects.toThrow("STARTUP_ARCHIVE_UNCONFIRMED")
    await writeLeaseReceipt(file, { ...original, profileArchive: root })
    await expect(readStartupArchive(file, env.server, lease)).rejects.toThrow("STARTUP_ARCHIVE_UNCONFIRMED")
  } finally { await Promise.all([env.server.close(), ...env.slots.map(s => s.close())]); await rm(root, { recursive: true }) }
})

test.skipIf(process.platform !== "linux")("legacy anchor EFBIG leaves final name free and permits safe retry", async () => {
  const script = `
import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm,readdir,lstat} from "node:fs/promises";
import path from "node:path";import os from "node:os";import {dlopen,ptr} from "bun:ffi";
import {parallelFixture} from ${JSON.stringify(path.resolve(import.meta.dir,"helpers/parallel-fixture.ts"))};
import {acquireEnvironmentLeases} from ${JSON.stringify(path.resolve(import.meta.dir,"../src/slots.ts"))};
import {writeLeaseReceipt} from ${JSON.stringify(path.resolve(import.meta.dir,"../src/lease.ts"))};
import {sealLegacyStartupArchive,readStartupArchive} from ${JSON.stringify(path.resolve(import.meta.dir,"../src/startup-archive.ts"))};
const root=await mkdtemp(path.join(os.tmpdir(),"evals-anchor-io-")),f=await parallelFixture(root);
const identity={containerId:"a".repeat(64),startedAt:"old",studioContainerId:"b".repeat(64),studioStartedAt:"old",serverEpoch:"c".repeat(64),configurationHash:"d".repeat(64)};
const journal=path.join(f.slots.controller.stateDir,"command.json");
await writeLeaseReceipt(journal,{version:2,kind:"unactivated-preparation",phase:"cli_admitted",commandId:"anchor-io",identity,slotIds:["a"],attempts:[]});
const env=await acquireEnvironmentLeases(f.slots,1,identity,journal,f.lockRoot),lease=env.slots[0];
const libc=dlopen("libc.so.6",{getrlimit:{args:["i32","ptr"],returns:"i32"},setrlimit:{args:["i32","ptr"],returns:"i32"}});
const limits=new BigUint64Array(2);assert.equal(libc.symbols.getrlimit(1,ptr(limits)),0);process.on("SIGXFSZ",()=>{});
try {
 const archive=path.join(lease.slot.historyDir,"original");await mkdir(archive,{mode:0o700});await Bun.write(path.join(archive,"history"),"original");
 const file=path.join(f.slots.controller.stateDir,"startup-"+lease.token+".json"),anchor=file+".archive-anchor.json";
 await writeLeaseReceipt(file,{version:2,status:"confirmed",slotId:lease.slot.id,leaseToken:lease.token,serverEpoch:identity.serverEpoch,processes:"confirmed",serverSessions:"confirmed",archive:"committed",profileArchive:archive,unused:false,attemptDirs:[],storageDeletionAllowed:true,nextAdmissionAllowed:true});
 const original=await Bun.file(file).text(),evidence=path.join(root,"history-before.json");
 await writeLeaseReceipt(evidence,{history:[{slotId:lease.slot.id,profileDir:lease.slot.profileDir,files:[{file:path.join(lease.slot.profileDir,"history"),sha256:new Bun.CryptoHasher("sha256").update("original").digest("hex")}]}]});
 const hash=new Bun.CryptoHasher("sha256").update(await Bun.file(evidence).arrayBuffer()).digest("hex");
 const restricted=new BigUint64Array([0n,limits[1]]);assert.equal(libc.symbols.setrlimit(1,ptr(restricted)),0);
 let failure;try {await sealLegacyStartupArchive(file,env.server,lease,evidence,hash)} catch(e){failure=e}
 finally {assert.equal(libc.symbols.setrlimit(1,ptr(limits)),0)}
 assert.equal(failure?.code,"EFBIG");
 assert.equal(await Bun.file(anchor).exists(),false,"failed write must not occupy final anchor name");
 assert.equal((await readdir(path.dirname(file))).filter(n=>n.includes(".archive-anchor.json.tmp-")).length,0);
 await sealLegacyStartupArchive(file,env.server,lease,evidence,hash);assert.ok(await readStartupArchive(file,env.server,lease));
 assert.equal((await lstat(anchor)).nlink,1);
 const committed=await Bun.file(anchor).text();await assert.rejects(()=>sealLegacyStartupArchive(file,env.server,lease,evidence,hash),{code:"EEXIST"});
 assert.equal(await Bun.file(anchor).text(),committed);assert.equal(await Bun.file(file).text(),original);assert.equal(await Bun.file(path.join(archive,"history")).text(),"original");
 console.log("EFBIG -> no final/temp -> retry confirmed -> existing anchor preserved");
} finally {libc.symbols.setrlimit(1,ptr(limits));libc.close();await Promise.all([env.server.close(),...env.slots.map(s=>s.close())]);await rm(root,{recursive:true})}
`
  const child=Bun.spawn([process.execPath,"-e",script],{stdout:"pipe",stderr:"pipe"})
  const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited])
  expect({code,error:err}).toEqual({code:0,error:""})
  expect(out).toContain("retry confirmed")
},15000)

test("startup inventory preserves stopped socket and symlink object identity", async () => {
 const {lstat, symlink}=await import("node:fs/promises")
 const root=await mkdtemp(path.join(os.tmpdir(),"startup-special-")), archive=path.join(root,"archive")
 try {
  await mkdir(archive,{mode:0o700})
  const socket=path.join(archive,"socket")
  const child=Bun.spawn([process.execPath,"-e",'Bun.listen({unix:process.env.TEST_SOCKET,socket:{data(){}}});process.kill(process.pid,"SIGKILL")'],{env:{PATH:process.env.PATH,TEST_SOCKET:socket},stdout:"pipe",stderr:"pipe"})
  await child.exited
  await symlink("/does-not-exist/outside",path.join(archive,"link"))
  const before=await lstat(socket), inventory=await startupArchiveInventory(root,archive)
  expect(inventory.find(row=>row.name==="socket")).toMatchObject({kind:"socket",inode:before.ino,device:before.dev,sha256:null})
  expect(inventory.find(row=>row.name==="link")).toMatchObject({kind:"link",target:"/does-not-exist/outside",sha256:null})
  expect(await startupArchiveInventory(root,archive)).toEqual(inventory)
 }finally{await rm(root,{recursive:true,force:true})}
})
