import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { collectNodeNativeEvidence } from "../src/node-native"
test("сохраняются последние реальные native observations из собственного cleanup history archive",async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"node-native-"))
 try {
  const profile=path.join(root,"profile"), history=profile+".history/attempt", attempt=path.join(root,"attempt")
  const native=await Bun.file(new URL("fixtures/node-evals/min-max-native.json",import.meta.url)).json()
  const records=native.observations.map((o:any)=>({operation_id:o.operation_id,recorded_at:o.recorded_at,phase:"node_observation_completed",outcome:{status:"SUCCEEDED",output:{node_crosstable:o.node_crosstable}}}))
  await Bun.write(path.join(history,"runtime/execution-events.jsonl"),records.map((r:any)=>JSON.stringify(r)).join("\n"))
  await Bun.write(path.join(attempt,"cleanup.json"),JSON.stringify({result:{status:"confirmed"},stages:[{stage:"profile_history",status:"confirmed",path:history}]}))
  await collectNodeNativeEvidence(attempt,profile)
  const proof=await Bun.file(path.join(attempt,"native-crosstable.json")).json()
  expect(proof.observations).toHaveLength(2)
  expect(proof.observations[1].node_crosstable.input_fields[2].functions).toBe(12)
  expect(proof.observations[1].source_sha256).toMatch(/^[a-f0-9]{64}$/)
 } finally {await rm(root,{recursive:true,force:true})}
})

test("owned local variable native step is retained with source provenance after cleanup", async () => {
 const root=await mkdtemp(path.join(os.tmpdir(),"node-native-variables-"))
 try {
  const profile=path.join(root,"profile"),history=profile+".history/attempt",attempt=path.join(root,"attempt")
  const native={status:"SUCCEEDED",action_key:"node.crosstable.local_variables.internal",phase:"local_variables",cleanup_complete:true,
   output:{verified:true,cleanup_complete:true,node_context:{verified:true,document_id:"doc",workflow_id:"wf",node_id:"cross"},
    variables:[{id:17,name:"GroupLimit",label:"GroupLimit",type:4,value:1,is_null:false}]}}
  await Bun.write(path.join(history,"runtime/execution-events.jsonl"),JSON.stringify({operation_id:"apply",phase:"node_step_completed",internal_operation_id:"apply:n1",outcome:native})+"\n")
  await Bun.write(path.join(attempt,"cleanup.json"),JSON.stringify({result:{status:"confirmed"},stages:[{stage:"profile_history",status:"confirmed",path:history}]}))
  await collectNodeNativeEvidence(attempt,profile)
  const proof=await Bun.file(path.join(attempt,"native-crosstable.json")).json()
  expect(proof.local_variable_observations).toHaveLength(1)
  expect(proof.local_variable_observations[0].output.variables[0].id).toBe(17)
  expect(proof.local_variable_observations[0].source_sha256).toMatch(/^[a-f0-9]{64}$/)
 } finally {await rm(root,{recursive:true,force:true})}
})
