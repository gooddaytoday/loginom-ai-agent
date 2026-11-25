import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseConnectionCapability} from '../lib/imports-database-connection.mjs';
import {createDatabaseImportNodeSupport} from '../lib/imports-database-node.mjs';
import {releaseNodeTarget} from '../lib/node-target.mjs';

const origin='https://app.loginom.ai',build='7.4.2',prefix='MF;TF-1';
const moduleLabel='Модуль1',workflowLabel='Сценарий',errorText='При переходе на "Модуль1.Подключения" возникла ошибка.';
const moduleTid='module',connectionsTid=prefix+';ListViewForm;cntTile;ListView;headercontainer;title_1';
const workflowTid=prefix+';ListViewForm;cntTile;ListView;headercontainer;title_2';
const flow={workflow_id:'flow',tab_tid:'tab',prefix,navigation_path:[{tid:moduleTid,label:moduleLabel},{tid:'flow',label:workflowLabel}]};
const document_id='doc',connection={name:'/own/probe.db',database_path:'/own/probe.db'};
const graph={complete:true,interaction_ready:true,document_id,workflow_ref:flow,dom_epoch:1,nodes:[],links:[],foreign_links:[]};
const selector=tid=>'[data-tid='+JSON.stringify(tid)+']';

async function failedNavigation(t,fault){
 const calls=[];
 let surface='graph',dialogOpen=false,moduleController;
 const doc={documentElement:{}};
 const packageNode={},module={ParentNode:packageNode},workflow={ParentNode:module};
 const tab={classList:{contains:s=>s==='x-tab-active'}},active={Controller:{Node:{data:{node:workflow}},FController:{}}};
 const preparation={document:doc,id:document_id,receipts:new Map([['prepare',{phase:'verified',workflowId:'flow',nodeTargetWorkflowNode:workflow,packageNode,tab}]])};
 const element=(id,text='',x=25)=>({
  id,textContent:text,innerText:text,isConnected:true,checkVisibility:()=>true,
  getBoundingClientRect:()=>({left:x-5,right:x+5,top:15,bottom:25,width:10,height:10}),closest:()=>null,contains:()=>false,
 });
 const moduleTile=element('module'),connections=element('connections','Подключения',45),workflowTile=element('workflow',workflowLabel,65);
 const root=element('module-view');
 root.contains=e=>[connections,workflowTile].includes(e);
 class ListViewForm { FView={el:{dom:root}}; }
 moduleController=new ListViewForm();
 const modal=element('msgbox'),title=element('msg-title','Loginom '+build);
 const message=element('msg-text',fault==='foreign window'?'Other operation failed.':errorText+'\nПодробности');
 const ok=element('msg-ok','OK',85);
 modal.contains=e=>[title,message,ok].includes(e);
 const windows=[modal,...(fault==='extra window'?[element('other-window')]:[])];
 const components=new Map([modal,ok].map(e=>[e.id,{el:{dom:e},disabled:false}]));
 const byTid=new Map([[moduleTid,moduleTile],[connectionsTid,connections],[workflowTid,workflowTile],[flow.tab_tid,tab]]);
 const dialogElements=new Map([['msgbox;p.h;p.t',title],['msgbox;cnt',message],['msgbox;tlb;ok',ok]]);
 const all=sel=>{
  if(sel==='.x-window')return dialogOpen?windows:[];
  if(sel.includes('x-mask:visible'))return dialogOpen?windows:[];
  if(sel.startsWith('[data-tid^='))return surface==='module'?[connections,workflowTile]:[];
  for(const [tid,e] of byTid)if(sel===selector(tid))return [e];
  if(dialogOpen)for(const [tid,e] of dialogElements)if(sel===selector(tid))return [e];
  return [];
 };
 for(const [tid,e] of [...byTid,...dialogElements])e.getAttribute=()=>tid;
 Object.assign(doc,{querySelectorAll:all,elementFromPoint:x=>[moduleTile,connections,workflowTile,ok].find(e=>e.getBoundingClientRect().left<x&&e.getBoundingClientRect().right>x)});
 modal.querySelectorAll=sel=>all(sel).filter(e=>modal.contains(e));
 const globals={document:doc,location:{origin},innerWidth:200,innerHeight:200,__loginomDockPreparationV1:preparation,
  bg:{app:{Version:build,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>active}}}}}}},
  Ext:{getCmp:id=>components.get(id)}};
 const previous=Object.fromEntries(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [k,v] of Object.entries(globals))Object.defineProperty(globalThis,k,{configurable:true,value:v});
 t.after(()=>{for(const [k,d] of Object.entries(previous)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 const locator=sel=>({count:async()=>all(sel).length,evaluate:async(fn,arg)=>fn(all(sel)[0],arg),
  evaluateAll:async(fn,arg)=>fn(all(sel),arg),isVisible:async()=>sel===selector(prefix+';ModelForm;cmpDiagram')&&surface==='graph'});
 const click=async(x)=>{
  if(x===25){calls.push('module');surface='module';active.Controller.Node.data.node=module;active.Controller.FController=moduleController;}
  if(x===45){calls.push('open connections');dialogOpen=true;
   if(fault==='wrong view owner')active.Controller.FController=new ListViewForm();}
  if(x===85){calls.push('dismiss');if(fault==='lost click')throw Error('Click reply lost');dialogOpen=false;
   if(fault==='owner changed after dismissal')active.Controller.FController=new ListViewForm();}
  if(x===65){calls.push('return to workflow');surface='graph';active.Controller.Node.data.node=workflow;active.Controller.FController={};}
 };
 const dispose=async()=>{};
 const page={locator,evaluate:async(fn,arg)=>fn(arg),evaluateHandle:async(fn,arg)=>{
  const value=fn(arg);
  if(value===ok)return {asElement:()=>({click:()=>click(85),dispose}),dispose};
  if(!value)return {asElement:()=>null,dispose};
  return {...value,dispose};
 },
  waitForTimeout:ms=>new Promise(resolve=>setTimeout(resolve,Math.min(5,ms))),mouse:{click,dblclick:click}};
 const readGraph=async()=>{
  assert.equal(surface,'graph');assert.equal(dialogOpen,false);
  return {...graph,...(calls.includes('return to workflow')?{dom_epoch:2,
   ...(fault==='busy graph'?{interaction_ready:false}:{}),
   ...(fault==='changed graph'?{nodes:[{ref:{document_id,workflow_id:'flow',node_id:'added'},locked:false}]}:{})}:{})};
 };
 const deadline=Date.now()+300;
 return {calls,result:await databaseConnectionCapability(page,{deadline,document_id,workflow_ref:flow,origin,build,connection},readGraph)};
}

test('a connections navigation refusal closes its own dialog and restores the quiet graph',async t=>{
 const {calls,result}=await failedNavigation(t);
 assert.deepEqual(calls,['module','open connections','dismiss','return to workflow'],JSON.stringify(result));
 assert.equal(result.verified,false);
 assert.equal(result.cleanup_complete,true);
 assert.match(result.error,/При переходе на "Модуль1.Подключения" возникла ошибка/);
 assert.deepEqual(result.pre_target_checkpoint,{graph:{...graph,dom_epoch:2},navigation_refused:true});
});

for(const fault of ['foreign window','extra window','wrong view owner','lost click','owner changed after dismissal','busy graph','changed graph']){
 test('connections navigation retains pending cleanup for '+fault,async t=>{
  const {calls,result}=await failedNavigation(t,fault);
  assert.equal(result.cleanup_complete,false);
  assert.equal(result.pre_target_checkpoint,undefined);
  assert.equal(calls.includes('dismiss'),['lost click','owner changed after dismissal','busy graph','changed graph'].includes(fault));
  assert.equal(calls.includes('return to workflow'),['busy graph','changed graph'].includes(fault));
 });
}

test('pre-target release admits the completed SQLite refusal receipt with a verified graph',async()=>{
 const request={document_id,workflow_ref:flow,target:{kind:'new',type:'imports.database'},parameters:{database:{database_path:connection.database_path}}};
 const operation={id:'apply',parameters:request,nodeApply:{request,pending:{phase:'target'}}};
 const receipt={operation_id:'apply:n1',action_key:'node.database.connection.internal',status:'AMBIGUOUS',cleanup_complete:true,effect_possible:true,
  output:{verified:false,pre_target_checkpoint:{graph,navigation_refused:true}},error:{message:errorText}};
 const support=createDatabaseImportNodeSupport({targetOrigin:origin,targetBuild:build});
 const drivers=support.nodeApplyDriverFactory({operation,execute:async()=>receipt,onRecord:async record=>record,
  receiptOptions:(id,key)=>{operation.lastReceipt={id,action_key:key};return {};}});
 const deadline=Date.now()+5000;
 await assert.rejects(drivers.beforeTarget({deadline}),/возникла ошибка/);
 assert.deepEqual(operation.preTargetGraph,graph);
 const adapter={verifyWorkflow:async()=>({status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,document_id,workflow_ref:flow}),
  observe:async()=>graph};
 const release=()=>releaseNodeTarget({operation,deadline,adapter,readReceipt:async()=>({state:'completed',receipt})});
 assert.equal((await release()).target_state,'not_created');
 operation.transportUncertain=true;
 await assert.rejects(release,/release boundary is unavailable/);
});
