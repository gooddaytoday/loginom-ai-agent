import { expect, test } from "bun:test"
import { checkNodeSequence, readNodeEvents, operationReceipts } from "../src/node-events"
const csv="Region,Month,A,B\nN,M1,15,7\nN,M2,3,2\nS,M1,4,6\n"
const fixture=await Bun.file(new URL("fixtures/node-evals/multi-row-keys-protocol.json",import.meta.url)).json()
function check(parts=fixture) {
 const events=readNodeEvents(parts.map((p:unknown)=>JSON.stringify(p)).join("\n"))
 const node=events.calls.find(c=>c.output.configuration?.readback?.kind==="crosstable")!.output.node.node_id
 return checkNodeSequence(events,"crosstable-multi-row-keys",node,csv).failures
}
test("multi-row-keys full native read доказывает оба текстовых ключа, order, types и fresh categories",()=>{
 expect(check()).toEqual([])
 for(const mutate of [
  (o:any)=>{o.configuration.readback.row_keys.reverse()},
  (o:any)=>{o.configuration.readback.row_keys.pop()},
  (o:any)=>{o.output.ports[0].sample_complete=false},
  (o:any)=>{o.output.ports[0].schema[1].type="real"},
  (o:any)=>{o.output.ports[0].category_fields[0].category="C"},
  (o:any)=>{o.output.ports[0].exact_table.rows[0][1].native.utf8_hex="4e"},
  (o:any)=>{o.configuration.readback.facts[0].functions=["avg"]},
 ]) {
  const parts=structuredClone(fixture), p=parts.find((p:any)=>JSON.parse(p.part.state.output).configuration?.readback?.kind==="crosstable")
  const output=JSON.parse(p.part.state.output); mutate(output); p.part.state.output=JSON.stringify(output)
  expect(check(parts).length).toBeGreaterThan(0)
 }
})

const refresh=await Bun.file(new URL("fixtures/node-evals/sliding-refresh-protocol.json",import.meta.url)).json()
function refreshCheck(parts=refresh) {
 const events=readNodeEvents(parts.map((p:unknown)=>JSON.stringify(p)).join("\n")), node=events.calls.find(c=>c.output.configuration?.readback?.kind==="crosstable")!.output.node.node_id
 return checkNodeSequence(events,"crosstable-sliding-source-refresh",node,"Region,B,C\nN,11,4\nS,6,8\n","Region,A,B\nN,10,7\nS,3,2\n").failures
}
const reread=(events:ReturnType<typeof readNodeEvents>)=>operationReceipts(events).receipts.find(p=>p.request.tool.endsWith("node_read"))!
test("sliding требует initial full read → same import source change → same CrossTable reread без apply",()=>{
 expect(refreshCheck()).toEqual([])
 function change(mutator:(events:ReturnType<typeof readNodeEvents>)=>void) {
  const events=readNodeEvents(refresh.map((p:unknown)=>JSON.stringify(p)).join("\n")); mutator(events)
  const node=events.calls.find(c=>c.output.configuration?.readback?.kind==="crosstable")!.output.node.node_id
  return checkNodeSequence(events,"crosstable-sliding-source-refresh",node,"Region,B,C\nN,11,4\nS,6,8\n","Region,A,B\nN,10,7\nS,3,2\n").failures
 }
 expect(change(e=>{e.calls.find(c=>c.output.configuration?.readback?.kind==="crosstable")!.output.output.ports[0].sample_complete=false}).length).toBeGreaterThan(0)
 expect(change(e=>{const request=e.calls.find(c=>c.input.target?.type==="imports.text" && c.input.target.kind==="existing")!; request.start=0}).length).toBeGreaterThan(0)
 expect(change(e=>{const first=e.calls.find(c=>c.output.configuration?.readback?.kind==="crosstable")!;reread(e).receipt.output.execution.execution_id=first.output.execution.execution_id}).length).toBeGreaterThan(0)
 expect(change(e=>{e.calls.find(c=>c.input.target?.type==="imports.text" && c.input.target.kind==="existing")!.input.target.ref.node_id="replacement"}).length).toBeGreaterThan(0)
 expect(change(e=>{e.calls.find(c=>c.tool.endsWith("node_read"))!.input.source_operation_id="other"}).length).toBeGreaterThan(0)
 expect(change(e=>{const first=e.calls.find(c=>c.input.target?.type==="transform.cross_table")!, last=e.calls.find(c=>c.tool.endsWith("node_read"))!;e.calls.push({...first,index:last.index+1,start:last.end+1,end:last.end+2,input:{...first.input,operation_id:"late-apply",parameters:{}}})}).length).toBeGreaterThan(0)
 expect(change(e=>{reread(e).receipt.output.output.ports[0].category_fields[0].category="A"}).length).toBeGreaterThan(0)
})
