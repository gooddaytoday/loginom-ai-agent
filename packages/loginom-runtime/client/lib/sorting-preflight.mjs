import {managedJavascriptPreviewAdmission} from './javascript-output-preview.mjs';
import {makeJavascriptManagedSelectionReadCode,dispatchManagedJavascriptBody} from './javascript-managed-selection.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {resolveSortingParameters} from './sorting-parameters.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
// Cancel discards the port draft, but Loginom keeps the source inactive.
// Restore only activity lost by this inspection, through the ordinary owned
// execution driver under this channel's original deadline and cancellation.
export async function restorePreflightSourceActivity(channel,node,before,observeSource,ctx){
 const after=await observeSource();
 need(typeof before.active==='boolean'&&after.port_guid===before.port_guid,'Preflight source port identity changed');
 if(after.active===before.active)return {port:after,execution:null};
 need(before.active===true&&after.active===false,'Unexpected preflight source activation');
 const driver=createNodeExecutionProcedure(channel,node);
 await driver.prepare();
 await finishConfiguredGraph(channel,driver,'execute',node);
 const execution=await driver.waitCompleted({signal:ctx.signal,stopSignal:ctx.stopSignal});
 need(execution.verified===true&&execution.owner_verified===true&&execution.status==='completed'
  &&execution.cleanup_complete===true,'Preflight source execution unconfirmed');
 const port=await observeSource();
 need(port.port_guid===before.port_guid&&port.active===before.active,'Preflight source activity was not restored');
 return {port,execution};
}
export async function preflightSortingSource(options,ctx,config){
 return preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.keys!==undefined,resolve:resolveSortingParameters,label:'sorting'});
}
export async function preflightTabularSource(options,ctx,config,{required,resolve,label,inputPort,existingSource=false}){
 const {operation,execute,onRecord,now,receiptOptions}=options,request=operation.parameters;
 if(!required)return {verified:true,not_applicable:true};
 // Existing input mappings can retain names absent from the upstream output.
 // Validate their effective schema in the normal input wizard, before editing
 // or committing it. New nodes still reject bad keys before graph creation.
 if(request.target.kind==='existing'&&!existingSource)return {verified:true,not_applicable:true,validation_deferred:'input_mapping'};
 if(!(inputPort===undefined?request.inputs.length===1:request.inputs.filter(i=>i.input===inputPort).length===1)){
  const error=Error('Invalid parameters.inputs: '+label+' preflight requires an explicit input');
  error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;
 }
 const input=inputPort===undefined?request.inputs[0]:request.inputs.find(i=>i.input===inputPort),binding={document_id:request.document_id,workflow_ref:request.workflow_ref,node:input.source};
 const channel=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:256,...config,signal:ctx.signal,preparedNodeContext:binding,
  wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
 const graph=s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent';
 let s=await channel.observe({condition:'upstream graph before '+label+' validation',readOutputs:true,ready:s=>graph(s)&&s.node_outputs?.verified===true});
 const ports=s.node_outputs.ports.filter(p=>p.index===input.output);need(ports.length===1,'Exact upstream '+label+' port required');const port=ports[0];
 if(port.active!==true){const error=Error(label+' preflight requires an active source output');error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 const script=s.ui.elements.filter(e=>e.tid===port.tid&&e.signature?.native_graph?.status==='script');
 const admission=['sorting','calculator','filter','join_input_0','join_input_1'].includes(label)&&script.length===1?managedJavascriptPreviewAdmission(options.nodeHistory?.(),binding,port):null;
 if(admission){
  // Join input 0's preview can leave its source selected. Select the owned JS
  // producer with the existing journaled body gesture before strict port capture.
  const task={operation_id:operation.id+':source-select-'+(inputPort??0),owner:binding.node,
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
  await channel.openJavascriptPreview(port);
 }
 if(!admission){
  const portControl=s=>s.ui.elements.filter(e=>e.tid===port.tid&&e.allowed_actions.includes('click'));
  if(portControl(s).length!==1){
   // Only the owned source observation ran: no preview, target or link gesture
   // was dispatched. Do not strand this local refusal as an unknown mutation.
   const error=Error('Upstream port is not interactable. No node or link was created; verify the source output and use a NEW operation_id.');
   error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;
  }
  await channel.perform({condition:'select upstream output for schema preview',initialObservation:s,ready:s=>graph(s)&&portControl(s).length===1,identity:()=>({node:input.source,port_guid:port.port_guid}),resolve:s=>({verb:'click',ref:portControl(s)[0].ref})});
  s=await channel.observe({condition:'selected upstream output preview command',ready:s=>graph(s)&&s.ui.elements.some(e=>e.tid===port.tid&&e.allowed_actions.includes('press'))});
  await channel.perform({condition:'open temporary upstream schema preview',initialObservation:s,ready:graph,identity:()=>({node:input.source,port_guid:port.port_guid}),resolve:s=>({verb:'press',ref:s.ui.elements.find(e=>e.tid===port.tid).ref,key:'F3'})});
 }
 const preview=await channel.observe({condition:'complete owned upstream preview schema',readPreview:true,ready:s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.port_guid===port.port_guid&&s.node_preview_schema.port===input.output});
 let error,fields=preview.node_preview_schema.fields;
 try{
  if(admission){need(preview.node_preview_schema.inventory_complete===true&&preview.node_preview_schema.node_id===input.source.node_id
   &&preview.node_preview_schema.port===0,'Managed JavaScript preview schema is incomplete');alignReadSchema(fields,admission.schema);}
  const mapping=request.mappings.find(m=>m.direction==='input'&&(inputPort===undefined||m.port===inputPort));
  if(mapping?.fields){need(mapping.fields.length===fields.length,'Input mapping must account for every upstream field');const seen=new Set();fields=mapping.fields.map(f=>{const source=fields.find(c=>c.name===f.source?.name);need(source&&!seen.has(source.name)&&f.excluded!==true,'Invalid '+label+' input mapping');seen.add(source.name);return {...source,name:f.name??source.name,label:f.label??source.label};});}
  resolve(request.parameters,fields);
 }catch(e){error=e;}
 const root=preview.node_preview_schema.root_tid;
 await channel.perform({condition:'close temporary '+label+' preflight preview',initialObservation:preview,ready:s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.port_guid===port.port_guid,
  identity:()=>({node:input.source,port_guid:port.port_guid,root}),resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===root+';p.h;close'&&e.allowed_actions.includes('click'));need(es.length===1,'Preview close unavailable');return {verb:'click',ref:es[0].ref};}});
 const returned=await channel.observe({condition:'upstream graph restored after '+label+' validation',readOutputs:true,
  ready:s=>graph(s)&&s.node_outputs?.verified===true});
 const after=returned.node_outputs.ports.filter(p=>p.index===input.output);
 need(after.length===1&&after[0].port_guid===port.port_guid&&after[0].active===port.active,'Preview changed upstream port identity or activity');
 const proof={verified:true,cleanup_complete:true,settings_changed:false,source:input.source,port:input.output,schema:fields,preview:preview.node_preview_schema,node_context:returned.prepared_node_context,parameters_valid:!error,
  source_activity:{before:port.active,after:after[0].active,changed:false},
  ...(admission?{managed_javascript_source:{source_operation_id:admission.source_operation_id,execution_id:admission.execution_id}}:{})};
 const completed=label+'_preflight_completed',saved=await onRecord({phase:completed,operation_id:operation.id,proof});
 need(saved?.phase===completed&&JSON.stringify(saved.proof)===JSON.stringify(proof),label+' preflight was not durably acknowledged');
 if(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 return proof;
}
