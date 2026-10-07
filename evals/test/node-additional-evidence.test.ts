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

test("min/max собственный native output mapping и mask12; swapped source и mask13 отвергаются",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"node-minmax-"))
 try {
  await Bun.write(path.join(root,"task.json"),JSON.stringify({id:"crosstable-min-max",checklist:["input","crosstable","graph","sequence","export","result"].map(id=>({id,required:true}))}))
  await Bun.write(path.join(root,"data/sales.csv"),"Region,Category,Amount\nN,A,10\nN,A,-5\nN,B,7\nS,A,3\nS,B,2\n")
  const csv="Region,A_min,A_max,B_min,B_max\nN,-5,10,7,7\nS,3,3,2,2\n"
  await Bun.write(path.join(root,"oracle.csv"),csv)
  await Bun.write(path.join(root,"artifact/results/eval-lab26-builder-crosstable-min-max-1-crosstable-min-max-1.result.csv"),csv)
  const xml=await Bun.file(new URL("fixtures/node-evals/min-max.xml",import.meta.url)).text()
  async function packageXml(source:string) {
   await Bun.write(path.join(root,"artifact/unpacked/Unit_0/Unit.xml"),source)
   const p=Bun.spawn(["python3","-c","import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w');z.write(sys.argv[2],'Unit_0/Unit.xml');z.close()",path.join(root,"artifact/package.lgp"),path.join(root,"artifact/unpacked/Unit_0/Unit.xml")])
   expect(await p.exited).toBe(0)
  }
  await packageXml(xml)
  const events=await Bun.file(new URL("fixtures/node-evals/min-max-protocol.json",import.meta.url)).json()
  await Bun.write(path.join(root,"events.jsonl"),events.map((e:unknown)=>JSON.stringify(e)).join("\n"))
  const native=await Bun.file(new URL("fixtures/node-evals/min-max-native.json",import.meta.url)).json()
  await Bun.write(path.join(root,"native-crosstable.json"),JSON.stringify(native))
  expect(await validateNodeAttempt(root,root)).toEqual({errors:[],failures:[]})
  const corrupted=structuredClone(native)
  for(const observation of corrupted.observations) observation.node_crosstable.input_fields.find((f:any)=>f.label==="Amount").functions=13
  await Bun.write(path.join(root,"native-crosstable.json"),JSON.stringify(corrupted))
  expect((await validateNodeAttempt(root,root)).failures.join(" ")).toContain("mask")
  await Bun.write(path.join(root,"native-crosstable.json"),JSON.stringify(native))
  await packageXml(xml.replace('Mapping Source="A_Amount_Min"','Mapping Source="A_Amount_Max"'))
  expect((await validateNodeAttempt(root,root)).failures.join(" ")).toContain("mapping")
 } finally {await rm(root,{recursive:true,force:true})}
})
