// Independent acceptance instrumentation, never a public retained-byte API.
// Contract2 checks observable graph identity and bytes; settings are unverified.
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {mkdir,realpath,lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,basename,isAbsolute} from 'node:path';
import {REVISION,checkActionLedger} from './text-export-observer-policy.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=(v,m)=>{if(!v)throw Error(m);};
export const OBSERVER_REVISION=REVISION;
export const SNAPSHOT_BLOCKER='NATIVE_OBSERVER_SMOKE_NOT_ADMITTED';
export async function unavailableNativeObserver(){throw Error(SNAPSHOT_BLOCKER);}
const requiredSnapshot=['document_id','workflow_id','node_id','source_node_id','graph','workflow_ref'];
export function validateSnapshots(before,after,identity){
 for(const s of [before,after]){
  need(s&&s.complete===true&&requiredSnapshot.every(k=>Object.hasOwn(s,k)),'Incomplete native snapshot');
  for(const k of ['document_id','workflow_id','node_id','source_node_id'])need(s[k]===identity[k],'Snapshot identity differs');
  need(!Object.hasOwn(s,'settings')&&!Object.hasOwn(s,'source_settings')&&s.settings_verified===false,'Contract2 does not verify settings');
  for(const k of ['graph','workflow_ref'])need(s[k]&&typeof s[k]==='object'&&Object.keys(s[k]).length>0,'Missing live '+k);
 }
 need(same(before,after),'Observed graph/identity changed during read');
}

// The observer receives an absolute deadline, abort signal and fresh read ID.
// Its native implementation MUST subscribe before the one gesture and create a
// new download file, returning raw evidence; it must not Configure/Execute/save.
export function createReadObserverGate({dispatch,observe=unavailableNativeObserver,append,artifactRoot,clock=()=>performance.now(),budgetMs=60000}){
 need(Number.isInteger(budgetMs)&&budgetMs>0&&budgetMs<=60000,'Invalid observer budget');
 let busy=false,used=false,poisoned=false,active=0,seq=0,previous='0'.repeat(64),writes=Promise.resolve();
 const record=async(kind,payload)=>{const line=JSON.stringify({seq:++seq,mono_ms:clock(),previous,kind,payload});previous=hash(line);writes=writes.then(()=>append(line+'\n'));await writes;};
 const publicFailure=reason=>{const e=Error(reason);e.acceptanceObserverIncomplete=true;return e;};
 const invoke=async(request,context=null)=>{
  if(busy||poisoned)throw publicFailure('OBSERVER_GATE_BLOCKED');
  if(!context){active++;try{return await dispatch(request);}finally{active--;}}
  need(active===0,'Concurrent public dispatch remains active');
  need(!used,'Observer is single-shot');used=true;busy=true;
  const controller=new AbortController(),start=clock(),deadline=Math.min(start+budgetMs,Number.isFinite(context.overall_deadline_ms)?context.overall_deadline_ms:start);
  let timer,abortListener,timedOut=false,dispatched=false;
  const guard=()=>{if(controller.signal.aborted||clock()>=deadline)throw publicFailure('OBSERVER_BUDGET_OR_CANCEL');};
  const original=JSON.stringify(request),readId=randomUUID();
  const failPromise=new Promise((_,reject)=>{
   abortListener=()=>reject(publicFailure('OBSERVER_ABORTED'));
   controller.signal.addEventListener('abort',abortListener,{once:true});
   timer=setTimeout(()=>{timedOut=true;controller.abort();},budgetMs);
  });
  // Entire observer interval, including journal persistence, is bounded. A late
  // observer response can never release the original replace request.
  const work=(async()=>{
   guard();const {run_id,session_id,runtime,baseline,reject,identity}=context;
   need(run_id&&session_id&&runtime&&baseline&&reject&&identity&&context.origin==='http://logi-test-plan.bg.local','Missing gate binding');
   need(/^[a-f0-9]{64}$/.test(baseline.original_event_hash??'')&&/^[a-f0-9]{64}$/.test(reject.terminal_event_hash??'')&&Number.isSafeInteger(baseline.original_event_index)&&Number.isSafeInteger(reject.terminal_event_index)&&baseline.original_event_index<reject.terminal_event_index,'Original/reject causal anchors required');
   need(Array.isArray(context.other_pending_operations)&&context.other_pending_operations.length===0,'Pending product operations not excluded');
   need(reject.status==='FAILED'&&reject.cleanup_complete===true&&reject.verification==='text_export_conflict_rejected','Reject not terminal/clean');
   need(request.params?.name==='dock_node_apply','Replace must be a public node call');
   const p=request.params.arguments?.parameters;
   need(p?.overwrite==='replace'&&p.destination===baseline.destination&&reject.destination===baseline.destination,'Wrong replace path');
   need(baseline.bytes>=0&&Number.isSafeInteger(baseline.bytes)&&/^[a-f0-9]{64}$/.test(baseline.sha256),'Invalid original bytes');
   await record('reject_bound',{run_id,session_id,runtime,baseline,reject,identity,source_edge:context.source_edge,workflow_ref:context.workflow_ref,origin:context.origin,observer_revision:OBSERVER_REVISION,read_id:readId,overall_deadline_ms:context.overall_deadline_ms,deadline_ms:deadline,request_sha256:hash(original)});guard();
   await record('read_started',{read_id:readId});guard();
   need(isAbsolute(artifactRoot)&&await realpath(artifactRoot)===resolve(artifactRoot),'Private artifact root must be ordinary');guard();
   const owner=await lstat(artifactRoot);need(owner.isDirectory()&&(owner.mode&0o077)===0,'Artifact root not private');guard();
   const parent=join(artifactRoot,'reject-baseline');await mkdir(parent,{recursive:true,mode:0o700});guard();need(await realpath(parent)===parent,'Artifact parent changed');guard();
   const folder=join(parent,readId);await mkdir(folder,{mode:0o700});guard();
   const name=basename(baseline.destination);need(/^[A-Za-z0-9_.-]+\.(csv|tsv)$/.test(name),'Invalid exact filename');
   const nativeFile='reject-baseline/'+readId+'/'+name,downloadPath=join(artifactRoot,nativeFile);
   const result=await observe({context:structuredClone(context),readId,deadline,downloadPath,signal:controller.signal});guard();
   const info=await lstat(downloadPath);guard();need(info.isFile()&&!info.isSymbolicLink()&&info.size<=16777216,'Native artifact invalid');
   const file=await open(downloadPath,constants.O_RDONLY|constants.O_NOFOLLOW);let data;try{const stat=await file.stat();guard();need(stat.ino===info.ino&&stat.dev===info.dev,'Artifact replaced');data=await file.readFile();guard();const after=await file.stat();need(after.size===stat.size&&after.mtimeMs===stat.mtimeMs&&after.ctimeMs===stat.ctimeMs,'Artifact changed while reading');}finally{await file.close();}guard();
   need(data.length===baseline.bytes&&hash(data)===baseline.sha256,'Downloaded bytes differ from original');
   need(result&&result.read_id===readId&&result.cleanup_complete===true,'Read cleanup/identity unconfirmed');
   validateSnapshots(result.before,result.after,identity);
   need(result.before.source_node_id===context.identity.source_node_id,'Fresh source identity differs');
   checkActionLedger(result.action_ledger,context);
   need(result.destination===baseline.destination&&result.bytes===baseline.bytes&&result.sha256===baseline.sha256,'Baseline bytes changed');
   need(result.native_file===nativeFile&&result.native_file!==baseline.native_file,'Fresh private file required');
   need(result.listener_before_gesture===true&&result.download_count===1&&result.workflow_returned===true,'Native causal chain incomplete');
   const kinds=['snapshot_before','download_listener','download_gesture','download_completed','workflow_return','snapshot_after'];
   need(Array.isArray(result.raw)&&same(result.raw.map(r=>r.kind),kinds),'Raw observation/download chain missing');
   need(result.raw.every((r,i)=>r.seq===i+1&&r.read_id===readId&&r.session_id===session_id&&r.origin===context.origin),'Raw causal binding differs');
   need(same(result.raw[0].payload,result.before)&&same(result.raw[5].payload,result.after),'Raw snapshots differ');
   const downloaded=result.raw[3].payload;need(downloaded.suggested_name===name&&downloaded.download_completed===true&&downloaded.destination===baseline.destination,'Raw download differs');
   need(same(result.raw[4].payload,identity),'Raw workflow return differs');
   await record('read_completed',{...result,read_id:readId});guard();
   need(JSON.stringify(request)===original,'Public request changed');
   await record('replace_dispatch',{read_id:readId,request_sha256:hash(original)});guard();
   return true;
  })();
  try{
   await Promise.race([work,failPromise]);guard();clearTimeout(timer);
   // Keep the gate held until dispatch resolves; no competing product operation
   // can slip between the checked observer and its original request.
   dispatched=true;return await dispatch(request);
  }catch(e){
   poisoned=true;controller.abort();
   // Do not wait indefinitely for an uncertain native observer or writer here.
   void record('incomplete',{read_id:readId,timed_out:timedOut,replace_not_dispatched:!dispatched,reason:e.acceptanceObserverIncomplete?'budget_or_gate':'observation_unconfirmed'}).catch(()=>{});
   throw publicFailure(dispatched?'REPLACE_DISPATCH_OUTCOME_UNCERTAIN':'OBSERVER_INCOMPLETE_REPLACE_NOT_DISPATCHED');
  }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abortListener);busy=false;}
 };
 return {invoke,state:()=>({busy,used,poisoned}),revision:OBSERVER_REVISION};
}
