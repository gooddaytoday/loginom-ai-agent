import {showMissingValuesMappingTable} from './missing-values-output.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {selectPreparedGraphNode} from './node-graph-selection.mjs';
import {readCalculatorOutputMapping} from './calculator-output-source.mjs';
import {managedJavascriptPreviewAdmission} from './javascript-output-preview.mjs';
import {makeJavascriptManagedSelectionReadCode,dispatchManagedJavascriptBody} from './javascript-managed-selection.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
import {createNodeProcedure,NodeProcedureStepError,NodeReadinessTimeout} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {resolveGroupingParameters} from './grouping-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const acknowledged=(saved,event)=>same(Object.fromEntries(Object.keys(event).map(k=>[k,saved?.[k]])),event);
const graphDomain=g=>({...g,nodes:g.nodes.map(({dom_epoch,...n})=>n)});
// Shared by every tabular source preflight. The original F3 is never replayed.
// A completed late opening may settle by reads; otherwise release must close
// that exact owned preview and prove the original idle graph unchanged.
export async function openNodeSchemaPreview(options,ctx,config,channel,binding,port,state,{managed=false}={}){
 const {operation,onRecord,now=Date.now}=options;
 const graph=s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent';
 const owned=s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.settings_changed===false
  &&s.node_preview_schema.node_id===binding.node.node_id&&s.node_preview_schema.port_guid===port.port_guid
  &&s.node_preview_schema.port===port.index;
 let pending;
 if(operation.nodeApply){
  const baseline=await operation.nodeTargetAdapter.observe(operation.parameters,ctx.deadline,ctx.signal);
  need(now()<ctx.deadline&&baseline.complete===true&&baseline.interaction_ready===true
   &&baseline.document_id===binding.document_id&&same(baseline.workflow_ref,binding.workflow_ref)
   &&baseline.nodes.every(n=>n.locked===false),'Complete idle graph required before upstream preview');
  pending={binding:structuredClone(binding),port:structuredClone(port),baseline:structuredClone(baseline),...(managed?{managed:true}:{})};
  const event={phase:'grouping_preview_prepared',operation_id:operation.id,checkpoint:pending};
  need(acknowledged(await onRecord(structuredClone(event)),event),'Preview checkpoint acknowledgement differs');
  operation.groupingPreview=pending;
 }
 let receipt,reference;
 try{
  try{
   if(managed)await channel.openJavascriptPreview(port);
   else{
    const result=await channel.perform({condition:'open temporary upstream schema preview',initialObservation:state,ready:graph,
     identity:()=>({node:binding.node,port_guid:port.port_guid}),
     resolve:s=>({verb:'press',ref:s.ui.elements.find(e=>e.tid===port.tid).ref,key:'F3'})});
    receipt=result;
   }
  }catch(error){
   receipt=error instanceof NodeProcedureStepError?error.receipt:null;
   reference=structuredClone(operation.lastReceipt);
   // As in cold Filter settlement: only an exact completed receipt proving
   // one dispatched gesture permits a late read within the original budget.
   const step=channel.lastPreparedStep,trace=receipt?.trace;
   if(managed||operation.transportUncertain||now()>=ctx.deadline||receipt?.status!=='AMBIGUOUS'
    ||receipt.phase!=='observing'||receipt.effect_possible!==true||receipt.cleanup_complete!==true
    ||step?.action?.verb!=='press'||step.action.key!=='F3'||receipt.operation_id!==step.internal_operation_id
    ||!Array.isArray(trace)||trace.filter(e=>e.event==='ui_preconditions_verified').length!==1
    ||trace.find(e=>e.event==='ui_preconditions_verified').verb!=='press'
    ||!same(trace.find(e=>e.event==='ui_preconditions_verified').refs,[step.action.ref])
    ||trace.filter(e=>e.event==='ui_gesture_applied'&&e.verb==='press').length!==1)throw error;
   const original=await options.readReceipt(reference);
   need(now()<ctx.deadline&&!operation.transportUncertain&&original?.state==='completed'&&same(original.receipt,receipt),
    'Original preview completion is unconfirmed');
   const condition='settle the dispatched upstream schema preview';
   for(;;){
    need(now()<ctx.deadline&&!operation.transportUncertain,'Original preview settlement deadline elapsed');
    try{
     const observed=await channel.observe({condition,readPreview:true,ready:owned,
      timeoutMs:Math.min(15000,ctx.deadline-now())});
     need(now()<ctx.deadline&&!operation.transportUncertain&&owned(observed),'Late preview owner or deadline changed');
     const event={phase:'upstream_preview_settled',operation_id:operation.id,reference,deadline:ctx.deadline,
      node:binding.node,port_guid:port.port_guid};
     need(acknowledged(await onRecord(structuredClone(event)),event),'Preview settlement acknowledgement differs');
     need(now()<ctx.deadline&&!operation.transportUncertain,'Late preview settlement exceeded its deadline');
     return observed;
    }catch(error){if(!(error instanceof NodeReadinessTimeout)||error.condition!==condition)throw error;}
   }
  }
  reference=structuredClone(operation.lastReceipt);
  if(!receipt&&reference&&pending){const saved=await options.readReceipt(reference);if(saved?.state==='completed')receipt=saved.receipt;}
  if(pending&&receipt&&same(operation.lastReceipt,reference))
   Object.assign(pending,{failed:true,reference:structuredClone(reference),receipt:structuredClone(receipt)});
  return await channel.observe({condition:'complete owned upstream preview schema',readPreview:true,ready:owned});
 }catch(error){
  if(pending&&receipt&&['SUCCEEDED','AMBIGUOUS','NOT_APPLIED','FAILED'].includes(receipt.status)
   &&(receipt.cleanup_complete===true||pending.managed&&pending.lease_disposed&&receipt.action_key==='node.javascript.preview.open.internal')
   &&!operation.transportUncertain&&same(operation.lastReceipt,reference))
   Object.assign(pending,{failed:true,reference:structuredClone(reference),receipt:structuredClone(receipt)});
  throw error;
 }
}
export async function closeNodeSchemaPreview(options,channel,preview,binding,port,{readOutputs=false,label='upstream'}={}){
 const {operation}=options,p=operation.groupingPreview,root=preview.node_preview_schema.root_tid;
 const owned=s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.node_id===binding.node.node_id
  &&s.node_preview_schema.port_guid===port.port_guid&&s.node_preview_schema.port===port.index
  &&s.node_preview_schema.root_tid===root;
 let receipt;
 try{
  receipt=await channel.perform({condition:'close temporary '+label+' preflight preview',initialObservation:preview,ready:owned,
   identity:()=>({node:binding.node,port_guid:port.port_guid,root}),resolve:s=>{
    const es=s.ui.elements.filter(e=>e.tid===root+';p.h;close'&&e.allowed_actions.includes('click'));
    need(es.length===1,'Preview close unavailable');return {verb:'click',ref:es[0].ref};}});
 }catch(error){receipt=error instanceof NodeProcedureStepError?error.receipt:null;throw error;}
 finally{
  if(p&&receipt?.cleanup_complete===true&&!operation.transportUncertain)
   Object.assign(p,{failed:true,reference:structuredClone(operation.lastReceipt),receipt:structuredClone(receipt)});
 }
 return channel.observe({condition:'upstream graph restored after '+label+' validation',readOutputs,
  ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'&&(!readOutputs||s.node_outputs?.verified===true)});
}
// This is a release of one completed browser call, never a retry or a claim
// that an ambiguous F3 succeeded. Only its native-owned preview may be closed.
export async function releaseNodeSchemaPreview(options,ctx,config){
 const {operation,onRecord,execute,receiptOptions,now=Date.now}=options,p=operation.groupingPreview;
 if(!p)return;
 need(p.failed===true&&!operation.transportUncertain&&!operation.nodeApply.node
  &&operation.nodeApply.pending?.phase==='target'&&same(operation.lastReceipt,p.reference),
  'Grouping preview has no releasable original F3 receipt');
 const saved=await options.readReceipt(p.reference),r=saved?.receipt;
 const capture=p.managed===true&&p.capture_refused===true&&p.lease_disposed===true
  &&r?.action_key==='node.javascript.preview.capture.internal'&&r.status==='NOT_APPLIED'
  &&r.effect_possible===false&&r.cleanup_complete===true&&r.output?.lease_disposed===true
  &&same(r.output.node_context,p.binding.node)&&r.output.port_guid===p.port.port_guid;
 need(saved?.state==='completed'&&same(r,p.receipt)&&['AMBIGUOUS','SUCCEEDED','NOT_APPLIED','FAILED'].includes(r.status)
  &&(r.cleanup_complete===true||p.managed===true&&p.lease_disposed===true&&r.action_key==='node.javascript.preview.open.internal')
  &&(capture||['ui.act','node.javascript.preview.open.internal'].includes(r.action_key)),'Original F3 browser completion is unconfirmed');
 const previous=operation.deadline;operation.deadline=ctx.deadline;
 try{
  const channel=createNodeProcedure({operation,execute,record:onRecord,now,...config,signal:ctx.signal,preparedNodeContext:p.binding,
   wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
  const graph=s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent';
  const owned=s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.node_id===p.binding.node.node_id
   &&s.node_preview_schema.port_guid===p.port.port_guid&&s.node_preview_schema.port===p.port.index
   &&s.node_preview_schema.settings_changed===false;
  const condition='original grouping preview before release';
  let s;
  for(;;){
   try{
    s=await channel.observe({condition,readPreview:true,
     ready:s=>graph(s)&&(owned(s)||s.ui.dialogs.length===0&&s.ui.masks.length===0),
     timeoutMs:Math.min(15000,Math.max(1,ctx.deadline-now()))});
    break;
   }catch(error){
    // Continue only this read-only wait, never a gesture or another failure.
    if(!(error instanceof NodeReadinessTimeout)||error.condition!==condition||now()>=ctx.deadline)throw error;
   }
  }
  need(!capture||!owned(s)&&s.ui.dialogs.length===0&&s.ui.masks.length===0,'Capture refusal cannot own an opened preview');
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
  operation.preTargetWarnings=['The failed upstream preview was closed and the unchanged idle graph was verified. Target creation and execution were not requested.'];
  delete operation.groupingPreview;
 }catch(error){operation.cleanupConfirmed=false;throw error;}
 finally{operation.deadline=previous;}
}
// Keep #429's internal imports and journal phase names compatible.
export {releaseNodeSchemaPreview as releaseGroupingPreview};
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
 if(port.index===0&&port.active===false)return preflightInactiveTabularSource(options,{channel,binding,port,state:s},
  {label:'grouping',sourceIcons:['bg-vendor-icon-importtextfile','bg-vendor-icon-calcdata'],resolve:resolveGroupingParameters});
 if(port.index!==0||port.active!==true){const error=Error('Grouping preflight requires an active source output zero');error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 const script=s.ui.elements.filter(e=>e.tid===port.tid&&e.signature?.native_graph?.status==='script');
 const admission=script.length===1?managedJavascriptPreviewAdmission(options.nodeHistory?.(),binding,port):null;
 let preview;
 if(admission){
  // C1 can leave another REST branch's JS selected. Use the existing owned
  // body gesture before strict native-port capture, as Sort/Join already do.
  const task={operation_id:operation.id+':source-select-0',owner:binding.node,
   workflow_ref:{prefix:binding.workflow_ref.prefix,tab_tid:binding.workflow_ref.tab_tid},
   targetOrigin:config.targetOrigin,targetBuild:config.targetBuild,deadline:operation.deadline};
  const before=await execute(makeJavascriptManagedSelectionReadCode({...task,mode:'capture'}));
  try{
   let selected=before;
   if(before.ready!==true){
    operation.cleanupConfirmed=false;
    let result;
    try{result=await dispatchManagedJavascriptBody({task,before,execute,record:onRecord,receiptOptions});}
    catch(error){operation.transportUncertain=true;operation.nodeEffectPossible=true;throw error;}
    operation.nodeEffectPossible ||= result.effect_possible===true;
    operation.cleanupConfirmed=result.cleanup_complete===true;
    need(result.status==='SUCCEEDED','Managed JavaScript source selection refused');
    selected=result.output?.selection;
   }
   need(selected?.ready===true&&selected.node_tid===s.prepared_node_context.tid,
    'Managed JavaScript source selection unconfirmed');
  }finally{if(!operation.transportUncertain)await execute(makeJavascriptManagedSelectionReadCode({...task,mode:'dispose'}));}
  preview=await openNodeSchemaPreview(options,ctx,config,channel,binding,port,s,{managed:true});
 }
 if(!admission){
  const portControl=s=>s.ui.elements.filter(e=>e.tid===port.tid&&e.allowed_actions.includes('click'));
  need(portControl(s).length===1,'Upstream port is not interactable');
  await channel.perform({condition:'select upstream output for schema preview',initialObservation:s,ready:s=>graph(s)&&portControl(s).length===1,identity:()=>({node:input.source,port_guid:port.port_guid}),resolve:s=>({verb:'click',ref:portControl(s)[0].ref})});
  s=await channel.observe({condition:'selected upstream output preview command',ready:s=>graph(s)&&s.ui.elements.some(e=>e.tid===port.tid&&e.allowed_actions.includes('press'))});
  preview=await openNodeSchemaPreview(options,ctx,config,channel,binding,port,s);
 }

 let error,fields=preview.node_preview_schema.fields;
 try{
  if(admission){need(preview.node_preview_schema.inventory_complete===true&&preview.node_preview_schema.node_id===input.source.node_id
   &&preview.node_preview_schema.port===0,'Managed JavaScript preview schema is incomplete');alignReadSchema(fields,admission.schema);}
  const mapping=request.mappings.find(m=>m.direction==='input');
  if(mapping?.fields){need(mapping.fields.length===fields.length,'Input mapping must account for every upstream field');const seen=new Set();fields=mapping.fields.map(f=>{const source=fields.find(c=>c.name===f.source?.name);need(source&&!seen.has(source.name)&&f.excluded!==true,'Invalid grouping input mapping');seen.add(source.name);return {...source,name:f.name??source.name,label:f.label??source.label};});}
  resolveGroupingParameters(request.parameters,fields);
 }catch(e){error=e;}
 const returned=await closeNodeSchemaPreview(options,channel,preview,binding,port,{label:'grouping'});
 const proof={verified:true,cleanup_complete:true,settings_changed:false,source:input.source,port:input.output,schema:fields,preview:preview.node_preview_schema,node_context:returned.prepared_node_context,parameters_valid:!error,
  ...(admission?{managed_javascript_source:{source_operation_id:admission.source_operation_id,execution_id:admission.execution_id}}:{})};
 const saved=await onRecord({phase:'grouping_preflight_completed',operation_id:operation.id,proof});
 need(saved?.phase==='grouping_preflight_completed'&&JSON.stringify(saved.proof)===JSON.stringify(proof),'Grouping preflight was not durably acknowledged');
 delete operation.groupingPreview;
 if(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 return proof;
}

// Inactive configured sources have no data to preview. Read their complete
// schema in the owned output editor, then cancel without executing upstream.
export async function preflightInactiveTabularSource(options,{channel,binding,port,state},{label,sourceIcons,resolve}){
 const {operation,onRecord}=options,request=operation.parameters;
 // Only the native body signature carries node_id; port signatures carry
 // native object identities instead. The output reader already binds the port.
 const controls=state.ui.elements.filter(e=>e.tid===state.prepared_node_context?.tid&&e.signature?.native_graph?.status==='non_script'
  &&sourceIcons.includes(e.signature.native_graph.icon)&&e.signature.native_graph.node_id===binding.node.node_id);
 if(port.active!==false||port.index!==0||controls.length!==1){
  const error=Error(label+' preflight requires an active source output or a verified configured source');
  error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;
 }
 const icon=controls[0].signature.native_graph.icon;
 await channel.openOutputPort(port.index);
 // The derived Calculator editor exposes its complete stores in Links mode;
 // the import editor exposes the configured schema in Table mode.
 const observed=icon==='bg-vendor-icon-calcdata'?await readCalculatorOutputMapping(channel):await (async()=>{
  await showMissingValuesMappingTable(channel);
  return channel.observe({condition:'complete inactive '+label+' source schema',readMappings:true,
   ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
 })();
 const mapping=observed.node_mapping,owner=observed.prepared_node_context;
 need(mapping.inventory_complete===true&&mapping.source_identity_verified===true
  &&owner.output_port?.port_guid===port.port_guid&&owner.output_port.port===port.index
  &&owner.output_port.node_icon_class===icon,'Inactive '+label+' source schema owner is unconfirmed');
 let fields=mapping.target_fields.filter(f=>!f.excluded).map(({name,label,type})=>({name,label,type})),error;
 try{
  need(fields.length>0&&fields.length<=1000&&new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length
   &&fields.every(f=>typeof f.name==='string'&&f.name.length>0&&typeof f.label==='string'
    &&['boolean','datetime','real','integer','string','variant'].includes(f.type)),'Complete inactive '+label+' source schema required');
  const input=request.mappings.find(m=>m.direction==='input');
  if(input?.fields){need(input.fields.length===fields.length,'Input mapping must account for every upstream field');const seen=new Set();fields=input.fields.map(f=>{const source=fields.find(c=>c.name===f.source?.name);need(source&&!seen.has(source.name)&&f.excluded!==true,'Invalid '+label+' input mapping');seen.add(source.name);return {...source,name:f.name??source.name,label:f.label??source.label};});}
  resolve(request.parameters,fields);
 }catch(e){error=e;}
 const cancellation=await closePreparedWizard(channel);
 need(cancellation.verified===true&&cancellation.draft_discarded===true&&cancellation.settings_applied===false,
  'Inactive '+label+' source cancellation is unconfirmed');
 let returned=await channel.observe({condition:'inactive '+label+' source unchanged after schema inspection',readOutputs:true,
  ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'&&s.node_outputs?.verified===true});
 // Cancelling the editor deselects its node and hides its native port shapes.
 if(!returned.node_outputs.node_selected){
  await selectPreparedGraphNode(channel,returned,'reselect inactive '+label+' source after cancellation',{refreshReplacedBody:true});
  returned=await channel.observe({condition:'selected inactive '+label+' source after schema inspection',readOutputs:true,
   ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'&&s.node_outputs?.verified===true&&s.node_outputs.node_selected===true});
 }
 const after=returned.node_outputs.ports.filter(p=>p.index===port.index);
 need(after.length===1&&after[0].port_guid===port.port_guid&&after[0].active===false,'Inactive '+label+' source identity or activity changed');
 const proof={verified:true,cleanup_complete:true,settings_changed:false,source:binding.node,port:port.index,schema:fields,
  cancellation,node_context:returned.prepared_node_context,parameters_valid:!error,source_activity:{before:false,after:false,changed:false}};
 const phase=label+'_preflight_completed',saved=await onRecord({phase,operation_id:operation.id,proof});
 need(saved?.phase===phase&&JSON.stringify(saved.proof)===JSON.stringify(proof),label+' preflight was not durably acknowledged');
 if(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 return proof;
}
