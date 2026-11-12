const need=(value,message)=>{if(!value)throw Error('ASSNRULES_EXCLUDE_'+message);};

// Owner decision 12.11: only this mode audits saved exclusion settings and
// rules. Native 7.4.2 restores the excluded singleton on Save/Open without Teach.
export function checkAssnRulesExclusionSaved(snapshot,expected,node){
 const contract=expected.assnrules_exclusion;
 need(contract?.exclude_support_above_pct===90&&expected.outputs?.length===1
  &&expected.outputs[0].output_node_type==='datamining.assn_rules'
  &&expected.outputs[0].output_port===1,'COLD_CONTRACT');
 need(snapshot?.verified===true&&snapshot.kind==='parameters'
  &&snapshot.node_context?.verified===true
  &&['document_id','workflow_id','node_id'].every(k=>snapshot.node_context[k]===node[k]),'SAVED_OWNER');
 need(snapshot.values?.pedExcludeLargeSupportItems===true
  &&snapshot.values.pedMaxSupport===contract.exclude_support_above_pct
  &&snapshot.switches?.pedExcludeLargeSupportItems===false
  &&snapshot.switches?.pedMaxSupport===false,'SAVED_SETTINGS');
 return {exclude_support_above_pct:snapshot.values.pedMaxSupport,exclusion_enabled:true,settings_applied:false};
}

export async function observeAssnRulesExclusionSaved({load,channel,expected}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const selected=await channel.observe({condition:'cold association rules exclusion selection',
  ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,selected,'cold select exclusion',{refreshReplacedBody:true});
 await openPreparedWizard(channel);
 try{
  const next=(stage,destination)=>channel.perform({condition:'cold inspect exclusion '+stage,
   ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,resolve:s=>{
    const controls=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));
    need(controls.length===1,'NEXT');return {verb:'wizard_step',ref:controls[0].ref,expected_stage:destination};}});
  await next('input_mapping','assn_rules_auxiliary');
  await next('assn_rules_auxiliary','assn_rules');
  const snapshot=await channel.observe({condition:'cold saved exclusion flag and threshold',readAssnRules:true,
   ready:s=>s.wizard?.stage==='assn_rules'&&s.node_assn_rules?.verified===true&&s.node_assn_rules.kind==='parameters'});
  return checkAssnRulesExclusionSaved(snapshot.node_assn_rules,expected,selected.prepared_node_context);
 }finally{
  const closed=await closePreparedWizard(channel);
  need(closed.verified===true&&closed.cleanup_complete===true&&closed.settings_applied===false,'CANCEL');
 }
}
