import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createNodeTargetBrowserAdapter} from './node-target-browser.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {effectiveColUnionInput} from './col-union-mappings.mjs';
import {validateColUnionSchemas} from './col-union-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export function validateColUnionGraphInputs(request,graph){
 for(const input of request.inputs){
  const matches=graph.nodes.filter(n=>['document_id','workflow_id','node_id'].every(k=>n.ref?.[k]===input.source[k]));
  need(matches.length===1&&matches[0].outputs.includes(input.output),'Exact union source output is absent from the current graph');
 }
}
export function colUnionInputSchemaOrigin(existing,graph,port){
 // An allocated port can still be free. Its empty mapping wizard has no
 // upstream schema; inspect the requested source before making the new link.
 return existing&&graph.links.some(e=>e.target===existing.ref.node_id&&e.input===port)?'existing_mapping':'requested_source';
}
export async function preflightColUnion(options,ctx,config){
 const {operation,execute,onRecord,now,receiptOptions}=options,request=operation.parameters;
 if(request.finish==='close')return {verified:true,not_applicable:true};
 const count=2,schemas=[],proofs=[];
 const graph=await createNodeTargetBrowserAdapter({execute,origin:config.targetOrigin,build:config.targetBuild}).observe(request,ctx.deadline);
 const existing=request.target.kind==='existing'?graph.nodes.find(n=>n.ref.node_id===request.target.ref.node_id):null;
 try{
  validateColUnionGraphInputs(request,graph);
  if(request.target.kind==='existing')need(existing?.type==='transform.col_union_data','Existing union identity required');
  need(!existing||existing.locked===false,'ColUnion input preflight requires a writable node');
  need(!existing||existing.inputs.length<=count,'Removing an existing union input requires explicit separate intent');
 }catch(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 for(let port=0;port<count;port++){
  if(colUnionInputSchemaOrigin(existing,graph,port)==='requested_source'){
   proofs.push(await preflightTabularSource(options,ctx,config,{required:true,inputPort:port,existingSource:true,label:'col_union_input_'+port,resolve:(p,fields)=>{schemas[port]=fields;}}));
  }else{
   const channel=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:256,...config,signal:ctx.signal,
    preparedNodeContext:{document_id:request.document_id,workflow_ref:request.workflow_ref,node:request.target.ref},
    wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
   await channel.openInputPort(port);
   const s=await channel.observe({condition:'union existing input preflight',readMappings:true,ready:s=>s.node_mapping?.verified&&s.node_mapping.node_context.input_port?.port===port});
   let error;try{schemas[port]=effectiveColUnionInput(request.mappings.find(m=>m.direction==='input'&&m.port===port)??{direction:'input',port},s.node_mapping);}catch(e){error=e;}
   const closed=await closePreparedWizard(channel);proofs.push({port,native_mapping:s.node_mapping,closed});
   if(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
  }
 }
 try{validateColUnionSchemas(request,schemas);}catch(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 return {verified:true,proofs};
}
