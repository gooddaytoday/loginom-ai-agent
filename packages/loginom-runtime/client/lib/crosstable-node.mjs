import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {preflightCrossTableSource} from './crosstable-preflight.mjs';
import {validateCrossTableParameters} from './crosstable-parameters.mjs';
import {configureCrossTable} from './crosstable-procedure.mjs';
import {materializeCrossTableOutput} from './crosstable-output.mjs';
import {crossTableConfigurationReadback} from './crosstable-readback.mjs';
import {crossTableParametersSchema} from './node-api.mjs';
const need=(v,m)=>{if(!v)throw Error('CrossTable: '+m);};
export function createCrossTableNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.cross_table',mode:'pivot',revision:'crosstable-v1-internal-1',readback:crossTableConfigurationReadback,
 parameterSchema:crossTableParametersSchema,validate:validateCrossTableParameters,preflight:preflightCrossTableSource,
 configurationObservation:{condition:'owned CrossTable configuration',readCrossTable:true,ready:s=>s.wizard?.stage==='crosstable'&&s.node_crosstable?.verified===true},
 async configure(channel,p,context){
  const changed=await configureCrossTable(channel,p,context);if(context.request.finish==='close')return changed;
  const root=changed.configuration.node_context.tid;
  const next=async(initial,expected)=>channel.perform({condition:'validate CrossTable and advance',initialObservation:initial,
   ready:s=>s.wizard?.status==='observed',identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===root+';btnNext'&&e.allowed_actions.includes('wizard_step'));
    need(es.length===1,'Next is unavailable; inspect native wizard error');return {verb:'wizard_step',ref:es[0].ref,expected_stage:expected};}});
  const before=await channel.observe({condition:'CrossTable complete before Next',readCrossTable:true,
   ready:s=>s.wizard?.stage==='crosstable'&&s.node_crosstable?.verified===true&&s.node_crosstable.dialogs.length===0});
  await next(before,['output_mapping','done']);
  let destination=await channel.observe({condition:'CrossTable validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  if(destination.wizard.stage==='output_mapping'){
   destination=await channel.observe({condition:'owned CrossTable inline output inventory',readMappings:true,
    ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true});
   need(['document_id','workflow_id','node_id'].every(k=>destination.node_mapping.node_context[k]===changed.configuration.node_context[k]),'inline output owner differs');
   // Native CrossTable generates/synchronizes these fields on execution. No
   // guessed source inventory, mapping override or premature schema comparison.
   await next(destination,'done');
  }
  const done=await channel.observe({condition:'CrossTable accepted by native Next',ready:s=>s.wizard?.stage==='done'});
  return {...changed,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },
 materializedSchema:materializeCrossTableOutput,
});}
