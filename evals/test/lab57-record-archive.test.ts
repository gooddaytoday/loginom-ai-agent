import { expect, test } from "bun:test"
import { chmod, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { archiveReservedRecord, reserveRecordArchive, snapshotPrivateRecord } from "../src/lab57-record-archive"

test("LAB57 proposal: entire synthetic legacy guard is archived with bytes and inode preserved", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lab57-record-"))
  try {
    const source=path.join(root,"profile.harness-lease")
    await mkdir(source,{mode:0o700})
    await writeFile(path.join(source,"owner.json"),'{"nonce":"SYNTHETIC","pid":1}',{mode:0o600})
    const expected=await snapshotPrivateRecord(root,source)
    const reservation=await reserveRecordArchive({root,source,destination:path.join(root,"archived-guard"),once:path.join(root,"once.json"),expected})
    expect(JSON.parse(await readFile(reservation.once,"utf8")).status).toBe("CONSUMED_BEFORE_MUTATION")
    expect((await lstat(reservation.once)).mode&0o777).toBe(0o600)
    const result=await archiveReservedRecord(reservation)
    expect(result.status).toBe("RECORD_ARCHIVED")
    expect((await lstat(result.destination)).ino).toBe(expected[0]!.inode)
    expect(await readFile(path.join(result.destination,"owner.json"),"utf8")).toBe('{"nonce":"SYNTHETIC","pid":1}')
    expect(await Bun.file(source).exists()).toBe(false)
  } finally {await rm(root,{recursive:true,force:true})}
})

async function record() {
  const root=await mkdtemp(path.join(os.tmpdir(),"lab57-record-"))
  const source=path.join(root,"profile.process-group")
  await writeFile(source,"1234567",{mode:0o600})
  return {root,source,destination:path.join(root,"archived-registration"),once:path.join(root,"once.json"),expected:await snapshotPrivateRecord(root,source)}
}

test("LAB57 proposal: a reservation cannot be redirected to another destination", async () => {
  const plan=await record()
  try {
    const reservation=await reserveRecordArchive(plan)
    await expect(archiveReservedRecord({...reservation,destination:path.join(plan.root,"another-destination")})).rejects.toThrow("Once plan changed")
    expect(await readFile(plan.source,"utf8")).toBe("1234567")
  } finally {await rm(plan.root,{recursive:true,force:true})}
})

test("LAB57 proposal: simultaneous once races admit exactly one reservation", async () => {
  const plan=await record()
  try {
    const results=await Promise.allSettled([reserveRecordArchive(plan),reserveRecordArchive(plan)])
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1)
    expect(await readFile(plan.source,"utf8")).toBe("1234567")
    expect((await lstat(plan.once)).mode&0o777).toBe(0o600)
  } finally {await rm(plan.root,{recursive:true,force:true})}
})

test("LAB57 proposal: crash after reservation consumes once without moving the record", async () => {
  const plan=await record()
  try {
    await reserveRecordArchive(plan) // Simulated crash boundary: no archive invocation follows.
    await expect(reserveRecordArchive(plan)).rejects.toThrow()
    expect(await readFile(plan.source,"utf8")).toBe("1234567")
    expect(JSON.parse(await readFile(plan.once,"utf8")).status).toBe("CONSUMED_BEFORE_MUTATION")
  } finally {await rm(plan.root,{recursive:true,force:true})}
})

test.each(["content", "inode", "symlink", "mode", "hardlink"])("LAB57 proposal: changed source %s stops after once", async mutation => {
  const plan=await record()
  try {
    const reservation=await reserveRecordArchive(plan)
    if(mutation==="content") await writeFile(plan.source,"CHANGED")
    if(mutation==="inode") {await rm(plan.source);await writeFile(plan.source,"1234567",{mode:0o600})}
    if(mutation==="symlink") {await rm(plan.source);await symlink("/etc/passwd",plan.source)}
    if(mutation==="mode") await chmod(plan.source,0o644)
    if(mutation==="hardlink") await link(plan.source,path.join(plan.root,"alias"))
    await expect(archiveReservedRecord(reservation)).rejects.toThrow()
    expect(await Bun.file(plan.once).exists()).toBe(true)
    expect(await Bun.file(plan.destination).exists()).toBe(false)
  } finally {await rm(plan.root,{recursive:true,force:true})}
})

test("LAB57 proposal: unknown guard files added after reserve stop entire archival", async () => {
  const plan=await record()
  try {
    await rm(plan.source);await mkdir(plan.source,{mode:0o700})
    await writeFile(path.join(plan.source,"owner.json"),"SYNTHETIC",{mode:0o600})
    plan.expected=await snapshotPrivateRecord(plan.root,plan.source)
    const reservation=await reserveRecordArchive(plan)
    await writeFile(path.join(plan.source,"foreign.json"),"FOREIGN",{mode:0o600})
    await expect(archiveReservedRecord(reservation)).rejects.toThrow()
    expect(await readFile(path.join(plan.source,"foreign.json"),"utf8")).toBe("FOREIGN")
  } finally {await rm(plan.root,{recursive:true,force:true})}
})

test.each(["file", "empty-directory", "symlink"])("LAB57 proposal: destination race %s never replaces existing object", async kind => {
  const plan=await record()
  try {
    const reservation=await reserveRecordArchive(plan)
    if(kind==="file") await writeFile(plan.destination,"FOREIGN",{mode:0o600})
    if(kind==="empty-directory") await mkdir(plan.destination,{mode:0o700})
    if(kind==="symlink") await symlink(plan.source,plan.destination)
    const before=await lstat(plan.destination)
    await expect(archiveReservedRecord(reservation)).rejects.toThrow()
    expect((await lstat(plan.destination)).ino).toBe(before.ino)
    expect(await readFile(plan.source,"utf8")).toBe("1234567")
    await expect(reserveRecordArchive(plan)).rejects.toThrow()
  } finally {await rm(plan.root,{recursive:true,force:true})}
})

test("LAB57 proposal: noncanonical parent and external paths are refused before once", async () => {
  const plan=await record()
  try {
    await expect(reserveRecordArchive({...plan,destination:"/tmp/foreign"})).rejects.toThrow()
    await symlink(plan.root,path.join(plan.root,"alias-root"))
    await expect(snapshotPrivateRecord(path.join(plan.root,"alias-root"),path.join(plan.root,"alias-root/profile.process-group"))).rejects.toThrow()
    expect(await Bun.file(plan.once).exists()).toBe(false)
  } finally {await rm(plan.root,{recursive:true,force:true})}
})
