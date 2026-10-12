// Private LAB-69 receipt correlation. No native calls, replay or cleanup authority.
import {createHash} from 'node:crypto';
import {makeSavedPackageStateCode,parseSavedPackageState} from '../../packages/loginom-runtime/client/lib/package-persistence.mjs';
import {parseWorkspacePreparation} from '../../packages/loginom-runtime/client/lib/workspace.mjs';

export const savedRecordHash=raw=>createHash('sha256').update(raw).digest('hex');
const recordNames=['workspace','request','save','dirty'];
const text=value=>({content:[{type:'text',text:JSON.stringify(value)}]});

// expected and recordPins come from the private caller's selected originals,
// never from a receipt's self-declared owner, label, prefix or hash.
export function consumeSavedPackageRecords(rawRecords,expected,{now,maxJournalAgeMs=15000}={}) {
 const limits={native_binding:'NOT_VERIFIED',holders:'NOT_VERIFIED',historical_operation:'NOT_VERIFIED',
  persisted_content_verified:false,mutation_authorized:false,release_authorized:false};
 const refuse=reason=>({status:'NOT_VERIFIED',correlation:'NOT_VERIFIED',reason,...limits});
 try {
  makeSavedPackageStateCode(expected); // Reuse existing exact path/build/identity validation; never execute its code.
  if(!['prepareOperationId','saveOperationId','runtimeRevision','manifestSha256'].every(k=>typeof expected[k]==='string'&&expected[k]))return refuse('CALLER_PINS_REQUIRED');
  if(!Number.isFinite(now)||!Number.isSafeInteger(maxJournalAgeMs)||maxJournalAgeMs<0)return refuse('INVALID_JOURNAL_CLOCK');
  const records={};
  for(const name of recordNames){
   const raw=rawRecords?.[name],pin=expected.recordPins?.[name];
   if(typeof raw!=='string'||! /^[0-9a-f]{64}$/.test(pin??'')||savedRecordHash(raw)!==pin)return refuse('ORIGINAL_RECORD_PIN_'+name);
   records[name]=JSON.parse(raw);
  }
  const {workspace,request,save,dirty}=records;
  for(const record of Object.values(records)){
   if(record.session_id!==expected.sessionId||record.runtime_revision!==expected.runtimeRevision
    ||record.manifest_sha256!==expected.manifestSha256||record.target?.loginom_build!==expected.loginomBuild)return refuse('JOURNAL_BINDING_CHANGED');
  }
  const times=recordNames.map(name=>Date.parse(records[name].recorded_at));
  if(times.some(t=>!Number.isFinite(t)||t>now)||times.some((t,i)=>i&&t<times[i-1])
   ||now-times[3]>maxJournalAgeMs)return refuse('STALE_OR_UNORDERED_JOURNAL');
  if(workspace.event!=='workspace_prepared')return refuse('PREPARATION_EVENT_REQUIRED');
  const prepared=parseWorkspacePreparation(text(workspace.state));
  if(prepared.status!=='READY'||prepared.operation_id!==expected.prepareOperationId||prepared.session_id!==expected.sessionId
   ||prepared.document_id!==expected.documentId||prepared.loginom_account!==expected.account
   ||prepared.target?.loginom_build!==expected.loginomBuild||prepared.ownership_verified!==true
   ||prepared.workflow_ref?.workflow_id!==expected.workflowRef?.workflow_id
   ||prepared.workflow_ref?.tab_tid!==expected.workflowRef?.tab_tid
   ||JSON.stringify(prepared.workflow_ref)!==JSON.stringify(expected.workflowRef))return refuse('PREPARED_IDENTITY_CHANGED');
  if(request.phase!=='prepared'||save.phase!=='completed'||dirty.phase!=='saved_package_state_observed'
   ||[request,save,dirty].some(r=>r.operation_id!==expected.saveOperationId))return refuse('SAVE_OPERATION_CHANGED');
  if([request,save].some(r=>JSON.stringify(r.checkpoint?.workflow_ref)!==JSON.stringify(expected.workflowRef)))return refuse('SAVE_WORKFLOW_BINDING_UNAVAILABLE');
  if(!['package.save_as','package.save_checkpoint'].includes(request.action_key)||save.action_key!==request.action_key
   ||request.parameters?.path!==expected.packagePath
   ||JSON.stringify(request.parameters)!==JSON.stringify(save.parameters))return refuse('SAVE_REQUEST_CHANGED');
  const outcome=save.outcome;
  if(outcome?.status!=='SUCCEEDED'||outcome.operation_id!==expected.saveOperationId||outcome.action_key!==request.action_key
   ||outcome.phase!=='verified'||outcome.cleanup_complete!==true||outcome.error!==null
   ||outcome.output?.package_ref?.path!==expected.packagePath)return refuse('CONFIRMED_SAVE_REQUIRED');
  const state=parseSavedPackageState(text(dirty.state),expected);
  // The existing v1 state has no native Guid, reference epoch or capture clock.
  // Journal recorded_at is not a native observation timestamp. Never manufacture
  // these links from a successful save, a current unrelated observer or labels.
  return {status:'NOT_VERIFIED',correlation:'VERIFIED',reason:'FRESH_NATIVE_PACKAGE_BINDING_UNAVAILABLE',
   save_operation_id:expected.saveOperationId,session_id:state.session_id,document_id:state.document_id,
   account:state.account,package_path:state.package_path,reported_modified:state.modified,
   dirty:'REPORTED_AFTER_CONFIRMED_SAVE',journal_recorded_at:dirty.recorded_at,
   native_observed_at:null,native_session_guid:null,...limits};
 }catch{return refuse('MALFORMED_OR_UNBOUND_RECEIPT');}
}
