import test from 'node:test';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NODE_TYPES} from '../../../packages/loginom-runtime/client/lib/node-contracts.mjs';
import {parseExpectedOutputs,parseExpectedVariableInventory,matchVariableInventoryLinks} from '../expected-outputs.mjs';
const fixture=()=>{
 const expected=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-vartodata/acceptance/expected.json',import.meta.url),'utf8'));
 expected.variable_inventory.outputs=[];
 expected.package_path='/own/variables.lgp';
 return expected;
};
test('VarToData keeps its full typed table oracle while auditing only its actual variable source link',()=>{
 const expected=fixture(),inventory=parseExpectedVariableInventory(expected);
 assert.deepEqual(inventory.outputs,[]);assert.equal(inventory.links.length,1);
 const parsed=parseExpectedOutputs(expected);assert.equal(parsed.outputs[0].columns.length,8);assert.equal(parsed.outputs[0].rows.length,1);
 for(const change of [e=>e.outputs=[],e=>e.variable_inventory.links=[],e=>e.variable_inventory.links[0].target.type='transform.sorting',e=>e.variable_inventory.links[0].kind='control']){
  const bad=fixture();change(bad);assert.throws(()=>{parseExpectedVariableInventory(bad);parseExpectedOutputs(bad);});
 }
});
const graph=()=>({nodes:[{ref:{node_id:'source'},type:NODE_TYPES['variables.calculator'].type},{ref:{node_id:'target'},type:'variables.to_table'}],variable_links:[{source:'source',output:0,target:'target',input:0,kind:'variables',source_port_guid:'source-guid',target_port_guid:'target-guid'}]});
test('link-only VarToData inventory still requires exact typed native endpoints and GUID evidence',()=>{
 const want=parseExpectedVariableInventory(fixture());assert.equal(matchVariableInventoryLinks(graph(),want).length,1);
 for(const change of [g=>g.nodes[0].type=NODE_TYPES['variables.calculator'].icon_class,g=>g.variable_links=[],g=>g.variable_links[0].kind='control',g=>g.variable_links[0].input=1,g=>delete g.variable_links[0].source_port_guid,g=>g.nodes.push({...g.nodes[1]})]){
  const bad=graph();change(bad);assert.throws(()=>matchVariableInventoryLinks(bad,want));
 }
});
const source=readFileSync(new URL('../cold-check.mjs',import.meta.url),'utf8'),start=source.indexOf('  if(variableInventory?.outputs.length===0){'),end=source.indexOf('  // Независимый reader',start);
assert.ok(start>0&&end>start);
const audit=new Function('f',`return (async()=>{const {variableInventory,adapter,prepared,state,matchVariableInventoryLinks,record}=f;${source.slice(start,end)}})();`);
test('production cold rechecks the same native link after the full table read and refuses changed GUIDs',async()=>{
 for(const fault of [null,'guid','edge','return']){
  const original=graph(),current=graph(),inventory=parseExpectedVariableInventory(fixture()),events=[];
  if(fault==='guid')current.variable_links[0].target_port_guid='changed';
  if(fault==='edge')current.variable_links=[];
  const f={variableInventory:inventory,prepared:{document_id:'doc',workflow_ref:{workflow_id:'wf'}},state:{variableInventory:{links:original.variable_links}},matchVariableInventoryLinks,
   adapter:{activateWorkflow:async()=>({status:fault==='return'?'NOT_APPLIED':'SUCCEEDED',verified:true,cleanup_complete:true}),observe:async()=>current},record:async e=>events.push(e)};
  if(fault)await assert.rejects(audit(f));else {await audit(f);assert.equal(events[0].phase,'cold_variable_links_after_table');assert.deepEqual(events[0].links,original.variable_links);}
 }
});

test('rows scenario privately delivers the authored package and retains the exact typed cold oracle',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util,json
s=importlib.util.spec_from_file_location('runner','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('variables-rows');print(json.dumps({k:str(c[k]) for k in ['prompt','expected_name','source_package']}))`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const spec=JSON.parse(r.stdout);
 assert.ok(spec.prompt.endsWith('task-rows.md'));assert.equal(spec.expected_name,'expected-rows.json');assert.ok(spec.source_package.endsWith('fixtures/source.lgp'));
 const e=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/variables-vartodata/acceptance/expected-rows.json',import.meta.url)));
 e.package_path='/own/rows.lgp';assert.equal(parseExpectedOutputs(e).outputs[0].rows.length,8);
 assert.equal(parseExpectedVariableInventory(e).links.length,1);
});
