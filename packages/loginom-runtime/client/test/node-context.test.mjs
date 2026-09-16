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
  const document={querySelectorAll:selector=>selector.startsWith('[data-tid^=')?crumbs:activeElements.filter(e=>selector==='[data-tid='+JSON.stringify(e.getAttribute())+']')};
  const record={phase:'verified',workflowId:'flow',tab,packageNode,nodeTargetWorkflowNode:workflowNode};
  const preparation={id:'doc',document,receipts:new Map([['prepare',record]])};
  const app={PackageTreeNode,WorkFlowTreeNode,ModelNodeTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}};
  const context=vm.createContext({document,bg:{app},__loginomDockPreparationV1:preparation,getComputedStyle:()=>({visibility:'visible'})});
  const page={evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context)};
  const enterWizard=()=>{class WizardModelComponentForm{};controller.FController=Object.assign(new WizardModelComponentForm(),{FModelNode:nodeTree.FModelNode});controller.Node.data.node={ParentNode:nodeTree};activeElements=[tab,wizard];};
  const enterViews=()=>{class ViewsForm{};const root=element('MF;TF-1;ViewsForm');controller.FController=Object.assign(new ViewsForm(),{FModelNode:nodeTree.FModelNode,FView:{el:{dom:root}}});controller.Node.data.node={ParentNode:nodeTree};activeElements=[tab,root];};
  const enterPortWizard=()=>{
    class WizardTreeNode{};class ModelPortTreeNode{};class ModelOutputPortsTreeNode{};class WizardModelComponentForm{};
    Object.assign(app,{WizardTreeNode,ModelPortTreeNode,ModelOutputPortsTreeNode});
    const group=Object.assign(new ModelOutputPortsTreeNode(),{ParentNode:nodeTree});
    const portTree=Object.assign(new ModelPortTreeNode(),{ParentNode:group,FIndex:0,FModelNodePort:{}});
    const w=Object.assign(new WizardTreeNode(),{ParentNode:portTree}),model=Object.assign(new WizardModelComponentForm(),{FModelEnginePort:{},FView:{el:{dom:wizard}}});
    controller.Node.data.node=w;controller.FController=model;activeElements=[tab,wizard];
    const node={data:nodeTree.FModelNode,FGuid:'node'},port={data:portTree.FModelNodePort,parent:node,FPortIndex:0,FGuid:'port-guid'};
    const opening={phase:'verified',document_id:'doc',workflow_id:'flow',node_id:'node',wizard:model,nodeTree,portTree,
      workflow:workflowNode,packageNode,node,port,nodeData:node.data,portData:port.data,portGuid:port.FGuid,
      nativeIndex:0,portIndex:0,enginePort:model.FModelEnginePort,operation_id:'open-port'};
    preparation.outputPortOpenReceipts=new Map([['open-port',opening]]);return {opening,model,portTree,group};
  };
  return{binding,page,controller,enterViews,record,preparation,workflowNode,nodeTree,enterWizard,enterPortWizard,tab,graph,
    changeCrumb:()=>crumbs[0].textContent='Other',duplicateTab:()=>activeElements.push(tab)};
}
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
