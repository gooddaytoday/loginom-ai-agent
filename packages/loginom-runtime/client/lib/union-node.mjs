import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateUnionParameters,unionOutputFields} from './union-parameters.mjs';
import {configureUnion,unionReady} from './union-procedure.mjs';
import {configureUnionInputs,configureUnionOutput} from './union-mappings.mjs';
import {unionConfigurationReadback} from './union-readback.mjs';
import {unionParametersSchema} from './node-api.mjs';
import {preflightUnion} from './union-preflight.mjs';
import {configureDerivedInlineMapping} from './grouping-inline-mapping.mjs';
import {verifyJoinOutputSync} from './join-output-sync.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
// Keep guidance local to Union: the main table belongs to inputs[0], not
// parameters.tables. Descriptions do not change the shared request schema.
const parameterSchema=structuredClone(unionParametersSchema);
parameterSchema.description='Append all rows, preserving duplicates. inputs includes the main table at port 0 and joined tables at ports 1..N. parameters.tables describes ONLY joined tables; never include the main table there. Two total inputs require exactly one tables entry (port 1); three total inputs require exactly two entries (ports 1 and 2).';
parameterSchema.properties.tables.description='Complete mappings for joined input ports 1..N ONLY, in order. Do not list the main table at input port 0. Each source field must have an explicit main field name or null to retain a separate output field.';
parameterSchema.properties.prefixes.description='Always supply enabled, name and label. For no prefixes use {enabled:false,name:"",label:""}. When enabled is true, name must be a nonempty identifier; name and label are prepended only to unmatched joined fields.';
export function validateUnionInlineSources(configuration,native){
 const expected=unionOutputFields(configuration);
 need(native?.verified&&native.inventory_complete&&native.source_identity_verified,'Union inline output not verified');
 need(expected.length===native.source_fields.length&&native.source_fields.every(s=>expected.some(f=>f.name===s.name&&f.label===s.label&&f.type===s.type)),'Union inline sources differ');
 need(native.target_fields.every(f=>!f.inherited&&f.required===false
  &&(!f.excluded||f.source===null&&f.exclusion_source!=null
   &&native.source_fields.some(s=>JSON.stringify(s)===JSON.stringify(f.exclusion_source)))),'Unsupported retained union output');
 return native.target_fields.filter(f=>!f.excluded&&f.source===null);
}
export function createUnionNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.union_data',modes:['append_all'],revision:'union-v4-internal-2',readback:unionConfigurationReadback,parameterSchema,
 validate:validateUnionParameters,preflight:preflightUnion,configureInputs:configureUnionInputs,
 configurationObservation:{condition:'union configuration page',readUnion:true,ready:unionReady},
 async configure(channel,p,{request}){
  const changed=await configureUnion(channel,p,{request});if(request.finish==='close')return changed;
  const validationSource=await channel.observe({condition:'union settings before validation',readUnion:true,ready:unionReady});
  await channel.perform({condition:'validate union settings',initialObservation:validationSource,ready:unionReady,identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(es.length===1,'Union Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'union validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureDerivedInlineMapping(channel,changed.configuration,validateUnionInlineSources,verifyJoinOutputSync,{sourceOf:f=>f.source??f.exclusion_source}):null;
  const done=await channel.observe({condition:'union accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureUnionOutput,
});}
