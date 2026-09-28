import {isDeepStrictEqual} from 'node:util';
import {verifyNamedFailureOutcome} from './javascript-native-named-failure.mjs';
import {attributionSha256,readReviewedAttributionProfile,nativeAttributionDiagnostic,verifyJavascriptNativeErrorAttribution} from './javascript-native-error-attribution.mjs';

const need=(value,reason)=>{if(!value)throw Error('Attribution artifact audit: '+reason);};
const equal=(a,b,reason)=>need(isDeepStrictEqual(a,b),reason);

export function attributionObservedDomain(report,proof){
 need(report.execution_schema?.verified===true&&report.execution_schema.form==='JavaScriptColumnsWizard'
  &&report.execution_schema.generation?.checked===true&&report.execution_schema.grids?.length===2
  &&report.execution_schema.grids.every(grid=>grid.count===0&&grid.total===0&&grid.fields.length===0),'code schema not verified');
 const builds=report.snapshots.filter(item=>item.build!==undefined||item.edition!==undefined);
 need(builds.length===12&&builds.every(item=>item.build==='7.4.2'&&item.edition==='Enterprise'),'build snapshots differ');
 need(proof.runtime.document_id===proof.binding.document_id,'runtime document differs');
 return {origin:proof.binding.origin,build:builds[0].build,edition:builds[0].edition,schema_mode:'code',schema:proof.exact.schema,
  frontends:proof.frontends.map(item=>Object.fromEntries(Object.entries(item).filter(([key])=>key!=='url'))),
  runtime:Object.fromEntries(Object.entries(proof.runtime).filter(([key])=>!['document_id','binding_id'].includes(key))),
  subscription_proxy_source_sha256:proof.subscription_proxy_source_sha256,count_loader_sha256:proof.count_loader_sha256};
}

// Recompute line hashes, complete ACK inventory and semantic associations even
// after whole-file authentication. Exported for portable adversarial fixtures.
export function verifyAttributionJournal(report,journal,caseId){
 need(typeof journal==='string'&&journal.endsWith('\n'),'journal truncated');
 const lines=journal.match(/[^\n]*\n/g),events=lines.map(line=>JSON.parse(line));
 const refs=[];
 const walk=value=>{
  if(!value||typeof value!=='object')return;
  if(['journal','line','sha256'].every(key=>Object.hasOwn(value,key)))refs.push(value);
  Object.values(value).forEach(walk);
 };
 walk(report);
 need(refs.length>0&&report.execution_records?.length===lines.length,'missing journal ACK inventory');
 refs.forEach(ref=>{
  need(ref.journal==='execution-events.jsonl'&&Number.isSafeInteger(ref.line)&&ref.line>0&&ref.line<=lines.length,'foreign or stale ACK line');
  need(attributionSha256(lines[ref.line-1])===ref.sha256,'journal ACK digest differs');
  if(ref.phase!==undefined)equal(ref.phase,events[ref.line-1].phase,'journal ACK phase differs');
  if(ref.recorded_at!==undefined)equal(ref.recorded_at,events[ref.line-1].recorded_at,'journal ACK time differs');
 });
 report.execution_records.forEach((ref,index)=>need(ref.line===index+1,'ACK inventory reordered or duplicated'));
 const one=phase=>{
  const matches=events.map((event,index)=>({event,index})).filter(item=>item.event.phase===phase);
  need(matches.length===1,'nonunique journal phase '+phase);return matches[0];
 };
 const calibration=caseId.startsWith('K'),results=calibration?report.calibration_result:report.native_roundtrip;
 const phases=['native_roundtrip_input_before_js','native_roundtrip_armed','native_roundtrip_schema_bound','native_roundtrip_done_sealed',
  calibration?'calibration_dispatch_reserved':'native_named_dispatch_reserved','execution_launched','execution_terminal',
  'native_named_failed_terminal_sealed','javascript_native_roundtrip_upstream_cells_verified','native_named_failed_upstream_verified',
  calibration?'calibration_terminal_captured':'native_named_terminal_verified',calibration?'calibration_finalized':'native_named_finalized'];
 const ordered=phases.map(one);
 need(ordered.every((item,index)=>index===0||item.index>ordered[index-1].index),'journal phase order differs');
 need(events.every(event=>event.target?.origin===results.before.binding.origin&&event.target?.loginom_build==='7.4.2'),'journal environment differs');
 need(!events.some(event=>event.roundtrip_role==='output'||event.role==='output'),'OUTPUT evidence on failed path');
 need(events.filter(event=>event.phase?.includes('preview_closed')).length===2,'preview cleanup differs');
 equal(one(phases[0]).event.proof,results.before,'original INPUT journal proof differs');
 const armed=one(phases[1]).event;
 need(armed.armed===true&&armed.input_read_id===results.before.binding.read_id&&armed.source_sha256===results.failed.source_sha256,'armed INPUT/source differs');
 need(one(phases[2]).event.verified===true&&one(phases[2]).event.schema_mode==='code','journal schema differs');
 const seal=one(phases[3]).event.attestation;
 need(seal.verified===true&&seal.node_id===results.failed.node.node_id&&seal.source_sha256===results.failed.source_sha256
  &&seal.schema_mode==='code'&&seal.basis==='live_pre_done_attestation_and_confirmed_own_done_graph','Done source/owner differs');
 const dispatch=one(phases[4]).event;
 need(dispatch[calibration?'calibration_id':'named_case_id']===caseId&&dispatch.source_sha256===results.failed.source_sha256,'dispatch source differs');
 equal(dispatch.node,results.failed.node,'dispatch owner differs');
 const launched=one('execution_launched').event;
 equal(launched.node,results.failed.node,'launched owner differs');
 equal(launched.baseline,results.failed.execution.fresh_baseline,'launched baseline differs');
 need(launched.identity?.phase==='initial'&&launched.identity.node_id===results.failed.node.node_id
  &&launched.identity.source_sha256===results.failed.source_sha256&&launched.launch?.verified===true
  &&launched.launch.launch_gesture_verified===true,'launched source/gesture differs');
 equal(one('execution_terminal').event.terminal,results.failed.execution,'terminal child differs');
 equal(one('native_named_failed_terminal_sealed').event.failed,results.failed,'failed seal differs');
 equal(one('javascript_native_roundtrip_upstream_cells_verified').event.proof,results.upstream,'upstream raw proof differs');
 const base=Object.fromEntries(['before','failed','upstream','output','outcome'].map(key=>[key,results[key]]));
 equal(one('native_named_failed_upstream_verified').event.results,base,'post-ACK results differ');
 const terminal=one(phases[10]).event,final=one(phases[11]).event;
 if(calibration)equal(terminal.result,results,'calibration terminal differs');
 if(!calibration){
  equal(terminal.outcome,results.outcome,'named outcome differs');
  need(terminal.execution_id===results.failed.execution.execution_id,'named terminal owner differs');
  equal(final.coverage,report.native_named,'coverage differs');
 }
 equal(final.cleanup,report.cleanup,'final cleanup differs');
 need(['package_closed','logged_out','browser_closed'].every(key=>final.cleanup[key]===true)&&!final.cleanup.failure,'journal cleanup incomplete');
 equal(final.status,report.status,'final status differs');
 return {journal_refs_verified:refs.length,journal_lines_verified:lines.length,phase_order_verified:true,ack_inventory_verified:true};
}

export function auditRetainedJavascriptAttribution({caseId,artifacts,calibration}){
 const profile=readReviewedAttributionProfile(calibration);
 need(caseId.startsWith('B-')&&Object.hasOwn(profile.artifacts,caseId),'unsupported retained case');
 const ids=[...profile.calibrations.map(item=>item.id),caseId];
 const verified=Object.fromEntries(ids.map(id=>{
  const pin=profile.artifacts[id],files=artifacts?.[id];
  Object.entries(pin.sha256).forEach(([key,digest])=>need(typeof files?.[key]==='string'&&attributionSha256(files[key])===digest,'retained artifact SHA differs: '+id+'/'+key));
  const report=JSON.parse(files.report),snapshot=JSON.parse(files.snapshot),freeze=JSON.parse(files.freeze);
  equal(snapshot.pins,freeze.pins,'original snapshot/freeze differs');
  need(Object.keys(snapshot.pins).length===pin.pin_count&&freeze.pin_count===pin.pin_count
   &&snapshot.source_commit===pin.source_commit,'original source generation differs');
  const results=report.calibration_result??report.native_roundtrip;
  need(report.status===(id.startsWith('K')?'DIAGNOSTIC_OBSERVED':'UNRESOLVED')&&!report.failure&&!report.evidence_failure
   &&(report.gates_closed??[]).length===0,'retained report status differs');
  need(['package_closed','logged_out','browser_closed'].every(key=>report.cleanup?.[key]===true)&&!report.cleanup.failure,'cleanup incomplete');
  equal(verifyNamedFailureOutcome(results,id),results.outcome,'recomputed raw failure outcome differs');
  need(report.execution_probe.status==='source_verified'&&report.execution_probe.source_sha256===pin.source_sha256
   &&attributionSha256(results.failed.source)===pin.source_sha256,'execution source differs');
  equal(report.execution_probe.execution,results.failed.execution,'probe execution differs');
  const environment=attributionObservedDomain(report,results.before);
  equal(environment,profile.observed_domain,'observed domain differs');
  equal(attributionObservedDomain(report,results.upstream),environment,'upstream domain differs');
  const journal=verifyAttributionJournal(report,files.journal,id);
  if(id.startsWith('K')){
   const control=profile.calibrations.find(item=>item.id===id);
   need(results.failed.source===control.source&&results.failed.error_details===control.raw_diagnostic
    &&results.failed.native_text_length===control.native_text_length,'calibration source/raw differs');
   const diagnostic=nativeAttributionDiagnostic(results.failed);
   need(diagnostic.parsed&&diagnostic.frames.length===2&&diagnostic.frames[0].function==='Anonymous function'
    &&diagnostic.frames[0].source==='main'&&diagnostic.frames[0].line===control.source_line
    &&diagnostic.frames[1].function==='module'&&diagnostic.frames[1].source==='main'
    &&diagnostic.frames[1].line===1&&diagnostic.frames[1].column===1,'calibration caller correspondence differs');
  }
  return [id,{report,results,environment,audit:{...journal,original_freeze:pin.freeze,original_pin_count:pin.pin_count,
   original_source_commit:pin.source_commit,sha256:pin.sha256,input_and_upstream_cells_verified:8,cleanup_verified:true}}];
 }));
 const attribution=verifyJavascriptNativeErrorAttribution({caseId,results:verified[caseId].results,environment:verified[caseId].environment,calibration});
 return {sidecar_version:1,case_id:caseId,historical_report_modified:false,
  status:attribution.candidate_source_span?'RECORDED_R_CANDIDATE_PENDING_ROOT_REVIEW':'UNRESOLVED',
  artifact_authentication:'exact_root_reviewed_full_artifact_bytes_and_semantic_audit',
  audits:Object.fromEntries(ids.map(id=>[id,verified[id].audit])),
  attribution:{...attribution,artifact_authentication:'verified_by_retained_artifact_audit',
   ...(attribution.candidate_source_span?{status:'RECORDED_R_CANDIDATE_PENDING_ROOT_REVIEW',reason:'whole_R_line_candidate_requires_root_review'}:{})},
  root_review_required:true,case_complete:false,g5_complete:false};
}
