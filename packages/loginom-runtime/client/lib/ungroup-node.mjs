import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateUngroupParameters,resolveUngroupFields,ungroupOutputFields} from './ungroup-parameters.mjs';
import {configureUngroup,ungroupReady,supportedUngroupConfiguration} from './ungroup-procedure.mjs';
import {configureUngroupInputs,configureUngroupOutput,effectiveUngroupInput} from './ungroup-mappings.mjs';
import {ungroupConfigurationReadback} from './ungroup-readback.mjs';
import {ungroupParametersSchema} from './node-api.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {configureDerivedInlineMapping} from './grouping-inline-mapping.mjs';
import {verifyJoinOutputSync} from './join-output-sync.mjs';
const need=(v,m)=>{if(!v)throw Error('Ungroup: '+m);};
export async function preflightUngroup(options,ctx,config){
 const request=options.operation.parameters;
 if(request.finish==='close'||!request.parameters.ungroup)return {verified:true,not_applicable:true};
 const schemas=[],proofs=[];
 for(const inputPort of [0,1]){
  if(request.target.kind==='new')proofs.push(await preflightTabularSource(options,ctx,config,{required:true,inputPort,label:'ungroup_input_'+inputPort,resolve:(p,fields)=>{schemas[inputPort]=fields;}}));
  else{
   const {operation,execute,onRecord,now,receiptOptions}=options;
   const channel=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:256,...config,signal:ctx.signal,
    preparedNodeContext:{document_id:request.document_id,workflow_ref:request.workflow_ref,node:request.target.ref},
    wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
   await channel.openInputPort(inputPort);
   const s=await channel.observe({condition:'ungroup effective input schema',readMappings:true,ready:s=>s.node_mapping?.verified&&s.node_mapping.node_context.input_port?.port===inputPort});
   let error;try{schemas[inputPort]=effectiveUngroupInput(request.mappings.find(m=>m.direction==='input'&&m.port===inputPort)??{direction:'input',port:inputPort},s.node_mapping);}catch(e){error=e;}
   const closed=await closePreparedWizard(channel);proofs.push({port:inputPort,native_mapping:s.node_mapping,closed});
   if(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
  }
 }
 try{
  // Preview proves names/types, while complete native port mappings below
  // retain the strict data_kind check before any input mapping commit.
  resolveUngroupFields(request.parameters.ungroup,schemas,{requireKinds:request.target.kind==='existing'});
  const fields=ungroupOutputFields({input_fields:schemas,ungroup:request.parameters.ungroup});
  need(new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,'generated names conflict; rename inputs explicitly');
 }catch(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 return {verified:true,proofs};
}
export function validateUngroupInlineSources(c,native){
 const expected=ungroupOutputFields({...c,ungroup:supportedUngroupConfiguration(c)});
 need(native?.verified&&native.inventory_complete&&native.source_identity_verified,'inline output not verified');
 need(expected.length===native.source_fields.length&&expected.every(f=>native.source_fields.some(s=>s.name===f.name&&s.type===f.type)),'inline generated fields differ');
 need(native.target_fields.every(f=>!f.inherited&&!f.excluded),'unsupported retained output');
 return native.target_fields.filter(f=>f.source===null);
}
export function createUngroupNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.ungroup_data',mode:'shares',revision:'ungroup-shares-v1',readback:ungroupConfigurationReadback,parameterSchema:ungroupParametersSchema,
 validate:validateUngroupParameters,preflight:preflightUngroup,configureInputs:configureUngroupInputs,
 configurationObservation:{condition:'ungroup configuration page',readUngroup:true,ready:ungroupReady},
 async configure(channel,p,{request}){
  const changed=await configureUngroup(channel,p,{request});if(request.finish==='close')return changed;
  const initialObservation=await channel.observe({condition:'ungroup before Next',readUngroup:true,ready:ungroupReady});
  await channel.perform({condition:'validate native ungroup settings',initialObservation,ready:ungroupReady,identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(es.length===1,'Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'ungroup validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureDerivedInlineMapping(channel,changed.configuration,validateUngroupInlineSources,verifyJoinOutputSync,{sourceOf:f=>f.source??f.exclusion_source}):null;
  const done=await channel.observe({condition:'ungroup accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureUngroupOutput,
});}
