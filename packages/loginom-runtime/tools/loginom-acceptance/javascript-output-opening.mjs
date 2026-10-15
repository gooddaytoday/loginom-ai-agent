import {inspectJavascriptVisualizers,inspectJavascriptViewsSettlement} from '../../client/lib/javascript-output-context.mjs';
export {inspectJavascriptVisualizers,inspectJavascriptViewsSettlement};

export async function waitJavascriptViewsSettlement(page,{binding,held,prepared,output,deadline,record,allowGraph=false}) {
  const args={binding,held,prepared,output,allowGraph};
  const diagnostic=()=>page.evaluate(inspectJavascriptViewsSettlement,args);
  try{
    const before=await diagnostic();await record({phase:'javascript_views_settlement_before',...before,deadline});
    const remaining=deadline-Date.now();if(remaining<=0)throw Error('Views settlement original deadline expired');
    if(!before.ready){const ready=await page.waitForFunction(inspectJavascriptViewsSettlement,{...args,poll:true},{timeout:remaining,polling:100});await ready.dispose();}
    const after=await diagnostic();
    if(!after.ready||Date.now()>=deadline)throw Error('Views settlement unconfirmed under original deadline');
    await record({phase:'javascript_views_settlement_verified',...after,deadline});return after;
  }catch(error){
    const terminal=await diagnostic().catch(()=>({native_owner_verified:false}));
    await record({phase:'javascript_views_settlement_refused',...terminal,deadline,reason:String(error.message).slice(0,300)});throw error;
  }
}

export async function openJavascriptOutputViews(page,{binding,node,icon,reference,prepared,channel,output,deadline,record,select}) {
  if(output?.active!==true||output.index!==0||!output.port_guid)throw Error('Active JS output required before selection');
  const args={binding,node,output};
  const diagnostic=()=>page.evaluate(inspectJavascriptVisualizers,{...args,requireSelected:false});
  const preflight=async()=>{const observed=await diagnostic();await record({phase:'javascript_private_views_active_preselection',...observed,deadline});};
  try {
    await preflight();
    await select(page,{binding,node,icon,deadline,record,requireSettings:false,requireVisualizers:true,beforeSelect:preflight});
  }catch(error){
    const terminal=await diagnostic().catch(error=>({native_owner_verified:false,diagnostic_error:String(error.message)}));
    await record({phase:'javascript_private_views_materialization_refused',...terminal,deadline,reason:String(error.message)});throw error;
  }
  const owns=s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'
    &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===reference[k])
    &&s.node_outputs?.verified===true&&s.node_outputs.node_selected===true
    &&s.node_outputs.ports?.filter(p=>p.index===0&&p.port_guid===output.port_guid&&p.active===true).length===1;
  const before=await channel.observe({condition:'private JS active output after selection',readOutputs:true,ready:owns});
  if(!owns(before))throw Error('Private output observation owner changed');
  const settlementHeld=await page.evaluateHandle(inspectJavascriptVisualizers,{...args,capture:true});
  try {
  const settle=()=>waitJavascriptViewsSettlement(page,{binding,held:settlementHeld,prepared,output,deadline,record});
  const candidates=before.ui.elements.filter(e=>e.tid===node.tid+';Visualizers'&&e.allowed_actions.includes('open_node_views'));
  if(candidates.length===1){
    if(Date.now()>=deadline)throw Error('Private Visualizers deadline');
    await channel.perform({condition:'open owned JS visualizers using admitted capability',initialObservation:before,ready:owns,
      resolve:s=>{const matches=s.ui.elements.filter(e=>e.tid===node.tid+';Visualizers'&&e.allowed_actions.includes('open_node_views'));
        if(matches.length!==1)throw Error('Owned Visualizers capability changed');return {verb:'open_node_views',ref:matches[0].ref};},
      identity:()=>({node:reference,port_guid:output.port_guid})});
    await settle();
    return {route:'shared',surface_verified:true,execution_started:false};
  }
  if(candidates.length)throw Error('Owned Visualizers capability ambiguous');
  let held,dispatched=false;
  try {
    await record({phase:'javascript_private_views_materialized',...await diagnostic(),deadline});
    const remaining=deadline-Date.now();if(remaining<=0)throw Error('Private Visualizers deadline');
    const ready=await page.waitForFunction(inspectJavascriptVisualizers,{...args,poll:true},{timeout:remaining,polling:100});await ready.dispose();
    held=await page.evaluateHandle(inspectJavascriptVisualizers,{...args,capture:true});
    const before=await page.evaluate(inspectJavascriptVisualizers,{...args,held});
    await record({phase:'javascript_private_views_dispatch',...before,deadline});
    const checked=await page.evaluate(inspectJavascriptVisualizers,{...args,held});
    if(!checked.ready||JSON.stringify(checked)!==JSON.stringify(before)||Date.now()>=deadline)throw Error('Private Visualizers changed before click');
    dispatched=true;await page.mouse.click(checked.point.x,checked.point.y);
    await record({phase:'javascript_private_views_gesture_returned',node_id:node.id,port_guid:output.port_guid,execution_started:false});
    await settle();
    return {route:'private',surface_verified:true,execution_started:false};
  }catch(error){
    const terminal=await diagnostic().catch(error=>({native_owner_verified:false,diagnostic_error:String(error.message)}));
    await record({phase:'javascript_private_views_refused',...terminal,node_id:node.id,effect_possible:dispatched,opening_dispatched:dispatched,execution_started:false,deadline,reason:String(error.message)});throw error;
  }finally{await held?.dispose();}
  }finally{await settlementHeld.dispose();}
}
