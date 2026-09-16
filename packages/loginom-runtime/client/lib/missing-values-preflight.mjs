import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {selectPreparedGraphNode} from './node-graph-selection.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {showMissingValuesMappingTable} from './missing-values-output.mjs';
import {resolveMissingValuesParameters} from './missing-values-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};

// Preview column infos contain type but no data kind. The output-port editor
// exposes the effective kind; cancel its unchanged draft before creating a node.
// Loginom may deactivate the source on opening. Cancellation discards settings,
// but does not reactivate data: execution remains the requested node phase.
export async function preflightMissingValuesSource(options,ctx,config){
 const {operation,execute,onRecord,now,receiptOptions}=options,request=operation.parameters;
 if(request.target.kind==='existing')return {verified:true,not_applicable:true,validation_deferred:'input_mapping'};
 need(request.inputs.length===1,'Missing values requires one explicit source');
 const input=request.inputs[0],binding={document_id:request.document_id,workflow_ref:request.workflow_ref,node:input.source};
 const channel=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:256,...config,signal:ctx.signal,preparedNodeContext:binding,
  wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
 const graph=s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent';
 const observeSource=async()=>{
  let s=await channel.observe({condition:'missing values source output activity',readOutputs:true,ready:s=>graph(s)&&s.node_outputs?.verified===true});
  if(!s.node_outputs.node_selected){await selectPreparedGraphNode(channel,s,'select missing values source',{refreshReplacedBody:true});s=await channel.observe({condition:'selected missing values source output',readOutputs:true,ready:s=>graph(s)&&s.node_outputs?.verified&&s.node_outputs.node_selected});}
  const ports=s.node_outputs.ports.filter(p=>p.index===input.output);need(ports.length===1,'Exact source output required');return ports[0];
 };
 const before=await observeSource();
 await channel.openOutputPort(input.output);await showMissingValuesMappingTable(channel);
 const s=await channel.observe({condition:'complete source types and kinds',readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
 const mapping=s.node_mapping;
 need(s.prepared_node_context.output_port?.port_guid===before.port_guid,'Source output owner changed');
 let fields=mapping.target_fields.filter(f=>!f.excluded).map(({name,label,type,data_kind})=>({name,label,type,data_kind})),error;
 try{
  const requested=request.mappings.find(m=>m.direction==='input');
  if(requested?.fields){
   need(requested.fields.length===fields.length,'Input mapping must account for every source field');const seen=new Set();
   fields=requested.fields.map(f=>{const source=fields.find(c=>c.name===f.source?.name);need(source&&!seen.has(source.name)&&f.excluded!==true,'Invalid missing values input mapping');seen.add(source.name);return {...source,name:f.name??source.name,label:f.label??source.label};});
  }
  resolveMissingValuesParameters(request.parameters,fields);
 }catch(e){error=e;}
 const cancelled=await closePreparedWizard(channel),after=await observeSource();
 need(cancelled.draft_discarded===true&&after.port_guid===before.port_guid,'Source port cancellation or identity was not verified');
 const proof={verified:true,cleanup_complete:true,effect_possible:before.active!==after.active,settings_changed:false,source:input.source,port:input.output,port_guid:before.port_guid,schema:fields,source_activity:{before:before.active,after:after.active,changed:before.active!==after.active},cancellation:cancelled,parameters_valid:!error};
 const phase='missing_values_preflight_completed',saved=await onRecord({phase,operation_id:operation.id,proof});
 need(saved?.phase===phase&&JSON.stringify(saved.proof)===JSON.stringify(proof),'Missing values source proof was not durably acknowledged');
 if(error){error.nodePhaseRefusal={phase:'target',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:'missing_values_preflight_completed'};throw error;}
 // A later graph refusal may still be terminal although this inspection
 // deactivated the source. Carry only the durably acknowledged, unchanged
 // settings proof; lost replies and unfinished editors never reach this point.
 return {...proof,target_refusal:{phase:'target',status:'FAILED',effect_possible:true,
  cleanup_complete:true,settings_unchanged:true,verification:phase}};
}
