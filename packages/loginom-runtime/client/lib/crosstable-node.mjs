import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateCrossTableParameters,resolveCrossTableParameters} from './crosstable-parameters.mjs';
import {configureCrossTable} from './crosstable-procedure.mjs';
import {deferCrossTableOutput,readCrossTableOutputs} from './crosstable-output.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {crossTableParametersSchema} from './node-api.mjs';

const need=(condition,message)=>{if(!condition)throw Error(message);};

export function createCrossTableNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.cross_table',mode:'pivot',revision:'crosstable-v1-internal-1',parameterSchema:crossTableParametersSchema,
 validate:validateCrossTableParameters,
 preflight:(options,context,settings)=>preflightTabularSource(options,context,settings,{
  required:true,resolve:resolveCrossTableParameters,label:'CrossTable'}),
 configurationObservation:{condition:'CrossTable configuration page',readCrossTable:true,
  ready:state=>state.wizard?.stage==='cross_table'&&state.node_cross_table?.verified===true},
 async configure(channel,parameters,{request,inputMapping}){
  if(request.finish==='close'){
   const state=await channel.observe({condition:'CrossTable draft ready for disposal',readCrossTable:true,
    ready:state=>state.wizard?.stage==='cross_table'&&state.node_cross_table?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:state.node_cross_table,draft_edits_skipped:true};
  }
  const configured=await configureCrossTable(channel,parameters,{inputMapping});
  const state=await channel.observe({condition:'CrossTable ready for validation',readCrossTable:true,
   ready:state=>state.wizard?.stage==='cross_table'&&state.node_cross_table?.verified===true});
  await channel.perform({condition:'validate CrossTable and advance',initialObservation:state,
   ready:state=>state.wizard?.stage==='cross_table',identity:state=>state.prepared_node_context,
   resolve:state=>{
    const controls=state.ui.elements.filter(element=>element.tid===state.wizard.root_tid+';btnNext'
     &&element.allowed_actions.includes('wizard_step'));
    need(controls.length===1,'CrossTable Next unavailable');
    return {verb:'wizard_step',ref:controls[0].ref,expected_stage:['output_mapping','done']};
   }});
  const destination=await channel.observe({condition:'CrossTable accepted configuration destination',
   ready:state=>['output_mapping','done'].includes(state.wizard?.stage)});
  if(destination.wizard.stage==='output_mapping'){
   await channel.perform({condition:'complete CrossTable generated mapping page',initialObservation:destination,
    ready:state=>state.wizard?.stage==='output_mapping',identity:state=>state.prepared_node_context,
    resolve:state=>{
     const controls=state.ui.elements.filter(element=>element.tid===state.wizard.root_tid+';btnNext'
      &&element.allowed_actions.includes('wizard_step'));
     need(controls.length===1,'CrossTable output Next unavailable');
     return {verb:'wizard_step',ref:controls[0].ref,expected_stage:'done'};
    }});
  }
  const done=await channel.observe({condition:'CrossTable accepted by Loginom',ready:state=>state.wizard?.stage==='done'});
  return {...configured,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },
 configureAllOutputs:deferCrossTableOutput,readOutputs:readCrossTableOutputs,
});}
