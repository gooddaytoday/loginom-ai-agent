// Fixed private read-only resource. Routing/opaque authority/gates belong to host.
// Cached native objects and Ext fields only: never open, configure, save or run.
export const IMPORT_RESOURCE_REVISION=1;
const harness='import-before-configure-v1';
export async function captureImport({binding,identity,browser,record}) {
 const need=(v,r)=>{if(!v)throw Error('LOGINOM_IMPORT_OBSERVATION_'+r);};
 need(binding?.revision===1&&binding.harness===harness,'BINDING');
 need(['owner','run','lease','chat','account','session','admission'].every(k=>typeof binding[k]==='string'&&binding[k])
  &&binding.lease===binding.owner+':'+binding.run&&Number.isSafeInteger(binding.generation)&&binding.generation>0
  &&Number.isSafeInteger(binding.expires)&&binding.expires>Date.now(),'OWNER');
 need(identity?.session_id===binding.session&&identity.account===binding.account&&identity.package_path===binding.packagePath
  &&['document_id','tab_tid','loginom_build'].every(k=>typeof identity[k]==='string'&&identity[k])&&identity.loginom_build==='7.4.2','IDENTITY');
 need(typeof browser?.callTool==='function'&&typeof record==='function','TRANSPORT');
 const retained={...binding},expected={...identity};
 const code=`async page=>page.evaluate(${readImportSurface.toString()},${JSON.stringify(expected)})`;
 const response=await browser.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:Math.max(1,binding.expires-Date.now())});
 need(Date.now()<retained.expires&&Object.keys(retained).every(k=>retained[k]===binding[k])
  &&Object.keys(expected).every(k=>expected[k]===identity[k]),'OWNER_OR_DEADLINE_CHANGED');
 need(!response?.isError,'READ_FAILED');
 const values=(response?.content??[]).filter(b=>b.type==='text').flatMap(b=>{try{return [JSON.parse(b.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1]??b.text)];}catch{return [];}});
 need(values.length===1&&values[0]?.revision===1&&values[0].harness===harness&&values[0].document_id===expected.document_id
  &&values[0].session_id===expected.session_id&&values[0].account===expected.account
  &&['PARTIAL','REFUSED'].includes(values[0].status)&&values[0].complete===false&&values[0].settings_applied===false,'RESULT');
 // Await caller's durable journal; persistence failure propagates, never a mint.
 await record({event:'fixed_import_preconfigure_observation',binding_admission:retained.admission,result:values[0]});
 need(Date.now()<retained.expires&&Object.keys(retained).every(k=>retained[k]===binding[k])&&Object.keys(expected).every(k=>expected[k]===identity[k]),'DEADLINE_AFTER_RECORD');
 return values[0];
}

// Exported for source/actual serialization tests, not a production entry/router.
export function readImportSurface(o) {
 const result={revision:1,harness:'import-before-configure-v1',session_id:o.session_id,document_id:o.document_id,account:o.account,
  status:'REFUSED',complete:false,settings_applied:false,effect_possible:false,observed_at:new Date().toISOString(),missing:[],
  node:null,output0:{status:'unknown'},source:{},format:{},columns:{status:'unknown',fields:[]},
  activity:{status:'unknown'},freshness:{status:'unknown',execution_verified:false},close_authority:false};
 const refuse=reason=>({...result,status:'REFUSED',reason,node:null,source:{},format:{},columns:{status:'unknown',fields:[]},output0:{status:'unknown'}});
 const p=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
 if(p?.document!==document||p.id!==o.document_id||app?.Version!==o.loginom_build)return refuse('DOCUMENT_OR_BUILD');
 const main=app.Application?.FInstance?.FMainForm,map=main?.FMapTree,connection=map?.FServerConnection;
 if(connection?.Connected!==true||connection.UserName!==o.account)return refuse('ACCOUNT');
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const tabs=exact(o.tab_tid),receipts=p.receipts instanceof Map?[...p.receipts.values()].filter(r=>{
  try{return r.phase==='verified'&&JSON.parse(r.request).session===o.session_id&&r.tab===tabs[0];}catch{return false;}
 }):[];
 if(tabs.length!==1||!tabs[0].classList.contains('x-tab-active')||!receipts.length
  ||receipts.some(r=>r.packageNode!==receipts[0].packageNode||r.workflowId!==receipts[0].workflowId))return refuse('PREPARATION');
 const card=main.Items?.Workspace?.getActiveTab();
 let current=card?.Controller?.Node?.data?.node,node,workflow,pack;const seen=new Set();
 for(let i=0;current&&i<32&&!seen.has(current);i++,current=current.ParentNode){
  seen.add(current);
  if(app.ModelNodeTreeNode&&current instanceof app.ModelNodeTreeNode)node=current;
  if(app.WorkFlowTreeNode&&current instanceof app.WorkFlowTreeNode)workflow=current;
  if(app.PackageTreeNode&&current instanceof app.PackageTreeNode){pack=current;break;}
 }
 const normalized=v=>typeof v==='string'?'/'+v.replaceAll('\\','/').replace(/^\/+/, ''):null;
 if(pack!==receipts[0].packageNode||normalized(pack?.PackageFileName)!==o.package_path
  ||workflow!==receipts[0].nodeTargetWorkflowNode)return refuse('PACKAGE_OR_WORKFLOW');
 const roles={'e78dbebd-942a-4ef4-ac45-654eec157c31':'operations','6774e6c2-a207-4293-b7ea-8db76e168f98':'details'};
 if(map.HasRunningNodes()!==false||pack.HasRunningNodes()!==false)return refuse('RUNNING_OR_UNKNOWN');
 const model=card.Controller?.FController;
 const suffix=o.tab_tid.match(/;tb(-\d+)?$/)?.[1]??'',prefix='MF;TF'+suffix;
 if(app.ModelForm&&model instanceof app.ModelForm){
  const diagram=model.FDiagram,graph=diagram?.FmxGraph,roots=exact(prefix+';ModelForm;cmpDiagram'),nodes=diagram?.FNodes?.FCollection;
  if(roots.length!==1||graph?.container!==roots[0]||!Array.isArray(nodes)||nodes.length>200)return refuse('GRAPH_OWNER');
  const imports=[];
  for(const [guid,role] of Object.entries(roles)){
   const matches=nodes.filter(n=>n.FGuid===guid);
   if(matches.length!==1||matches[0].FIconCls!=='bg-vendor-icon-importtextfile')return refuse('FIXED_IMPORT_GUID_OR_TYPE');
   const n=matches[0],body=graph.view.getState(n.FCell)?.shape?.node,tid=body?.getAttribute('data-tid');
   if(!body||!roots[0].contains(body)||!tid?.startsWith(prefix+';Graph;'))return refuse('GRAPH_NODE_DOM');
   const candidates=[];
   for(const group of n.FPorts??[])for(const port of group.FCollection??[]){
    const dom=graph.view.getState(port.FCell)?.shape?.node;
    if(dom?.getAttribute('data-tid')===tid+';Output_Data-0'&&roots[0].contains(dom)&&port.parent===n
     &&port.FCell.parent===n.FCell&&port.data&&typeof port.FGuid==='string'&&port.FGuid)candidates.push(port);
   }
   imports.push({role,node_id:guid,component:'imports.text',workflow_id:receipts[0].workflowId,
    output0:candidates.length===1?{status:'observed_native_binding',node_id:guid,port:0,port_guid:candidates[0].FGuid}:{status:'unknown'},
    settings:{status:'unknown',reason:'wizard_not_open'},activity:{status:'unknown'},freshness:{status:'unknown',execution_verified:false}});
  }
  if(main.Items.Workspace.getActiveTab()!==card||card.Controller.FController!==model||model.FDiagram!==diagram
   ||map.FServerConnection!==connection||connection.Connected!==true||connection.UserName!==o.account
   ||p.document!==document||p.id!==o.document_id||map.HasRunningNodes()!==false||pack.HasRunningNodes()!==false)return refuse('GRAPH_CHANGED');
  return {...result,status:'PARTIAL',reason:'GRAPH_IDENTITY_ONLY',imports,missing:['settings','activity','execution_freshness']};
 }
 if(!node?.FModelNode||!Object.hasOwn(roles,node.FGuid))return refuse('FIXED_IMPORT_GUID');
 if(model?.constructor?.name!=='WizardModelComponentForm'||model.FModelNode!==node.FModelNode)return refuse('NATIVE_WIZARD_OWNER');
 const roots=exact(prefix+';WizrdMCF');
 if(roots.length!==1||model.getEl?.()?.dom!==roots[0])return refuse('WIZARD_ROOT');
 const root=roots[0];
 const markers=['ImportTextFilePreviewWizard','ImportTextFileParamsWizard'];
 if(!markers.some(m=>root.querySelectorAll('[data-tid^='+JSON.stringify(prefix+';WizrdMCF;'+m+';')+']').length))return refuse('IMPORT_SURFACE');
 const bound={card,node,workflow,pack,connection,model,root,nativeSession:connection.Session};
 result.status='PARTIAL';result.reason='PRECONFIGURATION_FACTS_ONLY';
 result.node={role:roles[node.FGuid],node_id:node.FGuid,workflow_id:receipts[0].workflowId,component:'imports.text',native_owner_verified:true};
 const read=(form,key,name,dest)=>{
  const owners=exact(prefix+';WizrdMCF;'+form+';'+key).filter(e=>root.contains(e));
  const inputs=owners.length===1?[...owners[0].querySelectorAll('input')]:[];
  if(inputs.length!==1||typeof inputs[0].value!=='string'||inputs[0].value.length>2048){dest[name]={status:'unknown'};result.missing.push(name);return;}
  dest[name]={status:'observed',value:inputs[0].value,representation:'cached_native_input',settings_applied:false};
 };
 for(const [name,key] of Object.entries({source_path:'edtFileName;ValueControl',connection:'edtConnection',encoding:'edtCodePage;ValueControl',rows_to_skip:'edtRowsToSkip;ValueControl'}))read('ImportTextFilePreviewWizard',key,name,result.source);
 for(const [name,key] of Object.entries({delimiter:'edtDelimiterChar;ValueControl',text_qualifier:'edtTextQualifier;ValueControl',null_marker:'edtValueNull;ValueControl',decimal_separator:'edtDecimalSeparator;ValueControl'}))read('ImportTextFileParamsWizard',key,name,result.format);
 // Missing source-title flag stays unknown; never infer it from input pins.
 const titles=exact(prefix+';WizrdMCF;ImportTextFilePreviewWizard;edtFirstLineAsTitle;ValueControl').filter(e=>root.contains(e));
 result.source.first_line_as_title=titles.length===1?{status:'observed',value:titles[0].classList.contains('x-form-cb-checked'),representation:'native_ext_checkbox'}:{status:'unknown'};
 if(titles.length!==1)result.missing.push('first_line_as_title');
 const grids=exact(prefix+';WizrdMCF;ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;tbl').filter(e=>root.contains(e));
 if(grids.length===1){
  const view=globalThis.Ext?.getCmp?.(grids[0].id),store=view?.getStore?.(),data=store?.getData?.(),records=data?.items;
  if(view?.el?.dom===grids[0]&&store.isLoading?.()===false&&Array.isArray(records)&&records.length>0&&records.length<=1000
   &&records.every(r=>r.isModel===true)&&store.getCount?.()===records.length&&store.getTotalCount?.()===records.length
   &&(!data.getSource?.()||data.getSource().items?.length===records.length)){
   const fields=records.map((r,i)=>({index:r.data?.Index,name:r.data?.Name,label:r.data?.DisplayName,
    type:r.data?.DataType,data_kind:r.data?.DataKind,representation:'native_enum',native_record_id:r.internalId}));
   if(fields.every((f,i)=>f.index===i&&typeof f.name==='string'&&f.name.length>0&&f.name.length<=120
    &&typeof f.label==='string'&&f.label.length<=120&&Number.isInteger(f.type)&&Number.isInteger(f.data_kind))
    &&new Set(fields.map(f=>f.name)).size===fields.length&&new Set(fields.map(f=>f.native_record_id)).size===fields.length){
    result.columns={status:'observed_native_codes',fields,complete_native_inventory:true,canonical_types_verified:false};
   }
  }
 }
 // Never equate cached labels/schema, or idle, with native activity/freshness.
 result.missing.push('output0_native_binding','canonical_type_and_data_kind','activity','execution_freshness');
 const after=main.Items.Workspace.getActiveTab();
 if(after!==bound.card||after.Controller?.FController!==bound.model||bound.model.FModelNode!==bound.node.FModelNode
  ||bound.node.FGuid!==result.node.node_id||bound.node.ParentNode!==bound.workflow||bound.connection.Session!==bound.nativeSession
  ||map.FServerConnection!==bound.connection||bound.connection.Connected!==true||bound.connection.UserName!==o.account
  ||normalized(bound.pack.PackageFileName)!==o.package_path||p.document!==document||p.id!==o.document_id
  ||map.HasRunningNodes()!==false||pack.HasRunningNodes()!==false)return refuse('IDENTITY_CHANGED_DURING_READ');
 return result;
}
