// Offline preparation only. Fixed serialized reader, not a host/router entry.
// Native paths are grounded in workspace-ui/node-context. No click/load/execute.
export function readFixedImportCandidates(identity) {
 const unknown=reason=>({status:'unknown',reason});
 const result={revision:1,harness:'import-before-configure-v1',...identity,status:'PARTIAL',complete:false,
  settings_applied:false,effect_possible:false,close_authority:false,
  enum_binding:unknown('NO_CURRENT_IMPORT_RECORD_LABEL_BINDING'),wizard_output0:unknown('NO_CURRENT_OUTPUT_OPENING'),
  activity:unknown('NO_SAME_NODE_TOGGLE'),process_owner:unknown('NO_BOUND_PROCESS_STORE'),
  freshness:{status:'unknown',execution_verified:false,reason:'NO_BEFORE_AFTER_EXECUTION_LINEAGE'}};
 const refuse=reason=>({...result,status:'REFUSED',reason,enum_binding:unknown(reason),wizard_output0:unknown(reason),activity:unknown(reason),process_owner:unknown(reason)});
 const own=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o??{},k);return d&&Object.hasOwn(d,'value')?d.value:undefined};
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const app=globalThis.bg?.app,p=globalThis.__loginomDockPreparationV1;
 if(p?.document!==document||p.id!==identity.document_id||app?.Version!==identity.loginom_build)return refuse('DOCUMENT');
 const main=app.Application?.FInstance?.FMainForm,map=main?.FMapTree,connection=map?.FServerConnection;
 if(connection?.Connected!==true||connection.UserName!==identity.account)return refuse('ACCOUNT');
 const tabs=exact(identity.tab_tid),receipts=p.receipts instanceof Map?[...p.receipts.values()].filter(r=>{
  try{return r.phase==='verified'&&JSON.parse(r.request).session===identity.session_id&&r.tab===tabs[0];}catch{return false;}
 }):[];
 if(tabs.length!==1||!tabs[0].classList.contains('x-tab-active')||!receipts.length)return refuse('PREPARATION');
 const card=main.Items?.Workspace?.getActiveTab(),controller=card?.Controller,model=controller?.FController;
 const start=controller?.Node?.data?.node,ancestry=[];let node,workflow,pack;
 for(let n=start;n&&ancestry.length<32&&!ancestry.some(b=>b.n===n);n=n.ParentNode){
  ancestry.push({n,parent:n.ParentNode});
  if(app.ModelNodeTreeNode&&n instanceof app.ModelNodeTreeNode)node=n;
  if(app.WorkFlowTreeNode&&n instanceof app.WorkFlowTreeNode)workflow=n;
  if(app.PackageTreeNode&&n instanceof app.PackageTreeNode){pack=n;break;}
 }
 if(!pack||receipts.some(r=>r.packageNode!==pack||r.nodeTargetWorkflowNode!==workflow)
  ||'/'+String(pack.PackageFileName).replaceAll('\\','/').replace(/^\/+/, '')!==identity.package_path)return refuse('PACKAGE_WORKFLOW');
 const fixed=['e78dbebd-942a-4ef4-ac45-654eec157c31','6774e6c2-a207-4293-b7ea-8db76e168f98'];
 const prefix='MF;TF'+(identity.tab_tid.match(/;tb(-\d+)?$/)?.[1]??'');
 const roots=exact(prefix+';WizrdMCF');
 // Import format uses transposed properties, not output-mapping row records.
 // Without a measured native record association, keep enum binding unknown;
 // collect only bounded rendered draft labels from the actual fixed selectors.
 if(node?.FModelNode&&fixed.includes(node.FGuid)&&model?.FModelNode===node.FModelNode&&roots.length===1&&model.getEl?.()?.dom===roots[0]){
  const root=roots[0],base=prefix+';WizrdMCF;ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;normalHeaderCt;';
  const headers=[...document.querySelectorAll('[data-tid^='+JSON.stringify(base)+']')].filter(e=>root.contains(e)&&/^\d+$/.test(e.getAttribute('data-tid').slice(base.length)));
  const ordered=headers.sort((a,b)=>Number(a.getAttribute('data-tid').slice(base.length))-Number(b.getAttribute('data-tid').slice(base.length)));
  const fields=ordered.map((h,i)=>{
   const cells=[0,1,2,3].map(row=>exact(base+i+'_'+row).filter(e=>root.contains(e)));
   return {index:i,header:h,tid:h.getAttribute('data-tid'),cells:cells.map(xs=>xs[0]),unique:cells.every(xs=>xs.length===1),values:cells.map(xs=>xs.length===1?xs[0].textContent:null)};
  });
  const labels={'Целый':'integer','Вещественный':'real','Строковый':'string','Логический':'boolean','Дата/Время':'datetime','Переменный':'variant'};
  if(fields.length>0&&fields.length<=1000&&fields.every(f=>f.tid===base+f.index&&f.unique&&f.values.every(v=>typeof v==='string'&&v.length>0&&v.length<=120)
   &&Object.hasOwn(labels,f.values[2])&&['Неопределенное','Непрерывный','Дискретный'].includes(f.values[3]))
   &&new Set(fields.map(f=>f.values[0])).size===fields.length){
   result.enum_binding={...unknown('IMPORT_NATIVE_RECORD_ASSOCIATION_UNMEASURED'),rendered_draft_fields:fields.map(f=>({index:f.index,name:f.values[0],label:f.values[1],type_label:f.values[2],rendered_type:labels[f.values[2]],kind_label:f.values[3]})),canonical_types_verified:false};
   if(fields.some(f=>f.cells.some((e,i)=>exact(base+f.index+'_'+i).length!==1||exact(base+f.index+'_'+i)[0]!==e||e.textContent!==f.values[i])))result.enum_binding=unknown('RENDERED_BINDING_CHANGED');
  }
 }
 // Existing verified private opening receipts; observe pointer relations only.
 if(node&&fixed.includes(node.FGuid)&&model?.constructor?.name==='WizardModelComponentForm'&&roots.length===1){
  const wizard=start,portTree=wizard?.ParentNode,group=portTree?.ParentNode;
  const openings=p.outputPortOpenReceipts instanceof Map?[...p.outputPortOpenReceipts.values()].filter(o=>o.phase==='verified'&&o.document_id===p.id&&o.wizard===model&&o.nodeTree===node):[];
  if(openings.length===1){
   const o=openings[0],data=own(o.port,'data'),nodeData=own(o.node,'data');
   if(o.node&&o.port&&data&&nodeData&&app.WizardTreeNode&&wizard instanceof app.WizardTreeNode&&app.ModelPortTreeNode&&portTree instanceof app.ModelPortTreeNode
    &&app.ModelOutputPortsTreeNode&&group instanceof app.ModelOutputPortsTreeNode&&group.ParentNode===node
    &&o.direction==='output'&&o.portIndex===0&&Number.isSafeInteger(o.nativeIndex)&&o.nativeIndex>=0
    &&o.node_id===node.FGuid&&o.workflow_id===receipts[0].workflowId&&o.workflow===workflow&&o.packageNode===pack
    &&o.portTree===portTree&&portTree.FIndex===o.nativeIndex&&portTree.FModelNodePort===data&&data===o.portData
    &&o.node.FGuid===node.FGuid&&nodeData===node.FModelNode&&nodeData===o.nodeData&&o.port.parent===o.node
    &&o.port.FGuid===o.portGuid&&typeof o.portGuid==='string'&&o.portGuid&&o.enginePort===model.FModelEnginePort&&o.enginePort&&!model.FModelNode
    &&model.FView?.el?.dom===roots[0])result.wizard_output0={status:'observed_cached_opening',node_id:node.FGuid,port:0,port_guid:o.portGuid,native_index:o.nativeIndex,authority_verified:false};
  }
 }
 // The toggle is a same-selected-node UI observation, not activation/freshness.
 const diagram=model?.FDiagram,nodes=diagram?.FNodes?.FCollection,graph=diagram?.FmxGraph;
 const graphRoots=exact(prefix+';ModelForm;cmpDiagram');
 const selection=app.ModelForm&&model instanceof app.ModelForm?graph?.getSelectionCells?.():null;
 const selected=Array.isArray(nodes)&&nodes.length<=200&&Array.isArray(selection)&&selection.length===1?nodes.filter(n=>n.FCell===selection[0]&&fixed.includes(n.FGuid)&&n.FIconCls==='bg-vendor-icon-importtextfile'):[];
 if(selected.length===1&&nodes.filter(n=>n.FGuid===selected[0].FGuid).length===1&&graphRoots.length===1&&graph.container===graphRoots[0]){
  const n=selected[0],body=graph.view?.getState?.(n.FCell)?.shape?.node,buttons=exact(prefix+';ModelForm;btnToggleActivateCurrent');
  const button=buttons[0],native=buttons.length===1?globalThis.Ext?.getCmp?.(button.id):null;
  if(buttons.length===1&&native&&body&&graphRoots[0].contains(body)&&n.FLocked!==true&&native.el?.dom===button&&native.disabled!==true&&native.tooltip==='Выполнить узел'){
   const tip=button.getAttribute('data-qtip'),run=button.querySelectorAll('.bg-icon-run_current').length,stop=button.querySelectorAll('.bg-icon-stop').length;
   const mode=['Выполнить узел','Выполнить узел (F9)'].includes(tip)&&run===1&&stop===0?'execute':tip==='Деактивировать узел'&&stop===1&&run===0?'deactivate':null;
   if(mode&&graph.getSelectionCells()?.length===1&&graph.getSelectionCells()[0]===n.FCell&&native.el.dom===button&&button.getAttribute('data-qtip')===tip)
    result.activity={status:'observed_toggle',node_id:n.FGuid,mode,activation_verified:false};
  }
  // Both cached process views must own one native TreeStore and node data.
  const consoles=exact('ConsoleForm'),grids=['treepanel;tree','grd;tbl'].map(s=>exact('ConsoleForm;ProgressForm;trpProgress;'+s));
  const views=grids.map(xs=>xs.length===1?globalThis.Ext?.getCmp?.(xs[0].id):null),store=views[0]?.getStore?.();
  if(consoles.length===1&&grids.every(xs=>xs.length===1&&consoles[0].contains(xs[0]))&&views.every((v,i)=>v?.el?.dom===grids[i][0]&&v.getStore?.()===store)
   &&store?.$className==='Ext.data.TreeStore'&&store.isLoading?.()===false){
   const root=store.getRoot?.()??store.getRootNode?.(),records=[],seen=new Set();let valid=true;
   const walk=(children,parent)=>{if(!Array.isArray(children)){valid=false;return;}for(const r of children){
    const d=own(r,'data');if(records.length>=2000||seen.has(r)||r?.isModel!==true||typeof r.internalId!=='string'||!r.internalId||!d||d.loading||! /^[1-9][0-9]*(?:\.[1-9][0-9]*)*$/.test(String(d.id))||r.parentNode!==parent){valid=false;return;}
    seen.add(r);records.push(r);walk(r.childNodes,r);
   }};
   if(root?.isModel===true&&own(root,'data')?.loaded===true&&!own(root,'data').loading)walk(root.childNodes,root);else valid=false;
   const data=own(n,'data'),owned=records.filter(r=>data&&own(r,'data')?.ModelNode===data);
   if(valid&&new Set(records.map(r=>r.internalId)).size===records.length&&new Set(records.map(r=>String(own(r,'data').id))).size===records.length&&owned.length===1
    &&views.every(v=>v.getStore()===store)&&(store.getRoot?.()??store.getRootNode?.())===root)
    result.process_owner={status:'observed_cached_model_owner',node_id:n.FGuid,root_record_id:root.internalId,record_id:owned[0].internalId,process_id:String(own(owned[0],'data').id),execution_verified:false,inventory_complete:false};
  }
 }
 if(main.Items.Workspace.getActiveTab()!==card||card.Controller!==controller||controller.FController!==model||controller.Node?.data?.node!==start
  ||ancestry.some(b=>b.n.ParentNode!==b.parent)||map.FServerConnection!==connection||connection.UserName!==identity.account||connection.Connected!==true
  ||p.document!==document||p.id!==identity.document_id)return refuse('OWNER_CHANGED');
 return result;
}

// Offline candidate for row-oriented native definition layouts. The transposed
// Import format layout is NOT assumed to provide this record association.
export function collectRecordLabelPair(view,grid,row) {
 const unknown=reason=>({status:'unknown',reason});
 const own=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o??{},k);return d&&Object.hasOwn(d,'value')?d.value:undefined};
 const store=view?.getStore?.(),rawIndex=row?.getAttribute?.('data-recordindex');
 if(typeof rawIndex!=='string'||!/^\d+$/.test(rawIndex))return unknown('RECORD_INDEX');
 const index=Number(rawIndex);
 const record=Number.isSafeInteger(index)&&index>=0?store?.getAt?.(index):null,data=own(record,'data');
 if(view?.el?.dom!==grid||!grid?.contains(row)||store?.isLoading?.()!==false||record?.isModel!==true||!data
  ||row.getAttribute('data-boundview')!==grid.id||row.getAttribute('data-recordid')!==record.internalId
  ||own(data,'Index')!==index||typeof own(data,'Name')!=='string'||!own(data,'Name')
  ||typeof own(data,'DisplayName')!=='string'||!Number.isInteger(own(data,'DataType'))||!Number.isInteger(own(data,'DataKind')))return unknown('RECORD_ROW_OWNER');
 const cells=[...row.querySelectorAll('[data-tid]')],name=own(data,'Name'),label=own(data,'DisplayName');
 const names=cells.filter(e=>e.getAttribute('data-tid')?.endsWith(';colName_'+name));
 const labels=cells.filter(e=>e.getAttribute('data-tid')?.endsWith(';colDisplayName_'+name));
 const kinds=cells.filter(e=>e.getAttribute('data-tid')?.endsWith(';colDataKind_'+name));
 const icons=labels.length===1?[...labels[0].querySelectorAll('[class*="bg-TBGDataType-dt"]')]:[];
 const types={String:'string',Integer:'integer',Float:'real',Boolean:'boolean',DateTime:'datetime',Variant:'variant'};
 const markers=Object.entries(types).filter(([css])=>icons.length===1&&icons[0].classList.contains('bg-TBGDataType-dt'+css));
 if(names.length!==1||labels.length!==1||kinds.length!==1||names[0].textContent!==name||labels[0].textContent!==label||markers.length!==1
  ||!['Неопределенное','Непрерывный','Дискретный'].includes(kinds[0].textContent))return unknown('RENDERED_LABEL_ICON');
 const result={status:'observed_candidate_pair',record_id:record.internalId,index,name,label,native_type_code:own(data,'DataType'),native_kind_code:own(data,'DataKind'),
  icon_type:markers[0][1],kind_label:kinds[0].textContent,enum_mapping_verified:false};
 if(view.getStore()!==store||store.getAt(index)!==record||own(record,'data')!==data||own(data,'Name')!==result.name
  ||own(data,'DisplayName')!==result.label||own(data,'DataType')!==result.native_type_code||own(data,'DataKind')!==result.native_kind_code
  ||names[0].textContent!==name||labels[0].textContent!==label||kinds[0].textContent!==result.kind_label)return unknown('RECORD_BINDING_CHANGED');
 return result;
}
