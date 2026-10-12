import test from 'node:test';import assert from 'node:assert/strict';
import {consumeSavedPackageRecords,savedRecordHash} from '../grouping-saved-package-consumer.mjs';

// Contract-shaped journal doubles, not native receipts. No positive native PASS.
function fixture(modified=false,action='package.save_checkpoint'){
 const now=Date.parse('2026-10-12T02:00:00.000Z');
 const workflowRef={tab_tid:'tab',prefix:'prefix',workflow_id:'workflow',navigation_path:[]};
 const expected={sessionId:'cli-session',documentId:'prepared-document',account:'own',packagePath:'/own/grouping.lgp',
  loginomUrl:'https://own.invalid/app/',loginomBuild:'7.4.2',prepareOperationId:'prepare',saveOperationId:'save',
  runtimeRevision:'a'.repeat(64),manifestSha256:'b'.repeat(64),workflowRef};
 const meta={session_id:expected.sessionId,runtime_revision:expected.runtimeRevision,manifest_sha256:expected.manifestSha256,target:{loginom_build:'7.4.2'}};
 const prepared={status:'READY',target:{loginom_build:'7.4.2'},authenticated:true,created_draft:false,operation_id:'prepare',
  session_id:expected.sessionId,document_id:expected.documentId,loginom_account:'own',workflow_ref:workflowRef,
  ownership_verified:true,target_verified:true,package_ref:{path:'/own/grouping.lgp'}};
 const state={version:1,session_id:expected.sessionId,document_id:expected.documentId,account:'own',package_path:expected.packagePath,
  modified,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
 const records={workspace:{...meta,recorded_at:new Date(now-4000).toISOString(),event:'workspace_prepared',state:prepared},
  request:{...meta,recorded_at:new Date(now-3000).toISOString(),phase:'prepared',operation_id:'save',action_key:action,checkpoint:{workflow_ref:workflowRef},parameters:{path:expected.packagePath,conflict_policy:'replace'}},
  save:{...meta,recorded_at:new Date(now-2000).toISOString(),phase:'completed',operation_id:'save',action_key:action,checkpoint:{workflow_ref:workflowRef},parameters:{path:expected.packagePath,conflict_policy:'replace'},
   outcome:{status:'SUCCEEDED',operation_id:'save',action_key:action,phase:'completed',cleanup_complete:true,error:null,output:{package_ref:{path:expected.packagePath}}}},
  dirty:{...meta,recorded_at:new Date(now-1000).toISOString(),phase:'saved_package_state_observed',operation_id:'save',state}};
 const pin=()=>{const raw=Object.fromEntries(Object.entries(records).map(([k,v])=>[k,JSON.stringify(v)]));expected.recordPins=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,savedRecordHash(v)]));return raw;};
 return {now,expected,records,pin};
}
for(const action of ['package.save_as','package.save_checkpoint'])for(const modified of [false,true])test(`correlates ${action}/dirty=${modified} only; native remains NOT_VERIFIED (double)`,()=>{
 const f=fixture(modified,action),r=consumeSavedPackageRecords(f.pin(),f.expected,{now:f.now});
 assert.equal(r.correlation,'VERIFIED');assert.equal(r.status,'NOT_VERIFIED');assert.equal(r.reported_modified,modified);
 assert.equal(r.native_binding,'NOT_VERIFIED');assert.equal(r.native_observed_at,null);assert.equal(r.native_session_guid,null);
 assert.equal(r.persisted_content_verified,false);assert.equal(r.mutation_authorized,false);assert.equal(r.release_authorized,false);
});
const faults={
 request_workflow:f=>f.records.request.checkpoint.workflow_ref={...f.expected.workflowRef,workflow_id:'foreign'},
 completed_workflow:f=>f.records.save.checkpoint.workflow_ref={...f.expected.workflowRef,tab_tid:'foreign'},
 missing_checkpoint:f=>delete f.records.request.checkpoint,
 session:f=>f.records.dirty.session_id='foreign',revision:f=>f.records.save.runtime_revision='foreign',manifest:f=>f.records.request.manifest_sha256='foreign',
 build:f=>f.records.workspace.target.loginom_build='other',account:f=>f.records.workspace.state.loginom_account='foreign',
 document:f=>f.records.workspace.state.document_id='foreign',workflow:f=>f.records.workspace.state.workflow_ref={...f.expected.workflowRef,workflow_id:'foreign'},
 tab:f=>f.records.workspace.state.workflow_ref={...f.expected.workflowRef,tab_tid:'foreign'},
 ownership:f=>f.records.workspace.state.ownership_verified=false,prepare:f=>f.records.workspace.state.operation_id='other',
 not_ready:f=>f.records.workspace.state.status='NOT_READY',save_id:f=>f.records.save.operation_id='other',dirty_id:f=>f.records.dirty.operation_id='other',
 request_path:f=>f.records.request.parameters.path='/foreign/grouping.lgp',parameters:f=>f.records.save.parameters.conflict_policy='reject',
 action:f=>f.records.save.action_key='node.add',ambiguous:f=>f.records.save.outcome.status='AMBIGUOUS',
 pending:f=>f.records.save.outcome.phase='observing',cleanup:f=>f.records.save.outcome.cleanup_complete=false,
 error:f=>f.records.save.outcome.error={message:'primary'},outcome_id:f=>f.records.save.outcome.operation_id='other',
 outcome_action:f=>f.records.save.outcome.action_key='node.add',outcome_path:f=>f.records.save.outcome.output.package_ref.path='/foreign/grouping.lgp',
 state_session:f=>f.records.dirty.state.session_id='foreign',state_document:f=>f.records.dirty.state.document_id='foreign',
 state_account:f=>f.records.dirty.state.account='foreign',state_path:f=>f.records.dirty.state.package_path='/foreign/grouping.lgp',
 modified_type:f=>f.records.dirty.state.modified=0,read_mutation:f=>f.records.dirty.state.read_only=false,persistence_promotion:f=>f.records.dirty.state.persisted_content_verified=true,
 observation:f=>f.records.dirty.state.observation='before_save',old:f=>{for(const r of Object.values(f.records))r.recorded_at=new Date(Date.parse(r.recorded_at)-20000).toISOString();},
 future:f=>f.records.dirty.recorded_at=new Date(f.now+1).toISOString(),order:f=>f.records.dirty.recorded_at=f.records.request.recorded_at,
 event:f=>f.records.workspace.event='other',phase:f=>f.records.dirty.phase='verification_delivered'
};
for(const [name,mutate]of Object.entries(faults))test(`refuses semantic ${name} even with matching caller record pins`,()=>{
 const f=fixture();mutate(f);const r=consumeSavedPackageRecords(f.pin(),f.expected,{now:f.now});
 assert.equal(r.correlation,'NOT_VERIFIED');assert.equal(r.mutation_authorized,false);assert.equal(r.release_authorized,false);
});
test('pins refuse substitution of original bytes, omitted records and duplicate JSONL',()=>{
 for(const name of ['workspace','request','save','dirty']){
  const f=fixture(),raw=f.pin();raw[name]+=' ';
  assert.equal(consumeSavedPackageRecords(raw,f.expected,{now:f.now}).reason,'ORIGINAL_RECORD_PIN_'+name);
  delete raw[name];assert.equal(consumeSavedPackageRecords(raw,f.expected,{now:f.now}).correlation,'NOT_VERIFIED');
 }
 const f=fixture(),raw=f.pin();raw.save+='\n'+raw.save;f.expected.recordPins.save=savedRecordHash(raw.save);
 assert.equal(consumeSavedPackageRecords(raw,f.expected,{now:f.now}).correlation,'NOT_VERIFIED');
});
test('missing pins, invalid clock and malformed caller options refuse',()=>{
 const f=fixture(),raw=f.pin();
 for(const expected of [{...f.expected,recordPins:{}},{...f.expected,documentId:''},{...f.expected,packagePath:'/own/../foreign.lgp'},{...f.expected,saveOperationId:''}])
  assert.equal(consumeSavedPackageRecords(raw,expected,{now:f.now}).correlation,'NOT_VERIFIED');
 for(const options of [{now:NaN},{now:f.now,maxJournalAgeMs:-1},{now:f.now,maxJournalAgeMs:0.5}])
  assert.equal(consumeSavedPackageRecords(raw,f.expected,options).correlation,'NOT_VERIFIED');
});
