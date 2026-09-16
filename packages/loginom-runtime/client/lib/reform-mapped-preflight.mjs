import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {selectPreparedGraphNode} from './node-graph-selection.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {resolveConfiguredOutputMapping} from './port-mapping-procedure.mjs';
import {bindReformInput} from './reform-input.mjs';
import {resolveReformChanges} from './reform-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};

export function resolveMappedReformChanges(parameters,configuration,input,mapping){
 const bound=bindReformInput(configuration,input);
 const resolved=resolveConfiguredOutputMapping(mapping,input.source_fields.map(f=>({...f,used:true})),input);
 const fields=resolved.fields??input.target_fields.map(f=>({...f,current:f}));
 const projected=fields.map((f,index)=>{
  const original=bound.fields.find(c=>c.field_id===f.current.field_id);
  need(original,'Reform preflight input identity disappeared');
  return {...original,index,
   name:original.name===original.input_field.name?f.name:original.name,
   label:original.label===original.input_field.label?f.label:original.label,
   input_field:{...original.input_field,name:f.name,label:f.label,index}};
 });
 return resolveReformChanges(parameters,{...bound,fields:projected});
}

// Only mixed existing-node requests need this read-only validation pass. A
// separate input-port Done commits independently of the node wizard; validate
// the complete field patch before allowing that earlier settings commit.
export async function preflightMappedReform(options,ctx,config){
 const {operation,execute,onRecord,now,receiptOptions}=options,request=operation.parameters;
 const mapping=request.mappings.find(m=>m.direction==='input');
 if(request.target.kind!=='existing'||!request.parameters.changes.length||!mapping)return null;
 const node=request.target.ref;
 const channel=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:256,...config,signal:ctx.signal,
  preparedNodeContext:{document_id:request.document_id,workflow_ref:request.workflow_ref,node},
  wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
 await channel.openInputPort(0);
 const incoming=await channel.observe({condition:'mixed reform input baseline',readMappings:true,ready:s=>s.node_mapping?.verified===true});
 const input=incoming.node_mapping;
 await closePreparedWizard(channel);
 const graph=await channel.observe({condition:'graph before mixed reform validation',ready:s=>s.prepared_node_context?.surface==='graph'});
 await selectPreparedGraphNode(channel,graph,'select existing reform for mixed request validation');
 const opening=await openPreparedWizard(channel);
 const current=await channel.observe({condition:'mixed reform complete saved configuration',readReform:true,ready:s=>s.node_reform?.verified===true});
 let validationError;
 try{resolveMappedReformChanges(request.parameters,current.node_reform,input,mapping);}catch(error){validationError=error;}
 const closed=await closePreparedWizard(channel);
 const proof={verified:true,settings_unchanged:true,cleanup_complete:true,input,configuration:current.node_reform,
  opening,closed,parameters_valid:!validationError};
 const phase='reform_mapped_preflight_completed';
 const saved=await onRecord({phase,operation_id:operation.id,proof});
 need(saved?.phase===phase&&JSON.stringify(saved.proof)===JSON.stringify(proof),'Mixed reform validation was not durably acknowledged');
 if(validationError){
  // Opening settings may deactivate an active node. Report that possible
  // effect honestly, while recording a known refusal with no pending draft.
  validationError.nodePhaseRefusal={phase:'target',status:'FAILED',effect_possible:true,cleanup_complete:true,
   settings_unchanged:true,verification:'reform_mapped_preflight_completed'};
  throw validationError;
 }
 return proof;
}
