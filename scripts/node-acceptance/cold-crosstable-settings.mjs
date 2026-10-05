const need=(v,m)=>{if(!v)throw Error('COLD_CROSSTABLE:'+m);};
const owned=(s,node)=>s.node_crosstable?.node_context?.verified===true
 &&s.node_crosstable.node_context.surface==='wizard'
 &&['document_id','workflow_id','node_id'].every(k=>typeof node[k]==='string'&&s.node_crosstable.node_context[k]===node[k]);
export async function observeColdCrossTable(channel,target,{closePreparedWizard,openPreparedWizard,selectSource}){
 let state=await channel.observe({condition:'cold CrossTable configuration or missing local definition cache',readCrossTable:true,
  ready:s=>s.node_crosstable?.verified===true||s.node_crosstable?.reason==='crosstable_local_variable_owner'&&s.node_crosstable.node_context?.verified===true});
 need(owned(state,target.ref),'configuration owner differs');
 let variablesInspected=false;
 if(state.node_crosstable.verified!==true){
  need(state.node_crosstable.reason==='crosstable_local_variable_owner','unsupported configuration observation');
  // A failed readonly observation is not an uncertain mutation. Cancel this
  // exact wizard, populate the existing own UI definition cache, and retry the
  // complete observation once. Never substitute supplied variable values.
  const closed=await closePreparedWizard(channel);
  need(closed.verified&&closed.settings_applied===false,'configuration cancel');
  const v=await channel.configureCrossTableVariables([]);
  need(v.verified&&v.settings_changed===false&&v.settings_applied===false&&v.draft_discarded===true,'definition inspection changed settings');
  variablesInspected=true;
  await selectSource(channel,target);
  await openPreparedWizard(channel);
  state=await channel.observe({condition:'cold complete CrossTable after own definitions inspection',readCrossTable:true,
   ready:s=>s.node_crosstable?.verified===true&&s.node_crosstable.inventory_complete===true});
 }
 need(owned(state,target.ref)&&state.node_crosstable.verified===true&&state.node_crosstable.inventory_complete===true,'complete configuration unverified');
 return {state,variablesInspected};
}
