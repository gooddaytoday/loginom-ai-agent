import {consumeSavedPackageRecords,savedRecordHash} from './grouping-saved-package-consumer.mjs';

// Read-only qualification of caller-selected ORIGINAL journal bytes. This never
// supplies absent IDs, fields or authority from a newer observer or a fixture.
export function qualifySavedJournal(raw,expected,{now}={}) {
 const base={version:1,status:'NOT_VERIFIED',native_binding:'NOT_VERIFIED',
  mutation_authorized:false,release_authorized:false,persisted_content_verified:false};
 const fail=reason=>({...base,reason});
 if(typeof raw!=='string'||savedRecordHash(raw)!==expected.journalSha256)return fail('ORIGINAL_JOURNAL_PIN_MISMATCH');
 let rows;try{rows=raw.split('\n').map((s,i)=>({line:i+1,raw:s})).filter(r=>r.raw.trim())
  .map(r=>({...r,value:JSON.parse(r.raw),sha256:savedRecordHash(r.raw)}));}
 catch{return fail('INVALID_ORIGINAL_JSONL');}
 const proof=r=>({line:r.line,sha256:r.sha256,operation_id:r.value.operation_id??r.value.state?.operation_id??null,
  event:r.value.event??null,phase:r.value.phase??null,recorded_at:r.value.recorded_at??null});
 if(rows.some(r=>r.value.session_id!==expected.sessionId||r.value.runtime_revision!==expected.runtimeRevision
  ||r.value.manifest_sha256!==expected.manifestSha256))return fail('ORIGINAL_JOURNAL_CONTEXT_CHANGED');
 const prepared=rows.filter(r=>r.value.event==='workspace_prepared'&&r.value.state?.operation_id===expected.prepareOperationId);
 const saves=rows.filter(r=>r.value.phase==='completed'&&['package.save_as','package.save_checkpoint'].includes(r.value.action_key)
  &&r.value.outcome?.status==='SUCCEEDED');
 const selected=saves.filter(r=>r.value.operation_id===expected.saveOperationId);
 const requests=rows.filter(r=>r.value.phase==='prepared'&&r.value.operation_id===expected.saveOperationId
  &&['package.save_as','package.save_checkpoint'].includes(r.value.action_key));
 const states=rows.filter(r=>r.value.phase==='saved_package_state_observed'&&r.value.operation_id===expected.saveOperationId);
 const chosen={workspace:prepared,request:requests,save:selected,dirty:states},rawRecords={},recordPins={};
 for(const [key,rs]of Object.entries(chosen))if(rs.length===1){rawRecords[key]=rs[0].raw;recordPins[key]=rs[0].sha256;}
 const consumer=consumeSavedPackageRecords(rawRecords,{...expected,recordPins},{now});
 const missing=[];
 for(const [key,rs]of Object.entries(chosen))if(rs.length!==1)missing.push({field:key,reason:rs.length?'AMBIGUOUS_ORIGINAL_RECORD':'NO_ORIGINAL_RECORD',
  operation_id:key==='workspace'?expected.prepareOperationId:expected.saveOperationId??null});
 const p=prepared.length===1?prepared[0]:null,workflow=p?.value.state?.workflow_ref;
 const full=!!workflow&&typeof workflow.workflow_id==='string'&&typeof workflow.tab_tid==='string'
  &&typeof workflow.prefix==='string'&&Array.isArray(workflow.navigation_path);
 if(!full)missing.push({field:'workspace.state.workflow_ref',reason:'NO_COMPLETE_PREPARED_WORKFLOW'});
 for(const r of selected)for(const field of ['workflow_id','navigation_path'])if(!Object.hasOwn(r.value.checkpoint?.workflow_ref??{},field))
  missing.push({field:'save.checkpoint.workflow_ref.'+field,reason:'NOT_EMITTED_IN_SELECTED_RECORD',source:proof(r)});
 // Actual v1 producer returns only session/document/account/path/modified plus
 // read-only flags. Presence of arbitrary extra clock/Guid fields is not proof.
 missing.push({field:'dirty.state.native_session_guid/reference_epoch/native_observed_at',
  reason:'NO_QUALIFIED_V1_NATIVE_BINDING_CONTRACT',producer:'client/lib/package-persistence.mjs:readSavedPackageState'});
 return {...base,reason:'ORIGINAL_SAVED_PACKAGE_BINDING_UNAVAILABLE',journal:{sha256:expected.journalSha256,records:rows.length},
  original_session_id:expected.sessionId,selected_save_operation_id:expected.saveOperationId??null,
  counts:{workspace:prepared.length,successful_completed_saves:saves.length,selected_saves:selected.length,selected_dirty_reads:states.length},
  prepared_workflow:{complete_fields_present:full,source:p?proof(p):null,document_id:p?.value.state?.document_id??null,
   caller_document_matches:p?.value.state?.document_id===expected.documentId,
   package_path:p?.value.state?.package_ref?.path??null},
  selected_records:Object.fromEntries(Object.entries(chosen).map(([k,rs])=>[k,rs.map(proof)])),
  recordPins,consumer,missing,
  required_provider:{source:'existing original same-Page prepared/save native proof provider',
   fields:['exact CLI/native Session association','live document/owner/account/package/proxy/reference chain','full saved workflow','producer-native capture time/epoch'],
   gate:'fresh confirmed own resource/readiness gates; no old UNKNOWN replay, owner reconstruction or new Save for this qualification'}};
}
