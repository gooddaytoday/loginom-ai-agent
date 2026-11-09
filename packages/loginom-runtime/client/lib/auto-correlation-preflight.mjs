import {preflightTabularSource} from './sorting-preflight.mjs';
import {resolveAutoCorrelationField} from './auto-correlation-parameters.mjs';
// Loginom 7.4.2 fails natively (Access violation) on an empty series. Refuse
// before the target or Execute is touched; the old output is never a result.
export const AUTO_CORRELATION_EMPTY_INPUT='Во входных данных нет строк';
const need=(v,m)=>{if(!v)throw Error(m);};
export function autoCorrelationExistingSource(request,graph){
 need(graph?.complete===true&&graph.document_id===request.document_id,'Autocorrelation source graph ownership changed');
 const links=graph.links.filter(l=>l.target===request.target.ref.node_id&&l.input===0);
 need(links.length<=1,'Autocorrelation input is ambiguous');
 if(!links.length)return null;
 const nodes=graph.nodes.filter(n=>n.ref.node_id===links[0].source);need(nodes.length===1,'Autocorrelation source owner is ambiguous');
 return {source:nodes[0].ref,output:links[0].output,input:0};
}
export function makeAutoCorrelationRowCountCode(binding,port){
 return `async page=>page.evaluate(${readAutoCorrelationSourceRowCount.toString()},${JSON.stringify({node_id:binding.node.node_id,prefix:binding.workflow_ref.prefix,port_guid:port.port_guid})})`;
}
// Reads the row count of the visible owned upstream Preview, as cached by Loginom.
export function readAutoCorrelationSourceRowCount(b){
 const fail=reason=>({verified:false,reason});
 const model=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab()?.Controller?.FController;
 const form=model?.FPreviewManager?.FPreviewForm,node=form?.FCurrentPreviewNode,port=form?.FCurrentPreviewPort;
 if(model?.FPreviewManager?.FPreviewVisible!==true||node?.FGuid!==b.node_id||port?.parent!==node||port.FGuid!==b.port_guid)return fail('row_count_preview_binding');
 const roots=[...document.querySelectorAll('[data-tid='+JSON.stringify(b.prefix+';ModelForm;PreviewWindow;PreviewForm;DataSetForm')+']')].filter(e=>e.checkVisibility({checkVisibilityCSS:true}));
 const dc=roots.length===1&&globalThis.Ext?.getCmp?.(roots[0].id)?.Controller,dt=dc?.FDataTable,store=dt?.FDataSourceStore,helper=dc?.FDataSource?.$FHelper;
 if(!dc||dc.FModelNode!==node.data||!store||store.loading||store.isLoading?.())return fail('row_count_loading');
 const count=dt.FTotalRowCount;
 if(!Number.isSafeInteger(count)||count<0||count!==helper?.$FRowCount)return fail('row_count_unsettled');
 return {verified:true,row_count:count};
}
export async function readAutoCorrelationRowCount({execute,binding,port,deadline,now=Date.now,delay=ms=>new Promise(r=>setTimeout(r,ms))}){
 for(;;){
  const r=await execute(makeAutoCorrelationRowCountCode(binding,port));
  if(r?.verified===true)return r.row_count;
  need(now()+250<deadline,'Autocorrelation input row count is unavailable: '+(r?.reason??'unknown'));
  await delay(250);
 }
}
// Reopen or a Done-only Import replacement leaves the source inactive. Keep the
// refusal and the empty-input guard; name the source Execute recovery step.
export function autoCorrelationInactiveSource(){
 const error=Error('auto_correlation preflight requires an active source output. No node was changed. First execute the node feeding input 0 (the Import, if it feeds input 0 directly) via dock_node_apply with its existing ref, inputs:[] and finish:"execute"; wait for success, then repeat the same existing auto_correlation apply with a NEW operation_id.');
 error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;
}
export async function preflightAutoCorrelationSource(options,ctx,config,{preflight=preflightTabularSource}={}){
 const request=options.operation.parameters,field=request.parameters.autocorrelation?.field!==undefined;
 const plain=()=>preflight(options,ctx,config,{required:field,resolve:resolveAutoCorrelationField,label:'auto_correlation'});
 if(request.finish!=='execute')return plain();
 let input=request.inputs.find(i=>i.input===0);
 if(!input&&request.target.kind==='existing')
  input=autoCorrelationExistingSource(request,await options.operation.nodeTargetAdapter.observe(request,ctx.deadline,ctx.signal));
 if(!input)return plain();
 return preflight(options,ctx,config,{required:true,existingSource:true,input,label:'auto_correlation',inactiveSource:request.target.kind==='existing'?autoCorrelationInactiveSource:undefined,
  // Existing input mappings are validated by the input wizard, as before.
  resolve:(p,fields)=>{if(request.target.kind==='new')resolveAutoCorrelationField(p,fields);},
  inspect:async({binding,port})=>{
   const rows=await readAutoCorrelationRowCount({execute:options.execute,binding,port,deadline:ctx.deadline??options.operation.deadline});
   need(rows>0,AUTO_CORRELATION_EMPTY_INPUT);
  }});
}
