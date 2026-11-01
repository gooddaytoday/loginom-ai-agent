import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {openPreparedOutputPort} from '../lib/node-port-open.mjs';

function fixture(direction='output') {
 class ModelForm{};class WizardTreeNode{};class ModelPortTreeNode{};class ModelOutputPortsTreeNode{};class ModelInputPortsTreeNode{};class ModelNodeTreeNode{};
 const prefix='MF;TF',elements=[],box={x:0,y:0,width:20,height:20};
 const el=tid=>{const e={tid,id:'element-'+elements.length,textContent:'',visible:true,scrollLeft:0,scrollTop:0,getAttribute:()=>tid,getBoundingClientRect:()=>box,
  checkVisibility:o=>o?.checkVisibilityCSS===true&&e.visible,contains:x=>x===e||x?.parent===e,
  closest:()=>null,classList:{contains:()=>true}};elements.push(e);return e;};
 const tab=el('tab'),root=el(prefix+';ModelForm;cmpDiagram'),nodeDom=el(prefix+';Graph;Node');nodeDom.parent=root;
 const portDom=el(nodeDom.tid+';'+(direction==='input'?'Input':'Output')+'_Data-0');portDom.parent=root;
 const menu=el('mn'),button=el('mn;mniConfigurePort');button.parent=menu;menu.visible=false;
 const wizardDom=el(prefix+';WizrdMCF');wizardDom.visible=false;
 const dialog=el(null);dialog.visible=false;dialog.innerText='Loginom 7.4.2 Настройка порта приведет к деактивации узла. Вы действительно хотите начать настраивать порт? Да Да, больше не спрашивать Нет';
 const confirmation=Object.fromEntries(Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'}).map(([key,label])=>{
  const e=el('msgbox;tlb;'+key);e.textContent=label;e.parent=dialog;return [key,e];
 }));
 const node={FGuid:'node',FCell:{},data:{},FLocked:false},port={FGuid:'port',FCell:{},FPortIndex:0,data:{},parent:node};node.FPorts=[{FCollection:[port]}];
 const graph=Object.assign(new ModelForm(),{FDiagram:{FNodes:{FCollection:[node]},FmxGraph:{container:root,
  view:{getState:c=>({cell:c,shape:{node:c===node.FCell?nodeDom:portDom}})},getCellAt:()=>port.FCell}},FPortContextMenu:{el:{dom:menu}}});
 const workflow={},packageNode={},nodeTree=Object.assign(new ModelNodeTreeNode(),{ParentNode:workflow,FGuid:'node',FModelNode:node.data});
 const group=Object.assign(new (direction==='input'?ModelInputPortsTreeNode:ModelOutputPortsTreeNode)(),{ParentNode:nodeTree}),portTree=Object.assign(new ModelPortTreeNode(),{ParentNode:group,FIndex:0,FModelNodePort:port.data});
 const wizardTree=Object.assign(new WizardTreeNode(),{ParentNode:portTree});
 class WizardModelComponentForm{};const wizard=Object.assign(new WizardModelComponentForm(),{[direction==='input'?'FModelSocket':'FModelEnginePort']:{},FView:{el:{dom:wizardDom}}});
 const card={Controller:{FController:graph,Node:{data:{node:workflow}}}},flags={foreignMenu:false,foreignWizard:false,loading:0,deactivation:false},gestures=[];
 const document={elementFromPoint:()=>flags.foreignHit?menu:portDom,querySelectorAll:q=>{
  if(q.startsWith('[data-tid=')){const t=JSON.parse(q.slice(10,-1));return elements.filter(e=>e.tid===t);}
  if(q.startsWith('[data-tid^=')){const t=JSON.parse(q.slice(11,-1));return elements.filter(e=>e.tid?.startsWith(t));}
  if(q==='[role="dialog"],.x-message-box')return dialog.visible?[dialog]:[];
  if(q==='.x-mask,.x-mask-msg,.bg-mask-message')return [];
  if(dialog.visible)return [dialog];
  if(card.Controller.FController===wizard&&flags.finishMasks)return flags.finishMasks;
  if(flags.loading>0){flags.loading--;return [{checkVisibility:()=>true}];}return [];
 }};
 const prep={document,id:'doc',receipts:new Map([['prepare',{phase:'verified',workflowId:'flow',tab,packageNode,nodeTargetWorkflowNode:workflow}]])};
 const app={Version:'7.4.2',ModelForm,WizardTreeNode,ModelPortTreeNode,ModelOutputPortsTreeNode,ModelInputPortsTreeNode,ModelNodeTreeNode,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}}};
 menu.id='menu';const nativeControls=new Map([dialog,...Object.values(confirmation)].map(e=>[e.id,{el:{dom:e}}]));
 const context=vm.createContext({document,innerWidth:1000,innerHeight:800,location:{origin:'http://example.test'},bg:{app},__loginomDockPreparationV1:prep,Ext:{getCmp:id=>nativeControls.get(id)??graph.FPortContextMenu}});
 const showWizard=()=>{menu.visible=false;dialog.visible=false;wizardDom.visible=true;card.Controller.FController=wizard;card.Controller.Node.data.node=wizardTree;if(flags.foreignWizard)portTree.FModelNodePort={};flags.loading=2;};
 const page={mouse:{click:async(x,y,options)=>{if(options.button!=='right')throw Error('Expected right click');gestures.push(portDom.tid);menu.visible=true;graph.FCurrentPortMenu=flags.foreignMenu?{}:port;}},evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context),waitForTimeout:async()=>{},locator:selector=>{
  const tid=JSON.parse(selector.replace(/:visible$/, '').slice(10,-1));return {waitFor:async()=>{},click:async options=>{
   if(options?.trial){if(tid===confirmation.yes.tid)flags.beforeConfirm?.();return;}gestures.push(tid);
   if(tid===portDom.tid){menu.visible=true;graph.FCurrentPortMenu=flags.foreignMenu?{}:port;}
   else if(tid===button.tid){if(flags.holdOpen){menu.visible=false;}else if(flags.deactivation){menu.visible=false;dialog.visible=true;}else showWizard();}
   else if(tid===confirmation.yes.tid){showWizard();if(flags.lostConfirmation)throw Error('Confirmation reply lost');}
   else throw Error('Unexpected gesture');
  }};
 }};
 const task={binding:{document_id:'doc',workflow_ref:{workflow_id:'flow',prefix,tab_tid:'tab'},node:{document_id:'doc',workflow_id:'flow',node_id:'node'}},
  direction,port:0,operation_id:'open',origin:'http://example.test',build:'7.4.2',deadline:Date.now()+20000};
 const readNode=async()=>({verified:true,surface:'graph',locked:false,node_id:'node'});
 const run=()=>openPreparedOutputPort(page,task,readNode);
 return {run,task,prep,flags,gestures,port,portDom,graph,node,wizard,card,menu,readNode,page,dialog,confirmation,nativeControls,document,el,portTree};
}

test('port opening binds menu and wizard native identities and replays without another gesture',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(r.port_guid,'port');
 assert.equal(f.gestures.length,2);assert.equal(r.trace.at(-1).event,'output_port_wizard_verified');
 const again=await f.run();assert.equal(again.status,'SUCCEEDED',again.error);assert.equal(again.replayed,true);assert.equal(f.gestures.length,2);
});
test('outline SVG clones cannot replace or duplicate a port inside the prepared graph',async()=>{
 for(const direction of ['input','output']){
  const f=fixture(direction);const clone=f.el(f.portDom.tid);clone.getBoundingClientRect=()=>({x:0,y:0,width:0,height:0});
  assert.equal((await f.run()).status,'SUCCEEDED');assert.equal(f.gestures.length,2);
  const duplicate=fixture(direction);duplicate.el(duplicate.portDom.tid).parent=duplicate.portDom.parent;
  assert.equal((await duplicate.run()).status,'NOT_APPLIED');assert.equal(duplicate.gestures.length,0);
  const missing=fixture(direction);missing.portDom.parent=null;
  assert.equal((await missing.run()).status,'NOT_APPLIED');assert.equal(missing.gestures.length,0);
 }
});
test('foreign menu stops before Configure and unresolved opening never repeats right click',async()=>{
 const f=fixture();f.flags.foreignMenu=true;const r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(f.gestures.length,1);
 f.flags.foreignMenu=false;await f.run();assert.equal(f.gestures.length,1);
});
test('foreign port tree cannot become a successful opening receipt',async()=>{
 const f=fixture();f.flags.foreignWizard=true;const r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(f.gestures.length,2);
 assert.equal(f.prep.outputPortOpenReceipts.get('open').phase,'open_issued');
});
test('unknown target and blocked graph cause no gesture',async()=>{
 for(const change of [f=>{f.task.port=1;},f=>{f.node.FLocked=true;},f=>{f.flags.loading=1;},f=>{f.menu.visible=true;}]){
  const f=fixture();change(f);const r=await f.run();assert.equal(r.status,'NOT_APPLIED',r.error);assert.equal(f.gestures.length,0);
 }
});
test('blocked opening reports only bounded layer and parent identity',async()=>{
 for(const long of [false,true]){
  const f=fixture('input');
  const parent={tagName:'DIV',getAttribute:key=>key==='data-tid'?'MF;TF;WizrdMCF':key==='class'?'x-panel':null};
  const mask={tagName:'DIV',parentElement:parent,textContent:'PRIVATE_TEXT',value:'PRIVATE_VALUE',
   getAttribute:key=>key==='class'?(long?'"\n\\'.repeat(1000):'x-mask'):key==='role'?'presentation':null,
   classList:{contains:()=>false},checkVisibility:()=>true};
  const query=f.document.querySelectorAll;
  f.document.querySelectorAll=q=>q==='[role="dialog"],.x-mask,.x-mask-msg,.bg-mask-message'?[mask]:query(q);
  const result=await f.run();
  assert.equal(result.status,'NOT_APPLIED');assert.deepEqual(f.gestures,[]);
  assert.match(result.error,/Port opening blocked: /);assert.ok(result.error.length<=500);
  assert.ok(!result.error.includes('PRIVATE_TEXT'));assert.ok(!result.error.includes('PRIVATE_VALUE'));
  const d=JSON.parse(result.error.slice(result.error.indexOf(': ')+2));
  assert.equal(d.mode,'begin');assert.equal(d.layer.tag,'div');
  if(!long){assert.equal(d.layer.class,'x-mask');assert.equal(d.parent.tid,'MF;TF;WizrdMCF');}
 }
});
test('verified opening refuses a different wizard or a reused operation target',async()=>{
 const f=fixture();assert.equal((await f.run()).status,'SUCCEEDED');f.wizard.FModelEnginePort={};assert.equal((await f.run()).verified,false);assert.equal(f.gestures.length,2);
 f.task.port=1;assert.equal((await f.run()).verified,false);assert.equal(f.gestures.length,2);
});
test('pre-gesture reservation can be released after a no-effect refusal',async()=>{
 const f=fixture();f.flags.foreignHit=true;
 assert.equal((await f.run()).status,'NOT_APPLIED');assert.equal(f.prep.outputPortOpenReceipts.size,0);assert.equal(f.gestures.length,0);
 f.flags.foreignHit=false;assert.equal((await f.run()).status,'SUCCEEDED');assert.equal(f.gestures.length,2);
});

test('reopened ports may omit the lazy FPortIndex but must retain their native cell and tree index',async()=>{
 const f=fixture();delete f.port.FPortIndex;assert.equal((await f.run()).status,'SUCCEEDED');
 const wrong=fixture();wrong.port.FPortIndex=1;assert.equal((await wrong.run()).status,'NOT_APPLIED');assert.equal(wrong.gestures.length,0);
});

test('active port opening confirms its bound question once and replay performs no gestures',async()=>{
 const f=fixture();f.flags.deactivation=true;
 const result=await f.run();assert.equal(result.status,'SUCCEEDED',result.error);
 assert.deepEqual(f.gestures.slice(-1),['msgbox;tlb;yes']);assert.equal(f.gestures.length,3);
 assert.deepEqual(result.trace.map(t=>t.event),['output_port_reserved','output_port_menu_verified','output_port_open_issued','output_port_open_returned','output_port_deactivation_question_verified','output_port_deactivation_issued','output_port_wizard_verified']);
 assert.equal((await f.run()).status,'SUCCEEDED');assert.equal(f.gestures.length,3);
});

test('deactivation ignores hidden controls retained by an earlier dialog',async()=>{
 for(const direction of ['input','output'])for(const name of ['yes','no','cancel']){
  const f=fixture(direction);f.flags.deactivation=true;
  const stale=f.el('msgbox;tlb;'+name);stale.visible=false;
  stale.textContent='Предыдущий диалог';f.nativeControls.set(stale.id,{el:{dom:stale}});
  const result=await f.run();assert.equal(result.status,'SUCCEEDED',direction+':'+name+':'+result.error);
  assert.equal(f.gestures.length,3);assert.equal(f.gestures.at(-1),'msgbox;tlb;yes');
  const observed=result.trace.find(t=>t.event===direction+'_port_deactivation_issued').confirmation_controls;
  assert.equal(observed.find(c=>c.tid==='msgbox;tlb;'+name).matches,2);
  assert.ok(observed.every(c=>c.visible_matches===1));
 }
});

test('deactivation refuses visible duplicate or foreign confirmation controls',async()=>{
 for(const name of ['yes','no','cancel'])for(const variant of ['duplicate','foreign']){
  const f=fixture('input');f.flags.deactivation=true;
  if(variant==='duplicate'){
   const duplicate=f.el('msgbox;tlb;'+name);duplicate.parent=f.dialog;
   duplicate.textContent=f.confirmation[name].textContent;f.nativeControls.set(duplicate.id,{el:{dom:duplicate}});
  }else f.confirmation[name].parent={};
  assert.equal((await f.run()).status,'AMBIGUOUS',name+':'+variant);
  assert.equal(f.gestures.length,2);
 }
});

test('deactivation rechecks question, node, port, dialog and control before Yes',async()=>{
 const changes=[
  f=>{f.dialog.innerText=f.dialog.innerText.replace('порта','узла');},
  f=>{f.graph.FCurrentPortMenu={};},f=>{f.node.data={};},f=>{f.port.data={};},
  f=>{f.node.FLocked=true;},f=>{f.card.Controller.Node.data.node={};},
  f=>{f.confirmation.yes.textContent='Другой ответ';},
  f=>{f.nativeControls.get(f.confirmation.yes.id).disabled=true;},
  f=>{f.nativeControls.set(f.dialog.id,{el:{dom:f.dialog}});},
  f=>{f.dialog.visible=false;},
 ];
 for(const [i,change] of changes.entries()) {
  const f=fixture();f.flags.deactivation=true;f.flags.beforeConfirm=()=>change(f);
  const result=await f.run();assert.equal(result.status,'AMBIGUOUS',String(i));
  assert.equal(f.gestures.length,2,String(i));assert.equal(f.prep.outputPortOpenReceipts.get('open').phase,'open_issued');
 }
});

test('lost Yes response retains issued receipt and reconciles without another confirmation',async()=>{
 const f=fixture();f.flags.deactivation=true;f.flags.lostConfirmation=true;
 const first=await f.run();assert.equal(first.status,'AMBIGUOUS');assert.equal(f.gestures.length,3);
 assert.equal(f.prep.outputPortOpenReceipts.get('open').phase,'deactivation_issued');
 const second=await f.run();assert.equal(second.status,'SUCCEEDED',second.error);assert.equal(f.gestures.length,3);
});

test('input port binds its own group and socket without accepting the output engine port',async()=>{
 const f=fixture('input'),r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(r.direction,'input');
 assert.equal(f.prep.inputPortOpenReceipts.get('open').enginePort,f.wizard.FModelSocket);
 const again=await f.run();assert.equal(again.replayed,true);assert.equal(f.gestures.length,2);
 f.wizard.FModelEnginePort=f.wizard.FModelSocket;f.wizard.FModelSocket={};
 assert.equal((await f.run()).verified,false);assert.equal(f.gestures.length,2);
});
test('unresolved opposite-direction port opening prevents a new gesture',async()=>{
 const f=fixture('input');f.flags.foreignMenu=true;await f.run();
 f.task.direction='output';f.task.operation_id='another';f.flags.foreignMenu=false;
 const r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(f.gestures.length,1);
});

for (const direction of ['input', 'output']) test(`${direction} port ignores hidden stale menus but rejects two visible menus`, async()=>{
 const f=fixture(direction),old=f.el('mn'),button=f.el('mn;mniConfigurePort');button.parent=old;old.visible=false;button.visible=false;
 assert.equal((await f.run()).status,'SUCCEEDED');assert.equal(f.gestures.length,2);
 const g=fixture(direction),duplicate=g.el('mn');duplicate.visible=false;
 const click=g.page.mouse.click;g.page.mouse.click=async(...args)=>{await click(...args);duplicate.visible=true;};
 assert.equal((await g.run()).status,'AMBIGUOUS');assert.equal(g.gestures.length,1);
});

test('Union dynamic SVG creation index is rebound to the native tabular ordinal',async()=>{
 const f=fixture('input');f.node.FIconCls='bg-vendor-icon-uniondata';f.portDom.tid='MF;TF;Graph;Node;Input_Data-3';f.portDom.getAttribute=()=>f.portDom.tid;
 const r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(r.native_index,0);assert.equal(r.port,0);assert.equal(r.port_guid,'port');
 const bad=fixture('input');bad.node.FIconCls='bg-vendor-icon-uniondata';bad.port.FPortIndex=1;assert.equal((await bad.run()).status,'NOT_APPLIED');assert.equal(bad.gestures.length,0);
});

test('Union third port keeps logical 2, SVG 3 and native tree 2 distinct',async()=>{
 const f=fixture('input');f.node.FIconCls='bg-vendor-icon-uniondata';f.task.port=2;f.port.FPortIndex=2;f.portTree.FIndex=2;
 f.portDom.tid='MF;TF;Graph;Node;Input_Data-3';f.portDom.getAttribute=()=>f.portDom.tid;
 const ports=[0,1].map(i=>{const p={FGuid:'prior-'+i,FCell:{},FPortIndex:i,data:{},parent:f.node};const dom=f.el('MF;TF;Graph;Node;Input_Data-'+i);dom.parent=f.portDom.parent;dom.getBoundingClientRect=()=>({x:i*30,y:0,width:20,height:20});return {p,dom};});
 f.portDom.getBoundingClientRect=()=>({x:60,y:0,width:20,height:20});f.node.FPorts[0].FCollection.unshift(...ports.map(x=>x.p));
 f.graph.FDiagram.FmxGraph.getCellAt=x=>x<30?ports[0].p.FCell:x<60?ports[1].p.FCell:f.port.FCell;
 const r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(r.port,2);assert.equal(r.native_index,2);assert.equal(r.trace[0].port_tid,'MF;TF;Graph;Node;Input_Data-3');
});

test('covered port refuses opening before any mouse gesture',async()=>{const f=fixture();f.flags.foreignHit=true;const r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);assert.deepEqual(f.gestures,[]);});

for(const direction of ['input','output'])for(const variant of ['hidden','delayed','persistent','foreign','changed-port','no-neutral-point'])test(direction+' port tooltip recovery: '+variant,async()=>{
 const f=fixture(direction),moves=[],waits=[];
 await f.page.evaluate(()=>{globalThis.innerWidth=1280;},null);
 f.portDom.getBoundingClientRect=()=>({x:1225,y:757,width:6,height:9});
 const root=f.graph.FDiagram.FmxGraph.container;
 root.getBoundingClientRect=()=>({x:324,y:100,width:950,height:694});
 const tooltip=f.el(variant==='foreign'?'foreign-tooltip':'ttip');
 tooltip.getAttribute=name=>name==='data-tid'?tooltip.tid:name==='class'?'x-tip x-layer x-tip-default x-border-box':null;
 const cover={getAttribute:()=>null,closest:()=>tooltip,getBoundingClientRect:()=>({x:1168,y:692,width:106,height:102})};
 let covered=true;
 f.document.elementFromPoint=(x,y)=>x>1200&&y>750?(covered?cover:f.portDom):root;
 f.graph.FDiagram.FmxGraph.getCellAt=(x,y)=>x>900&&y>650||variant==='no-neutral-point'?f.port.FCell:null;
 f.page.mouse.move=async(x,y)=>{
  moves.push([x,y]);
  assert.ok(x>=324&&x<1274&&y>=100&&y<794);
  if(variant==='hidden')covered=false;
  if(variant==='changed-port')f.port.data={};
 };
 f.page.waitForTimeout=async ms=>{
  if(!covered)return;
  waits.push(ms);
  if(variant==='delayed')covered=false;
  else await new Promise(resolve=>setTimeout(resolve,ms));
 };
 const started=Date.now();
 const r=await f.run();
 if(['hidden','delayed'].includes(variant)){
  assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(moves.length,1);assert.equal(f.gestures.length,2);
  assert.ok(r.trace.some(t=>t.event===direction+'_port_tooltip_cleared'));
  assert.equal(waits.length,variant==='delayed'?1:0);
 }else{
  assert.equal(r.status,'NOT_APPLIED',r.error);assert.equal(r.effect_possible,false);assert.equal(r.cleanup_complete,true);
  assert.equal(f.gestures.length,0);assert.equal((direction==='input'?f.prep.inputPortOpenReceipts:f.prep.outputPortOpenReceipts).size,0);
  assert.equal(moves.length,['foreign','no-neutral-point'].includes(variant)?0:1);
  assert.ok(waits.length<=11);assert.ok(Date.now()-started<2000);
  if(variant==='persistent')assert.match(r.error,/ttip still covers port/);
 }
});

for(const direction of ['input','output'])for(const long of [false,true])test('covered '+direction+' port retains bounded DOM identity without text; long='+long,async()=>{
 const f=fixture(direction);
 await f.page.evaluate(()=>{globalThis.innerWidth=1280;},null);
 f.portDom.getBoundingClientRect=()=>({x:1225,y:757,width:6,height:9});
 const anchor={tagName:'DIV',getAttribute:name=>name==='class'?'x-panel':name==='data-tid'?'owned-panel':null};
 const cover={tagName:'DIV',textContent:'PRIVATE_TEXT',value:'PRIVATE_VALUE',
  getAttribute:name=>name==='class'?(long?'"\n\\'.repeat(1000):'unknown-layer'):name==='role'?'presentation':null,
  getBoundingClientRect:()=>({x:1200,y:730,width:80,height:64}),closest:()=>anchor};
 f.document.elementFromPoint=()=>cover;
 const r=await f.run();
 assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);assert.equal(r.cleanup_complete,true);
 assert.equal(f.gestures.length,0);assert.equal((direction==='input'?f.prep.inputPortOpenReceipts:f.prep.outputPortOpenReceipts).size,0);
 assert.ok(r.error.startsWith('Port has no observed interaction point: '));
 assert.ok(r.error.length<=500);assert.ok(!r.error.includes('PRIVATE_TEXT'));assert.ok(!r.error.includes('PRIVATE_VALUE'));
 const d=JSON.parse(r.error.slice(r.error.indexOf(': ')+2));
 assert.deepEqual(d.port_box,[1225,757,6,9]);assert.deepEqual(d.point,[1228,761.5]);
 assert.equal(d.covering.tag,'div');assert.equal(d.covering.role,'presentation');
 if(!long){assert.equal(d.covering.class,'unknown-layer');assert.equal(d.anchor.tid,'owned-panel');}
});

test('control input identity comes from the exact cached cell ordinal, never a SVG number',async()=>{
 const f=fixture('input');f.task.kind='control';
 f.portDom.tid='MF;TF;Graph;Node;Input_ControlVar';f.portDom.getAttribute=()=>f.portDom.tid;
 const dataPort={FGuid:'data',FCell:{},FPortIndex:0,data:{},parent:f.node};
 f.node.FPorts[0].FCollection.unshift(dataPort);const prior=f.graph.FDiagram.FmxGraph.view.getState;f.graph.FDiagram.FmxGraph.view.getState=c=>c===dataPort.FCell?{cell:c,shape:{node:{}}}:prior(c);f.port.FPortIndex=1;f.portTree.FIndex=1;
 const r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(r.native_index,1);assert.equal(r.port,0);
 assert.equal(f.prep.inputPortOpenReceipts.get('open').port,f.port);
});
test('control input opening refuses a misleading native ordinal without a gesture',async()=>{
 const f=fixture('input');f.task.kind='control';f.portDom.tid='MF;TF;Graph;Node;Input_ControlVar';f.portDom.getAttribute=()=>f.portDom.tid;
 f.port.FPortIndex=7;const r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(f.gestures.length,0);
});

test('pending port opening reports bounded observed state without another gesture',async()=>{
 const f=fixture();f.flags.holdOpen=true;f.page.waitForTimeout=async()=>{f.task.deadline=Date.now()-1;};
 const r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(f.gestures.length,2);
 assert.deepEqual(r.trace.map(x=>x.event),['output_port_reserved','output_port_menu_verified','output_port_open_issued','output_port_open_returned','output_port_open_pending']);
 const pending=r.trace.at(-1);assert.equal(pending.samples,1);assert.equal(pending.last.wizard_count,1);
 assert.deepEqual(Array.from(pending.last.wizard_visible),[false]);assert.equal(pending.last.controller_type,'ModelForm');
 assert.equal(pending.last.port_menu_same,true);assert.equal(pending.last.node_locked,false);
});


test('output wizard permits only its native disabled delete-column mask',async()=>{
 const variants=['valid','enabled','foreign-native','foreign-root','foreign-tid','duplicate-column','duplicate-mask','loading','message','dialog','text','input','foreign-port'];
 for(const variant of variants){
  const f=fixture(variant==='input'?'input':'output');
  const column=f.el('MF;TF;WizrdMCF;DataSetOutputSocketWizard;colTargetDelete');column.parent=f.wizard.FView.el.dom;
  f.nativeControls.set(column.id,{el:{dom:column},disabled:true});
  const classes=new Set(['x-mask','x-border-box']);
  const mask={parentElement:column,textContent:'',checkVisibility:()=>true,classList:{contains:name=>classes.has(name)},getAttribute:()=>null};
  f.flags.finishMasks=[mask];
  if(variant==='enabled')f.nativeControls.get(column.id).disabled=false;
  if(variant==='foreign-native')f.nativeControls.get(column.id).el.dom={};
  if(variant==='foreign-root')column.parent={};
  if(variant==='foreign-tid')column.getAttribute=()=> 'other-column';
  if(variant==='duplicate-column')f.el(column.tid);
  if(variant==='duplicate-mask')f.flags.finishMasks.push({...mask});
  if(variant==='loading')classes.add('x-mask-msg');
  if(variant==='message')classes.add('bg-mask-message');
  if(variant==='dialog')mask.getAttribute=()=> 'dialog';
  if(variant==='text')mask.textContent='Loading';
  if(variant==='foreign-port')f.flags.foreignWizard=true;
  // A blocked settlement terminates deterministically without waiting in the test.
  f.page.waitForTimeout=async()=>{throw Error('settlement still blocked');};
  const result=await f.run();
  assert.equal(result.status,variant==='valid'?'SUCCEEDED':'AMBIGUOUS',variant+': '+result.error);
  assert.equal(f.gestures.length,2,variant);
 }
});
