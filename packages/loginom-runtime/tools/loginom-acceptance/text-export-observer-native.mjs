// Acceptance-only adapter. Reuses observed UI primitives; never starts a client.
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {relative} from 'node:path';
import {readFile} from 'node:fs/promises';
import {makeWorkspaceUiCode} from '../../client/lib/workspace-ui.mjs';
import {findNativeStorageRow} from '../../client/lib/text-export-output.mjs';
import {makeNativeOutputDownloadCode} from '../../client/lib/executor.mjs';
import {createNodeTargetBrowserAdapter} from '../../client/lib/node-target-browser.mjs';
import {observeResponse} from './text-export-observer-response.mjs';
import {need,same,checkStep,checkActionLedger,safeReturnRefusal,returnBinding,checkDownloadReveal,checkSearchScroll} from './text-export-observer-policy.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const one=xs=>{need(xs.length===1,'Unique observed control required');return xs[0];};
export function parseBrowserResult(reply){
 need(!reply?.isError,'Browser call failed');
 const results=(reply.content??[]).filter(x=>x.type==='text').flatMap(x=>{try{return [JSON.parse(x.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1]??x.text)];}catch{return [];}});
 return one(results);
}
export function projectGraph(g,c){
 need(g?.complete===true&&g.interaction_ready===true&&g.document_id===c.identity.document_id&&same(g.workflow_ref,c.workflow_ref),'Foreign graph owner');
 for(const id of [c.identity.node_id,c.identity.source_node_id])need(g.nodes.filter(n=>n.ref.node_id===id&&n.ref.document_id===c.identity.document_id&&n.ref.workflow_id===c.identity.workflow_id).length===1,'Missing graph/source identity');
 const edges=g.links.filter(e=>e.target===c.identity.node_id);
 need(edges.length===1&&same(edges[0],c.source_edge),'Observed source anchor changed');
 return {complete:true,...c.identity,workflow_ref:g.workflow_ref,settings_verified:false,graph:{nodes:g.nodes.map(({dom_epoch,...n})=>n),links:g.links,foreign_links:g.foreign_links}};
}
// One deadline, read-only resampling; no navigation action is repeated here.
export async function waitObserved({sample,accept,guard,sleep=ms=>delay(ms),interval=250}){
 for(;;){guard();const value=await sample();guard();if(accept(value))return value;
  guard();await sleep(interval);guard();}
}
const owner=s=>({tab_tid:s.workflow_ref?.tab_tid,prefix:s.workflow_ref?.prefix});
export function createNativeObserver({invoke,artifactRoot,record=async()=>{},recordResponse=async()=>{},cancellationSignal,clock=()=>performance.now()}){
 return async({context:c,readId,deadline,downloadPath,signal})=>{
  if(cancellationSignal)signal=AbortSignal.any([signal,cancellationSignal]);
  const ledger=[],seenRefs=new Set(),base={expected_origin:c.origin,expected_build:'7.4.2'};
  const guard=()=>{signal.throwIfAborted();need(clock()<deadline,'Observer deadline');};
  const run=async(step,code)=>{
   guard();checkStep(step,c);
   if(step.kind==='root')need(seenRefs.has(step.ref),'Unknown observation root');
   need(ledger.length<512,'Observer action count exceeded');
   const start=clock();await record({phase:'prepared',seq:ledger.length+1,step,code_sha256:hash(code),run_id:c.run_id,session_id:c.session_id,mono_start:start});
   let result;
   try{
    result=await observeResponse({invoke,parse:parseBrowserResult,guard,clock,signal,deadline,code,record:recordResponse,
     binding:{seq:ledger.length+1,step_kind:step.kind,run_id:c.run_id,session_id:c.session_id,read_id:readId,mono_start:start},
     validate:r=>{
      if(['return','search_scroll'].includes(step.kind)&&safeReturnRefusal(r))return;
      if(r.status!==undefined)need(r.status==='SUCCEEDED','Native step incomplete');
      if(['files','home','folder','return','search_scroll'].includes(step.kind))need(r.cleanup_complete===true&&r.output?.gesture_applied===true,'Navigation cleanup unknown');
     }});
   }catch(error){
    await record({phase:'failure',seq:ledger.length+1,step:{kind:step.kind},code_sha256:hash(code),run_id:c.run_id,session_id:c.session_id,read_id:readId,mono_start:start,mono_end:clock(),deadline_ms:deadline,cancelled:signal.aborted,cleanup_complete:null,pending_ui_actions:null});
    throw error;
   }
   for(const e of result.output?.ui?.elements??[])seenRefs.add(e.ref);
   const entry={seq:ledger.length+1,run_id:c.run_id,session_id:c.session_id,mono_start:start,mono_end:clock(),step,code_sha256:hash(code),response:result,cleanup_complete:true};
   await record({phase:'completed',...entry});guard();ledger.push(entry);
   return result;
  };
  const graph=async()=>{
   let calls=0;
   const adapter=createNodeTargetBrowserAdapter({origin:c.origin,build:'7.4.2',execute:code=>{need(++calls===1,'Graph retry forbidden');return run({kind:'graph'},code);}});
   return projectGraph(await adapter.observe(c.graph_request,Date.now()+Math.max(1,deadline-clock())),c);
  };
  let documentEpoch;
  const observe=async(step)=>{
   const options=step.kind==='roots'?{discover_roots:true}:step.kind==='row'?{discover_roots:true,storage_name:step.name}:{root_ref:step.ref};
   const s=(await run(step,makeWorkspaceUiCode({mode:'observe',...base,...options}))).output;guard();
   need(s?.authenticated===true&&s.origin===c.origin&&s.loginom_build==='7.4.2'&&!s.ui?.dialogs?.length,'Observation owner blocked');
   need(typeof s.dom_epoch?.document==='string'&&s.dom_epoch.document.length>0&&s.workflow_ref?.tab_tid&&s.workflow_ref?.prefix,'Unknown observation owner');
   documentEpoch??=s.dom_epoch.document;need(s.dom_epoch.document===documentEpoch,'Observation document changed');return s;
  };
  const roots=()=>observe({kind:'roots'}),root=ref=>observe({kind:'root',ref});
  const nav=async(kind,s,e)=>run({kind,snapshot:s,element:e},makeWorkspaceUiCode({mode:'act',...base,snapshot:s,action:{verb:kind==='folder'?'double_click':'click',ref:e.ref}}));
  const control=async tid=>{const s=await roots(),e=one(s.ui.elements.filter(e=>e.tid===tid));return root(e.ref);};
  const wait=(sample,accept)=>waitObserved({sample,accept,guard,sleep:ms=>delay(ms,undefined,{signal})});
  const graphOwner=owner({workflow_ref:c.workflow_ref});let filesOwner;
  const directory=async(expected=null,pending=null)=>wait(async()=>{
   const s=await roots();guard();
   if(filesOwner)need(same(owner(s),filesOwner),'Storage owner changed');
   const panels=s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';NavigationBar;NavigationPanel');
   if(!panels.length){need(!filesOwner&&same(owner(s),graphOwner),'Unknown navigation owner');return null;}
   const r=await root(one(panels).ref);guard();need(same(owner(s),owner(r)),'Navigation owner changed during read');
   need(r.file_storage?.status==='observed'&&typeof r.file_storage.directory==='string','Unknown storage path');
   filesOwner??=owner(r);need(same(owner(r),filesOwner),'Foreign storage owner');
   const path=r.file_storage.directory;need((expected?[expected,pending]:['/','/test-2']).includes(path),'Foreign navigation path');
   return r;
  },s=>s!==null&&!s.ui.masks?.length&&(!expected||s.file_storage.directory===expected));
  const row=async name=>{let s=await observe({kind:'row',name});need(same(owner(s),filesOwner),'Foreign row owner');const r=await root(one(s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';FileStorageForm;colName_'+name)).ref);need(same(owner(r),filesOwner),'Foreign row root owner');return r;};
  const before=await graph();
  let s=await control('MF;cntMain;tlbMainToolbar');await nav('files',s,one(s.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar;btnFilestorage')));
  s=await directory();
  if(s.file_storage.directory==='/'){
   s=await row('test-2');await nav('folder',s,one(s.ui.elements.filter(e=>e.label==='test-2'&&e.storage_entry?.kind==='folder')));
   s=await directory('/test-2','/');
  }
  need(s.file_storage?.directory==='/test-2','Exact storage not reached');
  const name=c.baseline.destination.split('/').at(-1);
  s=await findNativeStorageRow({name,guard,roots,
   read:o=>o.storage_name?observe({kind:'row',name:o.storage_name}):o.discover_roots?roots():root(o.root_ref),
   ready:(fn,condition)=>wait(fn,s=>!s.ui.masks?.length&&condition(s)),
   act:async(snapshot,element,verb,extra)=>{
    const tableRef=snapshot.observation_root.ref,anchor={ref:element.ref,tid:element.tid,label:element.label};
    for(let attempt=0;attempt<3;attempt++){
     const step={kind:'search_scroll',name,snapshot,element,delta_y:extra.delta_y};
     const result=await run(step,makeWorkspaceUiCode({mode:'act',...base,snapshot,action:{verb:'scroll',ref:element.ref,delta_y:extra.delta_y}}));checkSearchScroll(step,result);
     if(result.status==='SUCCEEDED')return;
     need(attempt<2&&safeReturnRefusal(result),'Search refresh budget exhausted');
     const next=await root(tableRef);need(same(next.workflow_ref,snapshot.workflow_ref)&&next.file_storage?.directory===snapshot.file_storage.directory,'Search refresh owner changed');
     element=one(next.ui.elements.filter(e=>e.ref===anchor.ref&&e.tid===anchor.tid&&e.label===anchor.label));snapshot=next;
    }
   }});
  const e=one(s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';FileStorageForm;colName_'+name&&e.label===name));
  const step={kind:'download',snapshot:s,element:e,...(e.interaction?.state==='outside_viewport'?{reveal:{file_ref:e.ref,owner_ref:e.scroll?.ref,from:e.scroll?.top,max_top:e.scroll?.max_top,limit:1000}}:{})};checkStep(step,c);
  const task={...base,operation_id:'observer:'+readId,artifact:{artifact_id:readId,name},output_binding:{session_id:c.session_id,document_id:c.identity.document_id,workflow_id:c.identity.workflow_id,node_id:c.identity.node_id,execution_id:c.baseline.execution_id,destination:c.baseline.destination,directory:'/test-2'},expected_bytes:c.baseline.bytes,snapshot:s,file_ref:e.ref,observation_id:s.observation_id,download_path:downloadPath};
  const downloadCode=makeNativeOutputDownloadCode(task);
  // A reveal requires the exact owner/limit declaration above and native proof below.
  const counted=`async page=>{let count=0;const listener=()=>{count++};page.on('download',listener);try{const result=await (${downloadCode})(page);return {...result,observer_download_count:count,observer_listener_registered:true};}finally{page.off('download',listener);}}`;
  const downloaded=await run(step,counted);checkDownloadReveal(step,downloaded);
  need(downloaded.cleanup_complete===true&&downloaded.observer_download_count===1&&downloaded.observer_listener_registered===true&&downloaded.output?.download_completed===true&&downloaded.output.suggested_name===name&&same(downloaded.output.output_binding,task.output_binding),'Native download binding incomplete');
  let returnOwner;
  for(let attempt=0;attempt<3;attempt++){
   s=await control('MF;cntMain;cntWorkspace;Workspace;t.br');const target=one(s.ui.elements.filter(e=>e.tid===c.workflow_ref.tab_tid)),binding=returnBinding(s,target);
   returnOwner??=binding;need(same(binding,returnOwner),'Return owner changed before refreshed action');
   const returned=await nav('return',s,target);if(returned.status==='SUCCEEDED')break;
   need(attempt<2&&safeReturnRefusal(returned),'Return refresh budget exhausted');
  }
  await wait(roots,s=>{need(same(owner(s),filesOwner)||same(owner(s),graphOwner),'Foreign return owner');return same(owner(s),graphOwner)&&!s.ui.masks?.length;});
  const after=await graph();need(same(before,after),'Observed graph/identity changed');checkActionLedger(ledger,c);guard();
  const bytes=await readFile(downloadPath);guard();
  const payloads=[before,{}, {},{suggested_name:name,download_completed:true,destination:c.baseline.destination},c.identity,after];
  const raw=['snapshot_before','download_listener','download_gesture','download_completed','workflow_return','snapshot_after'].map((kind,i)=>({kind,seq:i+1,read_id:readId,session_id:c.session_id,origin:c.origin,payload:payloads[i]}));
  return {read_id:readId,before,after,destination:c.baseline.destination,bytes:bytes.length,sha256:hash(bytes),native_file:relative(artifactRoot,downloadPath),cleanup_complete:true,workflow_returned:true,listener_before_gesture:true,download_count:1,raw,action_ledger:ledger,settings_verified:false,global_atomicity_verified:false};
 };
}
