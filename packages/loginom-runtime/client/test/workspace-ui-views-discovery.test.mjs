import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {NavigationPage} from './fixtures/navigation/ui-page.mjs';
import {nativePage} from './fixtures/navigation/native-page.mjs';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';

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
 page.execute=async options=>JSON.parse(JSON.stringify(await vm.runInContext('('+makeWorkspaceUiCode({expected_build:'7.4.2',expected_origin:'https://loginom.test',prepared_node_context:f.binding,discover_roots:true,...options})+')',page.context)(page)));
 const original=f.binding.workflow_ref.navigation_path;crumbs(original);
 assert.equal((await readPreparedNodeContext(page,f.binding)).verified,true);
 f.enterWizard();const current=rekey?f.crumbs().slice(0,5).map(e=>({tid:e.getAttribute(),label:e.textContent})):original;
 for(const e of [...panel.children])e.remove();crumbs([...current,{tid:current.at(-1).tid+'>NavigationDiagnostic',label:'NavigationDiagnostic'}]);
 graph.remove();const views=page.add('div',base+'ViewsForm','',{x:0,y:120,width:900,height:600});
 class ViewsForm{};f.controller.Node.data.node=f.node;f.controller.FController=Object.assign(new ViewsForm(),{FModelNode:f.node.FModelNode,FView:{el:{dom:views}}});
 const toGraph=()=>{views.remove();page.document.body.append(graph);for(const e of [...panel.children])e.remove();crumbs(current);f.controller.Node.data.node=f.flow;f.controller.FController=f.graph;};
 return {f,page,panel,current,toGraph};
}


async function entryFixture({alias='NavigationPanel',rekey=false}={}){
 const x=await fixture({rekey,alias}),views=x.f.controller.FController;
 x.page.context.innerWidth=1000;x.page.context.innerHeight=800;
 const port='58f7e6c3-511e-39d7-8853-036e0a1a7612',view='8b1b164c-8b8a-4b71-832a-88e2d021fe3c';
 const panel=x.page.add('div','MF;TF-1;ViewsForm;cntPorts;'+port,'',{x:0,y:150,width:800,height:350},views.FView.el.dom);
 const card=x.page.add('div','MF;TF-1;ViewsForm;ViewerCard','',{x:10,y:160,width:500,height:200},panel);
 const panelObject={el:{dom:panel}};class BrowseViewVendor{}
 views.FPortList={[port]:{Type:0,Panel:panelObject}};
 views.FViewDescList={[view]:{PortPanel:panelObject,Vendor:new BrowseViewVendor(),ViewerCard:{FView:{el:{dom:card}}}}};
 const roots=await x.page.execute({mode:'observe',discover_roots:true});
 const root=roots.output.ui.elements.find(e=>e.tid==='MF;TF-1;NavigationBar;'+alias).ref;
 const execute=x.page.execute;x.page.execute=options=>execute({root_ref:root,discover_roots:false,...options});
 return {...x,navigationPanel:x.panel,views,panel,card,port,view};
}
for(const alias of ['NavigationPanel','NavPanel'])for(const rekey of [false,true])test('native ViewsForm discovery exposes bound Table entry '+alias+' rekey='+rekey,async()=>{
 const x=await entryFixture({alias,rekey}),s=await x.page.observe();
 assert.equal(s.prepared_node_context.verified,true);
 const card=s.ui.elements.find(e=>e.viewer_card?.kind==='enter');
 assert.ok(card);assert.equal(card.viewer_card.view_guid,x.view);assert.equal(card.viewer_card.port_guid,x.port);
 assert.ok(card.allowed_actions.includes('enter_table'));assert.deepEqual(x.page.events,[]);
});
for(const fault of ['foreign_document','foreign_panel','foreign_card','duplicate_root','duplicate_panel','duplicate_card','hidden_card','foreign_vendor','foreign_workflow','foreign_tab','foreign_node','foreign_account','foreign_connection','foreign_path','duplicate_navigation','wrong_root'])test('Table entry refuses '+fault,async()=>{
 const x=await entryFixture();
 if(fault==='foreign_workflow')x.f.record.nodeTargetWorkflowNode={};
 if(fault==='foreign_tab')x.f.record.tab={};
 if(fault==='foreign_node')x.f.node.FGuid='foreign';
 if(fault==='foreign_account')x.f.main.FMapTree.FServerConnection.UserName='foreign';
 if(fault==='foreign_connection')x.f.main.FMapTree.FServerConnection={UserName:'own'};
 if(fault==='foreign_path')x.f.pkg.PackageFileName='/foreign.lgp';
 if(fault==='duplicate_navigation')x.page.add('div','MF;TF-1;NavigationBar;NavPanel');
 if(fault==='wrong_root')x.navigationPanel.attrs['data-tid']='MF;TF-2;NavigationBar;NavigationPanel';
 if(fault==='foreign_document')x.f.prep.document={};
 if(fault==='foreign_panel')x.views.FPortList[x.port].Panel={el:{dom:{}}};
 if(fault==='foreign_card')x.views.FViewDescList[x.view].ViewerCard.FView.el.dom={};
 if(fault==='duplicate_root')x.page.add('div','MF;TF-1;ViewsForm');
 if(fault==='duplicate_panel')x.page.add('div',x.panel.getAttribute('data-tid'));
 if(fault==='duplicate_card')x.page.add('div',x.card.getAttribute('data-tid'));
 if(fault==='hidden_card')x.card.style.display='none';
 if(fault==='foreign_vendor')x.views.FViewDescList[x.view].Vendor={};
 const r=await x.page.execute({mode:'observe'});
 assert.equal(r.output?.ui?.elements?.some(e=>e.allowed_actions.includes('enter_table'))??false,false);
 assert.deepEqual(x.page.events,[]);
});
test('Table entry lost reply issues one gesture',async()=>{
 const x=await entryFixture(),s=await x.page.observe(),card=s.ui.elements.find(e=>e.viewer_card?.kind==='enter');
 assert.ok(card);x.page.failClick=true;
 const r=await x.page.act({verb:'enter_table',ref:card.ref},s);
 assert.equal(r.status,'AMBIGUOUS');assert.equal(x.page.events.filter(e=>e==='double_click').length,1);
});

for(const alias of ['NavigationPanel','NavPanel'])test('real joint output/navigation caller boundary '+alias,async()=>{
 const x=await entryFixture({alias,rekey:true});let time=0,calls=0;
 const channel=createNodeProcedure({operation:{id:'receiving-discovery',deadline:10000,action:{action_key:'node.configure',revision:'1'}},
  preparedNodeContext:x.f.binding,targetOrigin:'https://loginom.test',targetBuild:'7.4.2',
  now:()=>time,monotonicNow:()=>time,wait:async()=>{time+=10000;},record:async e=>e,
  execute:async code=>{calls++;return JSON.parse(JSON.stringify(await vm.runInContext('('+code+')',x.page.context)(x.page)));}});
 const read=()=>channel.observe({condition:'native bound table entry',readOutputs:true,readNavigation:true,
  ready:s=>s.ui.elements.some(e=>e.viewer_card?.kind==='enter'&&e.allowed_actions.includes('enter_table'))});
 if(alias==='NavPanel'){
  await assert.rejects(read,/Prepared workflow navigation region unavailable/);assert.equal(calls,1);
 }else{
  const s=await read(),card=s.ui.elements.find(e=>e.viewer_card?.kind==='enter');
  assert.equal(s.node_outputs.verified,true);assert.equal(card.viewer_card.port_guid,x.port);
  assert.equal(card.viewer_card.view_guid,x.view);assert.ok(card.allowed_actions.includes('enter_table'));assert.equal(calls,3);
 }
 assert.deepEqual(x.page.events,[]);
});
