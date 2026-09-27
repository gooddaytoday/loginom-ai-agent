// Private roundtrip only: real port selection + F3, never Visualizers or model calls.
export function inspectJavascriptNativePreview({binding:b,phase}){
  const need=(v,m)=>{if(!v)throw Error('Private native Preview: '+m);};
  const s=globalThis.__loginomJavascriptNativeRoundtripV1;
  need(s?.document===document&&s.stage==='completed'&&Date.now()<b.deadline,'completed owner/deadline');
  need(location.origin+'/'===b.origin&&bg.app.Version==='7.4.2'&&b.build==='7.4.2'
    &&s.binding.document_id===b.document_id&&s.binding.workflow_id===b.workflow_id
    &&s.source_sha256===b.source_sha256&&s.node.FGuid===b.node_id
    &&JSON.stringify(s.execution)===JSON.stringify(b.execution),'document/node/source/execution');
  s.check();
  const model=s.input.model,diagram=model.FDiagram,graph=diagram.FmxGraph,container=graph.container,node=s.node;
  need(s.input.card.Controller.Node.data.node===s.input.workflow,'original workflow');
  const ports=node.FPorts[1].FCollection,port=ports[0];
  need(node.FStatus===1&&node.FRunning===false&&ports.length===2&&port.FGuid===b.port_guid
    &&port.parent===node&&port.FCell.parent===node.FCell&&port.FType===1&&port.FSubType===1
    &&port.FParam===2&&port.FPortIndex===0&&port.FStatus===1,'same active data0 port');
  const view=graph.view,drawPane=view.getDrawPane();
  const shape=view.getState(port.FCell)?.shape?.node,nodeShape=view.getState(node.FCell)?.shape?.node;
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0
    &&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
  need(visible(nodeShape)&&nodeShape.getAttribute('data-tid')===b.node_tid&&container.contains(nodeShape)
    &&container.querySelectorAll('[data-tid='+JSON.stringify(b.node_tid)+']').length===1,'unique native node shape');
  need(visible(container)&&visible(shape)&&container.contains(shape)&&b.port_tid===b.node_tid+';Output_Data-0'
    &&shape.getAttribute('data-tid')===b.port_tid
    &&container.querySelectorAll('[data-tid='+JSON.stringify(b.port_tid)+']').length===1,'unique native port shape');
  need(![...document.querySelectorAll('[role="dialog"],.x-window,.x-mask,.bg-mask-message,.x-mask-msg')].some(visible)
    &&model.FPreviewManager?.FPreviewVisible===false,'quiet graph without Preview');
  need(!shape.closest('.x-item-disabled,.x-grid-row-disabled')&&shape.getAttribute('aria-disabled')!=='true','enabled port');
  need(shape.parentNode===drawPane&&container.contains(drawPane),'native renderer parent');
  const fingerprint=JSON.stringify(b);
  if(phase==='prepare'){
    need(!s.previewOpening,'opening already reserved');
    s.previewOpening={fingerprint,model,diagram,graph,view,drawPane,container,node,port,portData:port.data,cell:port.FCell,shape,status:'prepared'};
  }
  const held=s.previewOpening;
  const checks={binding:held?.fingerprint===fingerprint,model:held?.model===model,diagram:held?.diagram===diagram,
    graph:held?.graph===graph,container:held?.container===container,node:held?.node===node,port:held?.port===port,
    data:held?.portData===port.data,cell:held?.cell===port.FCell,shape:held?.shape===shape};
  // Bounded booleans only; retain the original reservation even on refusal.
  // selected runs only after mouse.click returned; select runs before the click.
  const rebind=phase==='selected'&&held?.status==='selection-dispatched'&&!checks.shape
    &&Object.entries(checks).every(([key,value])=>key==='shape'||value);
  need(Object.values(checks).every(Boolean)||rebind,'NP1 '+JSON.stringify({p:['prepare','select','selected','preview'].includes(phase)?phase:'other',
    h:['prepared','selection-dispatched','selected','preview-dispatched'].includes(held?.status)?held.status:'other',c:checks}));
  need(held.view===view&&held.drawPane===drawPane,'same native renderer');
  const previousConnected=rebind?held.shape?.isConnected===true:null;
  const box=shape.getBoundingClientRect(),point={x:box.x+box.width/2,y:box.y+box.height/2},hit=document.elementFromPoint(point.x,point.y);
  need(point.x>=0&&point.y>=0&&point.x<innerWidth&&point.y<innerHeight&&hit&&(hit===shape||shape.contains(hit))
    &&hit.closest('[data-tid]')===shape&&!hit.closest('button,a,input,select,textarea,[contenteditable="true"],[role="button"],[role="menuitem"]'),'native port hit-test');
  if(phase==='select'){
    need(held.status==='prepared','selection cannot replay');held.status='selection-dispatched';
  }else if(phase==='selected'||phase==='preview'){
    need(held.status===(phase==='selected'?'selection-dispatched':'selected'),'selection/F3 cannot replay');
    const selected=graph.getSelectionCells();
    need(Array.isArray(diagram.selectedPorts)&&diagram.selectedPorts.length===1&&diagram.selectedPorts[0]===port
      &&Array.isArray(selected)&&selected.includes(port.FCell)&&selected.length<=2
      &&selected.every(cell=>cell===port.FCell||cell===node.FCell),'exact selected output port');
    const focus=document.activeElement;
    need(focus&&(focus===document.body||container.contains(focus))
      &&!focus.closest('input,textarea,select,[contenteditable="true"],.CodeMirror,.monaco-editor'),'graph keyboard focus');
    // Probe06 proves a same-native root replacement only after the click returned.
    // Commit the new DOM binding after selected port, parent, hit-test and focus pass.
    if(rebind){held.selectionShapeTransition={previous:held.shape,current:shape};held.shape=shape;}
    held.status=phase==='selected'?'selected':'preview-dispatched';
  }else need(phase==='prepare','known opening phase');
  return {phase,node_id:b.node_id,port_guid:b.port_guid,effect_id:b.effect_id,source_sha256:b.source_sha256,
    execution_id:b.execution.execution_id,deadline:b.deadline,point,owner_verified:true,
    shape_transition:{rebound:rebind,previous_connected:previousConnected}};
}

export async function dispatchJavascriptNativePreview(page,args,inspect){
  const before=await page.evaluate(inspect,args);
  if(args.phase==='select'){
    await page.mouse.click(before.point.x,before.point.y);
    return page.evaluate(inspect,{...args,phase:'selected'});
  }
  if(args.phase==='preview')await page.keyboard.press('F3');
  return before;
}

export async function openJavascriptNativeRoundtripPreview({options,ctx,input,port,state,deadline,targetOrigin,targetBuild,onState}){
  const need=(v,m)=>{if(!v)throw Error('Private native Preview: '+m);};
  const {execute,onRecord,operation,now}=options;
  const owner=state.prepared_node_context;
  need(owner?.verified===true&&owner.surface==='graph'&&state.wizard?.status==='absent'
    &&['document_id','workflow_id','node_id'].every(k=>owner[k]===ctx.node[k])
    &&state.node_outputs?.verified===true&&port.index===0&&port.native_index===0&&port.active===true,'owned graph observation');
  const controls=state.ui.elements.filter(e=>e.tid===port.tid);
  need(controls.length===1&&controls[0].enabled===true&&controls[0].visible===true&&controls[0].kind==='port'&&controls[0].scope==='graph'&&Array.isArray(controls[0].allowed_actions)&&controls[0].allowed_actions.length===0,'exact denied output control');
  need(typeof port.tid==='string'&&port.tid.endsWith(';Output_Data-0'),'data0 control TID');
  const binding={document_id:ctx.document_id,workflow_id:ctx.workflow_ref.workflow_id,node_id:ctx.node.node_id,
    node_tid:owner.tid,port_tid:port.tid,port_guid:port.port_guid,
    origin:new URL(new URL(targetOrigin).origin).href,build:targetBuild,source_sha256:ctx.execution.trial.source_sha256,
    execution:ctx.execution,deadline:Math.min(deadline,input.binding.deadline),effect_id:operation.id+':native-preview'};
  const check=()=>{ctx.signal?.throwIfAborted();need(now()<binding.deadline&&options.exclusiveNodeOperation()===true,'deadline/read lock');};
  let effectPossible=false,step='prepare';
  try{
    for(const phase of ['prepare','select','preview']){
      step=phase;check();
      const intent={phase:'native_roundtrip_preview_intent',step:phase,binding};
      const saved=await onRecord(intent);need(saved?.phase===intent.phase&&saved.step===phase&&JSON.stringify(saved.binding)===JSON.stringify(binding),'intent journal ACK differs');check();
      if(phase!=='prepare')effectPossible=true;
      const result=await execute(`async page=>(${dispatchJavascriptNativePreview.toString()})(page,${JSON.stringify({binding,phase})},${inspectJavascriptNativePreview.toString()})`,{timeout:Math.min(10000,binding.deadline-now())});
      need(result?.owner_verified===true&&result.phase===(phase==='select'?'selected':phase)
        &&result.node_id===binding.node_id&&result.port_guid===binding.port_guid&&result.effect_id===binding.effect_id
        &&result.source_sha256===binding.source_sha256&&result.execution_id===binding.execution.execution_id
        &&result.deadline===binding.deadline,'opening response differs');
      const event={phase:'native_roundtrip_preview_gesture',step:phase,result};
      const ack=await onRecord(event);need(ack?.phase===event.phase&&ack.step===phase&&JSON.stringify(ack.result)===JSON.stringify(result),'gesture journal ACK differs');check();
    }
  }catch(error){
    if(effectPossible){operation.transportUncertain=true;await onState({uncertain:true});}
    const event={phase:'native_roundtrip_preview_refused',step,effect_possible:effectPossible,
      diagnostic:parseJavascriptNativePreviewDiagnostic(error.message)};
    try{
      const saved=await onRecord(event);
      need(saved?.phase===event.phase&&saved.step===step&&saved.effect_possible===effectPossible
        &&JSON.stringify(saved.diagnostic)===JSON.stringify(event.diagnostic),'refusal journal ACK differs');
    }catch(journalError){throw new AggregateError([error,journalError],error.message);}
    throw error;
  }
}

export function parseJavascriptNativePreviewDiagnostic(message){
  const match=typeof message==='string'&&message.match(/NP1 (\{[^\n]{1,400}\})/);
  if(!match)return null;
  let value;
  try{value=JSON.parse(match[1]);}catch{return null;}
  const keys=['binding','model','diagram','graph','container','node','port','data','cell','shape'];
  if(!value||Object.keys(value).sort().join(',')!=='c,h,p'
    ||!['prepare','select','selected','preview','other'].includes(value.p)
    ||!['prepared','selection-dispatched','selected','preview-dispatched','other'].includes(value.h)
    ||!value.c||Object.keys(value.c).length!==keys.length||!keys.every(k=>typeof value.c[k]==='boolean'))return null;
  return {p:value.p,h:value.h,c:Object.fromEntries(keys.map(k=>[k,value.c[k]]))};
}
