import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseExpectedVariableInventory} from '../expected-outputs.mjs';
import {auditUserRealDate} from '../variables-user-real-date.mjs';
const root=new URL('../../../docs/node-development/nodes/variables-user/acceptance/',import.meta.url);
const initial=JSON.parse(readFileSync(new URL('expected-initial-run.json',root))),final=JSON.parse(readFileSync(new URL('expected-updated-run.json',root)));
test('real/date scenario catalog isolates the user task and transaction input with typed cold expectations',()=>{
 const code=`import importlib.util
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py'); s=importlib.util.spec_from_file_location('r',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
c=m.scenario('variables-user-real-date'); e=m.expected_for(c,'/own/test.lgp')
assert c['variables_real_date'] and c['input_files']==['transactions.csv']
assert c['prompt'].name=='task-real-datetime.md' and c['export_count']==2
assert (c['source']/'oracle.py').is_file() and len(e['outputs'])==2
assert e['package_path']=='/own/test.lgp'
assert [len(o['rows']) for o in e['outputs']]==[3,3]
assert e['variable_inventory']['outputs'][0]['variables'][1]['type']=='datetime'
checks=Path('scripts/node-acceptance/required-checks.py').read_text()
assert 'variables-user-real-date' in checks
`;
 const r=spawnSync('python3',['-B','-c',code],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
test('stock typed variable cold oracle admits datetime including NULL and keeps invalid values refused',()=>{
 assert.equal(parseExpectedVariableInventory(final).outputs[0].variables[1].type,'datetime');
 for(const value of ['',false,3,'2026-11-01','2026-11-01T00:00:00Z']){
  const bad=structuredClone(final);bad.variable_inventory.outputs[0].variables[1].value=value;assert.throws(()=>parseExpectedVariableInventory(bad));
 }
});
function history(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'user'};
 const cell=(c,value)=>({type:c.type,is_null:value===null,value:value!==null&&c.type==='integer'?String(value):value,...(c.type==='datetime'&&value!==null?{representation:'local_datetime',timezone:'unspecified'}:{}),precision:value===null?'exact_null':c.type==='real'?'17_significant_digits':c.type==='integer'?'exact_integer':c.type==='datetime'?'millisecond':'source_text'});
 const snapshot=(id,want)=>({phase:'node_checkpoint',result:{operation_id:id,status:'SUCCEEDED',cleanup_complete:true,node,output:{variable_ports:[{kind:'variables',port:4,complete:true,fresh:true,source:'snapshot',native_source:'VariablesEditValuesWizard',package_modified:false,execution_id:null,read_id:id,count:8,completeness:{loaded:true,count:8,store_count:8,unique_ids:8},variables:want.variable_inventory.outputs[0].variables.map((v,index)=>({...v,id:index,index,label:v.name,cell:cell(v,v.value)}))}]}}});
 const tables=(want,suffix)=>want.outputs.map((o,i)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node:{...node,node_id:'filter'+i},execution:{status:'completed',execution_id:suffix+i},output:{ports:[{port:0,fresh:true,execution_id:suffix+i,row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},schema:o.columns.map(c=>({...c,label:c.name})),sample:o.rows.map(r=>o.columns.map(c=>cell(c,r[c.name])))}]}}}));
 return [snapshot('first',initial),...tables(initial,'first'),{phase:'node_apply_prepared',operation_id:'patch',request:{target:{kind:'existing',type:'variables.user',ref:node},mode:'values',finish:'done',parameters:{variables:final.variable_inventory.outputs[0].variables.slice(0,2)}}},
  {phase:'node_checkpoint',result:{operation_id:'patch',status:'SUCCEEDED',cleanup_complete:true,configuration:{readback:{values_are:'independent_owned_user_variables'}}}},snapshot('last',final),...tables(final,'last')];
}
test('both business phases use stock typed matching and retain the same variables and consumers',()=>{
 assert.equal(auditUserRealDate(history(),initial,final).status,'PASS');
 for(const change of [e=>e.shift(),e=>e[3].request.parameters.variables.pop(),e=>e[5].result.output.variable_ports[0].variables[1].label='changed',
  e=>e[6].result.node.node_id='replacement',e=>e[7].result.output.ports[0].sample[0][2].value=0.15,e=>e[4].result.configuration.readback={},
  e=>e.push({phase:'node_apply_prepared',request:{target:{type:'transform.calculator',kind:'existing'},parameters:{expressions:[{}]},inputs:[],mappings:[]}})]){
  const events=history();change(events);assert.throws(()=>auditUserRealDate(events,initial,final));
 }
});
test('observed Calculator expressions empty reexecution preserves consumers, while edits still refuse',()=>{
 const events=history();events.push({phase:'node_apply_prepared',request:{target:{type:'transform.calculator',kind:'existing'},parameters:{expressions:[]},inputs:[],mappings:[]}});
 assert.equal(auditUserRealDate(events,initial,final).status,'PASS');
 for(const parameters of [{expressions:[{}]},{expressions:[],order:['changed']},{expressions:[],extra:true}]){
  const bad=structuredClone(events);bad.at(-1).request.parameters=parameters;assert.throws(()=>auditUserRealDate(bad,initial,final));
 }
});
for(const type of ['transform.calculator','transform.filter_data'])
test(type+' edits between initial business results and the variable patch refuse',()=>{
 const events=history();events.splice(3,0,{phase:'node_apply_prepared',operation_id:'consumer-edit',request:{
  target:{type,kind:'existing'},mode:'configure',parameters:type==='transform.calculator'?{expressions:[{name:'flag',expression:'false'}]}:{conditions:[{field:'Share',operator:'greater',value:0.3}]},inputs:[],mappings:[]}});
 assert.throws(()=>auditUserRealDate(events,initial,final),/USER_REAL_DATE_CONSUMER_RECONFIGURED/);
});
test('initial consumer configuration before the initial business results is allowed',()=>{
 const events=history();events.splice(1,0,{phase:'node_apply_prepared',operation_id:'initial-consumer',request:{
  target:{type:'transform.calculator',kind:'new'},mode:'configure',parameters:{expressions:[{name:'flag',expression:'Share > threshold'}]},inputs:[],mappings:[]}});
 assert.equal(auditUserRealDate(events,initial,final).status,'PASS');
});
function appendConsumerRead(events,id,index){
 const result=structuredClone(events[index].result);
 result.operation_id=id;result.configuration={status:'not_requested'};
 const prepared={phase:'node_apply_prepared',operation_id:id,request:{
  target:{type:'transform.filter_data',kind:'existing',ref:structuredClone(result.node)},
  mode:'read_existing_output',finish:'execute',parameters:{source_operation_id:index===6?'day':'above',schemas:[{port:0,schema:structuredClone(result.output.ports[0].schema)}]},inputs:[],mappings:[]}};
 const checkpoint={phase:'node_checkpoint',result};events.push(prepared,checkpoint);
 return {prepared,checkpoint};
}
test('R3 day-final and above-final reads with confirmed not_requested configuration preserve consumers',()=>{
 const events=history();appendConsumerRead(events,'day-final',6);appendConsumerRead(events,'above-final',7);
 assert.equal(auditUserRealDate(events,initial,final).status,'PASS');
});
test('confirmed consumer reads between initial business results and the variable patch are allowed',()=>{
 const events=history();appendConsumerRead(events,'day-before-patch',1);appendConsumerRead(events,'above-before-patch',2);
 events.splice(3,0,...events.splice(-4));
 assert.equal(auditUserRealDate(events,initial,final).status,'PASS');
});
test('real consumer reconfiguration still refuses, including a read mode with changed configuration',()=>{
 for(const mode of ['configure','read_existing_output']){
  const events=history(),{prepared,checkpoint}=appendConsumerRead(events,'day-final',6);
  prepared.request.mode=mode;prepared.request.parameters={conditions:[{field:'Share',operator:'greater',value:0.3}]};
  checkpoint.result.configuration={status:'SUCCEEDED'};
  assert.throws(()=>auditUserRealDate(events,initial,final),/USER_REAL_DATE_CONSUMER_RECONFIGURED/);
 }
});
test('consumer read exemption requires its own successful later checkpoint and unchanged connections',()=>{
 for(const corrupt of [(_p,c)=>c.result.operation_id='other',(_p,c)=>c.result.node.node_id='other',
  (_p,c)=>c.result.status='FAILED',(_p,c)=>c.result.cleanup_complete=false,(_p,c)=>delete c.result.configuration,
  p=>p.request.inputs.push({source:'other'}),p=>p.request.mappings.push({port:0}),
  (_p,_c,e)=>e.pop(),(_p,_c,e)=>e.splice(e.length-2,0,e.pop())]){
  const events=history(),{prepared,checkpoint}=appendConsumerRead(events,'day-final',6);corrupt(prepared,checkpoint,events);
  assert.throws(()=>auditUserRealDate(events,initial,final),/USER_REAL_DATE_CONSUMER_RECONFIGURED/);
 }
});
test('independent creation readback proves initial values without requiring a redundant public snapshot',()=>{
 const events=history(),first=events[0].result,variables=first.output.variable_ports[0].variables;
 first.output={ports:[]};first.configuration={readback:{kind:'user_variables',mode:'values',scope:'observed_after_verified_finish',values_are:'independent_owned_user_variables',variables,receipt_ids:['first:configure']}};
 assert.equal(auditUserRealDate(events,initial,final).status,'PASS');
 for(const corrupt of [r=>r.values_are='draft',r=>r.variables[1].cell.value='2026-10-30T00:00:00.000',r=>r.variables[1].cell.precision='unverified',r=>r.variables[1].id=0]){
  const bad=structuredClone(events);corrupt(bad[0].result.configuration.readback);assert.throws(()=>auditUserRealDate(bad,initial,final));
 }
});
test('read-only builtin requests between initial readback and the patch are not value patches',()=>{
 const events=history();events.splice(1,0,{phase:'node_apply_prepared',request:{target:{type:'variables.user'},mode:'read',finish:'done',parameters:{source_operation_id:'first'}}});
 assert.equal(auditUserRealDate(events,initial,final).status,'PASS');
});
test('a verified reopen of the same saved package permits a new workflow ID while retaining native identities',()=>{
 const events=history();events.splice(5,0,{phase:'completed',action_key:'package.save_as',outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{reopened:true,package_ref:{path:final.package_path}}}});
 events[6].result.node={...events[6].result.node,workflow_id:'wf-reopened'};
 assert.equal(auditUserRealDate(events,initial,final).status,'PASS');
 for(const corrupt of [e=>e.splice(5,1),e=>e[5].outcome.output.package_ref.path='/other.lgp',e=>e[5].outcome.output.reopened=false,
  e=>e[6].result.node.document_id='foreign',e=>e[6].result.node.node_id='foreign']){
  const bad=structuredClone(events);corrupt(bad);assert.throws(()=>auditUserRealDate(bad,initial,final));
 }
});
