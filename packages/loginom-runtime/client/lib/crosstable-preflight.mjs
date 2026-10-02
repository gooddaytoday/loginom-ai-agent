import {selectPreparedGraphNode} from './node-graph-selection.mjs';
import {showMissingValuesMappingTable} from './missing-values-output.mjs';
import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {resolveCrossTableParameters} from './crosstable-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('CrossTable preflight: '+m);};
// DataKind comes from the existing owned output definition. Generic F3 preview
// omits it; do not infer discrete from string or create an incompatible target.
export async function preflightCrossTableSource(options,ctx,config){
 const {operation,execute,onRecord,now,receiptOptions}=options,r=operation.parameters;
 if(r.parameters.row_keys===undefined)return {verified:true,not_applicable:true};
 need(r.inputs.length===1,'explicit input required');const input=r.inputs[0];
 const channel=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:1024,...config,signal:ctx.signal,
  preparedNodeContext:{document_id:r.document_id,workflow_ref:r.workflow_ref,node:input.source},
  wrapMutation:(code,receipt)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(receipt.id,receipt.action_key,receipt.signature),operation_id:receipt.id})});
 let graph=await channel.observe({condition:'owned upstream before CrossTable validation',readOutputs:true,
  ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_outputs?.verified===true});
 if(!graph.node_outputs.node_selected){await selectPreparedGraphNode(channel,graph,'select CrossTable upstream',{refreshReplacedBody:true});
  graph=await channel.observe({condition:'selected CrossTable upstream',readOutputs:true,ready:s=>s.node_outputs?.verified===true&&s.node_outputs.node_selected});}
 const ports=graph.node_outputs.ports.filter(p=>p.index===input.output);
 if(ports.length!==1||ports[0].active!==true){const error=Error('CrossTable: execute and read the upstream table before configuring this node');
  error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 await channel.openOutputPort(input.output);await showMissingValuesMappingTable(channel);
 const observed=await channel.observe({condition:'upstream complete output definition',readMappings:true,
  ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true});
 const definition=await readOutputDefinitionPages(channel,{expectedCount:observed.node_mapping.target_fields.length});
 need(definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===observed.node_mapping.target_fields[i][k])),'rendered/native definitions differ');
 const fields=observed.node_mapping.target_fields.filter(f=>!f.excluded);let refusal;
 try{resolveCrossTableParameters(r.parameters,fields);}catch(error){refusal=error;}
 const cancelled=await closePreparedWizard(channel);
 need(cancelled.verified===true&&cancelled.settings_applied===false,'preflight cancellation unconfirmed');
 const returned=await channel.observe({condition:'upstream graph after CrossTable preflight cancellation',ready:s=>s.prepared_node_context?.surface==='graph'});
 await selectPreparedGraphNode(channel,returned,'refresh upstream after cancelled definition',{refreshReplacedBody:true});
 const after=await channel.observe({condition:'upstream activity after cancelled definition',readOutputs:true,
  ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_outputs?.verified===true&&s.node_outputs.ports.some(p=>p.index===input.output)});
 const current=after.node_outputs.ports.find(p=>p.index===input.output);need(current.port_guid===ports[0].port_guid,'source port identity changed');
 const proof={verified:true,cleanup_complete:true,effect_possible:ports[0].active!==current.active,settings_changed:false,source:input.source,port:input.output,
  source_activity:{before:ports[0].active,after:current.active,changed:ports[0].active!==current.active},
  schema:fields,definition,cancelled,parameters_valid:!refusal};
 const saved=await onRecord({phase:'crosstable_preflight_completed',operation_id:operation.id,proof});
 need(saved?.phase==='crosstable_preflight_completed'&&JSON.stringify(saved.proof)===JSON.stringify(proof),'journal acknowledgement differs');
 const target_refusal={phase:'target',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,
  verification:'crosstable_preflight_completed',proof};
 if(refusal){refusal.nodePhaseRefusal=target_refusal;throw refusal;}
 return {...proof,target_refusal};
}
