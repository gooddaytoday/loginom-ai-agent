import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makePreparedOutputPortOpenCode(binding,options) {
 return makePreparedPortOpenCode(binding,options,'output');
}
export function makePreparedInputPortOpenCode(binding,options) {
 return makePreparedPortOpenCode(binding,options,'input');
}
function makePreparedPortOpenCode(binding,options,direction) {
 validatePreparedNodeContext(binding);
 if(!options||Object.keys(options).sort().join(',')!=='build,deadline,operation_id,origin,port'
   ||!Number.isInteger(options.port)||options.port<0||options.port>99
   ||typeof options.operation_id!=='string'||! /^[A-Za-z0-9_.:-]{1,160}$/.test(options.operation_id)
   ||!Number.isSafeInteger(options.deadline)||typeof options.origin!=='string'||typeof options.build!=='string')throw Error('Exact bounded output port opening required');
 return `async page=>(${openPreparedOutputPort.toString()})(page,${JSON.stringify({binding,...options,direction})},${readPreparedNodeContext.toString()})`;
}

// A local opening receipt retains UI object identity across graph -> port wizard.
// Proxy objects are compared by reference only; no proxy property/method is used.
export async function openPreparedOutputPort(page,task,readNode=readPreparedNodeContext) {
 let effect=false;const trace=[],direction=task.direction??'output';
 const remaining=()=>{const n=task.deadline-Date.now();if(n<=0)throw Error('Output port opening deadline');return n;};
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
 const inspect=mode=>page.evaluate(({task,mode})=>{
  const direction=task.direction??'output',input=direction==='input',control=task.kind==='control';
  if(control&&(!input||task.port!==0))throw Error('Control input only');
  if(!['input','output'].includes(direction))throw Error('Invalid port direction');
  const b=task.binding,app=globalThis.bg?.app,p=globalThis.__loginomDockPreparationV1;
  const fail=m=>{throw Error(m);},exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
  if(location.origin!==task.origin||app?.Version!==task.build||p?.document!==document||p.id!==b.document_id)fail('Port opening document changed');
  const receipts=input?(p.inputPortOpenReceipts??=new Map()):(p.outputPortOpenReceipts??=new Map()),r=receipts.get(task.operation_id);
  if(r&&r.request!==JSON.stringify(b)+':'+task.port)fail('Port opening operation reused with another target');
  if(mode==='release_reserved'){if(r?.phase==='reserved')receipts.delete(task.operation_id);return null;}
  const records=[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===b.workflow_ref.workflow_id);
  const prepared=records.find(r=>r.nodeTargetWorkflowNode);
  const tabs=exact(b.workflow_ref.tab_tid);
  if(!prepared||records.some(r=>r.tab!==prepared.tab||r.packageNode!==prepared.packageNode)
    ||tabs.length!==1||tabs[0]!==prepared.tab||!tabs[0].classList.contains('x-tab-active'))fail('Port opening workflow changed');
  const card=app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),model=card?.Controller?.FController;
  if(['await_open','deactivation_issued'].includes(mode)) {
   if(!r||r.phase!=='open_issued'||r.workflow!==prepared.nodeTargetWorkflowNode||r.packageNode!==prepared.packageNode
     ||r.node.FGuid!==r.node_id||r.node.data!==r.nodeData||r.port.FGuid!==r.portGuid||r.port.data!==r.portData
     ||r.port.parent!==r.node||r.port.FPortIndex!==undefined&&r.port.FPortIndex!==r.nativeIndex)fail('Port confirmation identity changed');
   const visible=e=>e.checkVisibility({checkVisibilityCSS:true});
   const dialogs=[...document.querySelectorAll('[role="dialog"],.x-message-box')].filter(visible);
   if(!dialogs.length) {
    if(mode==='deactivation_issued')fail('Port confirmation disappeared before gesture');
    const wizard=exact(b.workflow_ref.prefix+';WizrdMCF');
    return wizard.length===1&&visible(wizard[0])?{wizard:true}:{pending:true,wizard_count:wizard.length,wizard_visible:wizard.map(visible).slice(0,4),controller_type:typeof model?.constructor?.name==='string'?model.constructor.name.slice(0,120):null,node_locked:r.node.FLocked===true,port_menu_same:r.graph.FCurrentPortMenu===r.port};
   }
   const dialog=dialogs[0],native=globalThis.Ext?.getCmp?.(dialog.id);
   const normalize=s=>s.replace(/\s+/g,' ').trim();
   const question='Loginom '+task.build+' Настройка порта приведет к деактивации узла. Вы действительно хотите начать настраивать порт? Да Да, больше не спрашивать Нет';
   if(dialogs.length!==1||native?.el?.dom!==dialog||normalize(dialog.innerText)!==question
     ||model!==r.graph||r.graph.FCurrentPortMenu!==r.port||r.node.FLocked===true
     ||card.Controller.Node?.data?.node!==r.workflow)fail('Port deactivation question owner changed');
   const masks=[...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].filter(visible);
   if(masks.some(e=>!(e.classList.contains('bg-mask-message')&&e.getAttribute('data-tid')===b.workflow_ref.prefix
       &&e.contains(r.graph.FDiagram.FmxGraph.container))
     &&!(e.classList?.contains('x-mask')===true&&e.classList?.contains('x-mask-msg')!==true&&!e.textContent.trim()
       &&e.parentElement?.getAttribute('data-tid')==='MF')))fail('Port confirmation has an unrelated mask');
   let yes;const confirmationControls=[];
   for(const [name,label] of Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'})) {
    // Ext retains hidden buttons from earlier dialogs with these same tids.
    const matches=exact('msgbox;tlb;'+name),es=matches.filter(visible),e=es[0],control=e&&globalThis.Ext?.getCmp?.(e.id);
    confirmationControls.push({tid:'msgbox;tlb;'+name,matches:matches.length,visible_matches:es.length});
    if(es.length!==1||!dialog.contains(e)||!visible(e)||normalize(e.textContent)!==label
      ||control?.el?.dom!==e||control.disabled===true||e.closest('.x-item-disabled,.x-btn-disabled'))fail('Port confirmation control changed: '+name+' '+JSON.stringify({
       matches:matches.length,visible_matches:es.length,in_dialog:!!e&&dialog.contains(e),
       label_matches:!!e&&normalize(e.textContent)===label,native_matches:!!e&&control?.el?.dom===e,
       disabled:control?.disabled===true,disabled_ancestor:!!e?.closest('.x-item-disabled,.x-btn-disabled')}));
    if(name==='yes')yes=e;
   }
   if(r.confirmation&&(r.confirmation.dialog!==dialog||r.confirmation.native!==native||r.confirmation.yes!==yes))fail('Port confirmation instance changed');
   r.confirmation??={dialog,native,yes};
   if(mode==='deactivation_issued')r.phase='deactivation_issued';
   return {deactivation:true,phase:r.phase,port_guid:r.portGuid,node_id:r.node_id,confirmation_controls:confirmationControls};
  }
  if(mode==='lookup')return r?{phase:r.phase,port_guid:r.port.FGuid}:null;
  const blockers=[...document.querySelectorAll('[role="dialog"],.x-mask,.x-mask-msg,.bg-mask-message')].filter(e=>e.checkVisibility({checkVisibilityCSS:true}));
  const blocked=blockers.some(e=>{
   const parent=e.parentElement,column=parent&&globalThis.Ext?.getCmp?.(parent.id),roots=exact(b.workflow_ref.prefix+';WizrdMCF'),grid=exact(b.workflow_ref.prefix+';WizrdMCF;TuneVariablesMappingWizard;grdTargetColumns');
   const ownDisabledHeader=control&&mode==='finish'&&e.classList?.contains('x-mask')===true&&e.classList?.contains('x-mask-msg')!==true&&!e.textContent.trim()
    &&parent?.getAttribute('data-tid')===b.workflow_ref.prefix+';WizrdMCF;TuneVariablesMappingWizard;colTargetDelete'
    &&column?.$className==='Ext.grid.column.Action'&&column.el.dom===parent&&column.disabled===true&&roots.length===1&&roots[0].contains(parent)
    &&grid.length===1&&Ext.getCmp(grid[0].id).getStore().isLoading()===false;
   // Ext masks a disabled delete-all column even when the output wizard is ready.
   // This one native control mask is not a wizard loading overlay.
   const columnTid=b.workflow_ref.prefix+';WizrdMCF;DataSetOutputSocketWizard;colTargetDelete';
   const ownDisabledOutputHeader=mode==='finish'&&!input&&e.classList?.contains('x-mask')
    &&!e.classList.contains('x-mask-msg')&&!e.classList.contains('bg-mask-message')
    &&e.getAttribute('role')!=='dialog'&&!e.textContent.trim()
    &&parent?.getAttribute('data-tid')===columnTid&&exact(columnTid).length===1
    &&roots.length===1&&model?.FView?.el?.dom===roots[0]&&roots[0].contains(parent)
    &&column?.el?.dom===parent&&column.disabled===true
    &&blockers.filter(mask=>mask.parentElement===parent).length===1;
   return !ownDisabledHeader&&!ownDisabledOutputHeader;
  });
  if(blocked){if(mode==='finish')return {pending:true,reason:'port_wizard_loading'};fail('Port opening blocked');}
  if(mode==='begin') {
   if(r)fail('Port opening already reserved');
   if(receipts.size>=128)fail('Port opening receipt bound exceeded');
   const pending=[...(p.inputPortOpenReceipts?.values()??[]),...(p.outputPortOpenReceipts?.values()??[])].some(v=>v.workflow===prepared.nodeTargetWorkflowNode&&v.phase!=='verified');
   if(pending)fail('Another output port opening is unresolved');
   const d=model?.FDiagram,roots=exact(b.workflow_ref.prefix+';ModelForm;cmpDiagram');
   if(!(model instanceof app.ModelForm)||roots.length!==1||d?.FmxGraph?.container!==roots[0])fail('Port opening graph unavailable');
   const ns=d.FNodes?.FCollection?.filter(n=>n.FGuid===b.node.node_id);
   if(ns?.length!==1||ns[0].FLocked===true)fail('Port opening node unavailable');
   const node=ns[0],nodeDom=d.FmxGraph.view.getState(node.FCell)?.shape?.node,tid=nodeDom?.getAttribute('data-tid');
   if(!tid||!roots[0].contains(nodeDom)||!Array.isArray(node.FPorts)||node.FPorts.length>16)fail('Port opening graph binding');
   const candidates=[];
   for(const list of node.FPorts){if(!Array.isArray(list.FCollection)||list.FCollection.length>100)fail('Port inventory bound');candidates.push(...list.FCollection);}
   const ports=[],graphBox=roots[0].getBoundingClientRect();
   for(const dom of document.querySelectorAll('[data-tid^='+JSON.stringify(tid+';'+(control?'Input_ControlVar':(input?'Input':'Output')+'_Data-'))+']')) {
    // The outline keeps a cloned SVG with identical tids after closing. Only
    // the prepared graph's own port can participate in native hit binding.
    if(!roots[0].contains(dom))continue;
    const ptid=dom.getAttribute('data-tid'),suffix=ptid.slice((tid+';'+(control?'Input_ControlVar':(input?'Input':'Output')+'_Data-')).length);
    if(control?suffix!=='':!/^[0-9]{1,2}$/.test(suffix))fail('Unknown output port identifier');
    const index=control?candidates.findIndex(p=>p.FCell===d.FmxGraph.view.getState(p.FCell)?.cell&&d.FmxGraph.view.getState(p.FCell)?.shape?.node===dom):Number(suffix),box=dom.getBoundingClientRect();
    if(index<0)fail('Control port native ordinal unavailable');
    if(box.width<=0||box.height<=0||exact(ptid).filter(e=>roots[0].contains(e)).length!==1)fail('Port DOM unavailable');
    const cell=d.FmxGraph.getCellAt(box.x-graphBox.x+roots[0].scrollLeft+box.width/2,box.y-graphBox.y+roots[0].scrollTop+box.height/2);
    const matches=candidates.filter(port=>port.FCell===cell&&port.parent===node&&port.data);
    if(matches.length!==1)fail('Port native hit identity unavailable');
    ports.push({port:matches[0],dom,tid:ptid,index});
   }
   ports.sort((a,b)=>a.index-b.index);
   // Union's dynamic tabular inputs retain an SVG creation index that includes
   // the hidden variable socket. Their native tree indexes are tabular ordinals.
   // Rebind on every opening; the exact cell, GUID and tree owner remain required.
   const dynamicUnion=input&&node.FIconCls==='bg-vendor-icon-uniondata';
   for(const [ordinal,p] of ports.entries()){
    p.nativeIndex=dynamicUnion?ordinal:p.index;
    if(p.port.FPortIndex!==undefined&&p.port.FPortIndex!==p.nativeIndex)fail('Port native hit identity unavailable');
   }
   if(new Set(ports.map(v=>v.index)).size!==ports.length||new Set(ports.map(v=>v.port.FGuid)).size!==ports.length)fail('Duplicate output ports');
   const target=ports[task.port];if(!target)fail('Requested output port absent');
   if(exact('mn').some(e=>e.checkVisibility({checkVisibilityCSS:true})))fail('An existing context menu is open');
   const rec={direction,request:JSON.stringify(b)+':'+task.port,phase:'reserved',graph:model,node,nodeData:node.data,
    port:target.port,portData:target.port.data,portGuid:target.port.FGuid,portDom:target.dom,
    portTid:target.tid,nativeIndex:target.nativeIndex,portIndex:task.port,workflow:prepared.nodeTargetWorkflowNode,packageNode:prepared.packageNode,
    document_id:b.document_id,workflow_id:b.workflow_ref.workflow_id,node_id:b.node.node_id,operation_id:task.operation_id};
   receipts.set(task.operation_id,rec);return {phase:rec.phase,port_tid:rec.portTid,port_guid:rec.port.FGuid,native_index:rec.nativeIndex};
  }
  if(!r||r.workflow!==prepared.nodeTargetWorkflowNode||r.packageNode!==prepared.packageNode)fail('Port opening receipt missing or changed');
  if(r.node.FGuid!==r.node_id||r.node.data!==r.nodeData||r.port.FGuid!==r.portGuid||r.port.data!==r.portData
    ||r.port.parent!==r.node||r.port.FPortIndex!==undefined&&r.port.FPortIndex!==r.nativeIndex)fail('Retained port identity changed');
  if(mode==='console_closed') {
   if(r.phase!=='console_close_issued'||model!==r.graph||r.node.FLocked===true)fail('Console recovery owner changed');
   const panels=['ConsoleForm','MF;ConsoleForm'].flatMap(exact).filter(e=>e.checkVisibility({checkVisibilityCSS:true}));
   if(panels.some(e=>e!==r.console.panel))fail('Console replaced during port recovery');
   if(panels.length)return {pending:true};
   r.phase='reserved';r.consoleClosed=true;return {closed:true};
  }
  if(mode==='menu_issued'||mode==='console_close_issued') {
   const graph=r.graph.FDiagram.FmxGraph,drawings=exact(r.portTid).filter(e=>graph.container.contains(e));
   if(r.phase!=='reserved'||model!==r.graph||r.node.FLocked===true
    ||drawings.length!==1)fail('Port changed before menu gesture');
   const dom=drawings[0],box=dom.getBoundingClientRect(),gb=graph.container.getBoundingClientRect();
   if(!graph.container.contains(dom)||box.width<=0||box.height<=0)fail('Port drawing unavailable');
   if(graph.getCellAt(box.x-gb.x+graph.container.scrollLeft+box.width/2,box.y-gb.y+graph.container.scrollTop+box.height/2)!==r.port.FCell)fail('Port native hit changed');
   // Hover may draw a transient SVG copy over a port. Use an observed point
   // directly; the following menu check must still bind the exact native port.
   const width=globalThis.innerWidth,height=globalThis.innerHeight;
   if(!Number.isFinite(width)||!Number.isFinite(height))fail('Port viewport unavailable');
   let point=null;
   for(const dy of [.5,.25,.75])for(const dx of [.5,.25,.75]){
    const x=box.x+box.width*dx,y=box.y+box.height*dy,hit=document.elementFromPoint(x,y);
    if(x>=0&&y>=0&&x<width&&y<height&&hit&&(hit===dom||dom.contains(hit)))point??={x,y};
   }
   if(mode==='console_close_issued'&&point)fail('Console no longer covers port before Close');
   if(!point){
    const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
    const panel=hit?.closest?.('[data-tid="ConsoleForm"],[data-tid="MF;ConsoleForm"]');
    const panels=['ConsoleForm','MF;ConsoleForm'].flatMap(exact);
    if(panel&&panels.length===1&&panels[0]===panel&&!r.consoleClosed&&panel.checkVisibility({checkVisibilityCSS:true})){
     // Reuse the native split-grid/store binding used for execution inventory.
     // Only completed records belonging to this prepared graph permit Close.
     const base=panel.getAttribute('data-tid')+';ProgressForm;';
     const grids=['treepanel;tree','grd;tbl'].map(t=>exact(base+'trpProgress;'+t));
     if(grids.some(es=>es.length!==1||!panel.contains(es[0])))fail('Covering console grids unavailable');
     const views=grids.map(es=>globalThis.Ext?.getCmp?.(es[0].id)),store=views[0]?.getStore?.(),root=store?.getRoot?.()??store?.getRootNode?.();
     if(store?.$className!=='Ext.data.TreeStore'||store.isLoading?.()||!root?.isModel||!root.internalId
       ||root.data?.loaded!==true||root.data.loading||views.some((v,i)=>v?.el?.dom!==grids[i][0]||v.getStore?.()!==store))fail('Covering console native binding unavailable');
     const nodes=r.graph.FDiagram.FNodes.FCollection,seen=new Set();let owned=false;
     const walk=records=>{
      if(!Array.isArray(records))fail('Console process inventory unavailable');
      for(const record of records){
       if(seen.size>=2000||seen.has(record)||!record?.isModel||record.data?.loading||record.data?.Status!==3
         ||record.data.CanCancelProcess!==false)fail('Console process is unsettled');
       seen.add(record);
       if(record.data.ModelNode){
        if(nodes.filter(n=>n.data===record.data.ModelNode).length!==1)fail('Console belongs to another graph');
        owned=true;
       }
       walk(record.childNodes);
      }
     };walk(root.childNodes);
     if(!owned||[...document.querySelectorAll('.x-window,.x-menu')].some(e=>e!==panel&&e.checkVisibility({checkVisibilityCSS:true})))fail('Console recovery has a foreign owner or layer');
     const buttons=exact(panel.getAttribute('data-tid')+';btnClose'),close=buttons[0],native=close&&globalThis.Ext?.getCmp?.(close.id);
     if(buttons.length!==1||!panel.contains(close)||native?.el?.dom!==close||native.disabled===true
       ||!close.checkVisibility({checkVisibilityCSS:true})||close.getAttribute('aria-disabled')==='true'
       ||close.closest('.x-item-disabled,.x-btn-disabled'))fail('Console Close unavailable');
     const cb=close.getBoundingClientRect(),x=cb.x+cb.width/2,y=cb.y+cb.height/2,top=document.elementFromPoint(x,y);
     if(cb.width<=0||cb.height<=0||x<0||y<0||x>=width||y>=height||!(top===close||close.contains(top)))fail('Console Close is covered');
     if(r.console&&(r.console.panel!==panel||r.console.close!==close||r.console.native!==native
       ||r.console.store!==store||r.console.root!==root||views.some((v,i)=>v!==r.console.views[i])))fail('Console recovery identity changed');
     r.console??={panel,close,native,store,root,views};
     if(mode==='console_close_issued')r.phase='console_close_issued';
     return {console:true,point:{x,y},console_tid:panel.getAttribute('data-tid')};
    }
    if(mode==='console_close_issued')fail('Owned console disappeared before Close');
    // Loginom can leave its hover tip over a freshly observed port. Move only
    // to a hit-tested empty point in this graph, then recheck the same owner.
    const tooltip=hit?.closest?.('[data-tid="ttip"],[data-tid^="ttip-"]');
    const tooltipTid=tooltip?.getAttribute('data-tid');
    if(/^ttip(?:-\d+)?$/.test(tooltipTid??'')&&exact(tooltipTid).length===1
      &&tooltip.checkVisibility({checkVisibilityCSS:true})){
     for(const dy of [.5,.1,.9])for(const dx of [.5,.1,.9]){
      const x=Math.max(0,gb.x)+(Math.min(width,gb.x+gb.width)-Math.max(0,gb.x))*dx;
      const y=Math.max(0,gb.y)+(Math.min(height,gb.y+gb.height)-Math.max(0,gb.y))*dy;
      const background=document.elementFromPoint(x,y);
      if(x>=0&&y>=0&&x<width&&y<height&&x>=gb.x&&x<gb.x+gb.width&&y>=gb.y&&y<gb.y+gb.height
        &&background&&(background===graph.container||graph.container.contains(background))
        &&!graph.getCellAt(x-gb.x+graph.container.scrollLeft,y-gb.y+graph.container.scrollTop))
       return {tooltip:true,point:{x,y}};
     }
    }
    let detail='';
    // Failure-only DOM identity: a covered port remains a refusal. Never read
    // text/values or grant the covering layer an actionable UI reference.
    try{
     const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
     const describe=e=>e?{tag:e.tagName?.toLowerCase().slice(0,16)??null,
      tid:e.getAttribute('data-tid')?.slice(0,64)??null,role:e.getAttribute('role')?.slice(0,24)??null,
      class:e.getAttribute('class')?.slice(0,64)??null}:null;
     const rect=b=>[b.x,b.y,b.width,b.height].map(n=>Math.round(n*1000)/1000);
     const diagnostic={port_tid:r.portTid.slice(0,96),port_box:rect(box),point:[box.x+box.width/2,box.y+box.height/2],
      covering:describe(hit),covering_box:hit?rect(hit.getBoundingClientRect()):null,
      anchor:describe(hit?.closest?.('[data-tid],[role="tooltip"],[role="dialog"],.x-tip,.x-window,.x-menu,.x-panel'))};
     // Escaped control characters can expand attributes sixfold. Keep the
     // complete diagnostic inside the existing 500-character error budget.
     for(let limit=32;JSON.stringify(diagnostic).length>400;limit=Math.floor(limit/2)){
      diagnostic.port_tid=diagnostic.port_tid.slice(0,limit);
      for(const e of [diagnostic.covering,diagnostic.anchor])if(e)
       for(const key of ['tag','tid','role','class'])if(typeof e[key]==='string')e[key]=e[key].slice(0,limit);
     }
     detail=': '+JSON.stringify(diagnostic);
    }catch{}
    fail('Port has no observed interaction point'+detail);
   }
   r.portDom=dom;r.phase='menu_issued';return {phase:r.phase,point};
  }
  if(mode==='menu'||mode==='open_issued') {
   const visible=e=>e.checkVisibility({checkVisibilityCSS:true});
   const menus=exact('mn').filter(visible),buttons=exact('mn;mniConfigurePort').filter(visible),menu=r.graph.FPortContextMenu;
   if(r.phase!=='menu_issued'||model!==r.graph||model.FCurrentPortMenu!==r.port||r.port.parent!==r.node
    ||menus.length!==1||menu?.el?.dom!==menus[0]||globalThis.Ext?.getCmp?.(menus[0].id)!==menu
    ||!menus[0].checkVisibility({checkVisibilityCSS:true})||buttons.length!==1||!menus[0].contains(buttons[0])
    ||!buttons[0].checkVisibility({checkVisibilityCSS:true})||buttons[0].closest('.x-item-disabled,.x-menu-item-disabled'))fail('Port menu owner changed');
   if(mode==='open_issued')r.phase='open_issued';return {phase:r.phase,port_guid:r.port.FGuid};
  }
  if(mode==='finish') {
   if(!['open_issued','deactivation_issued','verified'].includes(r.phase))fail('Port wizard was not opened by this operation');
   const wizardTree=card.Controller.Node?.data?.node,portTree=wizardTree?.ParentNode,group=portTree?.ParentNode,nodeTree=group?.ParentNode;
   const roots=exact(b.workflow_ref.prefix+';WizrdMCF');
   if(!(wizardTree instanceof app.WizardTreeNode)||!(portTree instanceof app.ModelPortTreeNode)
    ||!(group instanceof (input?app.ModelInputPortsTreeNode:app.ModelOutputPortsTreeNode))||!(nodeTree instanceof app.ModelNodeTreeNode)
    ||nodeTree.FGuid!==r.node_id||nodeTree.FModelNode!==r.node.data||portTree.FModelNodePort!==r.port.data
    ||portTree.FIndex!==r.nativeIndex||nodeTree.ParentNode!==r.workflow
    ||model?.constructor?.name!=='WizardModelComponentForm'||!(input?model.FModelSocket:model.FModelEnginePort)||model.FModelNode
    ||roots.length!==1||model.FView?.el?.dom!==roots[0])fail('Opened port wizard owner differs');
   if(r.phase==='verified'&&(r.wizard!==model||r.enginePort!==(input?model.FModelSocket:model.FModelEnginePort)||r.portTree!==portTree||r.nodeTree!==nodeTree))fail('Port wizard receipt became stale');
   r.wizard=model;r.enginePort=input?model.FModelSocket:model.FModelEnginePort;r.portTree=portTree;r.nodeTree=nodeTree;r.phase='verified';
   return {phase:r.phase,verified:true,document_id:r.document_id,workflow_id:r.workflow_id,node_id:r.node_id,
    direction,port:r.portIndex,native_index:r.nativeIndex,port_guid:r.port.FGuid,opening_operation_id:r.operation_id};
  }
  fail('Unknown port opening phase');
 },{task,mode});
 const finish=async()=>{while(remaining()>0){const result=await inspect('finish');if(!result.pending)return result;await page.waitForTimeout(Math.min(100,remaining()));}};
 try {
  remaining();let existing=await inspect('lookup');
  if(existing?.phase==='reserved'){await inspect('release_reserved');existing=null;}
  if(existing){effect=existing.phase!=='reserved';const result=await finish();return {status:'SUCCEEDED',...result,effect_possible:false,cleanup_complete:true,replayed:true,trace};}
  const before=await readNode(page,task.binding);
  if(before?.verified!==true||before.surface!=='graph'||before.locked!==false)throw Error('Prepared unlocked graph required for port opening');
  const target=await inspect('begin');trace.push({event:direction+'_port_reserved',...target});
  if(JSON.stringify(await readNode(page,task.binding))!==JSON.stringify(before))throw Error('Prepared node changed before port opening');
  let issued=await inspect('menu_issued');
  if(issued.console){
   trace.push({event:direction+'_port_console_observed',console_tid:issued.console_tid});
   const close=await inspect('console_close_issued');
   remaining();effect=true;
   await page.mouse.click(close.point.x,close.point.y,{button:'left'});
   const until=Date.now()+Math.min(1000,remaining());
   while((await inspect('console_closed')).pending){
    if(Date.now()>=until)throw Error('Owned console did not close before port opening');
    await page.waitForTimeout(Math.min(100,until-Date.now(),remaining()));
   }
   effect=false;trace.push({event:direction+'_port_console_closed'});
   if(JSON.stringify(await readNode(page,task.binding))!==JSON.stringify(before))throw Error('Prepared node changed after console Close');
   issued=await inspect('menu_issued');
  }
  if(issued.tooltip){
   const until=Date.now()+Math.min(1000,remaining());
   trace.push({event:direction+'_port_tooltip_observed',point:issued.point});
   await page.mouse.move(issued.point.x,issued.point.y);
   while(issued.tooltip){
    if(Date.now()>=Math.min(until,task.deadline))throw Error('Loginom tooltip ttip still covers port after bounded hover recovery; no port gesture issued');
    issued=await inspect('menu_issued');
    if(issued.tooltip)await page.waitForTimeout(Math.min(100,Math.max(1,until-Date.now()),remaining()));
   }
   trace.push({event:direction+'_port_tooltip_cleared'});
  }
  remaining();effect=true;
  await page.mouse.click(issued.point.x,issued.point.y,{button:'right'});
  await page.locator('[data-tid="mn;mniConfigurePort"]:visible').waitFor({state:'visible',timeout:remaining()});
  trace.push({event:direction+'_port_menu_verified',...await inspect('menu')});
  await page.locator('[data-tid="mn;mniConfigurePort"]:visible').click({trial:true,timeout:remaining()});
  trace.push({event:direction+'_port_open_issued',...await inspect('open_issued')});
  await page.locator('[data-tid="mn;mniConfigurePort"]:visible').click({timeout:remaining()});
  trace.push({event:direction+'_port_open_returned'});
  let pendingObservation;
  while(remaining()>0) {
   const transition=await inspect('await_open');
   if(transition.pending){
    if(!pendingObservation){pendingObservation={event:direction+'_port_open_pending',samples:0,last:transition};trace.push(pendingObservation);}
    pendingObservation.samples++;pendingObservation.last=transition;
   }
   if(transition.wizard)break;
   if(transition.deactivation) {
    trace.push({event:direction+'_port_deactivation_question_verified',...transition});
    const yes=page.locator('[data-tid="msgbox;tlb;yes"]:visible');
    await yes.click({trial:true,timeout:remaining()});
    const issued=await inspect('deactivation_issued');
    trace.push({event:direction+'_port_deactivation_issued',...issued});
    await yes.click({timeout:remaining()});
    break;
   }
   await page.waitForTimeout(Math.min(100,remaining()));
  }
  await at(task.binding.workflow_ref.prefix+';WizrdMCF').waitFor({state:'visible',timeout:remaining()});
  const result=await finish();trace.push({event:direction+'_port_wizard_verified',...result});
  return {status:'SUCCEEDED',...result,effect_possible:true,cleanup_complete:true,replayed:false,trace};
 }catch(error){if(!effect){try{await inspect('release_reserved');}catch{}}return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,effect_possible:effect,cleanup_complete:!effect,
  error:String(error.message).slice(0,500),trace};}
}
