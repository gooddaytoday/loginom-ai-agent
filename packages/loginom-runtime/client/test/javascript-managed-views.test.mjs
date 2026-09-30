import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJavascriptManagedViewsCode,runManagedJavascriptViewsGesture,
  openManagedJavascriptOutputViews} from '../lib/javascript-managed-views.mjs';

function fixture(){
 const owner={document_id:'doc',workflow_id:'flow',node_id:'node'};
 const workflow_ref={tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1'};
 const task={operation_id:'views-op',owner,workflow_ref,targetOrigin:'http://logi-test-plan.bg.local',
  targetBuild:'7.4.2',deadline:Date.now()+5000,mode:'open',gesture_id:'views-op:views',
  output:{index:0,native_index:0,active:true,port_guid:'port'},
  prepared:{document_id:'doc',node:owner,workflow_ref:{...workflow_ref,workflow_id:'flow',navigation_path:[{tid:'crumb',label:'Flow'}]}},
  expected:{ready:true,node_id:'node',port_guid:'port',point:{x:100,y:100}}};
 const lease={identity:JSON.stringify([owner,workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]),
  bodySettled:true,handle:{},viewsCaptured:{}};
 const clicks=[];
 const page={[Symbol.for('loginom-dock.javascript-owned-selection-v1')]:new Map([[task.operation_id,lease]]),
  evaluate:async(fn,args)=>fn(args),mouse:{click:async(x,y)=>{clicks.push({x,y});}}};
 const inspect=()=>structuredClone(task.expected);
 return {task,lease,page,clicks,inspect};
}

test('managed Views reserves its one gesture before a returned or lost response',async()=>{
 for(const lost of [false,true]){
  const f=fixture();
  if(lost)f.page.mouse.click=async(x,y)=>{f.clicks.push({x,y});throw Error('lost click reply');};
  if(lost)await assert.rejects(runManagedJavascriptViewsGesture(f.page,f.task,f.inspect),/lost/);
  if(!lost)assert.equal((await runManagedJavascriptViewsGesture(f.page,f.task,f.inspect)).status,'SUCCEEDED');
  assert.equal(f.lease.viewsAttempted,true);
  const repeated=await runManagedJavascriptViewsGesture(f.page,f.task,f.inspect);
  assert.equal(repeated.status,'NOT_APPLIED');assert.equal(repeated.effect_possible,false);assert.equal(f.clicks.length,1);
 }
});

test('managed Views refuses changed lease, readiness or observed point before any click',async()=>{
 for(const change of [f=>f.task.owner={...f.task.owner,node_id:'foreign'},f=>f.lease.bodySettled=false,
  f=>f.lease.viewsCaptured=null,f=>f.inspect=()=>({...f.task.expected,ready:false}),
  f=>f.inspect=()=>({...f.task.expected,point:{x:101,y:100}})]){
  const f=fixture();change(f);const result=await runManagedJavascriptViewsGesture(f.page,f.task,f.inspect);
  assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);assert.equal(f.clicks.length,0);
 }
});

test('managed Views code binds exactly output0, prepared owner and bounded native task',()=>{
 const f=fixture();assert.match(makeJavascriptManagedViewsCode(f.task),/runManagedJavascriptViewsGesture/);
 for(const change of [t=>t.output.index=1,t=>t.output.active=false,t=>t.prepared.node={...t.owner,node_id:'foreign'},
  t=>t.prepared.workflow_ref.prefix='foreign',t=>t.output.untrusted='selector',t=>t.mode='replay']){
  const task=structuredClone(f.task);change(task);assert.throws(()=>makeJavascriptManagedViewsCode(task));
 }
});

test('managed Views dispatch requires an exact durable journal ACK before its mutation wrapper',async()=>{
 const f=fixture(),calls=[];
 await assert.rejects(openManagedJavascriptOutputViews({prepared:f.task.prepared,node:f.task.owner,
  output:f.task.output,deadline:f.task.deadline,targetOrigin:f.task.targetOrigin,
  execute:async code=>{calls.push(code);return calls.length===1?{ready:true}:f.task.expected;},
  record:async event=>({...event,gesture_id:'wrong-ack'}),receiptOptions:()=>assert.fail('unexpected body'),
  wrapMutation:()=>assert.fail('mutation before ACK')}),/ACK/);
 assert.equal(calls.length,2);
});
