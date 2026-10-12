import {validatePreparedNodeContext,readPreparedNodeContext} from './node-context.mjs';
import {makeWorkspaceUiCode} from './workspace-ui.mjs';
// Private diagnostic consumer, not a host entry or native capture authorization.
// Runtime registration/admission/current-resource gates remain with LAB-68.
export function makeReplacementCaptureCode(request){
 const keys=['binding','account','package_path','origin','build','port_guid','opening_operation_id'];
 if(!request||Object.keys(request).some(k=>!keys.includes(k)&&k!=='output_column_page')||keys.some(k=>!Object.hasOwn(request,k)))throw Error('EXACT_REPLACEMENT_CAPTURE_REQUEST_REQUIRED');
 validatePreparedNodeContext(request.binding);
 for(const k of ['account','package_path','origin','build','port_guid','opening_operation_id'])if(typeof request[k]!=='string'||!request[k]||request[k].length>2048)throw Error('REPLACEMENT_CAPTURE_IDENTITY_REQUIRED');
 if(new URL(request.origin).origin!==request.origin||!request.package_path.startsWith('/'+request.account+'/')||!request.package_path.endsWith('.lgp'))throw Error('OWN_REPLACEMENT_CAPTURE_PATH_REQUIRED');
 const pinned=structuredClone(request);
 const observe=makeWorkspaceUiCode({mode:'observe',prepared_node_context:pinned.binding,expected_origin:pinned.origin,expected_build:pinned.build,...(Object.hasOwn(pinned,'output_column_page')?{output_column_page:pinned.output_column_page}:{})});
 return `async page=>(${readReplacementCapture.toString()})(page,${JSON.stringify(pinned)},${readPreparedNodeContext.toString()},${observe},${readCaptureIdentity.toString()},${readOwnedMappingCapture.toString()})`;
}
async function readReplacementCapture(page,request,readNode,observe,readIdentity,readGeometry){
 const gates={host_registration:'not_verified',original_owner:'not_verified',current_resources:'not_verified',deadline_pending_dirty:'not_verified',same_owner_cleanup:'not_verified',native_semantic_mapping:'not_verified'};
 const refuse=(reason,details={})=>({status:'NOT_APPLIED',effect_possible:false,reason,native_capture_admitted:false,gates,...details});
 const exact=n=>n?.verified===true&&n.surface==='wizard'&&n.document_id===request.binding.document_id&&n.workflow_id===request.binding.workflow_ref.workflow_id&&n.node_id===request.binding.node.node_id&&n.tid===request.binding.workflow_ref.prefix+';WizrdMCF'&&n.input_port?.direction==='input'&&n.input_port.port===0&&n.input_port.native_index===0&&n.input_port.port_guid===request.port_guid&&n.input_port.opening_operation_id===request.opening_operation_id&&!n.output_port;
 const identity=i=>i?.verified===true&&i.account===request.account&&i.package_path===request.package_path&&i.origin===request.origin&&i.build===request.build;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 // Exceptions/rejected values propagate unchanged; this recipe never retries a read.
 const before=await readNode(page,request.binding);if(!exact(before))return refuse('replacement_capture_native_binding',{native_before:before});
 const nativeIdentity=await page.evaluate(readIdentity,request.binding);if(!identity(nativeIdentity))return refuse('replacement_capture_identity');
 const observation=await observe(page);
 if(observation.status!=='SUCCEEDED'||observation.effect_possible!==false)return refuse('replacement_capture_observer',{observation});
 const s=observation.output,w=s?.wizard;
 if(!exact(s?.prepared_node_context)||!same(before,s.prepared_node_context))return refuse('replacement_capture_observer_proof',{native_before:before,observation});
 if(w?.status!=='observed'||w.stage!=='input_mapping'||w.root_tid!==before.tid||w.input_port_context?.status!=='observed'||w.input_port_context.direction!=='input'||(w.input_port_context.port_index!==null&&w.input_port_context.port_index!==0)||!s.dom_epoch)return refuse('replacement_capture_mapping_context',{observation});
 const raw=await page.evaluate(readGeometry,{root:before.tid,epoch:s.dom_epoch});
 if(raw?.verified!==true)return refuse('replacement_capture_raw',{raw});
 const after=await readNode(page,request.binding),afterIdentity=await page.evaluate(readIdentity,request.binding);
 if(!exact(after)||!same(before,after)||!identity(afterIdentity)||!same(nativeIdentity,afterIdentity))return refuse('replacement_capture_changed');
 const final=await observe(page);
 if(!exact(final.output?.prepared_node_context)||!same(after,final.output.prepared_node_context)||!same(s.prepared_node_context,final.output.prepared_node_context))return refuse('replacement_capture_final_proof',{native_before:before,native_after:after,observation,final_observation:final});
 if(final.status!=='SUCCEEDED'||final.effect_possible!==false||!same(s.dom_epoch,final.output?.dom_epoch)||!same(s.wizard,final.output?.wizard)||!same(s.package_identity,final.output?.package_identity))return refuse('replacement_capture_observation_changed');
 return {status:'DIAGNOSTIC_READ',effect_possible:false,native_capture_admitted:false,gates,requested_page:request.output_column_page??null,native_before:before,native_after:after,identity:nativeIdentity,observation,raw,final_observation:final};
}
function readCaptureIdentity(binding){
 const p=globalThis.__loginomDockPreparationV1,m=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
 const rs=p?.document===document&&p.id===binding.document_id?[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===binding.workflow_ref.workflow_id):[];
 if(!rs.length||!rs[0].packageNode||rs.some(r=>r.packageNode!==rs[0].packageNode))return {verified:false};
 return {verified:true,account:m?.FServerConnection?.UserName,package_path:rs[0].packageNode.PackageFileName,origin:location.origin,build:globalThis.bg?.app?.Version};
}
function readOwnedMappingCapture({root,epoch}){
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')],roots=exact(root);
 if(roots.length!==1||!roots[0].isConnected)return {verified:false,reason:'root'};
 const owner=roots[0],stem=root+';TuneDataSourceMappingWizard;',tid=e=>e.getAttribute('data-tid'),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
 const style=e=>{const s=getComputedStyle(e);return {display:s.display,visibility:s.visibility,opacity:s.opacity,transform:s.transform};};
 const node=e=>({tid:tid(e),id:e.id||e.getAttribute('id'),tag:e.tagName,rect:rect(e),style:style(e)});
 const scroll=e=>Object.fromEntries(['clientWidth','clientHeight','scrollWidth','scrollHeight','scrollLeft','scrollTop'].map(k=>[k,typeof e[k]==='number'&&Number.isFinite(e[k])?e[k]:null]));
 const all=[...owner.querySelectorAll('[data-tid]')];if(all.length>3000)return {verified:false,reason:'budget'};
 const grids=[];
 for(const e of all.filter(e=>/^grd(Source|Target)Columns(?:;tbl)?$/.test((tid(e)??'').slice(stem.length))&&(tid(e)??'').startsWith(stem))){
  const containers=[...e.querySelectorAll('.x-grid-item-container')],rows=[...e.querySelectorAll('table.x-grid-item')];
  if(rows.length>1000)return {verified:false,reason:'row_budget'};
  const c=globalThis.Ext?.getCmp?.(e.id),view=c?.getView?.(),store=c?.getStore?.(),data=store?.getData?.(),records=data?.items;
  const storeCapture=Array.isArray(records)&&records.length<=1000&&c?.el?.dom===e?{bound:true,count:store.getCount?.(),total:store.getTotalCount?.(),loading:store.isLoading?.(),buffered:store.isBufferedStore===true,currentPage:store.currentPage,view_id:view?.el?.dom?.id,source_count:data.getSource?.()?.items?.length,records:records.map(r=>({id:String(r.internalId??''),model:r.isModel===true,values:Object.fromEntries(['Index','Name','DisplayName','DataType','DataKind','UsageType'].map(k=>[k,['string','number','boolean'].includes(typeof r.data?.[k])?r.data[k]:null]))}))}:{bound:false,reason:'store_binding_unobserved'};
  grids.push({...node(e),scroll:scroll(e),containers:containers.map(c=>({...node(c),scroll:scroll(c)})),store:storeCapture,rows:rows.map(r=>({...node(r),index:r.getAttribute('data-recordindex'),boundview:r.getAttribute('data-boundview'),container_owned:containers.some(c=>r.parentElement===c),cells:[...r.querySelectorAll('[data-tid]')].map(c=>({...node(c),row_owned:c.closest('table')===r,text:String(c.textContent??'').slice(0,240),icons:[...c.querySelectorAll('[class*="bg-TBGDataType-dt"]')].map(i=>({class:i.getAttribute('class'),rect:rect(i)}))}))}))});
 }
 const controls=all.filter(e=>(tid(e)??'').startsWith(stem)&&/;(rbTable|rbLinks|SourceFilter|TargetFilter|SourceFilter;InputEl|TargetFilter;InputEl|btnAutoSyncThroughColumns)$/.test(tid(e))).map(e=>({...node(e),value:e.tagName==='INPUT'&&/Filter;InputEl$/.test(tid(e))?String(e.value??'').slice(0,240):null,checked:e.classList.contains('x-form-cb-checked'),pressed:e.classList.contains('x-btn-pressed')}));
 const svgs=[...owner.querySelectorAll('svg')];if(svgs.length>8)return {verified:false,reason:'svg_budget'};
 const svg=svgs.map(e=>({...node(e),paths:[...e.querySelectorAll('path')].slice(0,129).map(p=>{const m=p.getScreenCTM?.();return {...node(p),d:String(p.getAttribute('d')??'').slice(0,4096),ctm:m?Object.fromEntries(['a','b','c','d','e','f'].map(k=>[k,Number.isFinite(m[k])?m[k]:null])):null};})}));
 if(svg.some(s=>s.paths.length>128))return {verified:false,reason:'path_budget'};
 return {verified:true,root:node(owner),epoch,viewport:{width:innerWidth,height:innerHeight},controls,grids,svg,semantic_connections_verified:false};
}
