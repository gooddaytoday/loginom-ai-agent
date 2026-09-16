import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {resolveGroupingParameters} from './grouping-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export async function preflightGroupingSource(options,ctx,config){
 const {operation,execute,onRecord,now,receiptOptions}=options,request=operation.parameters;
 if(request.parameters.group_by===undefined)return {verified:true,not_applicable:true};
 need(request.inputs.length===1,'Grouping preflight requires an explicit input');
 const input=request.inputs[0],binding={document_id:request.document_id,workflow_ref:request.workflow_ref,node:input.source};
 const channel=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:256,...config,signal:ctx.signal,preparedNodeContext:binding,
  wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
 const graph=s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent';
 let s=await channel.observe({condition:'upstream graph before grouping validation',readOutputs:true,ready:s=>graph(s)&&s.node_outputs?.verified===true});
 const ports=s.node_outputs.ports.filter(p=>p.index===input.output);need(ports.length===1,'Exact upstream grouping port required');const port=ports[0];
 if(port.index!==0||port.active!==true){const error=Error('Grouping preflight requires an active source output zero');error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 const portControl=s=>s.ui.elements.filter(e=>e.tid===port.tid&&e.allowed_actions.includes('click'));
 need(portControl(s).length===1,'Upstream port is not interactable');
 await channel.perform({condition:'select upstream output for schema preview',initialObservation:s,ready:s=>graph(s)&&portControl(s).length===1,identity:()=>({node:input.source,port_guid:port.port_guid}),resolve:s=>({verb:'click',ref:portControl(s)[0].ref})});
 s=await channel.observe({condition:'selected upstream output preview command',ready:s=>graph(s)&&s.ui.elements.some(e=>e.tid===port.tid&&e.allowed_actions.includes('press'))});
 await channel.perform({condition:'open temporary upstream schema preview',initialObservation:s,ready:graph,identity:()=>({node:input.source,port_guid:port.port_guid}),resolve:s=>({verb:'press',ref:s.ui.elements.find(e=>e.tid===port.tid).ref,key:'F3'})});
 const preview=await channel.observe({condition:'complete owned upstream preview schema',readPreview:true,ready:s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.port_guid===port.port_guid});
 let error,fields=preview.node_preview_schema.fields;
 try{
  const mapping=request.mappings.find(m=>m.direction==='input');
  if(mapping?.fields){need(mapping.fields.length===fields.length,'Input mapping must account for every upstream field');const seen=new Set();fields=mapping.fields.map(f=>{const source=fields.find(c=>c.name===f.source?.name);need(source&&!seen.has(source.name)&&f.excluded!==true,'Invalid grouping input mapping');seen.add(source.name);return {...source,name:f.name??source.name,label:f.label??source.label};});}
  resolveGroupingParameters(request.parameters,fields);
 }catch(e){error=e;}
 const root=preview.node_preview_schema.root_tid;
 await channel.perform({condition:'close temporary grouping preflight preview',initialObservation:preview,ready:s=>s.node_preview_schema?.verified===true&&s.node_preview_schema.port_guid===port.port_guid,
  identity:()=>({node:input.source,port_guid:port.port_guid,root}),resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===root+';p.h;close'&&e.allowed_actions.includes('click'));need(es.length===1,'Preview close unavailable');return {verb:'click',ref:es[0].ref};}});
 const returned=await channel.observe({condition:'upstream graph restored after grouping validation',ready:graph});
 const proof={verified:true,cleanup_complete:true,settings_changed:false,source:input.source,port:input.output,schema:fields,preview:preview.node_preview_schema,node_context:returned.prepared_node_context,parameters_valid:!error};
 const saved=await onRecord({phase:'grouping_preflight_completed',operation_id:operation.id,proof});
 need(saved?.phase==='grouping_preflight_completed'&&JSON.stringify(saved.proof)===JSON.stringify(proof),'Grouping preflight was not durably acknowledged');
 if(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 return proof;
}
