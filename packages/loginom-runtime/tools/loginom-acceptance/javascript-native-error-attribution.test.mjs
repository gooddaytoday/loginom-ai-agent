import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {failedStage,readFailed} from './javascript-native-named.test.mjs';
import {attributionSha256,nativeAttributionDiagnostic,verifyJavascriptNativeErrorAttribution,readReviewedAttributionProfile} from './javascript-native-error-attribution.mjs';
import {verifyAttributionJournal,auditRetainedJavascriptAttribution} from './javascript-native-error-attribution-audit.mjs';

// Native transport executes in the existing page VM. Error text, environment
// attachment and journals below are SYNTHETIC, never a retained Loginom run.
const calibration=readFileSync(new URL('./fixtures/javascript-error-attribution-reviewed.json',import.meta.url),'utf8');
const profile=readReviewedAttributionProfile(calibration);
const clone=value=>JSON.parse(JSON.stringify(value));
const raw=(line=4)=>`Error: synthetic diagnostic\n   at Anonymous function (<main>:${line}:1)\n   at module (<main>:1:1)`;
async function fixture(caseId='B-get-case',message=raw()){
 const receipt=await readFailed(await failedStage(caseId,{message}));
 return {caseId,results:clone(receipt.results),environment:clone(profile.observed_domain),calibration};
}
for(const caseId of ['B-get-case','B-get-missing','B-isnull-case','B-isnull-missing']){
 test('attribution '+caseId+' keeps whole R candidate separate from acceptance',async()=>{
  const input=await fixture(caseId),before=JSON.stringify(input),out=verifyJavascriptNativeErrorAttribution(input);
  assert.equal(out.observed_line_matches_R,true);assert.equal(out.source_statement.line,4);
  assert.equal(out.reason,caseId.startsWith('B-get-')?'whole_R_line_candidate_requires_artifact_authentication_and_root_review':'native_isnull_caller_not_calibrated');
  assert.equal(out.applicability.native_control,caseId.startsWith('B-get-')?'K4-native-caller-v1':null);
  for(const key of ['rejection_attributed','case_complete','exact_pass','g5_complete','g6_complete','j25_complete','public_handler_accepted','cli_accepted','general_case_sensitivity_rule'])assert.equal(out[key],false);
  assert.equal(out.status,caseId.startsWith('B-get-')?'R_CANDIDATE_PENDING_ARTIFACT_AUTHENTICATION':'UNRESOLVED');assert.equal(out.source_span,null);assert.equal(out.root_review_required,true);
  assert.equal(Boolean(out.candidate_source_span),caseId.startsWith('B-get-'));
  assert.equal(out.artifact_authentication,'not_performed_by_semantic_verifier');assert.equal(JSON.stringify(input),before);
  assert.equal(Object.isFrozen(out.diagnostic.frames),true);
 });
}
for(const [name,message,reason] of [
 ['setup2',raw(2),'caller_outside_exact_R_statement'],['setup3',raw(3),'caller_outside_exact_R_statement'],
 ['late-check-getter5',raw(5),'caller_outside_exact_R_statement'],
 ['module-only','Error: synthetic\n   at module (<main>:1:1)','missing_or_competing_caller_frames'],
 ['competing',raw()+'\n   at Anonymous function (<main>:5:1)','missing_or_competing_caller_frames'],
 ['preview',raw().replace('<main>:4','<preview>:4'),'preview_or_foreign_source_frame'],
 ['reordered-frames','Error: synthetic\n   at module (<main>:1:1)\n   at Anonymous function (<main>:4:1)','caller_frame_order_differs'],
 ['quoted-marker','Error: quoted "JS_CAL_K2_SYNC_V1"','missing_or_competing_caller_frames'],
 ['quoted-stack','Error: "'+raw().replaceAll('\n','\\n')+'"','missing_or_competing_caller_frames'],
 ['unknown-header',raw().replace('Error:','Something:'),'unrecognized_native_diagnostic'],
 ['unknown-frame',raw().replace('Anonymous function','other'),'unrecognized_native_diagnostic']
])test('attribution rejects mapping '+name,async()=>{
 const out=verifyJavascriptNativeErrorAttribution(await fixture('B-get-case',message));
 assert.equal(out.observed_line_matches_R,false);assert.ok(out.reasons.includes(reason));assert.equal(out.rejection_attributed,false);
});
for(const [name,change] of Object.entries({
 missing_calibration:x=>delete x.calibration,forged_calibration:x=>x.calibration=x.calibration.replace('7.4.2','7.4.3'),
 shifted_calibration:x=>x.calibration=x.calibration.replace('"source_line": 4','"source_line": 5'),
 self_assertion:x=>x.calibration={verified:true,profile_id:profile.profile_id},
 source:x=>x.results.failed.source+='\n',source_hash:x=>x.results.failed.source_sha256='0'.repeat(64),
 build:x=>x.environment.build='7.4.3',schema:x=>x.environment.schema_mode='wizard',
 frontend:x=>x.environment.frontends[0].sha256='0'.repeat(64),runtime:x=>x.environment.runtime.functions={},
 owner:x=>x.results.failed.node.node_id='foreign',stale_child:x=>x.results.failed.execution.process_id='2.1',
 group_only:x=>x.results.failed.execution.error_source='group_error_details',
 stale_baseline:x=>x.results.failed.execution.fresh_baseline.roots.push({process_id:x.results.failed.execution.group_id}),
 truncated:x=>x.results.failed.native_error_complete=false,redacted:x=>x.results.failed.redacted=true,
 normalized:x=>x.results.failed.normalized=true,length:x=>x.results.failed.native_text_length=2000,
 output:x=>x.results.output={status:'read'},input:x=>x.results.before.raw.row_count=5,
 upstream:x=>x.results.upstream.lifecycle.pending=1,stored_outcome:x=>x.results.outcome.case_complete=true,
 quoted_marker_profile:x=>x.calibration='Error: "JS_CAL_K2_SYNC_V1"'
}))test('attribution refuses '+name,async()=>{
 const input=await fixture();change(input);assert.throws(()=>verifyJavascriptNativeErrorAttribution(input));
});
test('attribution complete raw1000 preserved; raw1001 refused',()=>{
 const text='Error: '+ 'x'.repeat(993);
 assert.equal(nativeAttributionDiagnostic({error_details:text,native_error_complete:true}).raw_utf16_length,1000);
 assert.throws(()=>nativeAttributionDiagnostic({error_details:text+'x',native_error_complete:true}));
});
for(const token of ['9007199254740992','9007199254740993','9'.repeat(310)]){
 for(const axis of ['line','column'])test('attribution rejects unsafe '+axis+' token '+token.slice(0,20),async()=>{
  const message=raw().replace('<main>:4:1',axis==='line'?`<main>:${token}:1`:`<main>:4:${token}`);
  const out=verifyJavascriptNativeErrorAttribution(await fixture('B-get-case',message));
  assert.equal(out.diagnostic.raw,message);assert.equal(out.diagnostic.parsed,false);
  assert.deepEqual(out.diagnostic.frames,[]);assert.equal(out.candidate_source_span,null);
 });
}
test('attribution projection is pinned to exact bytes, not mutable caller claims',()=>{
 assert.throws(()=>readReviewedAttributionProfile(calibration+' '));
 assert.throws(()=>auditRetainedJavascriptAttribution({caseId:'B-get-case',calibration,artifacts:{}}),/artifact SHA/);
 const artifacts=Object.fromEntries(Object.keys(profile.artifacts).map(id=>[id,Object.fromEntries(Object.keys(profile.artifacts[id].sha256).map(key=>[key,'{}']))]));
 assert.throws(()=>auditRetainedJavascriptAttribution({caseId:'B-get-case',calibration,artifacts}),/artifact SHA/);
});

function journalFixture(input){
 const results=input.results,failed=results.failed,cleanup={package_closed:true,logged_out:true,browser_closed:true};
 const events=[
  {phase:'native_roundtrip_input_before_js',proof:results.before},
  {phase:'input_preview_closed'},
  {phase:'native_roundtrip_armed',armed:true,input_read_id:results.before.binding.read_id,source_sha256:failed.source_sha256},
  {phase:'native_roundtrip_schema_bound',verified:true,schema_mode:'code'},
  {phase:'native_roundtrip_done_sealed',attestation:{verified:true,node_id:failed.node.node_id,source_sha256:failed.source_sha256,schema_mode:'code',basis:'live_pre_done_attestation_and_confirmed_own_done_graph'}},
  {phase:'native_named_dispatch_reserved',named_case_id:input.caseId,source_sha256:failed.source_sha256,node:failed.node},
  {phase:'execution_launched',node:failed.node,baseline:failed.execution.fresh_baseline,identity:failed.execution.trial,launch:{verified:true,launch_gesture_verified:true}},
  {phase:'execution_terminal',terminal:failed.execution},
  {phase:'native_named_failed_terminal_sealed',failed},
  {phase:'javascript_native_roundtrip_upstream_cells_verified',proof:results.upstream},
  {phase:'upstream_preview_closed'},
  {phase:'native_named_failed_upstream_verified',results},
  {phase:'native_named_terminal_verified',outcome:results.outcome,execution_id:failed.execution.execution_id},
  {phase:'native_named_finalized',coverage:{fixture:'synthetic'},status:'UNRESOLVED',cleanup}
 ].map(event=>({...event,target:{origin:results.before.binding.origin,loginom_build:'7.4.2'}}));
 const report={native_roundtrip:clone(results),native_named:{fixture:'synthetic'},status:'UNRESOLVED',cleanup:clone(cleanup)};
 return {events,report};
}
function serializeJournal(fixture){
 const lines=fixture.events.map(event=>JSON.stringify(event)+'\n');
 fixture.report.execution_records=lines.map((line,index)=>({journal:'execution-events.jsonl',line:index+1,sha256:attributionSha256(line)}));
 return lines.join('');
}
test('attribution journal recomputes complete ACKs and exact semantic associations',async()=>{
 const f=journalFixture(await fixture()),journal=serializeJournal(f);
 assert.equal(verifyAttributionJournal(f.report,journal,'B-get-case').journal_lines_verified,14);
});
test('attribution journal refuses consistent unsuccessful cleanup with independent snapshots',async()=>{
 const f=journalFixture(await fixture());
 assert.notEqual(f.report.cleanup,f.events[13].cleanup);
 f.report.cleanup.browser_closed=false;f.events[13].cleanup.browser_closed=false;
 const journal=serializeJournal(f);
 assert.throws(()=>verifyAttributionJournal(f.report,journal,'B-get-case'),/journal cleanup incomplete/);
});
for(const [name,change] of Object.entries({
 stale_ack:f=>f.report.execution_records[0].sha256='0'.repeat(64),
 missing_ack:f=>f.report.execution_records.pop(),foreign_ack:f=>f.report.execution_records[0].journal='../execution-events.jsonl',
 reordered_ack:f=>f.report.execution_records.reverse(),
 report_after_ack:f=>f.report.native_roundtrip.failed.execution.process_id='99.1'
}))test('attribution journal refuses '+name,async()=>{
 const f=journalFixture(await fixture()),journal=serializeJournal(f);change(f);
 assert.throws(()=>verifyAttributionJournal(f.report,journal,'B-get-case'));
});
for(const [name,change] of Object.entries({
 terminal_after_seal:f=>[f.events[7],f.events[8]]=[f.events[8],f.events[7]],
 foreign_terminal:f=>f.events[7].terminal.node.node_id='foreign',
 missing_done:f=>f.events.splice(4,1),wrong_schema:f=>f.events[3].schema_mode='wizard',
 wrong_environment:f=>f.events[0].target.loginom_build='other',
 stale_source:f=>f.events[2].source_sha256='0'.repeat(64),
 output_read:f=>f.events.push({phase:'output_read',role:'output',target:f.events[0].target}),
 cleanup:f=>f.events[13].cleanup.browser_closed=false,
 raw_upstream_after_ack:f=>f.events[9].proof.raw.row_count=7
}))test('attribution journal refuses rehashed synthetic '+name,async()=>{
 const f=journalFixture(await fixture());change(f);const journal=serializeJournal(f);
 assert.throws(()=>verifyAttributionJournal(f.report,journal,'B-get-case'));
});
