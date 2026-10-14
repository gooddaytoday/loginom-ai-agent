import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
const root=process.env.NODE_MINT_ROOT??new URL('../lib/',import.meta.url).href;
const {createNodeTargetBrowserAdapter,readGraph}=await import(new URL('node-target-browser.mjs',root));
const {activatePreparedWorkflow}=await import(new URL('node-workflow-activation.mjs',root));
function fixture(){
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelForm{};
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'tab',navigation_path:[{tid:'crumb',label:'Scenario'}]}};
 const element=tid=>({getAttribute:()=>tid,textContent:'Scenario',getBoundingClientRect:()=>({width:10,height:10}),classList:{contains:()=>true}});
 const tab=element('tab'),root=element('MF;TF-1;ModelForm;cmpDiagram'),body=element('MF;TF-1;Graph;Calc'),portDom=element('MF;TF-1;Graph;Calc;Output_Data-0'),crumb=element('crumb'),labelDom=element('MF;TF-1;Graph;Calc;Label;Label');
 const alternatePortDom=element(null),inside=[];let duplicateShape=false,wrongHit=false;
 root.contains=e=>e===body||e===portDom||e===alternatePortDom||e===labelDom||inside.includes(e);root.querySelectorAll=()=>[body,portDom,labelDom,...inside].filter(e=>e.getAttribute('data-tid'));
 const port={FCell:{visible:true}},node={FGuid:'n',FIconCls:'bg-vendor-icon-calcdata',FCell:{geometry:{x:10,y:10}},FPorts:[{FCollection:[port]}]};
 Object.assign(port,{FGuid:'port-guid',data:{},parent:node,FType:1,FSubType:1});port.FCell.parent=node.FCell;
 let portTid='MF;TF-1;Graph;Calc;Output_Data-0';portDom.getAttribute=()=>portTid;
 node.FLabel={parent:node,FCell:{parent:node.FCell,visible:true},FRawValue:'Calc'};
 let rendered=true,labelRendered=true,onPaint=()=>{},pausedPaint=false;
 const graph={container:root,getCellAt:()=>wrongHit?{}:port.FCell,view:{getState:cell=>cell===node.FCell?{shape:{node:body}}:cell===node.FLabel.FCell?(labelRendered?{text:{node:labelDom}}:null):rendered?{shape:{node:duplicateShape?alternatePortDom:portDom}}:null}};
 const model=Object.assign(new ModelForm(),{FCreateDraggedNodeStarted:false,FDraggingOverGraph:false,FDiagram:{FmxGraph:graph,FNodes:{FCollection:[node]}}});
 const packageNode=new PackageTreeNode(),workflowNode=Object.assign(new WorkFlowTreeNode(),{ParentNode:packageNode});
 const app={Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{Node:{data:{node:workflowNode}},FController:model}})}}}}}};
 const outside=[];
 const nodeList=values=>Object.assign(Object.fromEntries(values.map((v,i)=>[i,v])),{length:values.length,[Symbol.iterator]:function*(){yield* values;}});
 const document={querySelectorAll:selector=>nodeList(selector.startsWith('[data-tid^=')?[crumb]:[tab,root,body,portDom,...inside,...outside,...(labelRendered?[labelDom]:[])].filter(e=>selector==='[data-tid='+JSON.stringify(e.getAttribute())+']'))};
 tab.isConnected=true;packageNode.PackageFileName='/owned.lgp';packageNode.FGuid='pkg';workflowNode.FGuid='wf';
 const connection={UserName:'Owner'};app.Application.FInstance.FMainForm.FMapTree={FServerConnection:connection};
 const packageCrumb=element('package-crumb');packageCrumb.textContent='Package';packageCrumb.id='package';crumb.id='workflow';
 request.workflow_ref.navigation_path=[{tid:packageCrumb.getAttribute(),label:'Package'},{tid:crumb.getAttribute(),label:'Scenario'}];
 const originalQuery=document.querySelectorAll;document.querySelectorAll=s=>s.startsWith('[data-tid^=')?nodeList([packageCrumb,crumb]):s==='[data-tid="package-crumb"]'?nodeList([packageCrumb]):s==='[data-tid="crumb"]'?nodeList([crumb]):originalQuery(s);
 const nativeComponents={package:{el:{dom:packageCrumb},_node:{data:{node:packageNode}}},workflow:{el:{dom:crumb},_node:{data:{node:workflowNode}}}};
 const record={phase:'verified',workflowId:'wf',packageNode,tab,nodeTargetWorkflowNode:workflowNode,request:'original-request',crumbs:request.workflow_ref.navigation_path};
 const preparation={id:'doc',document,receipts:new Map([['p',record]])};
 const context=vm.createContext({Ext:{getCmp:id=>nativeComponents[id]},document,location:{origin:'http://loginom.test'},bg:{app},__loginomDockPreparationV1:preparation,getComputedStyle:()=>({visibility:'visible'}),setTimeout,clearTimeout,requestAnimationFrame:callback=>{if(pausedPaint)return;onPaint();callback(0);}});
 const page={evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context)};
 const adapter=createNodeTargetBrowserAdapter({origin:'http://loginom.test',build:'7.4.2',pinned:{},execute:code=>vm.runInNewContext('('+code+')',{...context})(page)});
 return {record,prepare:()=>activatePreparedWorkflow(page,{request,origin:'http://loginom.test',build:'7.4.2',deadline:Date.now()+1000}),binding:()=>readGraph(page,{request,types:{},origin:'http://loginom.test',build:'7.4.2',read_bindings:true}),outline:()=>{outside.push(element(portTid),element(labelDom.getAttribute()));},duplicatePort:()=>{inside.push(element(portTid));},read:()=>adapter.observe(request,Date.now()+1000),alternateShape:()=>{duplicateShape=true;},wrongHit:()=>{wrongHit=true;},losePortTid:()=>{portTid=null;},hide:()=>{rendered=false;},show:()=>{rendered=true;},paintWith:callback=>{onPaint=callback;},pausePaint:()=>{pausedPaint=true;},hideLabel:()=>{labelRendered=false;},port,node,labelDom};
}

for(const route of ['read','prepare']) {
 const success=async f=>{if(route==='read')return f.read();const r=await f.prepare();assert.equal(r.verified,true);return r};
 const refuse=async f=>{if(route==='read')await assert.rejects(f.read(),/navigation/);else assert.equal((await f.prepare()).verified,false)};
 test(route+' first capture pins original request before binding',async()=>{const f=fixture();await success(f);const d=Object.getOwnPropertyDescriptor(f.record,'nodePreparedRequest');assert.equal(d.value,'original-request');assert.equal(d.writable,false);assert.equal(d.configurable,false);assert.equal(d.enumerable,false);assert.ok(f.record.nodeNavigationBinding);await success(f);f.record.request='drift';await refuse(f);assert.equal(d.value,'original-request');});
 test(route+' retained incomplete binding refuses without late mint',async()=>{const f=fixture();f.record.nodeNavigationBinding={};await refuse(f);assert.equal(Object.hasOwn(f.record,'nodePreparedRequest'),false);});
 for(const kind of ['missing','empty','getter','foreign-pin','writable-pin'])test(route+' refuses '+kind+' without binding',async()=>{const f=fixture();let reads=0;if(kind==='missing')delete f.record.request;if(kind==='empty')f.record.request='';if(kind==='getter')Object.defineProperty(f.record,'request',{get(){reads++;throw Error('getter invoked')}});if(kind==='foreign-pin')Object.defineProperty(f.record,'nodePreparedRequest',{value:'foreign'});if(kind==='writable-pin')Object.defineProperty(f.record,'nodePreparedRequest',{value:'original-request',writable:true});await refuse(f);assert.equal(f.record.nodeNavigationBinding,undefined);assert.equal(reads,0);});
}
