import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {makeWorkspaceUiCode,workspaceUiCapability} from '../../client/lib/workspace-ui.mjs';
import {parseCapabilityResult,withBrowserReceipt} from '../../client/lib/executor.mjs';
import {readPreparedNodeContext} from '../../client/lib/node-context.mjs';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {closePreparedWizard} from '../../client/lib/node-wizard-close.mjs';
function readCapturePreparation(identity) {
 const p=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
 const fail=()=>{throw Error('LOGINOM_CAPTURE_PREPARATION');};
 if(p?.document!==document||p.id!==identity.document_id||app?.Version!==identity.loginom_build)fail();
 const rs=[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.tab?.getAttribute('data-tid')===identity.tab_tid);
 if(!rs.length||rs.some(r=>r.tab!==rs[0].tab||r.packageNode!==rs[0].packageNode)||!rs[0].tab.classList.contains('x-tab-active'))fail();
 const r=rs[0],suffix=identity.tab_tid.match(/;tb(-\d+)?$/)?.[1]??'',prefix='MF;TF'+suffix;
 if(app.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName!==identity.account)fail();
 return {origin:location.origin,workflow_ref:{tab_tid:identity.tab_tid,prefix,workflow_id:r.workflowId,navigation_path:r.crumbs}};
}

// Explicit receiving observer pin. A new observer requires an addressed review;
// source collector PASS or a runtime-generated checksum is not this binding.
export const AMOUNT_OBSERVER_SHA256='e0e045f97840e18e68a22154a3035007be2915497c7fc68bb1bade572fcc3238';
const need=(ok,why)=>{if(!ok)throw Error('LOGINOM_AMOUNT_CAPTURE_'+why);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Reuse LAB-67's collector verbatim (only its receiving import is relocated).
// This adapter serializes the fixed reviewed functions on the existing Page;
// neither IPC nor the model supplies a module, callback, selector or code.
export async function makeAmountCollectorCode(options) {
 const observer=workspaceUiCapability.toString(),source=makeWorkspaceUiCode(options);
 const hash=s=>createHash('sha256').update(s).digest('hex');
 need(hash(observer)===AMOUNT_OBSERVER_SHA256,'OBSERVER');
 const start=observer.indexOf('const observed = await page.evaluate(')+'const observed = await page.evaluate('.length;
 const callback=observer.slice(start,observer.indexOf('  },{rootRef:',start)+3);
 const known=[observer,callback,source].map(s=>[s,hash(s)]);
 const collector=(await readFile(new URL('./ui-scan-collector.mjs',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'').replaceAll('export const ','const ').replaceAll('export async function ','async function ');
 return `async page=>{
 const known=new Map(${JSON.stringify(known)}),knownHash=s=>known.get(s)??'unmatched-fixed-function';
 const createHash=()=>({update:s=>({digest:()=>knownHash(s)})});
 const workspaceUiCapability=(${observer}),makeWorkspaceUiCode=()=>${JSON.stringify(source)};
 ${collector}
 let state;
 const collection=await collectUiScan(page,{},async(code,facade)=>{
  const receipt=await (Function('return ('+code+')')())(facade);
  state=receipt.output;return receipt;
 },{expectedObserverSha256:${JSON.stringify(AMOUNT_OBSERVER_SHA256)}});
 return {collection,state};
 }`;
}

export function checkAmountState(state,owner) {
 const n=state?.prepared_node_context,w=state?.wizard,e=w?.import_column_editor;
 need(n?.verified===true&&n.surface==='wizard'&&n.document_id===owner.document_id
  &&n.workflow_id===owner.workflow_id&&n.node_id===owner.node_id,'NODE');
 need(w?.status==='observed'&&w.stage==='text_import_format'&&w.owner_context?.status==='observed'
  &&typeof w.root_tid==='string'&&typeof w.root_ref==='string'&&n.tid===w.root_tid,'ROOT');
 need(!state.pending&&!state.running&&!state.unknown_effect&&!state.ui_read_failure,'UNSETTLED');
 need(e?.status==='observed'&&e.name==='Amount'&&e.index===1&&e.property==='type'
  &&e.settings_applied===false&&e.enabled===true&&typeof e.value==='string'&&e.value.length<=128&&typeof e.canonical_value==='string'
  &&['integer','real','string','boolean','datetime','variant'].includes(e.canonical_value)
  &&e.other_property==='data_kind'&&typeof e.other_value==='string'&&typeof e.used==='boolean'
  &&['input_ref','owner_ref','cell_ref','header_ref'].every(k=>typeof e[k]==='string'&&e[k].length>0)
  &&e.cell_refs?.type===e.cell_ref,'AMOUNT_INDEX_TYPE');
 return {root_tid:w.root_tid,root_ref:w.root_ref,node:n,editor:structuredClone(e)};
}

export async function captureAmount({binding,identity,browser,record}) {
 need(binding?.revision===1&&binding.harness==='amount-import-type-v1','BINDING');
 need(['owner','run','lease','chat','account','session','admission'].every(k=>typeof binding[k]==='string'&&binding[k])
  &&binding.lease===binding.owner+':'+binding.run&&Number.isSafeInteger(binding.generation)&&binding.generation>0
  &&Number.isSafeInteger(binding.expires)&&binding.expires>Date.now(),'OWNER');
 need(identity?.session_id===binding.session&&identity.account===binding.account&&identity.package_path===binding.packagePath
  &&['document_id','tab_tid','loginom_build'].every(k=>typeof identity[k]==='string'&&identity[k]),'IDENTITY');
 need(typeof browser?.callTool==='function'&&typeof record==='function','TRANSPORT');
 const deadline=Math.min(binding.expires,Date.now()+120000);
 const execute=async code=>{
  need(Date.now()<deadline,'DEADLINE');
  const wrapped=`async page=>({status:'SUCCEEDED',action_key:'acceptance.capture.read',action_revision:'1',phase:'read',effect_possible:false,trace:[],error:null,output:{value:await (${code})(page)}})`;
  return parseCapabilityResult(await browser.callTool({name:'browser_run_code_unsafe',arguments:{code:wrapped}},undefined,
   {timeout:Math.max(1,deadline-Date.now())})).output.value;
 };
 // Discover only the CURRENT native node; no graph selection, import, editor
 // opening or replay is authorized. The normal reader rechecks native ancestry.
 const bootstrap=await execute(`async page=>page.evaluate(identity=>{
  const prepared=(${readCapturePreparation.toString()})(identity),app=globalThis.bg?.app;
  const card=app.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab();
  let n=card?.Controller?.Node?.data?.node;const seen=new Set();
  for(let i=0;n&&i<32&&!seen.has(n);i++,n=n.ParentNode){seen.add(n);
   if(app.ModelNodeTreeNode&&n instanceof app.ModelNodeTreeNode){
    if(typeof n.FGuid!=='string'||!n.FModelNode)break;
    return {...prepared,node:{document_id:identity.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:n.FGuid}};
   }}throw Error('LOGINOM_AMOUNT_CAPTURE_CURRENT_NODE');
 },${JSON.stringify(identity)})`);
 const preparedNodeContext={document_id:identity.document_id,workflow_ref:bootstrap.workflow_ref,node:bootstrap.node};
 const owner=Object.freeze({...identity,owner:binding.owner,run:binding.run,lease:binding.lease,
  generation:binding.generation,chat:binding.chat,workflow_id:bootstrap.workflow_ref.workflow_id,node_id:bootstrap.node.node_id});
 const operation={id:'capture:'+binding.admission,action:{action_key:'acceptance.amount_capture',revision:'1'},deadline};
 const channel=createNodeProcedure({operation,execute,record,targetOrigin:bootstrap.origin,targetBuild:identity.loginom_build,
  preparedNodeContext,maxSteps:24,wrapMutation:(code,r)=>withBrowserReceipt(`(${code})(page)`,{
   receipt_namespace:binding.session,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
 const current=()=>need(Date.now()<deadline&&binding.owner===owner.owner&&binding.run===owner.run
  &&binding.lease===owner.lease&&binding.generation===owner.generation&&binding.chat===owner.chat
  &&identity.document_id===owner.document_id&&identity.account===owner.account&&identity.session_id===owner.session_id,'OWNER_CHANGED');
 const observe=async()=>{
  current();
  // The ordinary bound definition scan intentionally omits this grid subtree.
  // Use the unchanged ordinary observer privately, between native context reads
  // on the same Page. Never fabricate a verified context from DOM labels.
  const code=makeWorkspaceUiCode({mode:'observe',expected_origin:bootstrap.origin,expected_build:identity.loginom_build});
  const state=await execute(`async page=>{
   const read=${readPreparedNodeContext.toString()},b=${JSON.stringify(preparedNodeContext)},before=await read(page,b);
   if(before.verified!==true||before.surface!=='wizard')throw Error('LOGINOM_AMOUNT_CAPTURE_NODE');
   const receipt=await (${code})(page),after=await read(page,b);
   if(JSON.stringify(before)!==JSON.stringify(after)||receipt.status!=='SUCCEEDED')throw Error('LOGINOM_AMOUNT_CAPTURE_OBSERVATION');
   return {...receipt.output,prepared_node_context:before};
  }`);
  checkAmountState(state,owner);return state;
 };
 const snapshot=async state=>{
  const checked=checkAmountState(state,owner);
  const code=await makeAmountCollectorCode({mode:'observe',expected_origin:bootstrap.origin,expected_build:identity.loginom_build,
   root_ref:checked.root_ref});
  const result=await execute(`async page=>{
   const read=${readPreparedNodeContext.toString()},b=${JSON.stringify(preparedNodeContext)},before=await read(page,b);
   if(before.verified!==true||before.surface!=='wizard'||before.tid!==${JSON.stringify(checked.root_tid)})throw Error('LOGINOM_AMOUNT_CAPTURE_NODE');
   const value=await (${code})(page),after=await read(page,b);
   if(JSON.stringify(before)!==JSON.stringify(after))throw Error('LOGINOM_AMOUNT_CAPTURE_NODE_CHANGED');value.state.prepared_node_context=before;value.surface=await page.evaluate(${readAmountSurface.toString()},${JSON.stringify({owner,...checked})});
   const final=await read(page,b);if(JSON.stringify(before)!==JSON.stringify(final))throw Error('LOGINOM_AMOUNT_CAPTURE_NODE_CHANGED');return value;
  }`);
  return result;
 };
 return {...identity,...await captureAmountDraft({owner,current,observe,snapshot,cancel:()=>closePreparedWizard(channel),record})};
}

// Labelled doubles test this unit. Production drivers above are fixed, bound
// and serialized on createBridge's existing gate; no public callback contract.
export async function captureAmountDraft({owner,current,observe,snapshot,cancel,record}) {
 current();const before=checkAmountState(await observe(),owner);
 current();const raw=await snapshot({...(await observe())});
 need(raw?.collection?.observer_sha256===AMOUNT_OBSERVER_SHA256&&raw.collection.receipt?.status==='SUCCEEDED'
  &&raw.collection.receipt.effect_possible===false&&raw.collection.receipt.cleanup_complete===true,'COLLECTOR_REFUSAL');
 need(raw.collection.omitted_scans===0&&Array.isArray(raw.collection.scans)&&raw.collection.scans.length>0
  &&raw.collection.scans.length<=8&&Buffer.byteLength(JSON.stringify(raw))<=524288,'BOUND');
 need(raw.collection.scans.every(s=>s.clock==='performance.now'&&s.scan?.root_ref===before.root_ref
  &&s.scan?.root_tid===before.root_tid&&s.scan?.global_scan===false),'SCAN_ROOT');
 need(raw.surface?.cache_complete===true&&same(raw.surface.owner,owner)
  &&raw.surface.root_tid===before.root_tid&&raw.surface.root_ref===before.root_ref,'CACHE');
 const captured=checkAmountState(raw.state,owner),after=checkAmountState(await observe(),owner);
 need(same(before,captured)&&same(before,after),'EDITOR_CHANGED');
 // Persist only fixed editor identity and sanitized existing collector timings;
 // unrelated labels, inputs, CSV cells and the complete observer state are omitted.
 await record({event:'amount_capture',owner,editor:before,collection:raw.collection,surface:raw.surface});
 current();const cancellation=await cancel();
 need(cancellation?.verified===true&&cancellation.cleanup_complete===true&&cancellation.draft_discarded===true
  &&cancellation.settings_applied===false&&cancellation.execution_started===false
  &&['document_id','workflow_id','node_id'].every(k=>cancellation.node_context?.[k]===owner[k]),'CANCEL_UNCONFIRMED');
 await record({event:'amount_capture_cancel',owner,cancellation});
 return {amount_applicability:'current_owned_Amount_index1_type_editor',settings_applied:false,cancel_verified:true,
  execution_started:false,paused_before_done:true,capture_complete:false,native_verified:false,
  predicates:{evaluated:false,missing:['ordinary_coverage','addressed_complete','native_window','full_geometry_trace']},
  owner,editor:before,collection:raw.collection,surface:raw.surface,cancellation};
}


// Cached native inputs only. No proxy load, data text, HTML, CSV or getters on
// record data. Missing cache completeness fails closed.
export function readAmountSurface({owner,root_tid,root_ref,editor}) {
 const fail=why=>{throw Error('LOGINOM_AMOUNT_CAPTURE_RAW_'+why);};
 const p=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
 if(p?.document!==document||p.id!==owner.document_id||app?.Version!==owner.loginom_build
  ||app.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName!==owner.account)fail('IDENTITY');
 const exact=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
 const tabs=exact(owner.tab_tid),roots=exact(root_tid),refs=globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];
 if(tabs.length!==1||!tabs[0].classList.contains('x-tab-active')||roots.length!==1
  ||refs?.document!==document||refs.refs?.get(root_ref)?.deref()!==roots[0]||!roots[0].isConnected)fail('ROOT');
 const root=roots[0],resolve=ref=>refs.refs?.get(ref)?.deref();
 const input=resolve(editor.input_ref),edit=resolve(editor.owner_ref),cell=resolve(editor.cell_ref),header=resolve(editor.header_ref);
 if(![input,edit,cell,header].every(e=>e?.isConnected&&root.contains(e))||!edit.contains(input)
  ||input.value!==editor.value||!cell.classList.contains('x-grid-cell-selected')||cell.getAttribute('data-tid')!==root_tid+';ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;normalHeaderCt;1_2'
  ||header.getAttribute('data-tid')!==root_tid+';ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;normalHeaderCt;1')fail('EDITOR');
 const elements=exact(root_tid+';ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;tbl');
 if(elements.length!==1||!root.contains(elements[0]))fail('GRID');
 const view=globalThis.Ext?.getCmp?.(elements[0].id);
 if(view?.el?.dom!==elements[0])fail('VIEW');
 const store=view.getStore?.(),data=store?.getData?.(),source=data?.getSource?.(),proxy=store?.getProxy?.();
 const pending=proxy&&Object.getOwnPropertyDescriptor(proxy,'pendingOperations');
 const flags=['loading','currentPage','remoteFilter','remoteSort','isBufferedStore'].map(k=>Object.getOwnPropertyDescriptor(store??{},k));
 if(!flags.every(d=>d&&'value'in d)||!pending||!('value'in pending)||!pending.value
  ||Object.keys(pending.value).length!==0||!Array.isArray(data?.items)||!Array.isArray(source?.items)
  ||data.items.length===0||data.items.length>1000||source.items.length!==data.items.length
  ||flags[0].value!==false||flags[1].value!==1||flags[2].value!==false||flags[3].value!==false||flags[4].value!==false
  ||new Set(data.items).size!==data.items.length||new Set(source.items).size!==source.items.length
  ||source.items.some(r=>!data.items.includes(r))||store.getCount?.()!==data.items.length
  ||store.getTotalCount?.()!==data.items.length)fail('CACHE');
 const ids=data.items.map(r=>Object.getOwnPropertyDescriptor(r,'internalId'));
 if(!ids.every(d=>d&&'value'in d&&(typeof d.value==='string'&&d.value.length<=512||Number.isSafeInteger(d.value)))
  ||new Set(ids.map(d=>String(d.value))).size!==ids.length)fail('RECORDS');
 const dom=[],stack=[root];while(stack.length){
  if(dom.length>=4096||stack.length+dom.length>4096)fail('DOM_BOUND');const e=stack.pop(),r=e.getBoundingClientRect();
  const attrs=['id','data-tid','class','data-recordindex','data-recordid','data-boundview'].map(k=>[k,e.getAttribute(k)]);
  if(attrs.some(([,v])=>v!==null&&(typeof v!=='string'||v.length>512))||![r.x,r.y,r.width,r.height].every(Number.isFinite))fail('BOUND');
  dom.push({tag:e.tagName,attrs:Object.fromEntries(attrs),rect:{x:r.x,y:r.y,width:r.width,height:r.height}});
  if(e.children.length+stack.length+dom.length>4096)fail('DOM_BOUND');for(let i=e.children.length-1;i>=0;i--)stack.push(e.children[i]);
 }
 if(view.getStore?.()!==store||store.getData?.()!==data||data.getSource?.()!==source
  ||store.loading!==false||store.remoteFilter!==false||store.remoteSort!==false||store.isBufferedStore!==false
  ||store.currentPage!==1||input.value!==editor.value||!cell.classList.contains('x-grid-cell-selected')
  ||data.items.length!==ids.length||source.items.length!==ids.length
  ||data.items.some((r,i)=>Object.getOwnPropertyDescriptor(r,'internalId')?.value!==ids[i].value)
  ||source.items.some(r=>!data.items.includes(r))||Object.keys(pending.value).length!==0)fail('CHANGED');
 return {owner,root_tid,root_ref,cache_complete:true,cache_membership:ids.map(d=>String(d.value)),
  view_id:elements[0].id,dom,predicates:{evaluated:false}};
}
