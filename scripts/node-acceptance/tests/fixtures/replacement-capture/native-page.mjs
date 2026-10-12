import vm from 'node:vm';
import fs from 'node:fs';
const before=JSON.parse(fs.readFileSync(new URL('./saved-package-before.json',import.meta.url))),after=JSON.parse(fs.readFileSync(new URL('./saved-package-after.json',import.meta.url)));
// Native-object/DOM double built from diagnostic 03 projections. UUIDs and
// ownership are deliberately local; the captured breadcrumb bytes are exact.
export function nativePage(){
 class MapTreeNode{};class PackagesTreeParentNode{};class PackageTreeNode{};class ModelUnitItemTreeNode{};class WorkFlowTreeNode{};class ModelNodeTreeNode{};class WizardTreeNode{};class ModelForm{};class WizardModelComponentForm{};
 const types=[MapTreeNode,PackagesTreeParentNode,PackageTreeNode,ModelUnitItemTreeNode,WorkFlowTreeNode,ModelNodeTreeNode,WizardTreeNode];
 const native=types.map((T,i)=>new T());for(let i=1;i<native.length;i++)native[i].ParentNode=native[i-1];
 const pkg=native[2],flow=native[4],node=native[5];pkg.PackageName=before.crumbs[2].label;pkg.PackageFileName='/own/diagnostic.lgp';node.FGuid='node';node.FModelNode={};
 const wf={workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:before.crumbs.map(({tid,label})=>({tid,label}))};
 const binding={document_id:'doc',workflow_ref:wf,node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
 let active=true,crumbs=[],elements=[],counter=0;const components=new Map();
 const element=(tid,label='')=>({id:'e'+(++counter),isConnected:true,textContent:label,getAttribute:()=>tid,getBoundingClientRect:()=>({width:100,height:25}),classList:{contains:()=>active}});
 const tab=element(wf.tab_tid),root=element(wf.prefix+';ModelForm;cmpDiagram'),dom=element(wf.prefix+';Graph;NavigationDiagnostic'),wizard=element(wf.prefix+';WizrdMCF');root.contains=e=>e===dom;root.querySelectorAll=()=>[];
 const graph=new ModelForm();const cell={geometry:{x:180,y:180}},n={FGuid:'node',FCell:cell,FIconCls:'import',data:node.FModelNode,FPorts:[]};n.FLabel={parent:n,FCell:{parent:cell,visible:false},FRawValue:'NavigationDiagnostic'};
 graph.FDiagram={FNodes:{FCollection:[n]},FmxGraph:{container:root,view:{getState:()=>({shape:{node:dom}})}}};
 const controller={Node:{data:{node:flow}},FController:graph};
 const setCrumbs=values=>{crumbs=values.map((c,i)=>{const e=element(c.tid,c.label);components.set(e.id,{el:{dom:e},_node:{data:{node:native[i]}}});return e;});};setCrumbs(before.crumbs);elements=[tab,root,dom];
 const document={querySelectorAll:s=>s.startsWith('[data-tid^=')?crumbs:[...elements,...crumbs].filter(e=>s==='[data-tid='+JSON.stringify(e.getAttribute())+']')};
 const record={phase:'verified',workflowId:'flow',tab,packageNode:pkg,nodeTargetWorkflowNode:flow,crumbs:wf.navigation_path.map(c=>({...c}))};
 const prep={document,id:'doc',receipts:new Map([['refresh',record]])};
 const main={FMapTree:{FServerConnection:{UserName:'own'}},Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}};
 const app={Version:'7.4.2',MapTreeNode,PackagesTreeParentNode,PackageTreeNode,ModelUnitItemTreeNode,WorkFlowTreeNode,ModelNodeTreeNode,WizardTreeNode,ModelForm,Application:{FInstance:{FMainForm:main}}};
 const context=vm.createContext({document,location:{origin:'https://loginom.test'},bg:{app},Ext:{getCmp:id=>components.get(id)},__loginomDockPreparationV1:prep,getComputedStyle:()=>({visibility:'visible'})});
 const calls=[];const page={evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context),locator:()=>({click:async o=>{calls.push(o.trial?'trial':'click');if(!o.trial)active=true;}}),mouse:{up:async()=>calls.push('release')}};
 const enterWizard=()=>{setCrumbs(after.crumbs);controller.Node.data.node=native[6];controller.FController=Object.assign(new WizardModelComponentForm(),{FModelNode:node.FModelNode});elements=[tab,wizard];};
 const returnGraph=()=>{setCrumbs(after.crumbs.slice(0,5));controller.Node.data.node=flow;controller.FController=graph;elements=[tab,root,dom];};
 return {page,binding,record,prep,pkg,flow,node,native,controller,main,components,context,calls,tab,graph,enterWizard,returnGraph,
  crumbs:()=>crumbs,duplicateCrumb:()=>crumbs.push(crumbs[2]),removeCrumb:()=>crumbs.splice(3,1),setActive:v=>{active=v},clearCrumbs:()=>{crumbs=[]}};
}
