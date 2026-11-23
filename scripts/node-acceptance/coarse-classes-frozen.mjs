const need=(v,m)=>{if(!v)throw Error('COARSE_FROZEN_'+m);};
export async function observeCoarseFrozenSavedSettings({load,channel}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const selected=await channel.observe({condition:'cold frozen node selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,selected,'cold select frozen node',{refreshReplacedBody:true});
 await openPreparedWizard(channel);
 try{
  const roles=await channel.observe({condition:'saved frozen roles',readCoarseClasses:true,ready:s=>s.wizard?.stage==='coarse_classes'&&s.node_coarse_classes?.verified===true});
  const inputs=roles.node_coarse_classes.fields.filter(f=>f.role==='input');
  need(inputs.length===1&&inputs[0].name==='Segment'&&inputs[0].frozen===true,'SAVED_ROLE');
  await channel.perform({condition:'inspect saved frozen model',ready:s=>s.wizard?.stage==='coarse_classes',identity:s=>s.prepared_node_context,resolve:s=>{
   const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));
   need(es.length===1,'NEXT');return {verb:'wizard_step',ref:es[0].ref,expected_stage:'coarse_classes_model'};
  }});
  let s=await channel.observe({condition:'saved frozen editor',ready:s=>s.wizard?.stage==='coarse_classes_model'});
  const tid=s.wizard.root_tid+';CoarseClassesWizard-2;btnActivationPortVisualizer';
  if(s.ui.elements.some(e=>e.tid===tid&&e.label==='Активировать'))await channel.perform({condition:'activate saved editor input for readback',initialObservation:s,ready:s=>s.wizard?.stage==='coarse_classes_model',identity:s=>s.prepared_node_context,resolve:s=>{
   const es=s.ui.elements.filter(e=>e.tid===tid&&e.allowed_actions.includes('click'));need(es.length===1,'ACTIVATE');return {verb:'click',ref:es[0].ref};
  }});
  s=await channel.observe({condition:'saved native IsLocked readback',readCoarseClasses:true,ready:s=>s.wizard?.stage==='coarse_classes_model'&&s.node_coarse_classes?.verified===true&&s.node_coarse_classes.model?.input_field==='Segment'});
  need(s.node_coarse_classes.model.locked===true,'IS_LOCKED');
  return {model:structuredClone(s.node_coarse_classes.model),settings_applied:false};
 }finally{
  const closed=await closePreparedWizard(channel);need(closed.verified&&closed.cleanup_complete&&closed.settings_applied===false,'CANCEL');
 }
}
