import {createHash} from 'node:crypto';
import {makeCalculatorCaptureCode} from './calculator-capture-adapter.mjs';
import {parseCapabilityResult,withBrowserReceipt} from '../../client/lib/executor.mjs';
import {readGraph} from '../../client/lib/node-target-browser.mjs';
import {NODE_TYPES} from '../../client/lib/node-contracts.mjs';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {selectPreparedGraphNode} from '../../client/lib/node-graph-selection.mjs';
import {excludeOutputField} from '../../client/lib/port-mapping-procedure.mjs';
import {closePreparedWizard} from '../../client/lib/node-wizard-close.mjs';
import {readPreparedNodeContext} from '../../client/lib/node-context.mjs';

const need=(ok,message)=>{if(!ok)throw Error('LOGINOM_CAPTURE_'+message);};
export const CAPTURE_LIMITS=Object.freeze({bytes:524288,dom:4096,records:1000,string:512});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Private managed entry is the only production caller. No request-controlled
// parameters, scripts, selectors, finish mode, module path or test driver.
export async function captureCalculator({binding,identity,browser,record}) {
 need(binding?.revision===1&&binding.harness==='calculator-grouped-before-done-v1','BINDING');
 need(['owner','lease','run','admission','chat','account','session'].every(k=>typeof binding[k]==='string'&&binding[k].length>0)
  &&binding.lease===binding.owner+':'+binding.run&&Number.isSafeInteger(binding.generation)
  &&binding.generation>0&&binding.expires>Date.now(),'OWNER');
 need(identity?.session_id===binding.session&&identity.account===binding.account
  &&identity.package_path===binding.packagePath&&typeof identity.document_id==='string'
  &&typeof identity.tab_tid==='string'&&typeof identity.loginom_build==='string','IDENTITY');
 need(browser&&typeof browser.callTool==='function'&&typeof record==='function','TRANSPORT');
 const deadline=Math.min(binding.expires,Date.now()+120000);
 const execute=async code=>{
  need(Date.now()<deadline,'DEADLINE');
  // Preserve the exact existing browser/serial gate supplied by createBridge.
  // Wrap values for the ordinary typed capability decoder; no second client.
  const wrapped=`async page=>({status:'SUCCEEDED',action_key:'acceptance.capture.read',action_revision:'1',phase:'read',effect_possible:false,trace:[],error:null,output:{value:await (${code})(page)}})`;
  return parseCapabilityResult(await browser.callTool({name:'browser_run_code_unsafe',arguments:{code:wrapped}},undefined,
   {timeout:Math.max(1,deadline-Date.now())})).output.value;
 };
 const bootstrap=await execute(`async page=>page.evaluate(${readCapturePreparation.toString()},${JSON.stringify(identity)})`);
 const request={document_id:identity.document_id,workflow_ref:bootstrap.workflow_ref};
 const graph=await execute(`async page=>(${readGraph.toString()})(page,${JSON.stringify({request,types:NODE_TYPES,origin:bootstrap.origin,build:identity.loginom_build})})`);
 need(graph.complete===true,'GRAPH');
 // Explicit fixed diagnostic label prevents silently picking another node.
 const nodes=graph.nodes.filter(n=>n.type==='transform.calculator'&&n.label==='LAB66CaptureCalculator');
 need(nodes.length===1,'DIAGNOSTIC_CALCULATOR_REQUIRED');
 const preparedNodeContext={document_id:identity.document_id,workflow_ref:bootstrap.workflow_ref,node:nodes[0].ref};
 const operation={id:'capture:'+binding.admission,action:{action_key:'acceptance.calculator_capture',revision:'1'},deadline};
 const channel=createNodeProcedure({operation,execute,record,targetOrigin:bootstrap.origin,targetBuild:identity.loginom_build,
  preparedNodeContext,maxSteps:128,wrapMutation:(code,r)=>withBrowserReceipt(`(${code})(page)`,{
   receipt_namespace:binding.session,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
 const owner=Object.freeze({...identity,owner:binding.owner,lease:binding.lease,run:binding.run,
  generation:binding.generation,chat:binding.chat,workflow_id:bootstrap.workflow_ref.workflow_id,node_id:nodes[0].ref.node_id});
 const current=()=>need(binding.expires>Date.now()&&identity.session_id===binding.session
  &&identity.document_id===owner.document_id&&identity.account===owner.account&&identity.package_path===owner.package_path
  &&binding.owner===owner.owner&&binding.lease===owner.lease&&binding.run===owner.run
  &&binding.generation===owner.generation&&binding.chat===owner.chat,'OWNER_CHANGED');
 const observe=async()=>{
  current();
  const s=await channel.observe({condition:'fixed Calculator output mapping capture',readMappings:true,
   ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
  return s;
 };
 const snapshot=async state=>execute(`async page=>{
  const read=${readPreparedNodeContext.toString()},binding=${JSON.stringify(preparedNodeContext)};
  const before=await read(page,binding);
  if(before.verified!==true||before.surface!=='wizard'||before.document_id!==binding.document_id
   ||before.node_id!==binding.node.node_id||before.workflow_id!==binding.workflow_ref.workflow_id
   ||before.tid!==${JSON.stringify(state.wizard.root_tid)})throw Error('LOGINOM_CAPTURE_RAW_NODE');
  const value=await (${makeCalculatorCaptureCode({owner,root_tid:state.wizard.root_tid,root_ref:state.wizard.root_ref,limits:CAPTURE_LIMITS})})(page);
  const after=await read(page,binding);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('LOGINOM_CAPTURE_RAW_NODE_CHANGED');
  return value;
 }`);
 // Any uncertain step rejects outwards. The bridge retains the original owner
 // and pending journal; finally must not blindly cancel an unknown effect.
 const selected=await channel.observe({condition:'owned diagnostic Calculator graph',ready:s=>
  s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'&&s.wizard?.status==='absent'});
 current();await selectPreparedGraphNode(channel,selected,'fixed diagnostic Calculator selection');
 current();await channel.openOutputPort(0);
 const receipt=await captureDraft({owner,current,observe,snapshot,
  exclude:source=>excludeOutputField(channel,source),cancel:()=>closePreparedWizard(channel),record});
 return {...identity,...receipt};
}

// Small orchestration unit tested with labelled drivers; captureCalculator above
// always supplies the real guarded channel. These doubles are not native PASS.
export async function captureDraft({owner,current,observe,snapshot,exclude,cancel,record}) {
 const checked=state=>{
  current();const n=state.prepared_node_context,w=state.wizard,m=state.node_mapping;
  need(n?.verified===true&&n.surface==='wizard'&&n.document_id===owner.document_id&&n.node_id===owner.node_id
   &&n.workflow_id===owner.workflow_id,'NODE_CHANGED');
  need(w?.status==='observed'&&w.stage==='output_mapping'&&typeof w.root_tid==='string'&&typeof w.root_ref==='string','ROOT');
  need(m?.verified===true&&m.inventory_complete===true&&m.source_identity_verified===true
   &&m.mapping_wizard==='DerivedDataSourceOutputSocketWizard','MAPPING');
  need(!state.pending&&!state.running&&!state.unknown_effect,'UNSETTLED');
  const fields=m.target_fields;need(Array.isArray(fields)&&fields.length<=CAPTURE_LIMITS.records,'RECORD_BOUND');
  const matches=fields.filter(f=>f.name==='Region');need(matches.length===1,'REGION');
  return {state,region:matches[0],root_tid:w.root_tid,root_ref:w.root_ref};
 };
 let before,after,baseline,changed,failure,failed=false,mutationUnconfirmed=false;
 try {
  baseline=checked(await observe());
  need(baseline.region.excluded===false&&baseline.region.source?.record_id,'REGION_ALREADY_EXCLUDED');
  before=await snapshot(baseline.state);validateCapture(before,owner,baseline);
  await record({event:'calculator_capture_before',owner,capture:before});
  current();
  mutationUnconfirmed=true;const edit=await exclude(baseline.region.source.record_id);
  need(edit?.verified===true&&edit.cleanup_complete===true&&edit.settings_applied===false,'EXCLUSION_UNCONFIRMED');
  mutationUnconfirmed=false;changed=checked(await observe());
  need(changed.root_tid===baseline.root_tid&&changed.root_ref===baseline.root_ref,'ROOT_CHANGED');
  need(changed.region.excluded===true&&changed.region.exclusion_source?.record_id===baseline.region.source.record_id
   &&changed.region.exclusion_source?.field_id===baseline.region.source.field_id,'REGION_CHANGED');
  // Exclusion legitimately replaces the target record. Preserve both IDs and
  // require the original source record/field identity via normal native proof.
  after=await snapshot(changed.state);validateCapture(after,owner,changed);
  await record({event:'calculator_capture_after',owner,capture:after});
 }catch(error){failure=error;failed=true;}
 // Refuse cancellation after an uncertain mutation or identity loss. For a
 // pure capture error on a still-owned draft, cancellation remains authorized.
 if(mutationUnconfirmed)throw failure;
 const safe=checked(await observe());
 if(baseline)need(safe.root_tid===baseline.root_tid&&safe.root_ref===baseline.root_ref,'CANCEL_ROOT_CHANGED');
 current();const cancellation=await cancel();
 need(cancellation?.verified===true&&cancellation.cleanup_complete===true&&cancellation.draft_discarded===true
  &&cancellation.settings_applied===false&&cancellation.execution_started===false
  &&cancellation.node_context?.document_id===owner.document_id&&cancellation.node_context?.node_id===owner.node_id
  &&cancellation.node_context?.workflow_id===owner.workflow_id,'CANCEL_UNCONFIRMED');
 await record({event:'calculator_capture_cancel',owner,cancellation});
 if(failed)throw failure; // Preserve Error and all falsy rejection values exactly.
 return {settings_applied:false,cancel_verified:true,execution_started:false,paused_before_done:true,
  capture_complete:false,missing:['ordinary_coverage','addressed_complete','native_window','full_geometry_trace'],
  before,after,region_transition:{source:baseline.region.source,before:baseline.region,after:changed.region},cancellation,
  native_verified:false};
}

export function validateCapture(capture,owner,state) {
 need(capture&&equal(capture.owner,owner)&&capture.root_tid===state.root_tid&&capture.root_ref===state.root_ref,'CAPTURE_IDENTITY');
 need(Array.isArray(capture.dom)&&capture.dom.length<=CAPTURE_LIMITS.dom
  &&Array.isArray(capture.stores)&&capture.stores.length===2,'CAPTURE_BOUND');
 need(capture.stores.every(s=>Array.isArray(s.records)&&s.records.length<=CAPTURE_LIMITS.records),'RECORD_BOUND');
 const matches=capture.stores[1].records.filter(r=>String(r.internalId)===state.region.record_id
  &&r.data?.Name==='Region');
 need(matches.length===1,'RAW_REGION_CHANGED');
 need(Buffer.byteLength(JSON.stringify(capture))<=CAPTURE_LIMITS.bytes,'BYTE_BOUND');
 need(capture.collector_revision===1&&capture.predicates?.status==='partial'&&capture.predicates.evaluated===false,'PREDICATE_CLAIM');
 need(capture.predicates.cached_windows?.length===2&&capture.predicates.cached_windows.every(p=>p.evaluated===true&&p.value===true),'CACHED_WINDOW');
 return createHash('sha256').update(JSON.stringify(capture)).digest('hex');
}

export function readCapturePreparation(identity) {
 const p=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
 const fail=()=>{throw Error('LOGINOM_CAPTURE_PREPARATION');};
 if(p?.document!==document||p.id!==identity.document_id||app?.Version!==identity.loginom_build)fail();
 const rs=[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.tab?.getAttribute('data-tid')===identity.tab_tid);
 if(!rs.length||rs.some(r=>r.tab!==rs[0].tab||r.packageNode!==rs[0].packageNode)||!rs[0].tab.classList.contains('x-tab-active'))fail();
 const r=rs[0],suffix=identity.tab_tid.match(/;tb(-\d+)?$/)?.[1]??'',prefix='MF;TF'+suffix;
 if(app.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName!==identity.account)fail();
 return {origin:location.origin,workflow_ref:{tab_tid:identity.tab_tid,prefix,workflow_id:r.workflowId,navigation_path:r.crumbs}};
}

// Bounded read-only raw inputs, independently serialized on the SAME Page.
// No predicate emulation, HTML/text dump, dataset/server calls or native loads.
export function readCaptureSurface({owner,root_tid,root_ref,limits}) {
 const fail=m=>{throw Error('LOGINOM_CAPTURE_'+m);};
 const p=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
 if(p?.document!==document||p.id!==owner.document_id||app?.Version!==owner.loginom_build
  ||app.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName!==owner.account)fail('RAW_IDENTITY');
 const exact=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
 const tabs=exact(owner.tab_tid);
 if(tabs.length!==1||!tabs[0].classList.contains('x-tab-active'))fail('RAW_TAB');
 const roots=exact(root_tid);if(roots.length!==1)fail('RAW_ROOT');
 const root=roots[0],ids=new WeakMap();let seq=0;
 const id=o=>{if(!o||typeof o!=='object')return null;if(!ids.has(o))ids.set(o,++seq);return ids.get(o);};
 const scalar=v=>{if(v===undefined)return {missing:true};if(v===null||typeof v==='boolean')return v;
  if(typeof v==='number'){if(!Number.isFinite(v))fail('FINITE');return v;}
  if(typeof v==='string'){if(new TextEncoder().encode(v).length>limits.string)fail('STRING_BOUND');return v;}return {object_id:id(v)};};
 const own=(o,k)=>{const d=o&&Object.getOwnPropertyDescriptor(o,k);return !d?{missing:true}:!('value'in d)?{accessor_not_read:true}:scalar(d.value);};
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,
  clientWidth:e.clientWidth,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight,scrollLeft:e.scrollLeft,scrollTop:e.scrollTop};};
 const dom=[],stack=[root];while(stack.length){
  if(dom.length>=limits.dom)fail('DOM_BOUND');const e=stack.pop();
  dom.push({id:id(e),parent_id:id(e.parentElement),tag:e.tagName,
   attrs:Object.fromEntries(['id','data-tid','data-recordindex','data-recordid','data-boundview'].map(k=>[k,scalar(e.getAttribute(k))])),rect:rect(e)});
  // Charge before allocating a child list; reject rather than truncate.
  if(e.children.length+stack.length+dom.length>limits.dom)fail('DOM_BOUND');
  for(let i=e.children.length-1;i>=0;i--)stack.push(e.children[i]);
 }
 const stores=['grdSourceColumns;tbl','grdTargetColumns;tbl'].map(suffix=>{
  const candidates=root.querySelectorAll('[data-tid$='+JSON.stringify(';'+suffix)+']');
  if(candidates.length!==1)fail('GRID');const element=candidates[0],view=globalThis.Ext?.getCmp?.(element.id);
  if(view?.el?.dom!==element)fail('GRID_BINDING');
  // These are the same cached UI accessors used by the native mapping reader.
  const store=view.getStore?.(),data=store?.getData?.(),source=data?.getSource?.(),proxy=store?.getProxy?.();
  if(!Array.isArray(data?.items)||data.items.length>limits.records||source&&(!Array.isArray(source.items)||source.items.length>limits.records))fail('CACHE_BOUND');
  const records=data.items.map(r=>({object_id:id(r),internalId:own(r,'internalId'),data_id:id(r.data),
   data:Object.fromEntries(['ID','Index','Name','DisplayName','DataType','GroupField','DataKind','Required','Broken','IsDerived','SourceDisplayName','SourceName','ConnectedRecord'].map(k=>[k,own(r.data,k)]))}));
  const pending=proxy&&Object.getOwnPropertyDescriptor(proxy,'pendingOperations');
  const pendingKeys=pending&&'value'in pending&&pending.value?Object.keys(pending.value):null;
  if(pendingKeys&&pendingKeys.length>limits.records)fail('PENDING_BOUND');
  return {element_id:id(element),view_id:id(view),store_id:id(store),data_id:id(data),source_id:id(source),proxy_id:id(proxy),
   flags:Object.fromEntries(['$className','isBufferedStore','loading','currentPage','remoteFilter','remoteSort','totalCount'].map(k=>[k,own(store,k)])),
   cached_reads:{count:scalar(store.getCount?.()),total:scalar(store.getTotalCount?.()),loading:scalar(store.isLoading?.()),
    remoteFilter:scalar(store.getRemoteFilter?.()),remoteSort:scalar(store.getRemoteSort?.())},
   proxy_class:own(proxy,'$className'),pendingKeys:pendingKeys?.map(scalar)??null,
   source_membership:source?.items.map(id)??null,cache_membership:data.items.map(id),records};
 });
 const result={owner,root_tid,root_ref,dom,stores,predicates:{status:'not_instrumented',evaluated:false,
  missing:['ordinary_coverage','addressed_complete','native_window','full_geometry_trace']}};
 if(new TextEncoder().encode(JSON.stringify(result)).length>limits.bytes)fail('BYTE_BOUND');
 return result;
}
