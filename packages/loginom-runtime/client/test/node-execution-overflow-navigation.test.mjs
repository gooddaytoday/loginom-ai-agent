import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import {returnToExecutedWorkflow} from '../lib/node-execution-procedure.mjs';
import {Page,build,origin} from './support/workspace-ui-fixture.mjs';
import {inputPortBreadcrumbs} from './input-port-breadcrumbs.fixture.mjs';

// LAB-82 D80 replay: Show Node leaves the sixth breadcrumb in toolbar overflow.
function fixture({hidden=true,vendor='crosstab',fault}={}) {
 const page=new Page();page.context.innerWidth=1440;page.context.innerHeight=1000;
 page.tab.attrs['data-tid']='MF;cntMain;cntWorkspace;Workspace;t.br;tb-5';
 const base='MF;TF-5;',caption='Суммы по регионам и категориям',key=caption.replaceAll(' ','_');
 const panel=page.add('div',base+'NavigationBar;NavigationPanel','',{x:48,y:35,width:1392,height:36});
 const crumbs=inputPortBreadcrumbs.slice(0,6).map((n,i)=>{
  const e=page.add('a',i===5?n.tid.replace(/Revenue$/,key):n.tid,i===5?caption:n.label,
   i===5?{x:774,y:41,width:300,height:24}:n.rect,panel);
  const icon=i===4?'maptree-icon-workflow':i===5?'bg-vendor-icon-'+vendor:null;
  if(icon)page.add('span',null,'',{x:e.box.x+6,y:44,width:18,height:18},e).attrs.class=icon;
  return e;
 });
 const crumb=crumbs[5],node={document_id:'doc',workflow_id:'wf',node_id:'node'};
 const owner={...node,verified:true,surface:'graph',locked:false,tid:base+'Graph;'+key,
  navigation_node:{tid:crumb.attrs['data-tid'],label:caption}};
 const binding={node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-5',navigation_path:crumbs.slice(0,5).map(e=>({tid:e.attrs['data-tid'],label:e.ownText.trim()}))}};
 if(hidden){crumb.style.display='none';crumb.box={x:0,y:0,width:0,height:0};crumb.children[0].box={...crumb.box};}
 if(fault==='tid')owner.navigation_node.tid+='-foreign';
 if(fault==='label')owner.navigation_node.label='Foreign';
 if(fault==='graph')owner.tid='MF;TF-3;Graph;'+key;
 if(['document_id','workflow_id','node_id'].includes(fault))owner[fault]='foreign';
 if(fault==='unverified')owner.verified=false;
 if(fault==='path')crumbs[3].attrs['data-tid']+='>Foreign';
 if(fault==='icon')crumb.children[0].attrs.class='bg-vendor-icon-reformcolumns';
 if(fault==='duplicate_icon')page.add('span',null,'',crumb.box,crumb).attrs.class='bg-vendor-icon-'+vendor;
 if(fault==='duplicate')page.add('a',crumb.attrs['data-tid'],caption,crumb.box,panel);
 if(fault==='duplicate_panel')page.add('div',base+'NavigationBar;NavigationPanel','',panel.box);
 if(fault==='visibility')crumb.style.visibility='hidden';
 if(fault==='hidden_attribute')crumb.attrs.hidden='';
 if(fault==='opacity')crumb.style.opacity='0';
 if(fault==='sensitive')crumb.attrs['aria-label']='password';
 const capability=vm.runInContext('('+workspaceUiCapability.toString()+')',page.context);
 const execute=options=>capability(page,{expected_build:build,expected_origin:origin,prepared_node_context:binding,...options},async()=>structuredClone(owner));
 const observe=()=>execute({mode:'observe'});
 return {page,node,owner,crumb,crumbs,execute,observe};
}

for(const options of [{hidden:true},{hidden:false},{hidden:true,vendor:'javascript'}]) {
 test('execution returns once from '+(options.hidden?'hidden ':'visible ')+(options.vendor??'crosstab')+' native overview',async()=>{
  const f=fixture(options),before=await f.observe();assert.equal(before.status,'SUCCEEDED');
  let ready;
  await assert.rejects(returnToExecutedWorkflow({observe:async o=>{ready=o.ready(before.output);throw Error('readiness probe');}},f.node),/readiness probe/);
  assert.equal(ready,true,'production execution-return readiness');
  assert.equal(before.output.node_context.status,'observed');
  assert.equal(before.output.node_context.path.length,6);
  assert.equal(before.output.navigation_context.status,'unobserved');
  if(options.hidden)assert.equal(before.output.ui.elements.some(e=>e.tid===f.crumb.attrs['data-tid']&&e.allowed_actions.length>0),false);
  const actions=[],click=f.page.mouse.click;
  f.page.mouse.click=async(...args)=>{await click(...args);f.crumb.remove();delete f.owner.navigation_node;};
  const channel={observe:async o=>{
   assert.equal(o.readNavigation,true);const r=await f.observe();assert.equal(r.status,'SUCCEEDED');
   assert.equal(o.ready(r.output),true,o.condition);return {...r.output,node_navigation_read:true};
  },perform:async o=>{
   const fresh=await f.observe();assert.equal(o.ready(fresh.output),true);
   const action=o.resolve(fresh.output);actions.push(action);
   const result=await f.execute({mode:'act',operation_id:'return-overview',action,snapshot:o.initialObservation});
   assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
  }};
  await returnToExecutedWorkflow(channel,f.node);
  assert.deepEqual(actions,[{verb:'click',ref:before.output.workflow_navigation.control_ref}]);
  assert.equal(f.page.events.filter(e=>e==='click').length,1);
  const after=await f.observe();assert.equal(after.output.navigation_context.status,'observed');
  await returnToExecutedWorkflow(channel,f.node);assert.equal(actions.length,1);
 });
}

for(const fault of ['tid','label','graph','document_id','workflow_id','node_id','unverified','path','icon','duplicate_icon','duplicate','duplicate_panel','visibility','hidden_attribute','opacity','sensitive']) {
 test('hidden CrossTable execution return rejects '+fault,async()=>{
  const f=fixture({fault}),result=await f.observe();
  if(result.status==='SUCCEEDED'){
   let ready;
   await assert.rejects(returnToExecutedWorkflow({observe:async o=>{ready=o.ready(result.output);throw Error('stop before gesture');}},f.node),/stop before gesture/);
   assert.equal(ready,false);assert.notEqual(result.output.navigation_context.status,'observed');
  }
  assert.deepEqual(f.page.events,[]);
 });
}
