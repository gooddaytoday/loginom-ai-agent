import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {supernodeParametersSchema,validateSupernodeParameters} from './supernode-parameters.mjs';
import {configureSupernode} from './supernode-procedure.mjs';
import {supernodeConfigurationReadback} from './supernode-readback.mjs';
import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';

const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
export function createSupernodeNodeSupport(config){
 const support=createTabularTransformNodeSupport(config,{
  type:'control.supernode',mode:'tabular_boundary',revision:'supernode-table-v1',
  parameterSchema:supernodeParametersSchema,validate:validateSupernodeParameters,readback:supernodeConfigurationReadback,
  configurationObservation:{condition:'owned Supernode ports',readSupernode:true,ready:s=>s.wizard?.stage==='supernode'&&s.node_supernode?.verified===true},
  configureInputs:async()=>verified({not_applicable:true,mappings:[]}),
  configureAllOutputs:async()=>verified({not_applicable:true,mappings:[]}),
  configure:configureSupernode,
 });
 return {...support,nodeApplyDriverFactory:options=>({...support.nodeApplyDriverFactory(options),verifySource:async(_p,ctx)=>{
  const request=options.operation.parameters;
  if(request.target.kind==='new'){
   const g=await options.operation.nodeTargetAdapter.observe({document_id:request.document_id,workflow_ref:request.workflow_ref},ctx.deadline);
   if(!g.complete||g.nodes.some(n=>n.boundary_role))throw Error('Nested Supernodes are unsupported; return to the parent workflow');
  }
  return verified({not_applicable:true});
 }})};
}

// The output boundary is an existing native service node. Only its local input
// link is editable; it has no wizard, creation, execution or output read.
export function createSupernodeOutputNodeSupport(config){
 const nodeApplyHandlers=new Map([['control.supernode_output',{
  revision:'supernode-output-link-v1',modes:['tabular_boundary'],parameter_schema:{type:'object',properties:{},additionalProperties:false},
  validate(p,m,r){
   if(m!=='tabular_boundary'||r.target.kind!=='existing'||Object.keys(p).length||r.mappings.length||r.variable_inputs?.length
    ||r.target.label!==undefined||r.target.position!==undefined||r.finish!=='done'||r.read.ports.length||r.read.variable_ports?.length
    ||r.inputs.length>1)throw Error('Supernode output boundary: existing target, local inputs, parameters:{}, mappings:[], finish:done and no reads required');
  },configure:(ctx,_p,drivers)=>drivers.configureBoundary(ctx),
 }]]);
 return {nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  let channel;
  const inspect=async ctx=>{
   options.operation.deadline=ctx.deadline;
   channel??=createNodeProcedure({operation:options.operation,execute:options.execute,record:options.onRecord,now:options.now,
    targetOrigin:config.targetOrigin,targetBuild:config.targetBuild,signal:ctx.signal,
    preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
    wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...options.receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
   const g=await options.operation.nodeTargetAdapter.observe({document_id:ctx.document_id,workflow_ref:ctx.workflow_ref},ctx.deadline);
   const nodes=g.nodes.filter(n=>n.ref.node_id===ctx.node.node_id);
   if(g.complete!==true||nodes.length!==1||nodes[0].boundary_role!=='output'||nodes[0].type!=='control.supernode_output'
    ||JSON.stringify(nodes[0].inputs)!=='[0]'||nodes[0].outputs.length)throw Error('Exact one-table native output boundary required');
   const s=await channel.observe({condition:'owned nested output boundary',ready:s=>s.prepared_node_context?.surface==='graph'});
   return verified({node_context:s.prepared_node_context});
  };
  return {verifySource:async()=>verified({not_applicable:true}),mapPorts:async()=>verified({not_applicable:true}),
   openWizard:inspect,configureBoundary:inspect,finish:async(mode,ctx)=>({...await inspect(ctx),mode,settings_applied:false,execution_started:false})};
 }};
}
