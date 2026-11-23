import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateEnrichParameters,enrichOutputFields} from './enrich-parameters.mjs';
import {configureEnrich,enrichReady} from './enrich-procedure.mjs';
import {configureEnrichInputs,configureEnrichOutput} from './enrich-mappings.mjs';
import {enrichConfigurationReadback} from './enrich-readback.mjs';
import {enrichParametersSchema} from './node-api.mjs';
import {preflightEnrich} from './enrich-preflight.mjs';
import {configureDerivedInlineMapping} from './grouping-inline-mapping.mjs';
import {verifyJoinOutputSync} from './join-output-sync.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export function validateEnrichInlineSources(configuration,native){
 const expected=enrichOutputFields(configuration);
 need(native?.verified&&native.inventory_complete&&native.source_identity_verified,'Enrich inline output not verified');
 need(expected.length===native.source_fields.length&&native.source_fields.every(s=>expected.some(f=>f.name===s.name&&f.label===s.label&&f.type===s.type)),'Enrich inline sources differ');
 need(native.target_fields.every(f=>!f.inherited&&f.required===false
  &&(!f.excluded||f.source===null&&f.exclusion_source!=null
   &&native.source_fields.some(s=>JSON.stringify(s)===JSON.stringify(f.exclusion_source)))),'Unsupported retained enrich output');
 return native.target_fields.filter(f=>!f.excluded&&f.source===null);
}
export function createEnrichNodeSupport(config){
 const implementation=options=>({
 type:'transform.enrich_data',modes:['left'],revision:'enrich-v1-internal-1',readback:enrichConfigurationReadback,parameterSchema:enrichParametersSchema,
 validate:validateEnrichParameters,preflight:preflightEnrich,configureInputs:(channel,mappings,ctx,request,finishWizard)=>configureEnrichInputs(channel,mappings,ctx,request,finishWizard,
  {graph:options.operation.targetPhase?.last_graph,node:options.operation.nodeApply.node}),
 configurationObservation:{condition:'enrich configuration page',readEnrich:true,ready:enrichReady},
 async configure(channel,p,{request}){
  const changed=await configureEnrich(channel,p,{request});if(request.finish==='close')return changed;
  const validationSource=await channel.observe({condition:'enrich settings before validation',readEnrich:true,ready:enrichReady});
  await channel.perform({condition:'validate enrich settings',initialObservation:validationSource,ready:enrichReady,identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(es.length===1,'Enrich Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'enrich validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureDerivedInlineMapping(channel,changed.configuration,validateEnrichInlineSources,verifyJoinOutputSync,{sourceOf:f=>f.source??f.exclusion_source}):null;
  const done=await channel.observe({condition:'enrich accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureEnrichOutput,
});
 const support=createTabularTransformNodeSupport(config,implementation());
 return {...support,nodeApplyDriverFactory:options=>createTabularTransformNodeSupport(config,implementation(options)).nodeApplyDriverFactory(options)};
}
