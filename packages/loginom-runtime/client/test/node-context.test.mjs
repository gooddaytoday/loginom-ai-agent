import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const {readPreparedNodeContext,validatePreparedNodeContext}=await import(process.env.NODE_CONTEXT_MODULE??new URL('../lib/node-context.mjs',import.meta.url));

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
  return{binding,page,controller,enterPendingWizard:()=>{class WizardTreeNode{};app.WizardTreeNode=WizardTreeNode;
      const nt=nodeTree,wt=Object.assign(new WizardTreeNode(),{ParentNode:nt});graph.FDiagram.FNodes.FCollection[0].data=nt.FModelNode;
      const ne={...element(binding.workflow_ref.navigation_path[0].tid+'>Import-3'),id:'pending-node',textContent:'Import'};
      const we={...element(binding.workflow_ref.navigation_path[0].tid+'>Import-3>Настройка'),id:'pending-wizard',textContent:'Настройка'};
      crumbs.push(ne,we);activeElements.push(ne,we);
      const nc={el:{dom:ne},_node:{data:{node:nt}}},wc={el:{dom:we},_node:{data:{node:wt}}};
      context.Ext={getCmp:id=>id===ne.id?nc:id===we.id?wc:null};return {nt,wt,nc,wc};},enterOverview:()=>{controller.Node.data.node=nodeTree;crumbs.push({...element(binding.workflow_ref.navigation_path[0].tid+'>Import-3'),textContent:'Import'});},enterViews,record,preparation,workflowNode,nodeTree,enterWizard,enterPortWizard,tab,graph,
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

// Native observation paths from LAB-66 b073 receipts 012/020, reviewed in
// 01a12cc9-0aa2-7ebc-8f9d-edc88c010728. Native objects below are explicit VM
// doubles; receipts do not supply raw Ext instances or prove their binding.
const savedNavigation=[{"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер", "label": ""}, {"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер>Пакеты", "label": "Пакеты"}, {"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер>Пакеты>Package1", "label": "cdiag_b073b1a2_c5ec_482e_9d1f_e7822a4a86d2"}, {"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер>Пакеты>Package1>Модуль1", "label": "Модуль1"}, {"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер>Пакеты>Package1>Модуль1>Сценарий", "label": "Сценарий"}];
const openedNavigation=[{"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер", "label": ""}, {"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер>Пакеты", "label": "Пакеты"}, {"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер>Пакеты>cdiag_b073b1a2_c5ec_482e_9d1f_e7822a4a86d2", "label": "cdiag_b073b1a2_c5ec_482e_9d1f_e7822a4a86d2"}, {"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер>Пакеты>cdiag_b073b1a2_c5ec_482e_9d1f_e7822a4a86d2>Модуль1", "label": "Модуль1"}, {"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер>Пакеты>cdiag_b073b1a2_c5ec_482e_9d1f_e7822a4a86d2>Модуль1>Сценарий", "label": "Сценарий"}, {"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер>Пакеты>cdiag_b073b1a2_c5ec_482e_9d1f_e7822a4a86d2>Модуль1>Сценарий>DiagInput", "label": "DiagInput"}, {"tid": "MF;TF-1;cnrNaviMode;b.s_Сервер>Пакеты>cdiag_b073b1a2_c5ec_482e_9d1f_e7822a4a86d2>Модуль1>Сценарий>DiagInput>Настройка", "label": "Настройка"}];
function checkpointFixture(){
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelNodeTreeNode{};class ModelForm{};class WizardModelComponentForm{};
 const packageNode=Object.assign(new PackageTreeNode(),{PackageFileName:'/own/cdiag_b073.lgp'}),moduleNode={ParentNode:packageNode};
 const workflowNode=Object.assign(new WorkFlowTreeNode(),{ParentNode:moduleNode}),nodeData={};
 const nodeTree=Object.assign(new ModelNodeTreeNode(),{ParentNode:workflowNode,FGuid:'node',FModelNode:nodeData});
 const el=(tid,id='')=>({id,isConnected:true,textContent:'',getAttribute:()=>tid,getBoundingClientRect:()=>({width:100,height:20}),classList:{contains:()=>true}});
 const tab=el('MF;cntMain;cntWorkspace;Workspace;t.br;tb-1'),graphRoot=el('MF;TF-1;ModelForm;cmpDiagram'),nodeRoot=el('MF;TF-1;Graph;DiagInput'),wizardRoot=el('MF;TF-1;WizrdMCF');graphRoot.contains=e=>e===nodeRoot;
 const graph=Object.assign(new ModelForm(),{FDiagram:{FNodes:{FCollection:[{FGuid:'node',FCell:{},data:nodeData}]},FmxGraph:{container:graphRoot,view:{getState:()=>({shape:{node:nodeRoot}})}}}});
 const controller={Node:{data:{node:workflowNode}},FController:graph};
 let crumbs=[],surface=[tab,graphRoot,nodeRoot];const components=new Map();
 const setCrumbs=path=>{crumbs=path.map((p,i)=>Object.assign(el(p.tid,'crumb-'+i),{textContent:p.label}));components.clear();crumbs.forEach((e,i)=>components.set(e.id,{el:{dom:e},_node:{data:{node:[null,null,packageNode,moduleNode,workflowNode,nodeTree,{}][i]}}}));};setCrumbs(savedNavigation);
 const document={querySelectorAll:selector=>selector.startsWith('[data-tid^=')?crumbs:[...surface,...crumbs].filter(e=>selector==='[data-tid='+JSON.stringify(e.getAttribute())+']')};
 const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:tab.getAttribute(),navigation_path:structuredClone(savedNavigation)},node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
 const record={phase:'verified',workflowId:'flow',tab,packageNode,nodeTargetWorkflowNode:workflowNode,crumbs:structuredClone(savedNavigation),request:JSON.stringify({intent:'open_package',packagePath:'/own/cdiag_b073.lgp'})};
 const preparation={id:'doc',document,receipts:new Map([['canonical-prepare',record]])};
 const app={PackageTreeNode,WorkFlowTreeNode,ModelNodeTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}};
 const context=vm.createContext({document,bg:{app},__loginomDockPreparationV1:preparation,getComputedStyle:()=>({visibility:'visible'}),Ext:{getCmp:id=>components.get(id)}});
 const page={evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context)};
 const open=()=>{controller.Node.data.node={ParentNode:nodeTree};controller.FController=Object.assign(new WizardModelComponentForm(),{FModelNode:nodeData});surface=[tab,wizardRoot];setCrumbs(openedNavigation);components.get('crumb-6')._node.data.node=controller.Node.data.node;};
 return {page,binding,record,preparation,packageNode,moduleNode,workflowNode,nodeTree,controller,components,context,open,setCrumbs,wizardRoot,tab,
 duplicate:()=>surface.push(crumbs[2]),missingSurface:()=>surface=[tab],crumb:i=>crumbs[i]};
}
for(const surface of ['graph','canonical wizard'])for(const conflict of [false,true])
 test('peer receipt '+(conflict?'authority conflict':'same native owner')+' on '+surface,async()=>{
  const f=checkpointFixture();if(surface==='canonical wizard')f.open();
  const peer={...f.record,nodeTargetWorkflowNode:conflict
    ?Object.assign(Object.create(Object.getPrototypeOf(f.workflowNode)),f.workflowNode):f.workflowNode};
  f.preparation.receipts.set('second-verified-receipt',peer);
  const binding=JSON.stringify(f.binding),receipt=JSON.stringify(f.record.request),alias=f.record.nodeNavigationPath;
  const result=await readPreparedNodeContext(f.page,f.binding);
  assert.equal(result.verified,!conflict);
  if(conflict){assert.equal(result.reason,'navigation');assert.equal(f.record.nodeNavigationPath,alias);
    assert.equal(f.record.nodeNavigationBinding,undefined);}
  assert.equal(JSON.stringify(f.binding),binding);assert.equal(JSON.stringify(f.record.request),receipt);
 });
test('SaveCheckpoint canonical preparation: old graph keys then native-bound wizard keys',async()=>{
 const f=checkpointFixture();assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,true);assert.equal(f.record.nodeNavigationPath,undefined);
 f.open();const r=await readPreparedNodeContext(f.page,f.binding);
 if(process.env.NODE_CONTEXT_BEFORE==='1'){assert.equal(r.reason,'navigation');return;}
 assert.equal(r.verified,true);assert.equal(r.surface,'wizard');assert.equal(r.node_id,'node');
 assert.deepEqual(JSON.parse(JSON.stringify(f.record.nodeNavigationPath)),openedNavigation.slice(0,5));
 assert.deepEqual(f.record.crumbs,savedNavigation);assert.deepEqual(f.binding.workflow_ref.navigation_path,savedNavigation);
 assert.deepEqual(JSON.parse(JSON.stringify(r.navigation_rebinding)),{prepared_path:savedNavigation,observed_path:openedNavigation.slice(0,5)});
 assert.deepEqual(await readPreparedNodeContext(f.page,f.binding),r); // stable before/after capture identity
});
const invalidCheckpoint={
 foreign_package:f=>{f.record.packageNode={PackageFileName:f.packageNode.PackageFileName};},
 foreign_workflow:f=>{f.record.nodeTargetWorkflowNode={};},
 foreign_node:f=>{f.nodeTree.FGuid='foreign';},
 document_epoch:f=>{f.preparation.id='foreign';},
 foreign_tab:f=>{f.record.tab={};},
 unverified_receipt:f=>{f.record.phase='pending';},
 unbound_request:f=>{f.record.request='{}';},
 wrong_path:f=>{f.packageNode.PackageFileName='/foreign/same-label.lgp';},
 missing_original:f=>{delete f.record.crumbs;},
 stale_original:f=>{f.record.crumbs=structuredClone(savedNavigation);f.record.crumbs[2].tid='stale';},
 label_only:f=>{f.components.clear();},
 foreign_native_module:f=>{f.components.get('crumb-3')._node.data.node={ParentNode:f.packageNode};},
 foreign_native_package:f=>{f.components.get('crumb-2')._node.data.node={};},
 detached_element:f=>{f.crumb(2).isConnected=false;},
 stale_component_dom:f=>{f.components.get('crumb-2').el.dom={};},
 duplicate_breadcrumb:f=>f.duplicate(),
 changed_label:f=>{f.crumb(2).textContent='Other';},
 foreign_prefix:f=>{f.crumb(0).getAttribute=()=> 'foreign';},
 stale_alias:f=>{f.record.nodeNavigationPath=[{tid:'foreign'}];},
 pending_surface:f=>f.missingSurface(),
 foreign_wizard_model:f=>{f.controller.FController.FModelNode={};},
 foreign_wizard_suffix:f=>{f.components.get('crumb-6')._node.data.node={ParentNode:f.nodeTree};},
 captured_binding_not_bypassed:f=>{f.record.nodeNavigationBinding={path:[],native:[],guids:[]};},
};
for(const [name,change] of Object.entries(invalidCheckpoint))test('canonical rebind refuses '+name+' without updating original binding',async()=>{
 const f=checkpointFixture();f.open();change(f);const original=JSON.stringify(f.binding);const alias=JSON.stringify(f.record.nodeNavigationPath);
 assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,false);
 assert.equal(JSON.stringify(f.binding),original);assert.equal(JSON.stringify(f.record.nodeNavigationPath),alias);
});

for(const path of [savedNavigation,openedNavigation.map((c,i)=>i===2?{...c,tid:c.tid+'-stale'}:c)])
 test('verified alias cannot silently rebind again or revert to stale keys',async()=>{
  const f=checkpointFixture();f.open();const before=await readPreparedNodeContext(f.page,f.binding);
  if(process.env.NODE_CONTEXT_BEFORE==='1'){assert.equal(before.verified,false);return;}
  assert.equal(before.verified,true);const alias=JSON.stringify(f.record.nodeNavigationPath);
  f.setCrumbs(path);assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,false);
  assert.equal(JSON.stringify(f.record.nodeNavigationPath),alias);
 });
