import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {NavigationPage} from './fixtures/navigation/ui-page.mjs';
import {nativePage} from './fixtures/navigation/native-page.mjs';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {returnFromOutputTable} from '../lib/node-output-procedure.mjs';

const lab73={"document_id": "3257e2bd-8b24-4934-a7fc-2b5f838de82d", "workflow_ref": {"tab_tid": "MF;cntMain;cntWorkspace;Workspace;t.br;tb-3", "prefix": "MF;TF-3", "navigation_path": [{"tid": "MF;TF-3;cnrNaviMode;b.s_Сервер", "label": ""}, {"tid": "MF;TF-3;cnrNaviMode;b.s_Сервер>Пакеты", "label": "Пакеты"}, {"tid": "MF;TF-3;cnrNaviMode;b.s_Сервер>Пакеты>Package1", "label": "replacement_null_live_f63cf21c_c7b2_41af_bea5_79e958ecff63"}, {"tid": "MF;TF-3;cnrNaviMode;b.s_Сервер>Пакеты>Package1>Модуль1", "label": "Модуль1"}, {"tid": "MF;TF-3;cnrNaviMode;b.s_Сервер>Пакеты>Package1>Модуль1>Сценарий", "label": "Сценарий"}], "workflow_id": "3257e2bd-8b24-4934-a7fc-2b5f838de82d-2"}, "account": "lab-73-monkey-47274bad-b33b-4a2a-bf2d-60b0c951c36e", "packagePath": "/lab-73-monkey-47274bad-b33b-4a2a-bf2d-60b0c951c36e/replacement-null-live-f63cf21c-c7b2-41af-bea5-79e958ecff63.lgp", "observed_path": [{"tid": "MF;TF-3;cnrNaviMode;b.s_Сервер", "label": ""}, {"tid": "MF;TF-3;cnrNaviMode;b.s_Сервер>Пакеты", "label": "Пакеты"}, {"tid": "MF;TF-3;cnrNaviMode;b.s_Сервер>Пакеты>replacement_null_live_f63cf21c_c7b2_41af_bea5_79e958ecff63", "label": "replacement_null_live_f63cf21c_c7b2_41af_bea5_79e958ecff63"}, {"tid": "MF;TF-3;cnrNaviMode;b.s_Сервер>Пакеты>replacement_null_live_f63cf21c_c7b2_41af_bea5_79e958ecff63>Модуль1", "label": "Модуль1"}, {"tid": "MF;TF-3;cnrNaviMode;b.s_Сервер>Пакеты>replacement_null_live_f63cf21c_c7b2_41af_bea5_79e958ecff63>Модуль1>Сценарий", "label": "Сценарий"}], "nodeLabel": "ExactInput", "table": {"view_guid": "86e7fe05-a6bc-4ecd-95e6-ab02cf6e608b", "port_guid": "58f7e6c3-511e-39d7-8853-036e0a1a7612", "table_tid": "MF;TF-3;ViewsForm;BrowseView"}};

async function fixture({lab=false,rekey=true,alias='NavigationPanel'}={}) {
 const f=nativePage(),page=new NavigationPage(),base=lab?'MF;TF-3;':'MF;TF-1;',label=lab?'ExactInput':'NavigationDiagnostic';
 if(lab){f.binding.document_id=lab73.document_id;f.prep.id=lab73.document_id;f.binding.workflow_ref=structuredClone(lab73.workflow_ref);f.binding.node.document_id=lab73.document_id;f.binding.node.workflow_id=lab73.workflow_ref.workflow_id;f.record.workflowId=lab73.workflow_ref.workflow_id;f.record.crumbs=structuredClone(lab73.workflow_ref.navigation_path);f.pkg.PackageName=lab73.workflow_ref.navigation_path[2].label;f.pkg.PackageFileName=lab73.packagePath;f.main.FMapTree.FServerConnection.UserName=lab73.account;page.tab.attrs['data-tid']=lab73.workflow_ref.tab_tid;f.graph.FDiagram.FNodes.FCollection[0].FLabel.FRawValue=label;}
 const panel=page.add('div',base+'NavigationBar;'+alias,'',{x:0,y:50,width:950,height:40});
 const crumbs=path=>{for(const [i,c] of path.entries()){
  const e=page.add('a',c.tid,c.label,{x:i*120,y:55,width:100,height:25},panel);e.id='table-crumb-'+i;
  f.components.set(e.id,{el:{dom:e},_node:{data:{node:f.native[i]}}});
  if(i===4)page.add('span',null,'',undefined,e).attrs.class='maptree-icon-workflow';
  if(i===5)page.add('span',null,'',undefined,e).attrs.class='bg-vendor-icon-importtext';
 }};
 const graph=page.add('div',base+'ModelForm;cmpDiagram','',{x:0,y:120,width:900,height:600});
 const body=page.add('g',base+'Graph;'+label,'',undefined,graph);
 f.prep.document=page.document;f.record.tab=page.tab;f.graph.FDiagram.FmxGraph.container=graph;
 f.graph.FDiagram.FmxGraph.view.getState=()=>({shape:{node:body}});
 page.context.bg=f.context.bg;page.context.Ext=f.context.Ext;page.context.__loginomDockPreparationV1=f.prep;
 page.evaluate=(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',page.context);
 page.execute=async options=>JSON.parse(JSON.stringify(await vm.runInContext('('+makeWorkspaceUiCode({expected_build:'7.4.2',expected_origin:'https://loginom.test',prepared_node_context:f.binding,...options})+')',page.context)(page)));
 const original=f.binding.workflow_ref.navigation_path;crumbs(original);
 assert.equal((await readPreparedNodeContext(page,f.binding)).verified,true);
 f.enterWizard();const current=rekey?(lab?lab73.observed_path:f.crumbs().slice(0,5).map(e=>({tid:e.getAttribute(),label:e.textContent}))):original;
 for(const e of [...panel.children])e.remove();crumbs([...current,{tid:current.at(-1).tid+'>'+label,label}]);
 graph.remove();const views=page.add('div',base+'ViewsForm','',{x:0,y:120,width:900,height:600});
 class ViewsForm{};f.controller.Node.data.node=f.node;f.controller.FController=Object.assign(new ViewsForm(),{FModelNode:f.node.FModelNode,FView:{el:{dom:views}}});
 const toGraph=()=>{views.remove();page.document.body.append(graph);for(const e of [...panel.children])e.remove();crumbs(current);f.controller.Node.data.node=f.flow;f.controller.FController=f.graph;};
 return {f,page,panel,current,toGraph};
}
for(const alias of ['NavigationPanel','NavPanel'])for(const rekey of [false,true])test('serialized Table parent path: '+alias+' rekey='+rekey,async()=>{
 const x=await fixture({alias,rekey}),s=await x.page.observe();
 assert.equal(s.prepared_node_context.verified,true);assert.equal(s.prepared_node_context.surface,'views');
 assert.equal(s.workflow_navigation.status,'observed');assert.deepEqual(s.workflow_navigation.path,x.current);
 assert.ok(s.ui.elements.some(e=>e.ref===s.workflow_navigation.control_ref&&e.allowed_actions.includes('click')));
 x.toGraph();const after=await x.page.observe();assert.equal(after.prepared_node_context.surface,'graph');assert.deepEqual(after.navigation_context.path,x.current);assert.deepEqual(x.page.events,[]);
});
const faults={document:x=>{x.f.prep.document={}},package:x=>{x.f.record.packageNode={}},workflow:x=>{x.f.record.nodeTargetWorkflowNode={}},tab:x=>{x.f.record.tab={}},node:x=>{x.f.node.FGuid='foreign'},account:x=>{x.f.main.FMapTree.FServerConnection.UserName='foreign'},connection:x=>{x.f.main.FMapTree.FServerConnection={UserName:'own'}},path:x=>{x.f.pkg.PackageFileName='/foreign.lgp'},label:x=>{x.panel.children[2].ownText='foreign'},parent:x=>{x.f.native[3].ParentNode={}},missing:x=>x.panel.children[3].remove(),duplicate:x=>x.page.add('a',x.current[2].tid,x.current[2].label,undefined,x.panel),foreign_owner:x=>{x.f.components.get(x.panel.children[5].id)._node.data.node={ParentNode:x.f.flow,FGuid:'node'}},ambiguous_owner:x=>{x.f.prep.receipts.set('foreign',{...x.f.record,packageNode:{}})}};
for(const [name,change] of Object.entries(faults))test('serialized return path refuses '+name,async()=>{
 const x=await fixture();change(x);const r=await x.page.execute({mode:'observe'});assert.notEqual(r.status,'SUCCEEDED');assert.deepEqual(x.page.events,[]);
});
for(const mode of ['success','lost_reply','wrong_table'])test('source Table/parent procedure: '+mode,async()=>{
 const x=await fixture(),table={view_guid:'view',port_guid:'port',table_tid:'Table'};
 // Output identities are projections of the separately tested output observer;
 // native binding, UI observation/action and return procedure execute real helpers.
 const observe=async()=>{const s=await x.page.observe();s.node_outputs=s.prepared_node_context.surface==='views'?{verified:true,surface:'views',tables:[{...table,active:true,view_guid:mode==='wrong_table'?'foreign':'view'}]}:{verified:true,surface:'graph',ports:[{port_guid:'port',active:true}]};return s;};
 const channel={observe:async o=>{const s=await observe();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{const s=await observe();assert.ok(o.ready(s));const action=o.resolve(s);assert.equal(action.verb,'click');if(mode==='lost_reply')x.page.failClick=true;const r=await x.page.act(action,s);if(mode==='lost_reply'){assert.equal(r.status,'AMBIGUOUS');throw Error('lost reply');}assert.equal(r.status,'SUCCEEDED');x.toGraph();}};
 if(mode==='success')assert.equal((await returnFromOutputTable(channel,table)).verified,true);else await assert.rejects(returnFromOutputTable(channel,table));
 assert.equal(x.page.events.filter(e=>e==='click').length,mode==='wrong_table'?0:1);
});

for(const mode of ['both_aliases','foreign_panel','missing_panel'])test('return does not borrow '+mode,async()=>{
 const x=await fixture();
 if(mode==='both_aliases')x.page.add('div','MF;TF-1;NavigationBar;NavPanel');
 if(mode==='foreign_panel')x.panel.attrs['data-tid']='MF;TF-2;NavigationBar;NavigationPanel';
 if(mode==='missing_panel')x.panel.attrs['data-tid']='MF;TF-1;OtherPanel';
 const s=await x.page.observe();assert.equal(s.prepared_node_context.verified,true);assert.notEqual(s.workflow_navigation.status,'observed');assert.deepEqual(x.page.events,[]);
});

// Exact LAB-73 projection from saved fresh-prepare-18 and final read sample.
// Native proof is recomputed by readPreparedNodeContext/serialized boundNode;
// source Table identifiers are historical output projections, not a live read.
for(const mode of ['rekey','fallback','foreign','missing','ambiguous','lost_reply'])test('LAB-73 real serialized Table return: '+mode,async()=>{
 const x=await fixture({lab:true,alias:'NavPanel',rekey:mode!=='fallback'});
 if(mode==='foreign')x.f.record.packageNode={};
 if(mode==='missing')x.f.components.delete(x.panel.children[2].id);
 if(mode==='ambiguous')x.f.prep.receipts.set('other',{...x.f.record,packageNode:{}});
 const observe=async()=>{const s=await x.page.observe();s.node_outputs=s.prepared_node_context.surface==='views'?{verified:true,surface:'views',tables:[{...lab73.table,active:true}]}:{verified:true,surface:'graph',ports:[{port_guid:lab73.table.port_guid,active:true}]};return s;};
 const channel={observe:async o=>{const s=await observe();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{const s=await observe();assert.ok(o.ready(s));const a=o.resolve(s);if(mode==='lost_reply')x.page.failClick=true;const r=await x.page.act(a,s);if(mode==='lost_reply'){assert.equal(r.status,'AMBIGUOUS');throw Error('lost reply');}assert.equal(r.status,'SUCCEEDED');x.toGraph();}};
 if(['rekey','fallback'].includes(mode)){const before=await observe();assert.equal(before.prepared_node_context.verified,true);assert.equal(before.workflow_navigation.status,'observed');assert.deepEqual(before.workflow_navigation.path,x.current);assert.equal((await returnFromOutputTable(channel,lab73.table)).verified,true);const after=await observe();assert.equal(after.prepared_node_context.surface,'graph');assert.equal(after.prepared_node_context.document_id,lab73.document_id);assert.deepEqual(after.navigation_context.path,x.current);}
 else await assert.rejects(returnFromOutputTable(channel,lab73.table));
 assert.equal(x.page.events.filter(e=>e==='click').length,['rekey','fallback','lost_reply'].includes(mode)?1:0);
});
