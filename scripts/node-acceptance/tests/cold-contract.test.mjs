import test from "node:test"
import assert from "node:assert/strict"
import { coldScenarios, verifyColdGraph, observationPort, coldSettings } from "../cold-contract.mjs"

test("legacy is explicit absence of version; unknown versions never fall back",()=>{
  const legacy={nodes:[],output_node_type:"grouping",columns:[],rows:[]}
  assert.equal(coldScenarios(legacy)[0].id,"legacy")
  for(const version of [null,"specification-v1","loginom-multi-output-v1"])
    assert.throws(()=>coldScenarios({...legacy,version}))
})
test("cold graph rejects changed input identity and extra/foreign links",()=>{
  const graph={workflow_ref:{navigation_path:[{label:"Scenario"}]},complete:true,foreign_links:[],nodes:[{ref:{node_id:"n"},type:"x",inputs:[0],outputs:[0,1,2]}],links:[]}
  const expected={navigation_path:["Scenario"],nodes:[{id:"n",type:"x",inputs:[0],outputs:[0,1,2]}],links:[]}
  verifyColdGraph(graph,expected)
  for(const mutate of [g=>g.complete=false,g=>g.foreign_links.push("foreign"),g=>g.nodes[0].ref.node_id="other",g=>g.nodes[0].outputs.pop(),g=>g.links.push({source:"other"})]){
    const g=structuredClone(graph);mutate(g);assert.throws(()=>verifyColdGraph(g,expected))
  }
})
test("multi-output adapter preserves integer strings and typed null; refuses cached and partial evidence",()=>{
  const data={port:2,port_guid:"guid",fresh:true,sample_complete:true,filter_enabled:false,precision:{numbers_verified:true},
    schema:[{index:0,name:"id",label:"ID",type:"integer",data_kind:"Дискретный",data_kind_source:"fresh_native"}],
    row_count:2,sample:[[{type:"integer",is_null:false,value:"9007199254740993"}],[{type:"integer",is_null:true,value:null}]]}
  const actual=observationPort(data,{role:"third"},"execution")
  assert.equal(actual.rows[0][0].value,"9007199254740993")
  assert.deepEqual(actual.rows[1][0],{type:"integer",is_null:true,value:null})
  for(const mutate of [d=>d.sample_complete=false,d=>d.filter_enabled=true,d=>d.precision.numbers_verified=false,d=>d.schema[0].data_kind_source="retained",d=>d.limitations=["partial"]]){
    const d=structuredClone(data);mutate(d);assert.throws(()=>observationPort(d,{role:"third"},"execution"))
  }
})

test('cold saved settings use complete native roles/options and reject changes or unknown kinds',()=>{
 const observed={verified:true,inventory_complete:true,input_fields:[{record_id:'ephemeral',name:'Amount',functions:1,disposition:7}],options:{sort:true}};
 const expected={kind:'grouping-ui-v1',values:{fields:[{name:'Amount',functions:1,disposition:7}],options:{sort:true}}};
 assert.deepEqual(coldSettings(observed,expected),expected.values);
 assert.throws(()=>coldSettings({...observed,verified:false},expected));
 assert.throws(()=>coldSettings({...observed,options:{sort:false}},expected));
 assert.throws(()=>coldSettings(observed,{...expected,kind:'guessed-handler'}));
 const importer={source:{path:'owned'},format:{null_marker:'?'},columns:[{name:'Amount',data_kind:'Непрерывный'}]};
 assert.deepEqual(coldSettings(importer,{kind:'text-import-ui-v1',values:structuredClone(importer)}),importer);
 assert.throws(()=>coldSettings({...importer,format:{null_marker:''}},{kind:'text-import-ui-v1',values:importer}));
});
