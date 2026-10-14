import {test,expect} from "bun:test"
import {mkdtemp,writeFile,readFile,lstat,mkdir} from "node:fs/promises"
import {archiveProfileHistory,management} from "../src/profile"
import type {AgentCommand} from "../src/cli"
test("official history refuses a failed closed admission before any move",async()=>{
  const profile=await mkdtemp("/tmp/lab57-history-")
  await writeFile(profile+"/preserve.txt","original",{mode:0o600})
  await expect(archiveProfileHistory(profile,"owned",async()=>{throw Error("CLOSED_ADMISSION_REFUSED")})).rejects.toThrow("CLOSED_ADMISSION_REFUSED")
  expect(await readFile(profile+"/preserve.txt","utf8")).toBe("original")
  await expect(lstat(profile+".history")).rejects.toThrow()
})
test("failed management admission cannot create diagnostics or launch an external command",async()=>{
  const root=await mkdtemp("/tmp/lab57-management-")
  const command:AgentCommand={mode:"fake",cmd:["/unavailable-command"],cwd:root,env:{},cleanupDir:root+"/diagnostics",beforeManagementEffect:async()=>{throw Error("ADMISSION_REFUSED")}}
  await expect(management(command,["loginom","recover"])).rejects.toThrow("ADMISSION_REFUSED")
  await expect(lstat(root+"/diagnostics")).rejects.toThrow()
})
test("ordinary unguarded history API still preserves actual bytes and settings",async()=>{
  const root=await mkdtemp("/tmp/lab57-history-default-")
  await mkdir(root+"/data");await writeFile(root+"/data/auth.json","settings");await writeFile(root+"/data/database","preserved")
  const archive=await archiveProfileHistory(root,"ordinary")
  expect(await readFile(root+"/data/auth.json","utf8")).toBe("settings")
  expect(await readFile(archive+"/data/database","utf8")).toBe("preserved")
})
