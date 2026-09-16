import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateReformChanges} from './reform-parameters.mjs';
import {preflightReformSource,validateReformInputParameters} from './reform-preflight.mjs';
import {configureReform} from './reform-procedure.mjs';
import {configureReformOutput,reformOutputSources,verifyReformInlineSync} from './reform-output.mjs';
import {reformConfigurationReadback} from './reform-readback.mjs';
import {reformParametersSchema} from './node-api.mjs';
import {configureDerivedInlineMapping} from './grouping-inline-mapping.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export function validateReformParameters(p,mode,r){
 need(mode==='scalar','Reform supports scalar mode');validateReformChanges(p);
 need(p.changes.every(c=>c.field.kind==='input_field'),'Public reform changes require input_field names');
 need(r.target.kind==='existing'||r.inputs.length===1,'New reform requires one explicit input');
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)&&r.read.ports.every(p=>p===0),'Reform has one table input/output');
 need(r.mappings.every(m=>m.port===0&&(m.fields??[]).every(f=>f.source?.kind==='configured_field'&&(m.direction==='output'||f.excluded!==true))),'Reform mappings require configured names and no input exclusion');
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit input mappings');
}
export function validateReformInlineSources(c,m){
 need(m.mapping_wizard==='DerivedDataSourceMappingEngineOutputPortWizard','Owned reform conditional output required');
 reformOutputSources(c,m);
 need(m.target_fields.every(f=>!f.excluded&&!f.inherited&&f.required===false),'Unsupported retained reform conditional output');
 const obsolete=m.target_fields.filter(f=>f.source===null);
 need(obsolete.every(f=>!m.source_fields.some(s=>s.name===f.name)),'A current reform source cannot be pruned');return obsolete;
}
export function createReformNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.reform_columns',mode:'scalar',revision:'reform-v3-internal-1',readback:reformConfigurationReadback,parameterSchema:reformParametersSchema,
 validate:validateReformParameters,validateInput:validateReformInputParameters,preflight:preflightReformSource,
 configurationObservation:{condition:'reform configuration page',readReform:true,ready:s=>s.wizard?.stage==='field_parameters'&&s.node_reform?.verified===true},
 async configure(channel,p,{request,inputMapping}){
  // Close has no committed input phase. It requests disposal, so do not open
  // field editors or change a draft merely to discard those same changes.
  if(request.finish==='close'){
   const s=await channel.observe({condition:'reform draft ready for disposal',readReform:true,ready:s=>s.wizard?.stage==='field_parameters'&&s.node_reform?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_reform,draft_edits_skipped:true};
  }
  need(inputMapping,'Reform requires the verified incoming mapping');
  const changed=await configureReform(channel,p,{inputMapping});
  await channel.perform({condition:'validate reform and advance',ready:s=>s.wizard?.stage==='field_parameters',identity:s=>s.prepared_node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(es.length===1,'Reform Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'reform validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureDerivedInlineMapping(channel,changed.configuration,validateReformInlineSources,
   (before,after,missing)=>verifyReformInlineSync(before,after,missing,changed.baseline_configuration,changed.configuration)):null;
  const done=await channel.observe({condition:'reform accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureReformOutput,
});}
