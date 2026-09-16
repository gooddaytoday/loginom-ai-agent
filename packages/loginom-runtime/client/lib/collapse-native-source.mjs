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
  const nodes=model.FDiagram.FNodes.FCollection,sources=nodes.filter(n=>n.FIconCls==='bg-vendor-icon-importtextfile');
  need(sources.length===1&&node.FIconCls==='bg-vendor-icon-columnflipping','owned static topology required');
  const imports=a.imports.filter(r=>r.node_id===sources[0].FGuid);
  need(imports.length===1,'Native source lacks private completed import provenance');
  const root=document.querySelector('[data-tid='+JSON.stringify(a.prefix+';ModelForm;PreviewWindow;PreviewForm;DataSetForm')+']');
  need(root?.checkVisibility({checkVisibilityCSS:true}),'native dataset visible');
  const d=Ext.getCmp(root.id).Controller,dt=d.FDataTable,ds=d.FDataSource,h=ds.$FHelper;
  need(d.FModelNode===node.data&&!dt.FDataSourceStore.loading,'native datasource ready');
  const schema=d.FColumnInfosStore.data.items.map(r=>({name:r.data.Name,label:r.data.DisplayName,type:r.data.DataType}));
  const count=dt.FTotalRowCount;
  need(Number.isSafeInteger(count)&&count>=0&&count<=50&&count===h.$FRowCount&&schema.length>0&&schema.length<=8,'Exact full bound is 50 rows by 8 columns');
  need(JSON.stringify(schema)===JSON.stringify(a.schema),'native schema differs from verified Preview headers');
  const count_loader_sources={PrepareColumnInfoAndRowCount:d.PrepareColumnInfoAndRowCount.toString(),InitOutput:d.InitOutput.toString(),DataSourceProxyRead:dt.FDataSourceStore.proxy.read.toString()};
  return {count_loader_sources,port:0,method:321,interface:116,offset:0,rows:count,columns:schema.map((_,i)=>i),row_count:count,schema,
   source:{owner:ds.$.$OW,object:ds.$.$O},document_id:a.document_id,workflow_id:a.workflow_id,package_id:a.package_id,
   node_id:a.node_id,port_guid:a.port_guid,execution:a.execution,tab_tid:a.tab_tid,prefix:a.prefix,origin:a.origin,
   static_source:imports[0]};
 },args);
}
