// Browser-serializable native captures. They have no host-side closures.
export function captureJavascriptSelection({binding,node}) {
    const tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
    const diagram=tab?.Controller?.FController?.FDiagram,nodes=diagram?.FNodes?.FCollection;
    const found=Array.isArray(nodes)&&nodes.length<=20?nodes.filter(n=>n.FGuid===node.id):[];
    if(tab!==binding.tab||found.length!==1)throw Error('Private selection binding unavailable');
    const selected=diagram.FmxGraph.getSelectionCells();
    return {document,controller:tab.Controller,tabRoot:tab.el?.dom,model:tab.Controller.FController,diagram,graph:diagram.FmxGraph,container:diagram.FmxGraph.container,native:found[0],cell:found[0].FCell,shape:diagram.FmxGraph.view.getState(found[0].FCell)?.shape?.node,replacements:0,initialSelectionCount:Array.isArray(selected)?selected.length:null,initialSelected:Array.isArray(selected)&&selected.length===1&&selected[0]===found[0].FCell};
  }

export function inspectJavascriptSelection({binding,node,icon,retained:r,requireSettings,requireVisualizers,inspectPhase,deadline,targetOrigin,targetBuild,poll=false,afterGesture=false}) {
    const app=globalThis.bg?.app,tab=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
    const diagram=tab?.Controller?.FController?.FDiagram,nodes=diagram?.FNodes?.FCollection;
    const found=Array.isArray(nodes)&&nodes.length<=20?nodes.filter(n=>n.FGuid===node.id):[];
    if(document!==r.document||location.origin!==targetOrigin||app?.Version!==targetBuild
      ||tab!==binding.tab||tab?.Controller!==r.controller||tab.Controller.FController!==r.model
      ||tab?.Controller?.Node?.data?.node!==binding.workflow||diagram!==r.diagram
      ||diagram.FmxGraph!==r.graph||diagram.FmxGraph.container!==r.container
      ||found.length!==1||found[0]!==r.native||found[0].data!==binding.nodeData||found[0].FCell!==r.cell||found[0].FIconCls!==icon)
      throw Error('Private selection native owner changed');
    const shape=diagram.FmxGraph.view.getState(r.cell)?.shape?.node,graph=diagram.FmxGraph.container;
    const exact=tid=>[...graph.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===tid);
    const selected=diagram.FmxGraph.getSelectionCells();
    const nodeSelected=Array.isArray(selected)&&selected.length===1&&selected[0]===r.cell;
    const unique=exact(node.tid);
    if(!shape?.isConnected||shape.getAttribute('data-tid')!==node.tid||!graph.contains(shape)
      ||unique.length!==1||unique[0]!==shape)throw Error('Private selection DOM changed: '+JSON.stringify({kind:'current_shape',phase:inspectPhase,connected:shape?.isConnected===true,tid_matches:typeof shape?.getAttribute==='function'&&shape.getAttribute('data-tid')===node.tid,inside_graph:!!shape&&graph.contains(shape),unique_count:unique.length,unique_matches:unique[0]===shape,after_gesture:afterGesture,node_selected:nodeSelected}));
    if(shape!==r.shape){
      const beforeSelection=!poll&&inspectPhase==='pre_select_click'&&!afterGesture&&r.initialSelected===true&&r.replacements===0;
      const managedBeforeSelection=!poll&&inspectPhase==='managed_pre_select_click'&&!afterGesture
        &&r.initialSelectionCount===0&&Array.isArray(selected)&&selected.length===0&&r.replacements===0;
      if((!afterGesture&&!beforeSelection&&!managedBeforeSelection)||r.replacements>=2||r.shape?.isConnected
        ||!nodeSelected&&!managedBeforeSelection)throw Error('Private selection DOM changed: '+JSON.stringify({kind:'replacement',phase:inspectPhase,after_gesture:afterGesture,replacements:r.replacements,previous_connected:r.shape?.isConnected===true,node_selected:nodeSelected}));
      // The managed first body click also permits one detached unselected redraw;
      // its caller still compares the complete pre-ACK snapshot and fresh point.
      r.shape=shape;r.replacements++;
    }
    const visible=e=>e.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
    let blockers,diagnostics=[],diagnosticFailed=false;
    try {
      blockers=[...document.querySelectorAll('[role="dialog"],.x-mask,.bg-mask-message,.x-mask-msg')].filter(visible);
      diagnostics=blockers.slice(0,12).map(e=>{
        const rect=e.getBoundingClientRect(),box={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
        if(!Object.values(box).every(Number.isFinite))throw Error('Nonfinite blocker geometry');
        const bounded=value=>typeof value==='string'?value.slice(0,200):null;
        return {selectors:['[role="dialog"]','.x-mask','.bg-mask-message','.x-mask-msg'].filter(selector=>e.matches(selector)),
          tid:bounded(e.getAttribute('data-tid')),id:bounded(e.id),role:bounded(e.getAttribute('role')),
          classes:bounded(e.getAttribute('class')),parent_tid:bounded(e.parentElement?.getAttribute('data-tid')),
          box,connected:e.isConnected===true,visibility:bounded(getComputedStyle(e).visibility),
          graph_contains_blocker:graph.contains(e),blocker_contains_graph:e.contains(graph)};
      });
    }catch{diagnosticFailed=true;diagnostics=[];}
    if(diagnosticFailed||blockers.length){
      const snapshot={blocked:true,ready:false,inspect_phase:inspectPhase,deadline,native_owner_verified:true,held_dom_verified:true,
        native_selection_count:Array.isArray(selected)?selected.length:null,dom_replacements:r.replacements,
        blocker_count:blockers?.length??null,blockers:diagnostics,descriptors_truncated:(blockers?.length??0)>12,
        diagnostic_failed:diagnosticFailed};
      const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
      freeze(snapshot);
      if(inspectPhase!=='terminal'&&!r.selectionBlocker)r.selectionBlocker=snapshot;
      // A truthy blocked result must never satisfy the existing post-gesture wait.
      if(poll)throw Error('Private selection blocked');
      return snapshot;
    }
    let pointFailure=null,pointDiagnosticFailed=false;
    const point=(element,control,count,required)=>{
      const samples=[];let box=null,visibleControl=false,disabled=false,diagnosticFailed=false;
      try {
        if(element){
          visibleControl=visible(element);
          disabled=!!element.closest('.x-item-disabled,.x-grid-row-disabled')||element.getAttribute('aria-disabled')==='true';
          const rect=element.getBoundingClientRect();box={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
          if(!Object.values(box).every(Number.isFinite)){box=null;throw Error('Nonfinite point geometry');}
          const bounded=value=>typeof value==='string'?value.slice(0,200):null;
          const describe=e=>e?{tid:bounded(e.getAttribute('data-tid')),classes:bounded(e.getAttribute('class')),
            tag:bounded(e.tagName),role:bounded(e.getAttribute('role')),connected:e.isConnected===true,
            graph_contains:graph.contains(e),is_control:e===element}:null;
          for(const dy of [.5,.25,.75])for(const dx of [.5,.25,.75]){
            const x=box.x+box.width*dx,y=box.y+box.height*dy;
            if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Nonfinite sample point');
            const hit=document.elementFromPoint(x,y),target=hit?.closest('[data-tid]');
            const hitControl=hit?.closest('button,a,input,select,textarea,[role="button"],[role="menuitem"]');
            const inside=x>=0&&y>=0&&x<innerWidth&&y<innerHeight;
            const ownedHit=!!hit&&(hit===element||element.contains(hit)),exactTarget=target===element,allowedControl=!hitControl||hitControl===element;
            if(visibleControl&&!disabled&&inside&&ownedHit&&exactTarget&&allowedControl)return {x,y};
            if(required)samples.push({x,y,in_viewport:inside,hit_owned:ownedHit,target_exact:exactTarget,control_allowed:allowedControl,
              hit:describe(hit),closest_tid:describe(target),closest_control:describe(hitControl)});
          }
        }
      }catch{diagnosticFailed=true;}
      if(required||diagnosticFailed){
        const snapshot={inspect_phase:inspectPhase,deadline,control,control_count:count,native_owner_verified:true,held_dom_verified:true,
          node_selected:nodeSelected,dom_replacements:r.replacements,visible:visibleControl,disabled,box,samples,diagnostic_failed:diagnosticFailed};
        const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
        freeze(snapshot);pointFailure??=snapshot;
        if(inspectPhase!=='terminal'&&!r.selectionPointFailure)r.selectionPointFailure=snapshot;
        pointDiagnosticFailed ||= diagnosticFailed;
      }
      return null;
    };
    const settings=exact(node.tid+';Setting');if(settings.length>1)throw Error('Private selection duplicate Setting');
    const setting=point(settings[0]??null,'Setting',settings.length,requireSettings&&nodeSelected);
    const visualizers=exact(node.tid+';Visualizers');if(requireVisualizers&&visualizers.length>1)throw Error('Private selection duplicate Visualizers');
    const visualizer=point(visualizers.length===1?visualizers[0]:null,'Visualizers',visualizers.length,requireVisualizers&&nodeSelected);
    const ready=nodeSelected&&(!requireSettings||!!setting)&&(!requireVisualizers||!!visualizer);
    const result={ready,node_selected:nodeSelected,
      native_selection_count:Array.isArray(selected)?selected.length:null,dom_replacements:r.replacements,settings_count:settings.length,setting_point:setting,
      visualizers_count:visualizers.length,visualizers_visible:visualizers.length===1&&visible(visualizers[0]),visualizers_point:visualizer,
      body_point:point(shape,'body',1,!ready&&!poll),
      point_snapshot:inspectPhase==='terminal'?pointFailure:r.selectionPointFailure??null,point_diagnostic_failed:pointDiagnosticFailed};
    if(poll&&pointDiagnosticFailed)throw Error('Private selection point diagnostic failed');
    return poll?(result.ready?result:false):result;
}

// Owned JavaScript graph selection and Setting gesture. Generic script-node actions stay denied.
export async function selectJavascriptForSettings(page,{binding,node,icon,deadline,record,openSettings=false,requireSettings=true,requireVisualizers=false,beforeSelect=async()=>{},beforeOpen=async()=>{},lifecycle={},targetOrigin="http://logi-test-plan.bg.local",targetBuild="7.4.2"}) {
  if(openSettings&&(!requireSettings||requireVisualizers))throw Error('Private opening requires Setting readiness');
  const retained=await page.evaluateHandle(captureJavascriptSelection,{binding,node});
  const args={binding,node,icon,retained,requireSettings,requireVisualizers,deadline,targetOrigin,targetBuild};let dispatched=false,openingDispatched=false,blockerSnapshot=null,pointSnapshot=null,pointJournalAttempted=false;
  const acknowledge=async(event,message)=>{
    const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
    freeze(event);
    const expected=JSON.stringify(event),saved=await record(event);
    if(JSON.stringify(Object.fromEntries(Object.keys(event).map(key=>[key,saved?.[key]])))!==expected)throw Error(message);
    return saved;
  };
  const recordPoint=async snapshot=>{
    if(!snapshot||pointJournalAttempted)return;
    pointSnapshot=snapshot;pointJournalAttempted=true;
    await acknowledge({phase:'javascript_private_selection_point_unavailable',node_id:node.id,
      effect_possible:dispatched||openingDispatched,opening_dispatched:openingDispatched,deadline,snapshot},'Private selection point journal ACK differs');
  };
  const read=async inspectPhase=>{
    const result=await page.evaluate(inspectJavascriptSelection,{...args,inspectPhase});
    if(result.blocked===true){blockerSnapshot=result;throw Error('Private selection blocked');}
    await recordPoint(result.point_snapshot);
    if(result.point_diagnostic_failed)throw Error('Private selection point diagnostic failed');
    const {point_snapshot,point_diagnostic_failed,...state}=result;
    return state;
  };
  try {
    const before=await read('initial');await record({phase:'javascript_private_selection_before',node_id:node.id,...before});
    if(Date.now()>=deadline)throw Error('Private selection deadline');
    if(!before.ready){
      if(!before.body_point)throw Error('Private selection body covered');
      await acknowledge({phase:'javascript_private_selection_dispatch',node_id:node.id,point:before.body_point,deadline,require_visualizers:requireVisualizers},'Private selection dispatch journal ACK differs');
      await beforeSelect();
      const checked=await read('pre_select_click');
      const ownedRedraw=before.node_selected&&checked.dom_replacements===before.dom_replacements+1;
      if((checked.dom_replacements!==before.dom_replacements&&!ownedRedraw)
        ||JSON.stringify({...checked,dom_replacements:before.dom_replacements})!==JSON.stringify(before))throw Error('Private selection changed before click');
      if(Date.now()>=deadline)throw Error('Private selection deadline');
      dispatched=true;
      await page.mouse.click(before.body_point.x,before.body_point.y);
      await record({phase:'javascript_private_selection_gesture_returned',node_id:node.id,pre_click_dom_replacements:checked.dom_replacements});
      args.afterGesture=true;
      const remaining=deadline-Date.now();if(remaining<=0)throw Error('Private selection deadline');
      const ready=await page.waitForFunction(inspectJavascriptSelection,{...args,inspectPhase:'post_select_poll',poll:true},{timeout:remaining,polling:100});await ready.dispose();
    }
    const after=await read('final');
    await record({phase:'javascript_private_selection_after',node_id:node.id,...after});
    if(!after.ready||Date.now()>=deadline)throw Error('Private selection requested controls unconfirmed');
    if(openSettings){
      await beforeOpen();
      const opening=await read('pre_open');
      if(!opening.ready)throw Error('Private Setting no longer ready');
      await acknowledge({phase:'javascript_private_open_dispatch',node_id:node.id,point:opening.setting_point,deadline},'Private Setting dispatch journal ACK differs');
      const checked=await read('pre_open_click');
      const redrawCountUnchanged=checked.dom_replacements===opening.dom_replacements;
      const oneMoreOwnedRedraw=checked.dom_replacements===opening.dom_replacements+1;
      if((!redrawCountUnchanged&&!oneMoreOwnedRedraw)
        ||JSON.stringify({...checked,dom_replacements:opening.dom_replacements})!==JSON.stringify(opening)
        ||Date.now()>=deadline)throw Error('Private Setting changed before click');
      openingDispatched=true;lifecycle.settingDispatched=true;
      await page.mouse.click(opening.setting_point.x,opening.setting_point.y);
      lifecycle.settingGestureReturned=true;
      await record({phase:'javascript_private_open_gesture_returned',node_id:node.id});
    }
    return {verified:true,selected:dispatched,opening_dispatched:openingDispatched,dom_replacements:after.dom_replacements};
  }catch(error){
    const capture=await page.evaluate(r=>({snapshot:r.selectionBlocker??null,point_snapshot:r.selectionPointFailure??null,available:true}),retained)
      .catch(()=>({snapshot:null,point_snapshot:null,available:false}));
    const snapshot=blockerSnapshot??capture.snapshot;
    if(snapshot)await acknowledge({phase:'javascript_private_selection_blocked',node_id:node.id,
      effect_possible:dispatched||openingDispatched,opening_dispatched:openingDispatched,deadline,snapshot},'Private selection blocker journal ACK differs');
    await recordPoint(capture.point_snapshot);
    const terminal=await page.evaluate(inspectJavascriptSelection,{...args,inspectPhase:'terminal'}).catch(()=>({observation_status:'unavailable'}));
    await record({phase:'javascript_private_selection_refused',node_id:node.id,effect_possible:dispatched||openingDispatched,
      opening_dispatched:openingDispatched,deadline,reason:String(error.message),blocker_snapshot:snapshot,point_snapshot:pointSnapshot,
      snapshot_observation_available:!!blockerSnapshot||capture.available,terminal_observation:terminal});throw error;
  }finally{await retained.dispose();}
}
