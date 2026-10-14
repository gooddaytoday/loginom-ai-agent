import test from 'node:test';import assert from 'node:assert/strict';
import {qualifySavedJournal} from '../grouping-saved-package-qualification.mjs';
import {savedRecordHash} from '../grouping-saved-package-consumer.mjs';
const expected={sessionId:'s',runtimeRevision:'r',manifestSha256:'m',prepareOperationId:'prepare',
 documentId:'doc',account:'own',packagePath:null,loginomBuild:'7.4.2',loginomUrl:'https://own.invalid'};
const entry={session_id:'s',runtime_revision:'r',manifest_sha256:'m',event:'workspace_prepared',recorded_at:'2026-10-10T10:10:11Z',
 state:{operation_id:'prepare',document_id:'doc',package_ref:{path:null},workflow_ref:{workflow_id:'wf',tab_tid:'tab',prefix:'prefix',navigation_path:[]}}};
function run(rows,extra={}){const raw=rows.map(r=>JSON.stringify(r)).join('\n')+'\n';return qualifySavedJournal(raw,{...expected,...extra,journalSha256:savedRecordHash(raw)},{now:Date.parse('2026-10-12T02:00:00Z')});}
test('unsaved prepared-only original shape gives machine-readable unavailable and actual consumer refusal (double)',()=>{
 const r=run([entry]);assert.equal(r.status,'NOT_VERIFIED');assert.equal(r.prepared_workflow.complete_fields_present,true);
 assert.equal(r.selected_save_operation_id,null);assert.equal(r.counts.successful_completed_saves,0);
 assert.equal(r.consumer.correlation,'NOT_VERIFIED');assert.equal(r.mutation_authorized,false);assert.equal(r.release_authorized,false);
 assert.ok(r.missing.some(x=>x.field==='save'&&x.operation_id===null));assert.equal(r.selected_records.workspace[0].sha256,savedRecordHash(JSON.stringify(entry)));
});
test('raw-byte substitution and source loss refuse without invented records',()=>{
 assert.equal(qualifySavedJournal(JSON.stringify(entry),{...expected,journalSha256:'wrong'}).reason,'ORIGINAL_JOURNAL_PIN_MISMATCH');
 const r=run([]);assert.equal(r.prepared_workflow.complete_fields_present,false);assert.equal(r.consumer.correlation,'NOT_VERIFIED');
});
test('foreign CLI identity and altered original revision refuse even after repinning',()=>{
 for(const key of ['session_id','runtime_revision','manifest_sha256'])assert.equal(run([{...entry,[key]:'foreign'}]).reason,'ORIGINAL_JOURNAL_CONTEXT_CHANGED');
});
test('ambiguous preparation is retained as unavailable, never arbitrarily selected',()=>{
 const r=run([entry,entry]);assert.equal(r.selected_records.workspace.length,2);assert.equal(r.recordPins.workspace,undefined);
 assert.ok(r.missing.some(x=>x.field==='workspace'&&x.reason==='AMBIGUOUS_ORIGINAL_RECORD'));
});
test('classic partial workflow stays incomplete',()=>{
 const r=run([{...entry,state:{...entry.state,workflow_ref:{tab_tid:'tab',prefix:'prefix'}}}]);assert.equal(r.prepared_workflow.complete_fields_present,false);
});
test('old recorded_at and arbitrary Guid/clock fields never become native observation authority',()=>{
 for(const clock of ['2026-10-10T10:10:11Z','2099-01-01T00:00:00Z',false]){
  const r=run([{...entry,native_observed_at:clock,native_session_guid:'new-observer',reference_epoch:'claim'}]);
  assert.equal(r.native_binding,'NOT_VERIFIED');assert.equal(r.release_authorized,false);
  assert.ok(r.missing.some(x=>x.reason==='NO_QUALIFIED_V1_NATIVE_BINDING_CONTRACT'));
 }
});
test('malformed JSONL has an explicit receipt',()=>{
 const raw='{broken}\n';assert.equal(qualifySavedJournal(raw,{...expected,journalSha256:savedRecordHash(raw)}).reason,'INVALID_ORIGINAL_JSONL');
});
