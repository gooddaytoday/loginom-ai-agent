import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateJoinParameters,resolveJoinKeys,joinOutputFields} from './join-parameters.mjs';
import {configureJoin,joinReady} from './join-procedure.mjs';
import {configureJoinInputs,configureJoinOutput,effectiveJoinInput} from './join-mappings.mjs';
import {joinConfigurationReadback} from './join-readback.mjs';
import {joinParametersSchema} from './node-api.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {configureDerivedInlineMapping} from './grouping-inline-mapping.mjs';
import {verifyJoinOutputSync} from './join-output-sync.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export async function preflightJoin(options,ctx,config){
 const request=options.operation.parameters;
 if(request.finish==='close'||!request.parameters.keys)return {verified:true,not_applicable:true};
 const schemas=[],proofs=[];
 for(const inputPort of [0,1]){
  if(request.target.kind==='new'){
   proofs.push(await preflightTabularSource(options,ctx,config,{required:true,inputPort,label:'join_input_'+inputPort,resolve:(p,fields)=>{schemas[inputPort]=fields;}}));
  }else{
   const {operation,execute,onRecord,now,receiptOptions}=options;
   const channel=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:256,...config,signal:ctx.signal,
    preparedNodeContext:{document_id:request.document_id,workflow_ref:request.workflow_ref,node:request.target.ref},
    wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
   await channel.openInputPort(inputPort);
   const state=await channel.observe({condition:'join unchanged input preflight',readMappings:true,ready:s=>s.node_mapping?.verified&&s.node_mapping.node_context.input_port?.port===inputPort});
   let error;try{schemas[inputPort]=effectiveJoinInput(request.mappings.find(m=>m.direction==='input'&&m.port===inputPort)??{direction:'input',port:inputPort},state.node_mapping);}catch(e){error=e;}
   const closed=await closePreparedWizard(channel);proofs.push({port:inputPort,native_mapping:state.node_mapping,closed});
   if(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
  }
 }
 try{
  resolveJoinKeys(request.parameters,schemas);
  const fields=joinOutputFields({input_fields:schemas,...request.parameters});
  need(new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,'Join output source names conflict; rename an input field');
  const output=request.mappings.find(m=>m.direction==='output');
  if(output?.fields)need(output.fields.length===fields.length&&output.fields.every(f=>fields.some(s=>s.name===f.source.name)),'Join output mapping is incomplete');
 }catch(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 return {verified:true,proofs};
}
export function validateJoinInlineSources(configuration,native){
 const expected=joinOutputFields(configuration);
 need(native?.verified&&native.inventory_complete&&native.source_identity_verified,'Join inline output not verified');
 need(expected.length===native.source_fields.length&&native.source_fields.every(s=>expected.some(f=>f.name===s.name&&f.label===s.label&&f.type===s.type)),'Join inline sources differ');
 need(native.target_fields.every(f=>!f.inherited&&f.required===false
  &&(!f.excluded||f.source===null&&f.exclusion_source!=null
   &&native.source_fields.some(s=>JSON.stringify(s)===JSON.stringify(f.exclusion_source)))),'Unsupported retained join output');
 return native.target_fields.filter(f=>!f.excluded&&f.source===null);
}
export function createJoinNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.join_data',modes:['inner','left'],revision:'join-v4-internal-1',readback:joinConfigurationReadback,parameterSchema:joinParametersSchema,
 validate:validateJoinParameters,preflight:preflightJoin,configureInputs:configureJoinInputs,
 configurationObservation:{condition:'join configuration page',readJoin:true,ready:joinReady},
 async configure(channel,p,{request}){
  const changed=await configureJoin(channel,p,{request});if(request.finish==='close')return changed;
  const validationSource=await channel.observe({condition:'join settings before validation',readJoin:true,ready:joinReady});
  await channel.perform({condition:'validate join settings',initialObservation:validationSource,ready:joinReady,identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(es.length===1,'Join Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'join validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureDerivedInlineMapping(channel,changed.configuration,validateJoinInlineSources,verifyJoinOutputSync,{sourceOf:f=>f.source??f.exclusion_source}):null;
  const done=await channel.observe({condition:'join accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureJoinOutput,
});}
