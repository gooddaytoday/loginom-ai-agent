import {resolveQualityFields} from './quality-parameters.mjs';
export async function configureQuality(channel,p,{inputMapping,request}){
 if(request.finish==='close'){const state=await channel.observe({condition:'owned Quality draft',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});return {verified:true,cleanup_complete:true,effect_possible:false,configuration:{verified:true,node_context:state.prepared_node_context},draft_edits_skipped:true};}
 if(inputMapping?.verified!==true||inputMapping.inventory_complete!==true||inputMapping.source_identity_verified!==true)throw Error('Quality requires a complete owned input mapping');
 const fields=resolveQualityFields(p,inputMapping.target_fields);
 if(fields.some(f=>f.excluded||f.usage_type!==3||!f.source||['name','label','type'].some(k=>f[k]!==f.source[k])))throw Error('Quality requires unchanged supported input columns');
 let state=await channel.observe({condition:'Quality native output mapping or completion page',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
 // Before the first execution native derived outputs are unmaterialized;
 // Next skips their empty cards and reaches the node description. Do not
 // pretend a node Done is available on an output-mapping page.
 if(state.wizard.stage==='output_mapping'){
  const root=state.wizard.root_tid;
  await channel.perform({condition:'accept Quality default field pages',initialObservation:state,
   ready:s=>s.wizard?.stage==='output_mapping'&&s.wizard.root_tid===root,identity:s=>s.prepared_node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===root+';btnNext'&&e.allowed_actions.includes('wizard_step'));
    if(es.length!==1)throw Error('Quality default Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:'done'};}});
  state=await channel.observe({condition:'Quality default settings accepted',ready:s=>s.wizard?.stage==='done'});
 }
 return {verified:true,cleanup_complete:true,effect_possible:false,settings_applied:false,
  configuration:{verified:true,node_context:state.prepared_node_context,mode:'profile',fields,
   hidden_settings:'not_exposed_by_native_wizard'}};
}
