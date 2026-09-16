// Acceptance-only bounded receipts. Never persist MCP text, UI trees or exception messages.
import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const bool=v=>typeof v==='boolean'?v:null;
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000?v:null;
const codes=new Set(['UI_EPOCH_CHANGED','UI_CONTEXT_CHANGED','UI_ROOT_STALE','UI_TARGET_CHANGED','LOGIN_REQUIRED','DOWNLOAD_BROWSER_CALL_FAILED','DOWNLOAD_CONTEXT_CHANGED','DOWNLOAD_EVENT_MISSING','DOWNLOAD_FAILED','DOWNLOAD_FILENAME_MISMATCH','DOWNLOAD_GESTURE_NOT_CONFIRMED','DOWNLOAD_ORIGIN_MISMATCH','DOWNLOAD_OUTPUT_SIZE_CHANGED','DOWNLOAD_REVEAL_EPOCH_CHANGED','DOWNLOAD_REVEAL_LIMIT','DOWNLOAD_REVEAL_NOT_CONFIRMED','DOWNLOAD_REVEAL_NOT_VERTICAL','DOWNLOAD_REVEAL_OWNER_BLOCKED','DOWNLOAD_REVEAL_OWNER_CHANGED','DOWNLOAD_REVEAL_OWNER_MISSING','DOWNLOAD_REVEAL_TARGET_CHANGED']);
const statuses=new Set(['SUCCEEDED','FAILED','NOT_APPLIED','AMBIGUOUS']);
const phases=new Set(['preconditions','revealing','requesting','downloading','downloaded','observed']);
const checkNames=['observation','authenticated','origin','build','workflow','epoch','tab','package','storage','dialogs','masks'];
export function safeNativeResult(r){
 const trace=Array.isArray(r?.trace)?r.trace:[];
 return {status:statuses.has(r?.status)?r.status:null,phase:phases.has(r?.phase)?r.phase:null,
  code:codes.has(r?.error?.code)?r.error.code:null,error_present:r?.error!=null,
  effect_possible:bool(r?.effect_possible),cleanup_complete:bool(r?.cleanup_complete),pending_ui_actions:count(r?.pending_ui_actions),
  download_count:count(r?.observer_download_count),listener_registered:bool(r?.observer_listener_registered),download_completed:bool(r?.output?.download_completed),
  context_checks:trace.filter(x=>x?.event==='download_context_refused').slice(0,1).map(x=>Object.fromEntries(checkNames.map(k=>[k,bool(x.checks?.[k])]))),
  trace_count:trace.length,preconditions_verified:trace.some(x=>x?.event==='ui_preconditions_verified'),gesture_applied:trace.some(x=>x?.event==='ui_gesture_applied'),trace_omitted:true};
}
function envelope(reply){
 const content=Array.isArray(reply?.content)?reply.content:[];
 const blocks=content.slice(0,8).map(x=>typeof x?.text==='string'?{type:'text',bytes:Buffer.byteLength(x.text),sha256:sha(x.text)}:{type:'omitted'});
 return {is_error:bool(reply?.isError),content_count:content.length,blocks,content_omitted:content.length>8};
}
// The original reply stays only in memory. Envelope receipt is durable before parse;
// bounded decoded receipt is durable before status/owner/success assertions.
export async function observeResponse({invoke,parse,validate,guard,record,clock,signal,deadline,binding,code}){
 const request={name:'browser_run_code_unsafe',arguments:{code}};
 const base={...binding,code_sha256:sha(code),request_sha256:sha(JSON.stringify(request)),deadline_ms:deadline};
 let invoked=false,received=false,stage='before_invoke',safe=null;
 const emit=(phase,extra={})=>record({...base,phase,mono_ms:clock(),remaining_ms:Math.max(0,deadline-clock()),cancelled:signal.aborted,...extra});
 try{
  guard();stage='transport';invoked=true;
  const reply=await invoke({code,signal,timeout:Math.max(1,Math.floor(deadline-clock()))});received=true;
  stage='receipt';const receipt=envelope(reply);await emit('received',{reply:receipt});
  // Do not parse oversized/unbounded envelopes, but retain their limited fingerprint.
  stage='parse';if(receipt.content_count>8||receipt.blocks.some(b=>b.bytes>1048576))throw Error('OBSERVER_RESPONSE_LIMIT');
  const result=parse(reply);safe=safeNativeResult(result);
  stage='decoded_receipt';await emit('decoded',{native:safe});
  stage='validation';guard();validate(result);guard();
  await emit('validated',{native:safe});guard();return result;
 }catch(error){
  // Unknown UI effects remain unknown even after the host promise has settled.
  await emit('failure',{failure_kind:signal.aborted?'cancellation':stage==='transport'?'transport_throw':stage==='parse'?'parse_failure':stage==='validation'?'validation_failure':'receipt_or_guard_failure',
   failed_stage:stage,invocation_started:invoked,response_received:received,host_invocation_settled:invoked,
   native:safe??{status:null,code:null,effect_possible:null,cleanup_complete:null,pending_ui_actions:null}});
  throw error;
 }
}
