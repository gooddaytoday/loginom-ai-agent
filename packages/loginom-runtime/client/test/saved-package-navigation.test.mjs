import test from 'node:test';import assert from 'node:assert/strict';
import {nativePage} from './fixtures/navigation/native-page.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {readGraph,createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
import {activatePreparedWorkflow} from '../lib/node-workflow-activation.mjs';
const task=f=>({request:f.binding,origin:'https://loginom.test',build:'7.4.2',types:{},deadline:Date.now()+30000});
test('saved package rekey preserves real prepared context, activation and graph reference',async()=>{
 const f=nativePage();const initial=await readGraph(f.page,task(f));assert.equal(initial.complete,true);
 assert.equal((await readPreparedNodeContext(f.page,f.binding)).surface,'graph');f.enterWizard();
 const w=await readPreparedNodeContext(f.page,f.binding);assert.equal(w.verified,true);assert.equal(w.surface,'wizard');assert.equal(w.node_id,'node');
 assert.equal(w.navigation_rebinding.prepared_path[2].tid.endsWith('>Package1'),true);
 assert.equal(w.navigation_rebinding.observed_path[2].label,w.navigation_rebinding.prepared_path[2].label);
 f.returnGraph();assert.equal((await activatePreparedWorkflow(f.page,task(f))).verified,true);
 const returned=await readGraph(f.page,task(f));assert.deepEqual(returned.workflow_ref,initial.workflow_ref);assert.deepEqual(returned.nodes,initial.nodes);assert.deepEqual(f.calls,[]);
});
test('rekey cannot establish a baseline retrospectively from an unconfirmed wizard',async()=>{
 const f=nativePage();f.enterWizard();assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,false);f.returnGraph();assert.equal((await activatePreparedWorkflow(f.page,task(f))).verified,false);await assert.rejects(readGraph(f.page,task(f)),/navigation/);assert.deepEqual(f.calls,[]);
});
const changes={document:f=>{f.prep.document={}},document_id:f=>{f.prep.id='other'},package:f=>{f.record.packageNode={}},workflow:f=>{f.record.nodeTargetWorkflowNode={}},workflow_guid:f=>{f.flow.FGuid='foreign'},package_guid:f=>{f.pkg.FGuid='foreign'},tab:f=>{f.record.tab={}},inactive_tab:f=>f.setActive(false),node:f=>{f.node.FGuid='foreign'},wizard_model:f=>{f.controller.FController.FModelNode={}},account:f=>{f.main.FMapTree.FServerConnection.UserName='foreign'},package_path:f=>{f.pkg.PackageFileName='/other.lgp'},label:f=>{f.crumbs()[2].textContent='other'},package_name:f=>{f.pkg.PackageName='other'},module_parent:f=>{f.native[3].ParentNode={}},foreign_module:f=>{f.components.get(f.crumbs()[3].id)._node.data.node={ParentNode:f.pkg}},foreign_node_crumb:f=>{f.components.get(f.crumbs()[5].id)._node.data.node={ParentNode:f.flow,FGuid:'node'}},foreign_wizard_crumb:f=>{f.components.get(f.crumbs()[6].id)._node.data.node={ParentNode:f.node}},component_dom:f=>{f.components.get(f.crumbs()[2].id).el.dom={}},missing_native:f=>{f.components.delete(f.crumbs()[2].id)},duplicate_crumb:f=>f.duplicateCrumb(),incomplete_crumb:f=>f.removeCrumb(),empty_crumbs:f=>f.clearCrumbs(),arbitrary_tid:f=>{f.binding.workflow_ref.navigation_path[2].tid='made-up'},unconfirmed_binding:f=>{f.record.crumbs[2].label='other';delete f.record.nodeNavigationBinding},ambiguous_receipt:f=>{f.prep.receipts.set('foreign',{...f.record,packageNode:{}})}};
for(const [name,change] of Object.entries(changes))test('saved package navigation refuses '+name,async()=>{
 const f=nativePage();assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,true);f.enterWizard();change(f);assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,false,name);assert.deepEqual(f.calls,[]);
});
test('original Page receipt recovers an unknown activation response without a second gesture',async()=>{
 const f=nativePage();await readGraph(f.page,task(f));f.enterWizard();assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,true);f.returnGraph();f.setActive(false);
 let first=true;const adapter=createNodeTargetBrowserAdapter({origin:'https://loginom.test',build:'7.4.2',execute:async code=>{const result=await new Function('page',`return (${code})(page)`)(f.page);if(first){first=false;throw Error('lost response')}return result;}});
 const ctx={receipt_id:'navigation-activation',deadline:Date.now()+10000};assert.equal((await adapter.activateWorkflow(f.binding,ctx)).verified,true);
 const recovered=await adapter.readWorkflowReceipt(f.binding,ctx);assert.equal(recovered.output.receipt.verified,true);assert.deepEqual(f.calls,['trial','click']);
});

import vm from 'node:vm';
import {NavigationPage} from './fixtures/navigation/ui-page.mjs';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';
for(const mode of ['saved_rekey','changed_label','changed_owner','lost_reply'])test('real UI opening '+mode+' keeps one settings gesture',async()=>{
 const f=nativePage(),page=new NavigationPage(),base='MF;TF-1;',panel=page.add('div',base+'NavigationBar;NavigationPanel');
 const makeCrumbs=path=>{for(const [i,c] of path.entries()){
  const e=page.add('a',c.tid,c.label,undefined,panel);e.id='native-crumb-'+i;
  f.components.set(e.id,{el:{dom:e},_node:{data:{node:f.native[i]}}});
  if(i===4)page.add('span',null,'',undefined,e).attrs.class='maptree-icon-workflow';
  if(i===5)page.add('span',null,'',undefined,e).attrs.class='bg-vendor-icon-importtext';
  if(i===6)page.add('span',null,'',undefined,e).attrs.class='maptree-icon-wizard';
 }};
 const original=f.binding.workflow_ref.navigation_path;makeCrumbs(original);
 const graph=page.add('div',base+'ModelForm;cmpDiagram'),body=page.add('g',base+'Graph;NavigationDiagnostic','',undefined,graph);
 page.add('span',base+'Graph;NavigationDiagnostic;Label;Label','NavigationDiagnostic',undefined,body);
 page.add('g',base+'Graph;NavigationDiagnostic;Setting','',{x:500,y:300,width:30,height:30},graph);
 f.prep.document=page.document;f.record.tab=page.tab;
 f.graph.FDiagram.FmxGraph.container=graph;f.graph.FDiagram.FmxGraph.view.getState=()=>({shape:{node:body}});
 page.context.bg=f.context.bg;page.context.Ext=f.context.Ext;page.context.__loginomDockPreparationV1=f.prep;
 page.evaluate=(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',page.context);
 page.execute=async options=>JSON.parse(JSON.stringify(await vm.runInContext('('+makeWorkspaceUiCode({expected_build:'7.4.2',expected_origin:'https://loginom.test',prepared_node_context:f.binding,...options})+')',page.context)(page)));
 assert.equal((await readPreparedNodeContext(page,f.binding)).verified,true);
 const snapshot=await page.observe(),button=snapshot.ui.elements.find(e=>e.wizard_open);assert.ok(button);
 const click=page.mouse.click;page.mouse.click=async(...args)=>{
  await click(...args);graph.remove();for(const e of [...panel.children])e.remove();
  f.enterWizard();const path=f.crumbs().map(e=>({tid:e.getAttribute(),label:e.textContent}));
  if(mode==='changed_label')path[2].label='foreign';makeCrumbs(path);
  if(mode==='changed_owner')f.node.FGuid='foreign';
  const w=page.add('div',base+'WizrdMCF');page.add('button',base+'WizrdMCF;ImportTextFileParamsWizard;FileNameTuning;edtFileName','',undefined,w);
  if(mode==='lost_reply')throw Error('lost settings response');
 };
 const result=await page.act({verb:'open_wizard',ref:button.ref},snapshot);
 assert.equal(result.status,mode==='saved_rekey'?'SUCCEEDED':'AMBIGUOUS',JSON.stringify(result));
 assert.equal(page.events.filter(e=>e==='click').length,1);
 assert.equal(result.trace.some(e=>e.event==='wizard_open_verified'),mode==='saved_rekey');
});

for(const mode of ['account','package_path','package','workflow','tab','ambiguous_workflow','wrong_parent','wrong_label','wrong_key','partial'])test('workflow rekey refuses '+mode+' before activation or graph observation',async()=>{
 const f=nativePage();await readGraph(f.page,task(f));f.enterWizard();f.returnGraph();
 if(changes[mode])changes[mode](f);
 if(mode==='ambiguous_workflow')f.prep.receipts.set('other',{...f.record,nodeTargetWorkflowNode:{}});
 if(mode==='wrong_parent')f.native[3].ParentNode={};
 if(mode==='wrong_label')f.crumbs()[3].textContent='foreign';
 if(mode==='wrong_key')f.crumbs()[2].getAttribute=()=>f.crumbs()[1].getAttribute()+'>forged';
 if(mode==='partial')f.removeCrumb();
 assert.equal((await activatePreparedWorkflow(f.page,task(f))).verified,false);
 await assert.rejects(readGraph(f.page,task(f)));assert.deepEqual(f.calls,[]);
});

test('a refused original node observation cannot authorize a later rekey',async()=>{
 const f=nativePage();f.graph.FDiagram.FNodes.FCollection=[];
 assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,false);
 assert.equal(f.record.nodeNavigationBinding,undefined);
 f.enterWizard();assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,false);
 assert.deepEqual(f.calls,[]);
});
