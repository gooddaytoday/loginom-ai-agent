const need=(v,m)=>{if(!v)throw Error('COARSE_EXTERNAL_'+m);};
// LAB-1324: after reopen, the saved node keeps complete external links and
// ready-class use (fine_classes=true) for its predictor. Read-only: Cancel.
export async function observeCoarseExternalSavedSettings({load,channel}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const {completeExternalLinks,selectCoarseClassesField}=await load('client/lib/coarse-classes-procedure.mjs');
 const selected=await channel.observe({condition:'cold external node selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,selected,'cold select external node',{refreshReplacedBody:true});
 await openPreparedWizard(channel);
 try{
  let s=await channel.observe({condition:'saved external links',readCoarseClasses:true,ready:s=>s.wizard?.stage==='coarse_classes_external'&&s.node_coarse_classes?.verified===true&&Array.isArray(s.node_coarse_classes.external?.links)});
  const links=structuredClone(s.node_coarse_classes.external.links);
  need(completeExternalLinks(links),'SAVED_LINKS');
  await channel.perform({condition:'inspect saved external roles',ready:s=>s.wizard?.stage==='coarse_classes_external',identity:s=>s.prepared_node_context,resolve:s=>{
   const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));
   need(es.length===1,'NEXT');return {verb:'wizard_step',ref:es[0].ref,expected_stage:'coarse_classes'};
  }});
  const roles=await channel.observe({condition:'saved external roles',readCoarseClasses:true,ready:s=>s.wizard?.stage==='coarse_classes'&&s.node_coarse_classes?.verified===true});
  const inputs=roles.node_coarse_classes.fields.filter(f=>f.role==='input');
  need(inputs.length===1,'SAVED_ROLE');
  s=await selectCoarseClassesField(channel,roles.node_coarse_classes,inputs[0].name);
  need(s.node_coarse_classes.settings.fine_classes===true,'SAVED_FINE_CLASSES');
  return {links,input_field:inputs[0].name,fine_classes:true,settings_applied:false};
 }finally{
  const closed=await closePreparedWizard(channel);need(closed.verified&&closed.cleanup_complete&&closed.settings_applied===false,'CANCEL');
 }
}
