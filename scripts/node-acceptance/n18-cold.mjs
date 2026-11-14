const need=(value,message)=>{if(!value)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const owns=(context,node)=>context?.verified===true&&['document_id','workflow_id','node_id'].every(key=>context[key]===node[key]);

// Owner-approved n18 alternative only. The Calculator's language must come
// from its reopened native wizard, never from the main-run receipt or its label.
export async function verifyN18JavascriptStep({graph,requirement,load,channelFor}){
 const alternative=requirement.alternative_types!==undefined;
 need(requirement.type==='programming.javascript'&&(!alternative||same(requirement.alternative_types,['transform.calculator'])&&requirement.alternative_syntax==='javascript'),'COLD_NODE_REQUIREMENT_INVALID');
 const javascript=graph.nodes.filter(node=>node.type==='programming.javascript');
 if(javascript.length)return {route:'programming.javascript',node:javascript[0].ref,settings_applied:false};
 need(alternative,'COLD_NODE_TYPE_MISSING:programming.javascript');
 const calculators=graph.nodes.filter(node=>node.type==='transform.calculator');
 need(calculators.length===1,'COLD_N18_CALCULATOR_MISSING_OR_AMBIGUOUS');
 // A dynamic import has no saved ColumnDefs. Materialize a unique direct
 // import before checking field links; other topologies keep the saved-wizard path.
 const incoming=graph.links.filter(link=>link.target===calculators[0].ref.node_id&&link.input===0);
 const imports=graph.nodes.filter(node=>node.type==='imports.text'&&incoming.length===1&&node.ref.node_id===incoming[0].source);
 if(imports.length===1){
  const {createNodeExecutionProcedure}=await load('client/lib/node-execution-procedure.mjs');
  const driver=createNodeExecutionProcedure(channelFor(imports[0].ref,'n18-saved-import'),imports[0].ref,{allowDeactivate:true});
  await driver.prepare();
  await driver.launchGraph();
  await driver.identify();
  const execution=await driver.waitCompleted();
  need(execution.status==='completed'&&execution.verified===true&&execution.owner_verified===true,'COLD_N18_IMPORT_EXECUTION_UNCONFIRMED');
 }
 const node=calculators[0].ref,channel=channelFor(node,'n18-saved-calculator');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard,wizardCloseBinding,boundInputMappingConflict}=await load('client/lib/node-wizard-close.mjs');
 const selected=await channel.observe({condition:'cold n18 Calculator graph',ready:s=>owns(s.prepared_node_context,node)&&s.prepared_node_context.surface==='graph'&&s.wizard?.status==='absent'});
 need(owns(selected.prepared_node_context,node),'COLD_N18_CALCULATOR_OWNER');
 await selectPreparedGraphNode(channel,selected,'cold select n18 Calculator',{refreshReplacedBody:true});
 await openPreparedWizard(channel);
 let closingObservation;
 try{
  const owned=s=>owns(s.prepared_node_context,node)&&s.prepared_node_context.surface==='wizard';
  const opened=await channel.observe({condition:'cold n18 saved Calculator wizard',
   ready:s=>owned(s)&&['input_mapping','calculator'].includes(s.wizard?.stage)});
  if(opened.wizard.stage==='input_mapping'){
   const binding=wizardCloseBinding(opened);
   let advanceError;
   try{
   await channel.perform({condition:'cold n18 advance saved Calculator',
   ready:s=>owned(s)&&s.wizard?.stage==='input_mapping',identity:s=>s.prepared_node_context,
   resolve:s=>{
    const next=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.enabled===true&&e.allowed_actions?.includes('wizard_step'));
    need(next.length===1,'COLD_N18_CALCULATOR_NEXT_UNCONFIRMED');
    return {verb:'wizard_step',ref:next[0].ref,expected_stage:'calculator'};
   }});
   }catch(error){
    if(error.receipt?.status!=='AMBIGUOUS'||error.receipt?.cleanup_complete!==true||error.receipt?.error?.code!=='WIZARD_STEP_NOT_CONFIRMED')throw error;
    advanceError=error;
   }
   const advanced=await channel.observe({condition:'cold n18 Calculator advanced or lost-links question',wizardConfirmation:binding,
    ready:s=>owned(s)&&s.wizard?.stage==='calculator'||boundInputMappingConflict(s,binding)});
   if(boundInputMappingConflict(advanced,binding)){
    closingObservation=advanced;
    throw Error('COLD_N18_CALCULATOR_LOST_LINKS');
   }
   if(advanceError)throw advanceError;
  }
  const ready=s=>owns(s.prepared_node_context,node)&&s.wizard?.stage==='calculator'&&s.node_calculator?.verified===true
   &&s.node_calculator.inventory_complete===true&&owns(s.node_calculator.node_context,node);
  const state=await channel.observe({condition:'cold n18 saved Calculator language',readCalculator:true,ready});
  need(ready(state)&&state.node_calculator.mode==='expression'&&state.node_calculator.syntax==='javascript','COLD_N18_CALCULATOR_JAVASCRIPT_REQUIRED');
  return {route:'transform.calculator',node,syntax:'javascript',settings_applied:false};
 }finally{
  const closed=await closePreparedWizard(channel,{initialObservation:closingObservation});
  need(closed.verified===true&&closed.cleanup_complete===true&&closed.settings_applied===false&&closed.draft_discarded===true
   &&owns(closed.node_context,node),'COLD_N18_CALCULATOR_CANCEL_UNCONFIRMED');
 }
}
