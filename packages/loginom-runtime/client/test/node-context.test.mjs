import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readPreparedNodeContext,validatePreparedNodeContext} from '../lib/node-context.mjs';

function fixture() {
  class PackageTreeNode{}; class WorkFlowTreeNode{}; class ModelNodeTreeNode{}; class ModelForm{};
  const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
  const element=tid=>({getAttribute:()=>tid,getBoundingClientRect:()=>({width:10,height:10}),classList:{contains:()=>true}});
  const tab=element(binding.workflow_ref.tab_tid), root=element('MF;TF-1;ModelForm;cmpDiagram'), dom=element('MF;TF-1;Graph;Import'), wizard=element('MF;TF-1;WizrdMCF'); root.contains=e=>e===dom;
  const packageNode=new PackageTreeNode(),workflowNode=Object.assign(new WorkFlowTreeNode(),{ParentNode:packageNode});
  const nodeTree=Object.assign(new ModelNodeTreeNode(),{ParentNode:workflowNode,FGuid:'node',FModelNode:{}});
  const graph=new ModelForm();graph.FDiagram={FNodes:{FCollection:[{FGuid:'node',FCell:{}}]},FmxGraph:{container:root,view:{getState:()=>({shape:{node:dom}})}}};
  const controller={Node:{data:{node:workflowNode}},FController:graph};
  let activeElements=[tab,root,dom],crumbs=binding.workflow_ref.navigation_path.map(c=>({...element(c.tid),textContent:c.label}));
  const nodeList=values=>Object.assign(Object.fromEntries(values.map((v,i)=>[i,v])),{length:values.length,[Symbol.iterator]:function*(){yield* values;}});
  const document={querySelectorAll:selector=>nodeList(selector.startsWith('[data-tid^=')?crumbs:activeElements.filter(e=>selector==='[data-tid='+JSON.stringify(e.getAttribute())+']'))};
  const record={phase:'verified',workflowId:'flow',tab,packageNode,nodeTargetWorkflowNode:workflowNode};
  const preparation={id:'doc',document,receipts:new Map([['prepare',record]])};
  const app={PackageTreeNode,WorkFlowTreeNode,ModelNodeTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}};
  const context=vm.createContext({document,bg:{app},__loginomDockPreparationV1:preparation,getComputedStyle:()=>({visibility:'visible'})});
  const page={evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context)};
  const enterWizard=()=>{class WizardModelComponentForm{};controller.FController=Object.assign(new WizardModelComponentForm(),{FModelNode:nodeTree.FModelNode});controller.Node.data.node={ParentNode:nodeTree};activeElements=[tab,wizard];};
  const enterViews=()=>{class ViewsForm{};const root=element('MF;TF-1;ViewsForm');controller.FController=Object.assign(new ViewsForm(),{FModelNode:nodeTree.FModelNode,FView:{el:{dom:root}}});controller.Node.data.node={ParentNode:nodeTree};activeElements=[tab,root];};
  const enterPortWizard=(input=false)=>{
    class WizardTreeNode{};class ModelPortTreeNode{};class ModelOutputPortsTreeNode{};class ModelInputPortsTreeNode{};class WizardModelComponentForm{};
    Object.assign(app,{WizardTreeNode,ModelPortTreeNode,ModelOutputPortsTreeNode,ModelInputPortsTreeNode});
    const group=Object.assign(input?new ModelInputPortsTreeNode():new ModelOutputPortsTreeNode(),{ParentNode:nodeTree});
    const portTree=Object.assign(new ModelPortTreeNode(),{ParentNode:group,FIndex:0,FModelNodePort:{}});
    const w=Object.assign(new WizardTreeNode(),{ParentNode:portTree}),model=Object.assign(new WizardModelComponentForm(),{[input?'FModelSocket':'FModelEnginePort']:{},FView:{el:{dom:wizard}}});
    controller.Node.data.node=w;controller.FController=model;activeElements=[tab,wizard];
    const node={data:nodeTree.FModelNode,FGuid:'node'},port={data:portTree.FModelNodePort,parent:node,FPortIndex:0,FGuid:'port-guid'};
    const opening={phase:'verified',document_id:'doc',workflow_id:'flow',node_id:'node',wizard:model,nodeTree,portTree,
      workflow:workflowNode,packageNode,node,port,nodeData:node.data,portData:port.data,portGuid:port.FGuid,
      nativeIndex:0,portIndex:0,enginePort:model[input?'FModelSocket':'FModelEnginePort'],operation_id:'open-port',...(input?{direction:'input'}:{})};
    preparation[input?'inputPortOpenReceipts':'outputPortOpenReceipts']=new Map([['open-port',opening]]);return {opening,model,portTree,group,w};
  };
  return{binding,page,controller,enterPendingWizard:()=>{class WizardTreeNode{};app.WizardTreeNode=WizardTreeNode;
      const nt=nodeTree,wt=Object.assign(new WizardTreeNode(),{ParentNode:nt});graph.FDiagram.FNodes.FCollection[0].data=nt.FModelNode;
      const ne={...element(binding.workflow_ref.navigation_path[0].tid+'>Import-3'),id:'pending-node',textContent:'Import'};
      const we={...element(binding.workflow_ref.navigation_path[0].tid+'>Import-3>Настройка'),id:'pending-wizard',textContent:'Настройка'};
      crumbs.push(ne,we);activeElements.push(ne,we);
      const nc={el:{dom:ne},_node:{data:{node:nt}}},wc={el:{dom:we},_node:{data:{node:wt}}};
      context.Ext={getCmp:id=>id===ne.id?nc:id===we.id?wc:null};return {nt,wt,nc,wc};},enterInputBreadcrumbs:(full=false)=>{
      const port=enterPortWizard(true),native=[nodeTree,port.group,port.portTree,port.w],components=[],ancestors=[];
      if(full){
        const module={ParentNode:packageNode};workflowNode.ParentNode=module;
        let prefix='MF;TF-1;cnrNaviMode;b.s_';
        crumbs=['Server','Packages','Package','Module','Scenario'].map((label,i)=>{prefix+=(i?'>':'')+label;return {...element(prefix),id:'ancestor-'+i,textContent:label};});
        binding.workflow_ref.navigation_path=crumbs.map(e=>({tid:e.getAttribute(),label:e.textContent}));
        for(const [i,node]of [packageNode,module,workflowNode].entries())ancestors.push({el:{dom:crumbs[i+2]},_node:{data:{node}}});
        activeElements.push(...crumbs);
      }
      let tid=binding.workflow_ref.navigation_path.at(-1).tid;
      for(const [i,label]of ['Import','Входные порты','Входной источник данных','Настройка'].entries()){
        tid+='>'+label.replaceAll(' ','_');const e={...element(tid),id:'input-crumb-'+i,textContent:label};
        crumbs.push(e);activeElements.push(e);components.push({el:{dom:e},_node:{data:{node:native[i]}}});
      }
      context.Ext={getCmp:id=>id.startsWith('ancestor-')?ancestors[Number(id.slice(9))-2]:components[Number(id.slice('input-crumb-'.length))]};
      return {...port,components,ancestors};
    },addOverflow:()=>{
      const tid=binding.workflow_ref.prefix+';cnrNaviMode',elements=[tid,tid+';b-2',tid+';b-2;mn',tid+';b-2;mn;mn.i'].map((t,i)=>({...element(t),id:'overflow-'+i}));
      const [be,te,me,ie]=elements,menu={el:{dom:me}},bar={el:{dom:be},layout:{overflowHandler:{menu}}},trigger={el:{dom:te},ownerCt:bar,menu},item={el:{dom:ie},ownerCt:menu,_node:{data:{node:workflowNode}}};
      bar.layout.overflowHandler.menuTrigger=trigger;me.querySelectorAll=()=>[ie];activeElements.push(...elements);
      const old=context.Ext.getCmp;context.Ext.getCmp=id=>id.startsWith('overflow-')?[bar,trigger,menu,item][Number(id.slice(9))]:old(id);
      return {bar,trigger,menu,item};
    },leaveInput:surface=>{crumbs=crumbs.slice(0,binding.workflow_ref.navigation_path.length);controller.Node.data.node=workflowNode;controller.FController=graph;activeElements=[tab,root,dom,...crumbs];if(surface==='views'){enterViews();activeElements.push(...crumbs);}},enterOverview:()=>{controller.Node.data.node=nodeTree;crumbs.push({...element(binding.workflow_ref.navigation_path[0].tid+'>Import-3'),textContent:'Import'});},enterViews,record,preparation,workflowNode,nodeTree,enterWizard,enterPortWizard,tab,graph,
    cloneNode:inside=>{const clone=element(dom.getAttribute());activeElements.push(clone);if(inside)root.contains=e=>e===dom||e===clone;},changeCrumb:()=>crumbs[0].textContent='Other',duplicateTab:()=>activeElements.push(tab)};
}
test('graph context ignores outline copies outside the native canvas but rejects duplicate nodes inside it',async()=>{
 const f=fixture();f.cloneNode(false);assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,true);
 const bad=fixture();bad.cloneNode(true);assert.equal((await readPreparedNodeContext(bad.page,bad.binding)).reason,'surface_ambiguous');
});
test('prepared context validates exact node ownership before serialization',()=>{
 const f=fixture();validatePreparedNodeContext(f.binding);
 for(const b of [{...f.binding,extra:true},{...f.binding,node:{...f.binding.node,workflow_id:'other'}},{...f.binding,node:{...f.binding.node,document_id:'other'}}])assert.throws(()=>validatePreparedNodeContext(b));
});
test('one cached workflow binds graph and wizard with independent document identity',async()=>{
 const f=fixture();assert.equal((await readPreparedNodeContext(f.page,f.binding)).surface,'graph');
 f.enterWizard();const b=await readPreparedNodeContext(f.page,f.binding);assert.equal(b.verified,true);assert.equal(b.surface,'wizard');assert.equal(b.node_id,'node');
});
for(const [name,change] of Object.entries({
 document:f=>f.preparation.document={},receipt:f=>f.record.phase='reserved',tab:f=>f.record.tab={},duplicate_tab:f=>f.duplicateTab(),inactive_tab:f=>f.tab.classList.contains=()=>false,
 package:f=>f.record.packageNode={},workflow:f=>f.record.nodeTargetWorkflowNode={},breadcrumb:f=>f.changeCrumb(),missing_workflow:f=>delete f.record.nodeTargetWorkflowNode,
 missing_node:f=>f.graph.FDiagram.FNodes.FCollection=[],duplicate_node:f=>f.graph.FDiagram.FNodes.FCollection.push({FGuid:'node'}),
 wrong_wizard_node:f=>{f.enterWizard();f.nodeTree.FGuid='other';},foreign_wizard_model:f=>{f.enterWizard();f.controller.FController.FModelNode={};},
 foreign_wizard_workflow:f=>{f.enterWizard();f.nodeTree.ParentNode={ParentNode:f.record.packageNode};},
}))test('prepared context refuses '+name,async()=>{const f=fixture();change(f);assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,false);});

test('prepared views keep the same node and exact native root binding',async()=>{
 const f=fixture();f.enterViews();assert.equal((await readPreparedNodeContext(f.page,f.binding)).surface,'views');
 f.controller.FController.FView.el.dom={};assert.equal((await readPreparedNodeContext(f.page,f.binding)).reason,'views_binding');
});
test('prepared views reject a different model even in the same workflow',async()=>{
 const f=fixture();f.enterViews();f.controller.FController.FModelNode={};assert.equal((await readPreparedNodeContext(f.page,f.binding)).reason,'views_model');
});

test('separate output wizard requires its verified opening receipt and exact native owner objects',async()=>{
 const f=fixture(),p=f.enterPortWizard(),result=await readPreparedNodeContext(f.page,f.binding);
 assert.equal(result.verified,true);assert.equal(result.surface,'wizard');assert.equal(result.output_port.port_guid,'port-guid');
 assert.equal(result.output_port.opening_operation_id,'open-port');
 const changes=[
  (f,p)=>{f.preparation.outputPortOpenReceipts.clear();},
  (f,p)=>{p.opening.phase='open_issued';},
  (f,p)=>{p.opening.wizard={};},(f,p)=>{p.opening.nodeTree={};},(f,p)=>{p.opening.portTree={};},
  (f,p)=>{p.opening.workflow={};},(f,p)=>{p.opening.packageNode={};},
  (f,p)=>{p.opening.node.data={};},(f,p)=>{p.opening.port.data={};},
  (f,p)=>{p.opening.port.parent={};},(f,p)=>{p.opening.port.FPortIndex=1;},
  (f,p)=>{p.portTree.FIndex=1;},(f,p)=>{p.model.FModelEnginePort={};},
  (f,p)=>{p.model.FView.el.dom={};},(f,p)=>{p.model.FModelNode={};},
  (f,p)=>{p.group.ParentNode={};},
  (f,p)=>{f.preparation.outputPortOpenReceipts.set('duplicate',{...p.opening});},
 ];
 for(const [i,change] of changes.entries()){const f=fixture(),p=f.enterPortWizard();change(f,p);assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,false,String(i));}
});


test('port context reports the icon from the same verified native port owner',async()=>{
 for(const input of [true,false])for(const icon of ['bg-vendor-icon-groupdata','bg-vendor-icon-sorting','bg-vendor-icon-crosstab','bg-vendor-icon-calcdata','bg-vendor-icon-reformcolumns']) {
  const f=fixture(),p=f.enterPortWizard(input);p.opening.node.FIconCls=icon;
  const result=await readPreparedNodeContext(f.page,f.binding);
  assert.equal(result.verified,true);assert.equal(result[input?'input_port':'output_port'].node_icon_class,icon);
  p.opening.node.data={};assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,false);
 }
});

test('overview breadcrumb identity comes from the same cached node tree GUID',async()=>{
 const f=fixture();assert.equal((await readPreparedNodeContext(f.page,f.binding)).navigation_node,undefined);
 f.enterOverview();const result=await readPreparedNodeContext(f.page,f.binding);
 assert.equal(result.verified,true);assert.equal(result.navigation_node.tid,'MF;TF-1;cnrNaviMode;b.s_Scenario>Import-3');
 f.nodeTree.FGuid='foreign';assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,false);
});

test('pending wizard breadcrumb requires the exact native node GUID',async()=>{
 const f=fixture();assert.equal((await readPreparedNodeContext(f.page,f.binding)).pending_wizard_node,undefined);
 f.enterPendingWizard();assert.equal((await readPreparedNodeContext(f.page,f.binding)).pending_wizard_node.tid,'MF;TF-1;cnrNaviMode;b.s_Scenario>Import-3');
 f.nodeTree.FGuid='other';assert.equal((await readPreparedNodeContext(f.page,f.binding)).pending_wizard_node,undefined);
});

test('pending deactivation rejects mismatched breadcrumb native objects',async()=>{
 for(const change of [p=>p.nt.FGuid='foreign',p=>p.nt.ParentNode={},p=>p.nt.FModelNode={},
  p=>p.wt.ParentNode={},p=>p.nc.el.dom={},p=>p.wc.el.dom={},p=>p.nc._node.data.node={},p=>p.wc._node.data.node={}]){
  const f=fixture(),p=f.enterPendingWizard();change(p);
  assert.equal((await readPreparedNodeContext(f.page,f.binding)).pending_wizard_node,undefined);
 }
});

test('D52 input breadcrumb binding requires the exact native node, port and opening context',async()=>{
 for(const fault of ['valid','same_type_foreign_node','node_guid','port_guid','port_index','native_index','opening','folder','port_tree','wizard_tree','component_dom']){
  const f=fixture(),p=f.enterInputBreadcrumbs();p.opening.node.FIconCls='bg-vendor-icon-clusterization';
  if(fault==='same_type_foreign_node')p.components[0]._node.data.node=Object.assign(Object.create(Object.getPrototypeOf(f.nodeTree)),f.nodeTree);
  if(fault==='node_guid')f.nodeTree.FGuid='foreign';
  if(fault==='port_guid')p.opening.port.FGuid='foreign';
  if(fault==='port_index')p.opening.portIndex=1;
  if(fault==='native_index')p.opening.nativeIndex=1;
  if(fault==='opening')f.preparation.inputPortOpenReceipts.clear();
  if(fault==='folder')p.components[1]._node.data.node={};
  if(fault==='port_tree')p.components[2]._node.data.node={};
  if(fault==='wizard_tree')p.components[3]._node.data.node={};
  if(fault==='component_dom')p.components[0].el.dom={};
  const r=await readPreparedNodeContext(f.page,f.binding);
  assert.equal(!!r.navigation_node,fault==='valid',fault);
 }
});


test('D52b workflow context requires all native ancestors of the same input0 opening',async()=>{
 for(const fault of ['valid','package','module','workflow','module_parent','component_dom','node','port','opening','path','duplicate']){
  const f=fixture(),p=f.enterInputBreadcrumbs(true);
  if(['package','module','workflow'].includes(fault))p.ancestors[['package','module','workflow'].indexOf(fault)]._node.data.node={};
  if(fault==='module_parent')f.workflowNode.ParentNode.ParentNode={};
  if(fault==='component_dom')p.ancestors[1].el.dom={};
  if(fault==='node')p.components[0]._node.data.node={};
  if(fault==='port')p.opening.portGuid='other';
  if(fault==='opening')p.opening.phase='open_issued';
  if(fault==='path')f.changeCrumb();
  if(fault==='duplicate')f.preparation.inputPortOpenReceipts.set('duplicate',{...p.opening});
  const r=await readPreparedNodeContext(f.page,f.binding);
  assert.equal(!!r.navigation_workflow,fault==='valid',fault);
  if(fault==='valid')assert.equal(r.navigation_workflow.tid,f.binding.workflow_ref.navigation_path.at(-1).tid);
 }
});

test('D52b Done/Execute and Views retain only the complete native workflow ancestry',async()=>{
 for(const surface of ['graph','views'])for(const fault of ['valid','package','module','workflow','module_parent','component_dom','path','document','receipt']) {
  const f=fixture(),p=f.enterInputBreadcrumbs(true);f.leaveInput(surface);
  if(['package','module','workflow'].includes(fault))p.ancestors[['package','module','workflow'].indexOf(fault)]._node.data.node={};
  if(fault==='module_parent')f.workflowNode.ParentNode.ParentNode={};
  if(fault==='component_dom')p.ancestors[1].el.dom={};
  if(fault==='path')f.changeCrumb();
  if(fault==='document')f.preparation.document={};
  if(fault==='receipt')f.record.phase='reserved';
  const r=await readPreparedNodeContext(f.page,f.binding);
  assert.equal(!!r.navigation_workflow,fault==='valid',surface+':'+fault);
  if(fault==='valid'){assert.equal(r.surface,surface);assert.equal(r.navigation_workflow.tid,f.binding.workflow_ref.navigation_path.at(-1).tid);}
 }
});

test('workflow overflow item belongs to the exact native toolbar, menu and cached workflow',async()=>{
 for(const fault of ['valid','bar_dom','trigger_dom','trigger_owner','handler_trigger','menu_dom','trigger_menu','handler_menu','item_dom','item_owner','item_workflow']) {
  const f=fixture();f.enterInputBreadcrumbs(true);f.leaveInput('views');const p=f.addOverflow();
  if(fault==='bar_dom')p.bar.el.dom={};if(fault==='trigger_dom')p.trigger.el.dom={};
  if(fault==='trigger_owner')p.trigger.ownerCt={};if(fault==='handler_trigger')p.bar.layout.overflowHandler.menuTrigger={};
  if(fault==='menu_dom')p.menu.el.dom={};if(fault==='trigger_menu')p.trigger.menu={};if(fault==='handler_menu')p.bar.layout.overflowHandler.menu={};
  if(fault==='item_dom')p.item.el.dom={};if(fault==='item_owner')p.item.ownerCt={};if(fault==='item_workflow')p.item._node.data.node={};
  const r=await readPreparedNodeContext(f.page,f.binding);
  assert.equal(!!r.workflow_overflow?.item_tid,fault==='valid',fault);
 }
});
