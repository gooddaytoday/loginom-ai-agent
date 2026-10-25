import {managedJavascriptPreviewAdmission} from './javascript-output-preview.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
import {createNodeProcedure,NodeProcedureStepError} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {resolveGroupingParameters} from './grouping-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const acknowledged=(saved,event)=>same(Object.fromEntries(Object.keys(event).map(k=>[k,saved?.[k]])),event);
const graphDomain=g=>({...g,nodes:g.nodes.map(({dom_epoch,...n})=>n)});
// This is a release of one completed browser call, never a retry or a claim
// that an ambiguous F3 succeeded. Only its native-owned preview may be closed.
export async function releaseGroupingPreview(options,ctx,config){
 const {operation,onRecord,execute,receiptOptions,now=Date.now}=options,p=operation.groupingPreview;
 if(!p)return;
 need(p.failed===true&&!operation.transportUncertain&&!operation.targetPhase&&!operation.nodeApply.node
  &&operation.nodeApply.pending?.phase==='target'&&same(operation.lastReceipt,p.reference),
  'Grouping preview has no releasable original F3 receipt');
 const saved=await options.readReceipt(p.reference),r=saved?.receipt;
 need(saved?.state==='completed'&&same(r,p.receipt)&&r.status==='AMBIGUOUS'&&r.cleanup_complete===true
  &&r.error?.code==='UI_BROWSER_CALL_FAILED','Original F3 browser completion is unconfirmed');
 const previous=operation.deadline;operation.deadline=ctx.deadline;
 try{
  const channel=createNodeProcedure({operation,execute,record:onRecord,now,...config,signal:ctx.signal,preparedNodeContext:p.binding,
   wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
  const graph=s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent';
  const owned=s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.node_id===p.binding.node.node_id
   &&s.node_preview_schema.port_guid===p.port.port_guid&&s.node_preview_schema.port===p.port.index
   &&s.node_preview_schema.settings_changed===false;
  const s=await channel.observe({condition:'original grouping preview before release',readPreview:true,
   ready:s=>graph(s)&&(owned(s)||s.ui.dialogs.length===0&&s.ui.masks.length===0),
   timeoutMs:Math.max(1,ctx.deadline-now())});
  if(owned(s))await channel.perform({condition:'close original grouping preview after failed F3',initialObservation:s,
   ready:owned,identity:()=>({node:p.binding.node,port_guid:p.port.port_guid,root:s.node_preview_schema.root_tid}),
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.node_preview_schema.root_tid+';p.h;close'&&e.allowed_actions.includes('click'));
    need(es.length===1,'Owned grouping preview close is unavailable');return {verb:'click',ref:es[0].ref};}});
  await channel.observe({condition:'graph restored after failed grouping preview',ready:s=>graph(s)&&s.ui.dialogs.length===0&&s.ui.masks.length===0});
  const quiet=g=>g?.complete===true&&g.interaction_ready===true&&g.document_id===p.binding.document_id
   &&same(g.workflow_ref,p.binding.workflow_ref)&&g.nodes.every(n=>n.locked===false
    &&n.ref.document_id===p.binding.document_id&&n.ref.workflow_id===p.binding.workflow_ref.workflow_id);
  const first=await operation.nodeTargetAdapter.observe(operation.parameters,ctx.deadline,ctx.signal);
  need(now()<ctx.deadline&&quiet(first)&&same(graphDomain(first),graphDomain(p.baseline)),'Grouping preview changed the original idle graph');
  const second=await operation.nodeTargetAdapter.observe(operation.parameters,ctx.deadline,ctx.signal);
  need(now()<ctx.deadline&&quiet(second)&&same(first,second),'Grouping preview release graph is not stable');
  const event={phase:'grouping_preview_released',operation_id:operation.id,reference:p.reference,graph:second};
  need(acknowledged(await onRecord(structuredClone(event)),event),'Grouping preview release acknowledgement differs');
  operation.preTargetGraph=structuredClone(second);operation.cleanupConfirmed=true;
  operation.preTargetWarnings=['The failed upstream preview was closed and the unchanged idle graph was verified. Grouping creation and execution were not requested.'];
  delete operation.groupingPreview;
 }catch(error){operation.cleanupConfirmed=false;throw error;}
 finally{operation.deadline=previous;}
}
export async function preflightGroupingSource(options,ctx,config){
 const {operation,execute,onRecord,now,receiptOptions}=options,request=operation.parameters;
 if(request.parameters.group_by===undefined)return {verified:true,not_applicable:true};
 need(request.inputs.length===1,'Grouping preflight requires an explicit input');
 const input=request.inputs[0],binding={document_id:request.document_id,workflow_ref:request.workflow_ref,node:input.source};
 const channel=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:256,...config,signal:ctx.signal,preparedNodeContext:binding,
  wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
 const graph=s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent';
 let s=await channel.observe({condition:'upstream graph before grouping validation',readOutputs:true,ready:s=>graph(s)&&s.node_outputs?.verified===true});
 const ports=s.node_outputs.ports.filter(p=>p.index===input.output);
 if(ports.length!==1){
  // This refusal precedes even the upstream preview gesture, target creation
  // and link changes. There is no new Grouping node to release or recreate.
  const error=Error('Exact upstream grouping port required: output '+input.output+' of node '+input.source.node_id
   +' is not uniquely confirmed. No Grouping node or link was created. Verify the output of the SAME existing upstream node, then retry this request with a NEW operation_id; do not recreate the upstream node.');
  error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;
 }
 const port=ports[0];
 if(port.index!==0||port.active!==true){const error=Error('Grouping preflight requires an active source output zero');error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 const script=s.ui.elements.filter(e=>e.tid===port.tid&&e.signature?.native_graph?.status==='script');
 const admission=script.length===1?managedJavascriptPreviewAdmission(options.nodeHistory?.(),binding,port):null;
 if(admission)await channel.openJavascriptPreview(port);
 if(!admission){
  const portControl=s=>s.ui.elements.filter(e=>e.tid===port.tid&&e.allowed_actions.includes('click'));
  need(portControl(s).length===1,'Upstream port is not interactable');
  await channel.perform({condition:'select upstream output for schema preview',initialObservation:s,ready:s=>graph(s)&&portControl(s).length===1,identity:()=>({node:input.source,port_guid:port.port_guid}),resolve:s=>({verb:'click',ref:portControl(s)[0].ref})});
  s=await channel.observe({condition:'selected upstream output preview command',ready:s=>graph(s)&&s.ui.elements.some(e=>e.tid===port.tid&&e.allowed_actions.includes('press'))});
  const baseline=await operation.nodeTargetAdapter.observe(request,ctx.deadline,ctx.signal);
  need(baseline.complete===true&&baseline.interaction_ready===true&&baseline.document_id===request.document_id
   &&same(baseline.workflow_ref,request.workflow_ref)&&baseline.nodes.every(n=>n.locked===false),
   'Complete idle graph required before grouping preview');
  const pending={binding,port,baseline};
  const checkpoint={phase:'grouping_preview_prepared',operation_id:operation.id,checkpoint:pending};
  need(acknowledged(await onRecord(structuredClone(checkpoint)),checkpoint),'Grouping preview checkpoint acknowledgement differs');
  operation.groupingPreview=structuredClone(pending);
  try{await channel.perform({condition:'open temporary upstream schema preview',initialObservation:s,ready:graph,identity:()=>({node:input.source,port_guid:port.port_guid}),resolve:s=>({verb:'press',ref:s.ui.elements.find(e=>e.tid===port.tid).ref,key:'F3'})});}
  catch(error){
   const r=error instanceof NodeProcedureStepError?error.receipt:null;
   if(r?.status==='AMBIGUOUS'&&r.action_key==='ui.act'&&r.cleanup_complete===true&&r.error?.code==='UI_BROWSER_CALL_FAILED'
    &&r.trace?.some(e=>e.event==='ui_preconditions_verified'&&e.verb==='press')&&!operation.transportUncertain)
    Object.assign(operation.groupingPreview,{failed:true,reference:structuredClone(operation.lastReceipt),receipt:structuredClone(r)});
   throw error;
  }
 }
 const preview=await channel.observe({condition:'complete owned upstream preview schema',readPreview:true,ready:s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.port_guid===port.port_guid});
 let error,fields=preview.node_preview_schema.fields;
 try{
  if(admission){need(preview.node_preview_schema.inventory_complete===true&&preview.node_preview_schema.node_id===input.source.node_id
   &&preview.node_preview_schema.port===0,'Managed JavaScript preview schema is incomplete');alignReadSchema(fields,admission.schema);}
  const mapping=request.mappings.find(m=>m.direction==='input');
  if(mapping?.fields){need(mapping.fields.length===fields.length,'Input mapping must account for every upstream field');const seen=new Set();fields=mapping.fields.map(f=>{const source=fields.find(c=>c.name===f.source?.name);need(source&&!seen.has(source.name)&&f.excluded!==true,'Invalid grouping input mapping');seen.add(source.name);return {...source,name:f.name??source.name,label:f.label??source.label};});}
  resolveGroupingParameters(request.parameters,fields);
 }catch(e){error=e;}
 const root=preview.node_preview_schema.root_tid;
 await channel.perform({condition:'close temporary grouping preflight preview',initialObservation:preview,ready:s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.port_guid===port.port_guid,
  identity:()=>({node:input.source,port_guid:port.port_guid,root}),resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===root+';p.h;close'&&e.allowed_actions.includes('click'));need(es.length===1,'Preview close unavailable');return {verb:'click',ref:es[0].ref};}});
 const returned=await channel.observe({condition:'upstream graph restored after grouping validation',ready:graph});
 const proof={verified:true,cleanup_complete:true,settings_changed:false,source:input.source,port:input.output,schema:fields,preview:preview.node_preview_schema,node_context:returned.prepared_node_context,parameters_valid:!error,
  ...(admission?{managed_javascript_source:{source_operation_id:admission.source_operation_id,execution_id:admission.execution_id}}:{})};
 const saved=await onRecord({phase:'grouping_preflight_completed',operation_id:operation.id,proof});
 need(saved?.phase==='grouping_preflight_completed'&&JSON.stringify(saved.proof)===JSON.stringify(proof),'Grouping preflight was not durably acknowledged');
 delete operation.groupingPreview;
 if(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 return proof;
}
