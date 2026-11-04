import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectColdOutputReads} from '../expected-outputs.mjs';
const source=readFileSync(new URL('../cold-check.mjs',import.meta.url),'utf8');
const start=source.indexOf('  const types=new Set(expectedOutputs.map');
const end=source.indexOf('  if(expected.tree_outputs)',start);
assert.ok(start>0&&end>start);
const run=new Function('f',`return (async()=>{const {expectedOutputs,state,variableInventory,graph,expected,multiple,saved,selectColdOutputReads}=f;
 const observeExportDestinations=()=>{throw Error('Unexpected export');},record=async()=>{};
 ${source.slice(start,end)}
 return reads;})();`);
const fixture=()=>({expectedOutputs:[],state:{variableInventory:{outputs:[{output:{complete:true}}]}},variableInventory:{outputs:[{node:{type:'variables.user'},port:4}]},
 graph:{nodes:[{type:'variables.user',ref:{node_id:'user'},outputs:[]}]},expected:{nodes:[{type:'variables.user'}]},multiple:true,saved:{},selectColdOutputReads});
test('cold variable-only production path completes after its verified typed inventory without asking for a table',async()=>{
 assert.deepEqual(await run(fixture()),[]);
 for(const change of [f=>delete f.state.variableInventory,f=>f.state.variableInventory.outputs=[],f=>f.variableInventory.outputs.push({})]){
  const f=fixture();change(f);await assert.rejects(run(f),/COLD_EXTRA_OR_MISSING_OUTPUT_NODE/);
 }
});
test('mixed and table-only cold retain the strict table selector even when variable inventory exists',async()=>{
 const f=fixture();f.expectedOutputs=[{output_node_type:'transform.calculator'}];f.graph.nodes.push({type:'transform.calculator',ref:{node_id:'table'},outputs:[0]});
 assert.deepEqual((await run(f)).map(r=>r.node.ref.node_id),['table']);
 f.graph.nodes.push({type:'transform.calculator',ref:{node_id:'extra'},outputs:[0]});await assert.rejects(run(f),/COLD_EXTRA_OR_MISSING_OUTPUT_NODE/);
});
