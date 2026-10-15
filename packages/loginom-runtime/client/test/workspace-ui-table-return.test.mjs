import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {NavigationPage} from './fixtures/navigation/ui-page.mjs';
import {nativePage} from './fixtures/navigation/native-page.mjs';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {returnFromOutputTable} from '../lib/node-output-procedure.mjs';

async function fixture({rekey=true,alias='NavigationPanel'}={}) {
 const f=nativePage(),page=new NavigationPage(),base='MF;TF-1;';
 const panel=page.add('div',base+'NavigationBar;'+alias,'',{x:0,y:50,width:950,height:40});
 const crumbs=path=>{for(const [i,c] of path.entries()){
  const e=page.add('a',c.tid,c.label,{x:i*120,y:55,width:100,height:25},panel);e.id='table-crumb-'+i;
  f.components.set(e.id,{el:{dom:e},_node:{data:{node:f.native[i]}}});
  if(i===4)page.add('span',null,'',undefined,e).attrs.class='maptree-icon-workflow';
  if(i===5)page.add('span',null,'',undefined,e).attrs.class='bg-vendor-icon-importtext';
 }};
 const graph=page.add('div',base+'ModelForm;cmpDiagram','',{x:0,y:120,width:900,height:600});
 const body=page.add('g',base+'Graph;NavigationDiagnostic','',undefined,graph);
 f.prep.document=page.document;f.record.tab=page.tab;f.graph.FDiagram.FmxGraph.container=graph;
 f.graph.FDiagram.FmxGraph.view.getState=()=>({shape:{node:body}});
 page.context.bg=f.context.bg;page.context.Ext=f.context.Ext;page.context.__loginomDockPreparationV1=f.prep;
 page.evaluate=(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',page.context);
 page.execute=async options=>JSON.parse(JSON.stringify(await vm.runInContext('('+makeWorkspaceUiCode({expected_build:'7.4.2',expected_origin:'https://loginom.test',prepared_node_context:f.binding,...options})+')',page.context)(page)));
 const original=f.binding.workflow_ref.navigation_path;crumbs(original);
 assert.equal((await readPreparedNodeContext(page,f.binding)).verified,true);
 f.enterWizard();const current=rekey?f.crumbs().slice(0,5).map(e=>({tid:e.getAttribute(),label:e.textContent})):original;
 for(const e of [...panel.children])e.remove();crumbs([...current,{tid:current.at(-1).tid+'>NavigationDiagnostic',label:'NavigationDiagnostic'}]);
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
