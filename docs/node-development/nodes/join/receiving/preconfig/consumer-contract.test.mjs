import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {assertPreconfigSample,checkReadAdapter,contractPins as pins} from './consumer-contract.mjs';
const now=Date.now();
// Data only. Never supplied to a native Page, private Map or ready context.
function fixture(){
 const owner={owner:id(),run:id(),generation:1,chat:id(),session_id:id(),document_id:id(),workflow_id:id(),account:'synthetic-'+id(),tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',loginom_build:'7.4.2'};
 owner.lease=owner.owner+':'+owner.run;owner.package_path='/'+owner.account+'/'+pins.package.name;
 const workflow={workflow_id:owner.workflow_id,tab_tid:owner.tab_tid,prefix:'MF;TF',navigation_path:[{tid:'synthetic-root',label:'synthetic'}]};
 const prepared={status:'READY',authenticated:true,created_draft:false,target:{loginom_build:'7.4.2'},target_verified:true,document_id:owner.document_id,loginom_account:owner.account,workflow_ref:workflow,package_ref:{path:owner.package_path}};
 const s={classification:'SYNTHETIC_DRIVER',scope:'existing_left_source_only',sample_id:id(),owner_before:structuredClone(owner),owner_after:owner,original_deadline:now+60000,prepare_at:now-2,read_at:now-1,settled:true,pending:false,unknown_effect:false,observation_only:true,effect_possible:false,dispatch:Object.fromEntries(['configure','apply','finish','execute','activate','create','save'].map(k=>[k,0])),prepare_response:{content:[{type:'text',text:JSON.stringify(prepared)}]}};
 s.imports=pins.imports.map(p=>{
  const ref={document_id:owner.document_id,workflow_id:owner.workflow_id,node_id:p.node_guid},operation=id(),destination='/'+owner.account+'/'+id()+'.csv';
  return {role:p.role,owner:structuredClone(owner),sample_id:s.sample_id,node_ref:ref,component:'imports.text',output0:{status:'observed_native_binding',complete_inventory:true,node_ref:structuredClone(ref),port:0,port_guid:id(),eligible_count:1},readback:{scope:'pre_configuration',settings_applied:false,complete:true,source:{...p.settings.source,source_path:destination},format:p.settings.format,columns:p.settings.columns.map((f,index)=>({index,...f})),canonical_types_verified:true,native_enum_binding_verified:true},delivery:{status:'SUCCEEDED',cleanup_complete:true,verified:true,current_owner:true,owner:structuredClone(owner),artifact_id:id(),operation_id:operation,verification_id:id(),destination,bytes:p.csv.bytes,sha256:p.csv.sha256,lineage:{complete:true,records:[{sequence:1,operation_id:operation,destination,verified:true,uncertain:false,bytes:p.csv.bytes,sha256:p.csv.sha256}]}},activity:{status:'observed_same_node',active:false,node_ref:structuredClone(ref),sample_id:s.sample_id},freshness:{status:'observed_current_read',execution_verified:false,owner:structuredClone(owner),read_at:s.read_at,sample_id:s.sample_id}};
 });return structuredClone(s);
}
const set=(s,path,value)=>{const ks=path.split('.'),last=ks.pop();let o=s;for(const k of ks)o=o[k];o[last]=value;};
const changes={
 'missing prepare':['prepare_response',null], 'missing owner':['owner_before',null],
 'foreign node document':['imports.0.node_ref.document_id',id()], 'foreign workflow':['imports.0.node_ref.workflow_id',id()],
 'foreign GUID':['imports.0.node_ref.node_id',id()], 'incomplete identity':['imports.0.node_ref',null],
 'foreign sibling sample':['imports.1.sample_id',id()], 'expired deadline':['original_deadline',now-1],
 'stale read':['read_at',now-10000], 'future read':['read_at',now+1],
 'unsettled':['settled',false], 'pending':['pending',true], 'unknown effect':['unknown_effect',true],
 'wrong component':['imports.0.component','transform.join_data'], 'missing output0':['imports.0.output0',null],
 'wrong output':['imports.0.output0.port',1], 'foreign output':['imports.0.output0.node_ref.node_id',id()],
 'duplicate output':['imports.0.output0.eligible_count',2], 'incomplete output':['imports.0.output0.complete_inventory',false],
 'incomplete readback':['imports.0.readback.complete',false], 'applied readback':['imports.0.readback.settings_applied',true],
 'missing delivery':['imports.0.delivery',null], 'historical delivery':['imports.0.delivery.current_owner',false],
 'foreign delivery':['imports.0.delivery.owner.account','foreign'], 'same digest old path':['imports.0.readback.source.source_path',pins.imports[0].retained_path],
 'same digest other path':['imports.0.delivery.destination','/foreign/same.csv'],
 'incomplete lineage':['imports.0.delivery.lineage.complete',false], 'selected upload absent':['imports.0.delivery.operation_id',id()],
 'uncertain write':['imports.0.delivery.lineage.records.0.uncertain',true], 'same digest wrong bytes':['imports.0.delivery.bytes',78],
 'unknown canonical type':['imports.0.readback.canonical_types_verified',false], 'missing native enum association':['imports.0.readback.native_enum_binding_verified',false],
 'wrong delimiter':['imports.0.readback.format.delimiter',','], 'wrong type':['imports.0.readback.columns.1.type','real'],
 'wrong kind':['imports.0.readback.columns.1.data_kind','Непрерывный'],
 'unknown activity':['imports.0.activity.status','unknown'], 'foreign activity':['imports.0.activity.node_ref.node_id',id()],
 'stale activity':['imports.0.activity.sample_id',id()], 'unknown freshness':['imports.0.freshness.status','unknown'],
 'cached execution':['imports.0.freshness.execution_verified',true], 'foreign process owner':['imports.0.freshness.owner.session_id',id()],
 'stale freshness':['imports.0.freshness.read_at',now-100],
};
for(const [name,[path,value]] of Object.entries(changes))test('refuse '+name,()=>{const s=fixture();set(s,path,value);assert.throws(()=>assertPreconfigSample(s,{now}));assert.ok(Object.values(s.dispatch).every(n=>n===0));});
const special={
 'duplicate port GUID across Imports':s=>s.imports[1].output0.port_guid=s.imports[0].output0.port_guid,
 'duplicate artifact across Imports':s=>s.imports[1].delivery.artifact_id=s.imports[0].delivery.artifact_id,
 'duplicate Import':s=>s.imports[1]=structuredClone(s.imports[0]),
 'missing Details':s=>s.imports.pop(), 'reverse Import order':s=>s.imports.reverse(),
 'owner drift':s=>s.owner_after.generation++,
 'duplicate write':s=>s.imports[0].delivery.lineage.records.push({...s.imports[0].delivery.lineage.records[0]}),
 'late uncertain write':s=>s.imports[0].delivery.lineage.records.push({...s.imports[0].delivery.lineage.records[0],sequence:2,operation_id:id(),uncertain:true}),
 'unordered columns':s=>s.imports[0].readback.columns.reverse(),
 'duplicate column':s=>s.imports[0].readback.columns[1]=structuredClone(s.imports[0].readback.columns[0]),
 'missing column':s=>s.imports[0].readback.columns.pop(),
 'unknown partial reader':s=>s.imports[0].readback={scope:'pre_configuration',settings_applied:false,complete:false,canonical_types_verified:false},
};
for(const [name,change] of Object.entries(special))test('refuse '+name,()=>{const s=fixture();change(s);assert.throws(()=>assertPreconfigSample(s,{now}));assert.ok(Object.values(s.dispatch).every(n=>n===0));});
for(const [name,change] of Object.entries({failed:p=>p.status='NOT_READY',newdraft:p=>p.created_draft=true,foreign_document:p=>p.document_id=id(),foreign_workflow:p=>p.workflow_ref.workflow_id=id(),foreign_package:p=>p.package_ref.path='/foreign/'+pins.package.name}))test('refuse prepare '+name,()=>{const s=fixture(),p=JSON.parse(s.prepare_response.content[0].text);change(p);s.prepare_response.content[0].text=JSON.stringify(p);assert.throws(()=>assertPreconfigSample(s,{now}));});
for(const route of ['configure','apply','finish','execute','activate','create','save'])test('detect forbidden '+route+' dispatch',()=>{const s=fixture();s.dispatch[route]=1;assert.throws(()=>assertPreconfigSample(s,{now}),new RegExp('DISPATCH_'+route));});
test('synthetic compatible trace never mints authority',async()=>{const s=fixture(),before=JSON.stringify(s);let reads=0;const r=await checkReadAdapter({source_sha:'45d37e1f99b2cbe3f9184398f285cbb456ba3700',path_kind:'synthetic',readPreconfigSample:async()=>{reads++;return s;}},{now});assert.equal(reads,1);assert.equal(JSON.stringify(s),before);assert.deepEqual(r,{status:'SYNTHETIC_CONTRACT_COMPATIBLE',complete:false,configure_authority:false,close_authority:false,effect_possible:false,native_proof:false,dispatch_count:0});});
test('historical pins cannot supply current owner',()=>assert.throws(()=>assertPreconfigSample(pins,{now}),/TRACE_CLASSIFICATION/));
test('missing closed adapter refused without dispatch',async()=>assert.rejects(checkReadAdapter({},{now}),/MISSING_CLOSED_PRECONFIG_ADAPTER/));
test('synthetic cannot be relabelled source',async()=>assert.rejects(checkReadAdapter({source_sha:'45d37e1f99b2cbe3f9184398f285cbb456ba3700',path_kind:'source',readPreconfigSample:async()=>fixture()},{now}),/ADAPTER_CLASSIFICATION/));

for(const position of ['prefix','suffix'])test('refuse '+position+' write missing operation_id',()=>{
 const s=fixture(),d=s.imports[0].delivery,w={...d.lineage.records[0],sequence:position==='prefix'?0:2};
 delete w.operation_id;if(position==='prefix')d.lineage.records.unshift(w);else d.lineage.records.push(w);
 assert.throws(()=>assertPreconfigSample(s,{now}),/WRITE_OPERATION_ID/);assert.ok(Object.values(s.dispatch).every(n=>n===0));
});
for(const [name,value] of [['empty',''],['null',null],['number',7]])test('refuse write '+name+' operation_id',()=>{
 const s=fixture(),d=s.imports[1].delivery;d.lineage.records.push({...d.lineage.records[0],sequence:2,operation_id:value});
 assert.throws(()=>assertPreconfigSample(s,{now}),/WRITE_OPERATION_ID/);assert.ok(Object.values(s.dispatch).every(n=>n===0));
});
test('refuse inherited write operation_id',()=>{
 const s=fixture(),d=s.imports[0].delivery,w={...d.lineage.records[0],sequence:2};delete w.operation_id;Object.setPrototypeOf(w,{operation_id:id()});d.lineage.records.push(w);
 assert.throws(()=>assertPreconfigSample(s,{now}),/WRITE_OPERATION_ID/);
});
test('correct prefix and suffix verified writes preserve non-authoritative compatibility',()=>{
 const s=fixture();for(const item of s.imports){const d=item.delivery;d.lineage.records.unshift({...d.lineage.records[0],sequence:0,operation_id:id()});d.lineage.records.push({...d.lineage.records[1],sequence:2,operation_id:id()});}
 const result=assertPreconfigSample(s,{now});assert.equal(result.status,'SYNTHETIC_CONTRACT_COMPATIBLE');
 assert.equal(result.configure_authority,false);assert.equal(result.close_authority,false);assert.equal(result.native_proof,false);assert.equal(result.dispatch_count,0);
});
