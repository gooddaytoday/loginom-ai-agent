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
  const direction=task.direction??'output',input=direction==='input';
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
    return wizard.length===1&&visible(wizard[0])?{wizard:true}:{pending:true};
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
     &&!(e.classList.contains('x-mask')&&!e.classList.contains('x-mask-msg')&&!e.textContent.trim()
       &&e.parentElement?.getAttribute('data-tid')==='MF')))fail('Port confirmation has an unrelated mask');
   let yes;
   for(const [name,label] of Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'})) {
    const es=exact('msgbox;tlb;'+name),e=es[0],control=e&&globalThis.Ext?.getCmp?.(e.id);
    if(es.length!==1||!dialog.contains(e)||!visible(e)||normalize(e.textContent)!==label
      ||control?.el?.dom!==e||control.disabled===true||e.closest('.x-item-disabled,.x-btn-disabled'))fail('Port confirmation control changed');
    if(name==='yes')yes=e;
   }
   if(r.confirmation&&(r.confirmation.dialog!==dialog||r.confirmation.native!==native||r.confirmation.yes!==yes))fail('Port confirmation instance changed');
   r.confirmation??={dialog,native,yes};
   if(mode==='deactivation_issued')r.phase='deactivation_issued';
   return {deactivation:true,phase:r.phase,port_guid:r.portGuid,node_id:r.node_id};
  }
  if(mode==='lookup')return r?{phase:r.phase,port_guid:r.port.FGuid}:null;
  const blocked=[...document.querySelectorAll('[role="dialog"],.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>e.checkVisibility({checkVisibilityCSS:true}));
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
   for(const dom of document.querySelectorAll('[data-tid^='+JSON.stringify(tid+';'+(input?'Input':'Output')+'_Data-')+']')) {
    const ptid=dom.getAttribute('data-tid'),suffix=ptid.slice((tid+';'+(input?'Input':'Output')+'_Data-').length);
    if(!/^[0-9]{1,2}$/.test(suffix))fail('Unknown output port identifier');
    const index=Number(suffix),box=dom.getBoundingClientRect();
    if(!roots[0].contains(dom)||box.width<=0||box.height<=0||exact(ptid).length!==1)fail('Port DOM unavailable');
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
  if(mode==='menu_issued') {
   if(r.phase!=='reserved'||model!==r.graph||r.node.FLocked===true
    ||exact(r.portTid).length!==1)fail('Port changed before menu gesture');
   const graph=r.graph.FDiagram.FmxGraph,dom=exact(r.portTid)[0],box=dom.getBoundingClientRect(),gb=graph.container.getBoundingClientRect();
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
   if(!point)fail('Port has no observed interaction point');
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
  const issued=await inspect('menu_issued');effect=true;
  await page.mouse.click(issued.point.x,issued.point.y,{button:'right'});
  await page.locator('[data-tid="mn;mniConfigurePort"]:visible').waitFor({state:'visible',timeout:remaining()});
  trace.push({event:direction+'_port_menu_verified',...await inspect('menu')});
  await page.locator('[data-tid="mn;mniConfigurePort"]:visible').click({trial:true,timeout:remaining()});await inspect('open_issued');
  await page.locator('[data-tid="mn;mniConfigurePort"]:visible').click({timeout:remaining()});
  while(remaining()>0) {
   const transition=await inspect('await_open');
   if(transition.wizard)break;
   if(transition.deactivation) {
    trace.push({event:direction+'_port_deactivation_question_verified',...transition});
    await at('msgbox;tlb;yes').click({trial:true,timeout:remaining()});
    const issued=await inspect('deactivation_issued');
    trace.push({event:direction+'_port_deactivation_issued',...issued});
    await at('msgbox;tlb;yes').click({timeout:remaining()});
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
