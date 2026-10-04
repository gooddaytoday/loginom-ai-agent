import {verifyUploadLineage} from './upload-lineage.mjs';
import {verifyTextImportSource} from './text-import-node.mjs';
const need=(x,m)=>{if(!x)throw Error(m);};

// Receipts come only from the current executor's private operations map.
// A later failed/unfinished change invalidates an earlier successful import.
export function completedStaticImports(history,uploads,ctx,uploadHistory) {
 need(Array.isArray(history)&&history.length<=1024,'Bounded private node history required');
 const seen=new Set(),accepted=[];
 for(const item of [...history].reverse()) {
  const r=item.request,n=item.outcome?.output,ref=n?.node??r?.target?.ref;
  if(!ref||ref.document_id!==ctx.document_id||ref.workflow_id!==ctx.workflow_ref.workflow_id||seen.has(ref.node_id))continue;
  seen.add(ref.node_id);
  if(r?.target?.type!=='imports.text'||item.cleanup_confirmed!==true||item.outcome.status!=='SUCCEEDED'
   ||n?.status!=='SUCCEEDED'||n.execution?.status!=='completed'||n.cleanup_complete!==true)continue;
  const c=n.configuration?.readback;
  if(c?.kind!=='text_import'||c.values_are!=='observed_ui_values'||c.source.connection!=='Локальное'
   ||JSON.stringify(c.node)!==JSON.stringify(ref))continue;
  const verified=verifyTextImportSource(r.parameters,uploads).source;
  if(c.source.source_path!==verified.destination)continue;
  need(Number.isSafeInteger(item.sequence),'Private import execution order required');
  verified.bytes_verified=true;verified.upload_completion_verified=true;
  verified.lineage=verifyUploadLineage(verified,uploadHistory,{executionSequence:item.sequence});
  accepted.push({node_id:ref.node_id,execution_id:n.execution.execution_id,import_operation_id:r.operation_id,
   source:verified,configuration:c});
 }
 need(accepted.length>0,'Exact full read requires a same-session byte-verified completed local import');
 return accepted;
}

// Reads cached state only. Neither a tool argument nor display text grants
// provenance. The native reader rechecks the selected source and topology on
// both sides of every response, including the latest native source execution.
export async function bindCollapseNative(page,args) {
 return page.evaluate(a=>{
  const need=(x,m)=>{if(!x)throw Error(m);};
  const prep=globalThis.__loginomDockPreparationV1;
  need(prep?.document===document&&prep.id===a.document_id&&location.origin===a.origin&&bg.app.Version==='7.4.2','native prepared document');
  const model=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
  const manager=model.FPreviewManager,form=manager?.FPreviewForm,node=form?.FCurrentPreviewNode,port=form?.FCurrentPreviewPort;
  need(manager?.FPreviewVisible===true&&node?.FGuid===a.node_id&&port?.FGuid===a.port_guid,'native preview owner');
  const nodes=model.FDiagram.FNodes.FCollection,links=model.FDiagram.FLinks.FCollection;
  let imports,static_chain;
  if(a.cross_table){
   need(node.FIconCls==='bg-vendor-icon-crosstab','owned CrossTable required');
   const incoming=n=>links.filter(l=>l.FTargetPort?.parent===n);
   const edge=incoming(node);need(edge.length===1,'CrossTable must have exactly one static input');
   const parent=edge[0].FSourcePort?.parent;need(parent&&parent!==node,'static ancestor required');
   let source=parent,collapse;
   if(parent.FIconCls==='bg-vendor-icon-columnflipping'){
    const candidates=a.cross_table.collapses.filter(c=>c.node_id===parent.FGuid);need(candidates.length===1,'Collapse lacks settled private provenance');collapse=candidates[0];
    const upstream=incoming(parent);need(upstream.length===1,'Collapse must have exactly one static input');source=upstream[0].FSourcePort?.parent;
    need(source&&source!==parent&&source!==node,'acyclic static chain required');
   }
   need(source.FIconCls==='bg-vendor-icon-importtextfile'&&incoming(source).length===0,'only a static local import can originate exact reads');
   imports=a.imports.filter(r=>r.node_id===source.FGuid);need(imports.length===1,'Native source lacks byte-verified provenance');
   const project=fs=>fs.filter(f=>!f.excluded).map(f=>({name:f.name,label:f.label,type:f.type}));
   const fields=imports[0].configuration.output_mapping.fields;
   if(collapse){
    need(JSON.stringify(project(collapse.configuration.input_mapping.fields))===JSON.stringify(project(fields)),'Collapse input differs from verified import');
    need(JSON.stringify(project(collapse.configuration.output_mapping.fields))===JSON.stringify(a.cross_table.input_schema),'CrossTable input differs from verified Collapse');
   }else need(JSON.stringify(project(fields))===JSON.stringify(a.cross_table.input_schema),'CrossTable input differs from verified import');
   // Opening a readonly definition deactivates its output. The owned CrossTable
   // execution may therefore run an ancestor again. Accept only the original
   // completed group or this exact, independently verified execution group.
   const tree=document.querySelector('[data-tid="ConsoleForm;ProgressForm;trpProgress;treepanel;tree"]');
   need(tree&&a.execution_owner_verified===true,'owned ancestor execution required');
   const store=Ext.getCmp(tree.id).getStore(),root=store.getRoot(),records=[];
   need(!store.isLoading()&&root.data.loaded===true,'ancestor execution inventory incomplete');
   const walk=ns=>{need(records.length+ns.length<=2000,'ancestor execution bound');for(const r of ns){need(!r.data.loading,'ancestor execution loading');records.push(r);walk(r.childNodes??[]);}};walk(root.childNodes);
   const owned=a.execution.execution_id.slice(a.document_id.length+1).split(':');
   need(owned.length===2&&String(root.internalId)===owned[0],'owned execution root changed');
   const effective=(native,proof)=>{
    const old=proof.execution_id.slice(a.document_id.length+1).split(':');
    need(proof.execution_id.startsWith(a.document_id+':')&&old.length===2&&old[0]===owned[0],'foreign provenance execution');
    const processes=records.filter(r=>r.data.ModelNode===native.data);
    need(processes.length>0,'ancestor execution missing');
    const latest=Math.max(...processes.map(r=>Number(String(r.data.id).split('.')[0])));
    need(Number.isSafeInteger(latest)&&[Number(old[1]),Number(owned[1])].includes(latest),'unowned newer ancestor execution');
    const group=records.filter(r=>String(r.data.id)===String(latest));
    need(group.length===1&&group[0].data.Status===3&&group[0].data.ErrorDetails===''&&group[0].data.loaded===true
     &&processes.some(r=>String(r.data.id).startsWith(latest+'.')&&r.data.Status===3&&r.data.ErrorDetails===''),'ancestor execution incomplete');
    return {...proof,provenance_execution_id:proof.execution_id,execution_id:a.document_id+':'+owned[0]+':'+latest};
   };
   imports=[effective(source,imports[0])];if(collapse)collapse=effective(parent,collapse);
   static_chain={kind:'crosstable_static_1',nodes:[{node_id:source.FGuid,icon:'bg-vendor-icon-importtextfile',execution_id:imports[0].execution_id},
    ...(collapse?[{node_id:parent.FGuid,icon:'bg-vendor-icon-columnflipping',execution_id:collapse.execution_id}]:[])],
    edges:links.filter(l=>l.FTargetPort?.parent===node||collapse&&l.FTargetPort?.parent===parent).map(l=>({guid:l.FGuid,source:l.FSourcePort.parent.FGuid,target:l.FTargetPort.parent.FGuid,source_port:l.FSourcePort.FGuid,input_port:l.FTargetPort.FGuid}))};
  }else{
   const sources=nodes.filter(n=>n.FIconCls==='bg-vendor-icon-importtextfile');
   need(sources.length===1&&node.FIconCls==='bg-vendor-icon-columnflipping','owned static topology required');
   imports=a.imports.filter(r=>r.node_id===sources[0].FGuid);need(imports.length===1,'Native source lacks private completed import provenance');
  }
  const root=document.querySelector('[data-tid='+JSON.stringify(a.prefix+';ModelForm;PreviewWindow;PreviewForm;DataSetForm')+']');
  need(root?.checkVisibility({checkVisibilityCSS:true}),'native dataset visible');
  const d=Ext.getCmp(root.id).Controller,dt=d.FDataTable,ds=d.FDataSource,h=ds.$FHelper;
  need(d.FModelNode===node.data&&!dt.FDataSourceStore.loading,'native datasource ready');
  const schema=d.FColumnInfosStore.data.items.map(r=>({name:r.data.Name,label:r.data.DisplayName,type:r.data.DataType}));
  const count=dt.FTotalRowCount;
  need(Number.isSafeInteger(count)&&count>=0&&count===h.$FRowCount&&schema.length>0,'Verified native row count and schema required');
  need(JSON.stringify(schema)===JSON.stringify(a.schema),'native schema differs from verified Preview headers');
  // A known capability refusal is data, not a transport exception. Ownership,
  // provenance, execution and the complete cached schema were verified above.
  // Do not create a native request outside the admitted 50x8 bound.
  if(count>50||schema.length>8)return {refusal:{code:'NATIVE_FULL_BOUND_EXCEEDED'},port:0,
   document_id:a.document_id,workflow_id:a.workflow_id,node_id:a.node_id,
   port_guid:a.port_guid,execution:a.execution,row_count:count,schema};
  const count_loader_sources={PrepareColumnInfoAndRowCount:d.PrepareColumnInfoAndRowCount.toString(),InitOutput:d.InitOutput.toString(),DataSourceProxyRead:dt.FDataSourceStore.proxy.read.toString()};
  return {count_loader_sources,port:0,method:321,interface:116,offset:0,rows:count,columns:schema.map((_,i)=>i),row_count:count,schema,
   source:{owner:ds.$.$OW,object:ds.$.$O},document_id:a.document_id,workflow_id:a.workflow_id,package_id:a.package_id,
   node_id:a.node_id,port_guid:a.port_guid,execution:a.execution,tab_tid:a.tab_tid,prefix:a.prefix,origin:a.origin,
   static_source:imports[0],...(static_chain?{static_chain}:{})};
 },args);
}
