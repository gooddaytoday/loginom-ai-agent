import { expect, test } from "bun:test"
import { checkNodeSequence, readNodeEvents } from "../src/node-events"
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
