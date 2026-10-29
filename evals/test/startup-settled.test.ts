import {expect,test} from "bun:test"
import {mkdtemp,mkdir,rm,lstat,readdir} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {parallelFixture,acquireFixtureSlot} from "./helpers/parallel-fixture"
import {archiveStartupHistory} from "../src/slot-storage"

for(const marker of ["loginom/connection/pending.json","loginom/recovery/unfinished.tmp"]) {
 test(`startup refuses unsettled ${marker} before any archive effect`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"startup-settled-")),f=await parallelFixture(root)
  const identity={containerId:"a".repeat(64),startedAt:"old",studioContainerId:"b".repeat(64),studioStartedAt:"old",serverEpoch:"c".repeat(64),configurationHash:"d".repeat(64)}
  const lease=await acquireFixtureSlot(f.slots,f.slots.slots[0]!,identity,f.lockRoot)
  try {
   const file=path.join(lease.slot.profileDir,marker)
   await mkdir(path.dirname(file),{recursive:true,mode:0o700});await Bun.write(file,"original pending evidence")
   const before=await lstat(file),receipt=await Bun.file(lease.receipt).text()
   await expect(archiveStartupHistory(f.slots,lease)).rejects.toThrow("Профиль имеет незавершённое состояние")
   expect(await Bun.file(file).text()).toBe("original pending evidence")
   expect((await lstat(file)).ino).toBe(before.ino)
   expect(await readdir(lease.slot.historyDir)).toEqual([])
   expect(await Bun.file(path.join(f.slots.controller.stateDir,`startup-${lease.token}.archive.json`)).exists()).toBe(false)
   expect(await Bun.file(lease.receipt).text()).toBe(receipt)
  }finally{await lease.close();await rm(root,{recursive:true,force:true})}
 })
}
