import { expect, test } from "bun:test"
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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
