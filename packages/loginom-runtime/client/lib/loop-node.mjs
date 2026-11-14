import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {loopParametersSchema,validateLoopParameters} from './loop-parameters.mjs';
import {makeLoopSourceCode} from './loop-procedure.mjs';
import {loopConfigurationReadback} from './loop-readback.mjs';
import {alignReadSchema} from './node-read-contract.mjs';

const verified=v=>({verified:true,cleanup_complete:true,effect_possible:false,...v});
export function createLoopNodeSupport(config){
 const support=createTabularTransformNodeSupport(config,{
  type:'control.loop',mode:'group_rows',revision:'loop-group-rows-v1',parameterSchema:loopParametersSchema,validate:validateLoopParameters,readback:loopConfigurationReadback,
  configurationObservation:{condition:'owned Loop selection',ready:s=>s.wizard?.stage==='loop_node'},
  configureInputs:async()=>verified({not_applicable:true,mappings:[]}),
  configure:(channel,p)=>channel.configureLoop(p),
  configureAllOutputs:async(channel,_c,p)=>channel.inspectLoop(p),
  readOutputs:async(channel,read,ctx)=>{
   const ports=[];
   for(const port of read.ports){const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
    output.schema=alignReadSchema(output.schema,null);ports.push(output);}
   return verified({effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports});
  },
 });
 return {...support,nodeApplyDriverFactory:options=>({...support.nodeApplyDriverFactory(options),verifySource:async(_p,ctx)=>{
  const r=options.operation.parameters;
  const graph=await options.operation.nodeTargetAdapter.observe({document_id:r.document_id,workflow_ref:r.workflow_ref},ctx.deadline);
  const source=graph.nodes.filter(n=>n.ref.node_id===r.parameters.body.node_id);
  if(!graph.complete||source.length!==1||source[0].type!=='control.supernode'||JSON.stringify(source[0].inputs)!=='[0]'
   ||JSON.stringify(source[0].outputs)!=='[0]'||source[0].variable_inputs?.length||source[0].variable_outputs?.length
   ||source[0].input_kinds?.some(k=>k!=='data')||source[0].output_kinds?.some(k=>k!=='data'))throw Error('Loop: same-workflow one-table Supernode required before mutation');
  const evidence=await options.execute(makeLoopSourceCode({document_id:r.document_id,workflow_ref:r.workflow_ref,body:r.parameters.body,
   ...(r.target.kind==='existing'?{loop:r.target.ref}:{}),origin:config.targetOrigin,build:config.targetBuild}),{timeout:Math.max(1000,ctx.deadline-Date.now())});
  options.operation.loopSource=evidence;
  return verified({source_kind:'same_workflow_supernode',...evidence});
 }})};
}
