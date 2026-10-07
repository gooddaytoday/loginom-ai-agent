import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { validateNodeAttempt } from "../src/node-evals"
test("multi-row-keys original input/native import, graph, full read, export and save",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"node-multikey-"))
 try {
  await Bun.write(path.join(root,"task.json"),JSON.stringify({id:"crosstable-multi-row-keys",checklist:["input","crosstable","graph","sequence","export","result"].map(id=>({id,required:true}))}))
  await Bun.write(path.join(root,"data/sales.csv"),"Region,Month,Category,Amount\nN,M1,A,10\nN,M1,A,5\nN,M1,B,7\nN,M2,A,3\nN,M2,B,2\nS,M1,A,4\nS,M1,B,6\n")
  const csv="Region,Month,A,B\nN,M1,15,7\nN,M2,3,2\nS,M1,4,6\n"
  await Bun.write(path.join(root,"oracle.csv"),csv)
  await Bun.write(path.join(root,"artifact/results/eval-lab26-builder-crosstable-multi-row-keys-2-crosstable-multi-row-keys-2.result.csv"),csv)
  await Bun.write(path.join(root,"artifact/unpacked/Unit_0/Unit.xml"),await Bun.file(new URL("fixtures/node-evals/multi-row-keys.xml",import.meta.url)).text())
  const proc=Bun.spawn(["python3","-c","import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w');z.write(sys.argv[2],'Unit_0/Unit.xml');z.close()",path.join(root,"artifact/package.lgp"),path.join(root,"artifact/unpacked/Unit_0/Unit.xml")])
  expect(await proc.exited).toBe(0)
  const events=await Bun.file(new URL("fixtures/node-evals/multi-row-keys-protocol.json",import.meta.url)).json()
  await Bun.write(path.join(root,"events.jsonl"),events.map((e:unknown)=>JSON.stringify(e)).join("\n"))
  expect(await validateNodeAttempt(root,root)).toEqual({errors:[],failures:[]})
 } finally {await rm(root,{recursive:true,force:true})}
})
