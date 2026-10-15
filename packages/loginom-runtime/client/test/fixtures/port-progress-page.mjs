// Explicit Page/native/DOM doubles copied from accepted node-port-open fixture.
import vm from 'node:vm';
import {openPreparedOutputPort} from '../../lib/node-port-open.mjs';
export function fixture(direction='output') {
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
   else if(tid===button.tid){if(flags.deactivation){menu.visible=false;dialog.visible=true;}else showWizard();}
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
