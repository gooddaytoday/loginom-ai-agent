// Private operator-only admission for the exact Visualizers control. The
// normal reader still owns output-context, Table creation and passive reads.
export function inspectJavascriptVisualizers({binding:b,node,output,held=null,capture=false,poll=false,requireSelected=true}) {
  const app=globalThis.bg?.app,tab=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  const controller=tab?.Controller,model=controller?.FController,diagram=model?.FDiagram,graph=diagram?.FmxGraph;
  const nodes=diagram?.FNodes?.FCollection,found=Array.isArray(nodes)&&nodes.length<=20?nodes.filter(n=>n.FGuid===node.id):[];
  if(document!==b.document||location.origin!=='http://logi-test-plan.bg.local'||app?.Version!=='7.4.2'
    ||tab!==b.tab||controller!==b.controller||model!==b.model||diagram!==b.diagram||graph!==b.graph||graph?.container!==b.container
    ||controller.Node?.data?.node!==b.workflow||found.length!==1||found[0]!==b.native
    ||found[0].data!==b.nodeData||found[0].FCell!==b.cell||found[0].FIconCls!=='bg-vendor-icon-javascript')
    throw Error('Private output native owner changed');
  const native=found[0],container=graph.container,shape=graph.view.getState(native.FCell)?.shape?.node;
  const exact=tid=>[...container.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===tid);
  const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const selected=graph.getSelectionCells();
  const nodeSelected=Array.isArray(selected)&&selected.length===1&&selected[0]===native.FCell;
  if(!visible(shape)||shape.getAttribute('data-tid')!==node.tid||!container.contains(shape)||exact(node.tid).length!==1
    ||requireSelected&&!nodeSelected)throw Error('Private output selected node changed');
  if([...document.querySelectorAll('[role="dialog"],.x-mask,.bg-mask-message,.x-mask-msg')].some(visible))throw Error('Private output blocked');
  if(!Array.isArray(native.FPorts)||native.FPorts.length>16||native.FPorts.some(list=>!Array.isArray(list.FCollection)||list.FCollection.length>100))
    throw Error('Private output native ports incomplete');
  const ports=native.FPorts.flatMap(list=>list.FCollection).filter(p=>p.FGuid===output.port_guid),port=ports[0];
  const portElement=port&&graph.view.getState(port.FCell)?.shape?.node,portTid=node.tid+';Output_Data-'+output.native_index;
  const images=portElement?[...portElement.querySelectorAll('image')]:[],image=images[0];
  const icon=(image?.getAttribute('href')??image?.getAttribute('xlink:href'))?.split('/').at(-1);
  if(output.active!==true||output.index!==0||!Number.isInteger(output.native_index)||ports.length!==1
    ||port.parent!==native||port.FCell?.parent!==native.FCell||!visible(portElement)||!container.contains(portElement)
    ||portElement.getAttribute('data-tid')!==portTid||exact(portTid).length!==1||images.length!==1
    ||!['output_table_active.svg','output_table_active_no_automapping.svg'].includes(icon))throw Error('Private output is not the same active native port');
  const controls=exact(node.tid+';Visualizers');
  if(controls.length>1)throw Error('Private Visualizers control ambiguous');
  const control=controls[0];
  if(held&&(shape!==held.shape||port!==held.port||port.data!==held.portData||port.FCell!==held.portCell||control!==held.control))
    throw Error('Private Visualizers binding changed');
  const hitPoint=element=>{
   if(visible(element)&&!element.closest('.x-item-disabled,.x-grid-row-disabled')&&element.getAttribute('aria-disabled')!=='true'){
    const box=element.getBoundingClientRect();
    for(const dy of [.5,.25,.75])for(const dx of [.5,.25,.75]){
      const x=box.x+box.width*dx,y=box.y+box.height*dy,hit=document.elementFromPoint(x,y);
      const interactive=hit?.closest('button,a,input,select,textarea,[role="button"],[role="menuitem"]');
      if(x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&hit&&(hit===element||element.contains(hit))
        &&hit.closest('[data-tid]')===element&&(!interactive||interactive===element))return {x,y};
    }
   }
   return null;
  };
  const point=hitPoint(control),box=visible(control)?control.getBoundingClientRect():null;
  const hit=box?document.elementFromPoint(box.x+box.width/2,box.y+box.height/2):null;
  const result={ready:nodeSelected&&!!point,node_id:node.id,port_guid:output.port_guid,control_tid:node.tid+';Visualizers',
    node_selected:nodeSelected,native_selection_count:Array.isArray(selected)?selected.length:null,
    control_count:controls.length,control_visible:visible(control)===true,
    control_hit:hit?{tid:hit.getAttribute?.('data-tid')??null,owner_tid:hit.closest('[data-tid]')?.getAttribute('data-tid')??null}:null,
    active_port_verified:true,activity_icon:icon,point,body_point:hitPoint(shape),execution_started:false};
  if(capture){if(!result.ready)throw Error('Private Visualizers not ready');return {shape,port,portData:port.data,portCell:port.FCell,control};}
  return poll?(result.ready?result:false):result;
}

// Read-only settlement of the one opening gesture. Original graph objects may
// become hidden, but their identities and the new native tree ancestry must agree.
export function inspectJavascriptViewsSettlement({binding:b,held,prepared,output,allowGraph=false,poll=false}) {
  const app=globalThis.bg?.app,p=globalThis.__loginomDockPreparationV1;
  const card=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  const records=[...(p?.receipts?.values()??[])].filter(r=>r.phase==='verified'&&r.workflowId===prepared.workflow_ref.workflow_id);
  if(document!==b.document||p?.document!==document||p.id!==prepared.document_id||location.origin!=='http://logi-test-plan.bg.local'||app?.Version!=='7.4.2'
    ||records.length!==1||records[0].nodeTargetWorkflowNode!==b.workflow
    ||b.native.data!==b.nodeData||b.native.FCell!==b.cell||b.native.FGuid!==prepared.node.node_id
    ||!Array.isArray(b.native.FPorts)||b.native.FPorts.length>16||b.native.FPorts.some(list=>!Array.isArray(list.FCollection)||list.FCollection.length>100)
    ||b.native.FPorts.flatMap(list=>list.FCollection).filter(port=>port===held.port).length!==1||held.port.FCell?.parent!==b.cell
    ||held.port.data!==held.portData||held.port.FCell!==held.portCell||held.port.FGuid!==output.port_guid||held.port.parent!==b.native)
    throw Error('Views settlement original native owner changed');
  const seen=new Set();let workflow,packageNode,nodeTree;
  for(let n=card?.Controller?.Node?.data?.node;n&&seen.size<32&&!seen.has(n);n=n.ParentNode){
    seen.add(n);
    if(app.ModelNodeTreeNode&&n instanceof app.ModelNodeTreeNode)nodeTree=n;
    if(n===b.workflow)workflow=n;
    if(n===records[0].packageNode)packageNode=n;
  }
  if(!workflow||!packageNode||nodeTree&&(nodeTree.FGuid!==b.native.FGuid||nodeTree.FModelNode!==b.nodeData))
    throw Error('Views settlement current workflow or node changed');
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const tabs=exact(prepared.workflow_ref.tab_tid);
  if(tabs.length!==1||tabs[0]!==records[0].tab||!tabs[0].classList.contains('x-tab-active'))throw Error('Views settlement tab changed');
  const crumbs=[...document.querySelectorAll('[data-tid^='+JSON.stringify(prepared.workflow_ref.prefix+';cnrNaviMode;b.s_')+']')];
  const path=prepared.workflow_ref.navigation_path;
  if(crumbs.slice(0,path.length).some((c,i)=>c.getAttribute('data-tid')!==path[i].tid||c.textContent.trim()!==path[i].label))
    throw Error('Views settlement navigation changed');
  const blockers=[...document.querySelectorAll('[role="dialog"],.x-mask,.bg-mask-message,.x-mask-msg')].filter(visible);
  if(blockers.some(e=>e.getAttribute('role')==='dialog'))throw Error('Views settlement foreign dialog');
  const model=card?.Controller?.FController,surface=model===b.model?'graph':model?.constructor?.name==='ViewsForm'?'views':'unknown';
  if(surface==='unknown')throw Error('Views settlement foreign surface');
  let portCount=0,portVisible=false,rootVisible=false,modelReady=true;
  if(surface==='views'){
    if(model.FModelNode&&model.FModelNode!==b.nodeData)throw Error('Views settlement model changed');
    modelReady=!!nodeTree&&model.FModelNode===b.nodeData;
    const roots=exact(prepared.workflow_ref.prefix+';ViewsForm');
    if(roots.length>1||roots.length===1&&model.FView?.el?.dom!==roots[0])throw Error('Views settlement root changed');
    rootVisible=roots.length===1&&visible(roots[0]);
    const ports=model.FPortList;
    if(ports&&Object.keys(ports).length>100)throw Error('Views settlement port bound');
    const nativePort=ports?.[output.port_guid],panels=exact(prepared.workflow_ref.prefix+';ViewsForm;cntPorts;'+output.port_guid);
    portCount=panels.length;
    if(portCount>1||nativePort&&nativePort.Type!==0||portCount===1&&nativePort?.Panel?.el?.dom!==panels[0])throw Error('Views settlement port changed');
    portVisible=portCount===1&&visible(panels[0]);
  }else{
    if(card!==b.tab||card.Controller!==b.controller||model.FDiagram!==b.diagram||b.diagram.FmxGraph!==b.graph)throw Error('Views settlement graph changed');
    rootVisible=visible(b.container);
  }
  const ready=modelReady&&blockers.length===0&&crumbs.length>=path.length&&rootVisible
    &&(surface==='views'&&portVisible||allowGraph&&surface==='graph'&&crumbs.length===path.length);
  const result={ready,surface,node_id:b.native.FGuid,port_guid:output.port_guid,native_owner_verified:true,
    navigation_count:crumbs.length,expected_navigation_count:path.length,blocker_count:blockers.length,
    model_ready:modelReady,root_visible:rootVisible,port_count:portCount,port_visible:portVisible,execution_started:false};
  return poll?(ready?result:false):result;
}

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
