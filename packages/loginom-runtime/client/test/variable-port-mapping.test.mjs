import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {makeVariablePortMappingCode,configureVariablePortMapping} from '../lib/variable-port-mapping.mjs';
const ref={document_id:'doc',workflow_id:'wf',node_id:'node'};
const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const request=()=>({operation_id:'map',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,target:{kind:'existing',type:'transform.calculator',ref},inputs:[],mode:'expression',parameters:{},
 mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:1000,execute_ms:1000,total_ms:5000}});
test('W1 mapping kind has an independent ordinal namespace and table handlers receive only their table mappings',()=>{
 const r=request(),table={direction:'input',port:0},variables={direction:'input',port:0,kind:'variables'},control={direction:'input',port:0,kind:'control'};
 let seen;
 const handlers=new Map([['transform.calculator',{revision:'1',modes:['expression'],configure:()=>{},validate:(_p,_m,request)=>{seen=request.mappings;}}]]);
 r.mappings=[table,variables,control];const before=structuredClone(r);validateNodeApplyRequest(r,handlers);assert.deepEqual(seen,[table]);assert.deepEqual(r,before);
 for(const mapping of [{...variables},{...control,port:1},{...variables,direction:'output'},{...variables,kind:'table'},
  {...variables,fields:[{source:{kind:'configured_field',name:'limit'},excluded:true}]},{...variables,fields:[{source:{schema_id:'s',field_id:'f'}}]}]){
  const invalid=structuredClone(r);invalid.mappings.push(mapping);assert.throws(()=>validateNodeApplyRequest(invalid,handlers));
 }
 r.mappings=[{...variables,changes:[{source:{kind:'configured_field',name:'limit'},name:'renamed'}]}];assert.doesNotThrow(()=>validateNodeApplyRequest(r,handlers));
 r.finish='close';assert.throws(()=>validateNodeApplyRequest(r,handlers));
});
test('mapping writer stops before opening a port on a foreign or locked graph',async()=>{
 const binding={document_id:'doc',workflow_ref:workflow,node:ref},mapping={direction:'input',port:0,kind:'variables'};
 assert.doesNotThrow(()=>makeVariablePortMappingCode(binding,{mapping}));
 for(const graph of [{verified:false},{verified:true,surface:'wizard'},{verified:true,surface:'graph',locked:true}]){
  const r=await configureVariablePortMapping({waitForTimeout:async()=>{}},{binding,mapping,deadline:Date.now()+1},async()=>graph,()=>assert.fail('No port opening'));
  assert.equal(r.status,'NOT_APPLIED');assert.equal(r.cleanup_complete,true);assert.equal(r.effect_possible,false);
 }
});
