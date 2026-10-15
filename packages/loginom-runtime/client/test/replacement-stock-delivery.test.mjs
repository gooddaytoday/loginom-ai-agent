import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.env.REPLACEMENT_STOCK_RUNTIME_ROOT??fileURLToPath(new URL('../../',import.meta.url));
const resources=process.env.REPLACEMENT_STOCK_RESOURCES;
assert.ok(resources,'Explicit full-manifest verified resources required');
const preload=fileURLToPath(new URL('./support/replacement-stock-delivery.mjs',import.meta.url));
const args={operation_id:'apply',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf'},target:{kind:'existing',type:'transform.replace_columns',ref:{document_id:'doc',workflow_id:'wf',node_id:'node'}},inputs:[],mode:'exact',parameters:{},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false}};
async function fixture(scenario,harness='replacement-input0-readonly-v1'){
 const directory=await mkdtemp(join(tmpdir(),'stock-delivery73-'));
 const child=fork(join(root,'src/managed-entry.mjs'),[],{execArgv:['--import',preload],env:{...process.env,REPLACEMENT_STOCK_RUNTIME_ROOT:root,REPLACEMENT_STOCK_SCENARIO:scenario},stdio:['ignore','pipe','pipe','ipc']});
 const pending=new Map();let logs='',seq=0;child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 child.on('message',m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);p.resolve(m)}});
 const exited=new Promise(resolve=>child.on('exit',(code,signal)=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('child exit '+code+' '+signal+' '+logs))}pending.clear();resolve({code,signal})}));
 const send=(operation,input)=>new Promise((resolve,reject)=>{const id=String(++seq);pending.set(id,{resolve,reject,timer:setTimeout(()=>{pending.delete(id);reject(Error('IPC timeout '+logs))},20000)});child.send({id,operation,input});});
 const cleanup=async()=>{if(child.connected){await send('close').catch(()=>{});if(child.connected)child.disconnect()}await exited;await rm(directory,{recursive:true,force:true})};
 try{
  const start=await send('start',{protocol:1,resources,stateDir:directory,generation:1,chat:'chat',endpoint:'https://fixture.invalid/mcp',connection:{url:'https://fixture.invalid',username:'account',password:'fixture',apiKey:'fixture'},headless:true,
   ...(harness?{acceptanceCapture:{revision:1,harness,owner:'host',run:'run',lease:'host:run',generation:1,chat:'chat',account:'account',admission:'admission',packagePath:'/account/original.lgp',expires:Date.now()+600000}}:{})});
  assert.equal(start.error,undefined,JSON.stringify(start)+' '+logs);
  const call=(name,arguments_)=>send('call',{name,arguments:arguments_});
  const prepare=await call('dock_prepare',{});assert.equal(prepare.error,undefined,JSON.stringify(prepare)+' '+logs);
  if(scenario!=='missing-apply'){
   const apply=await call('dock_node_apply',scenario==='generic-import'?{...args,target:{...args.target,type:'imports.text'},mode:'delimited'}:args);assert.equal(apply.error,undefined,JSON.stringify(apply)+' '+logs);assert.equal(apply.result.result.isError,undefined,JSON.stringify(apply));
  }
  return {call,send,cleanup,logs:()=>logs};
 }catch(error){await cleanup();throw error}
}
for(const scenario of ['valid','duplicate','missing-apply','foreign-request','owner','session','opening','epoch','request','deadline','pending','abort','resource','missing-slot','foreign-result','holes','getter','primary-error','primary-undefined','primary-null','primary-false','primary-zero','primary-empty'])test('actual managed/bridge original sibling '+scenario,async()=>{
 const f=await fixture(scenario);
 try{
  const reply=await f.call('dock_node_wait',{operation_id:scenario==='foreign-request'?'foreign':'apply',timeout_ms:1000});
  if(['valid','duplicate'].includes(scenario)){
   assert.equal(reply.error,undefined,JSON.stringify(reply)+' '+f.logs());
   const body=reply.result,env=body.replacementOriginal;assert.ok(env,JSON.stringify(reply));
   assert.equal(env.kind,'replacement-original-reply-v1');assert.equal(env.outcome.kind,'original-pins');assert.deepEqual(env.outcome.result,body.result);
   const p=env.original;assert.equal(p.operation_id,'apply');assert.equal(p.owner,'host');assert.equal(p.run,'run');assert.equal(p.lease,'host:run');assert.equal(p.generation,1);assert.equal(p.chat,'chat');assert.equal(p.session_id,'session');assert.equal(p.account,'account');assert.equal(p.package_path,'/account/original.lgp');
   assert.equal(p.request_sha256,createHash('sha256').update(JSON.stringify(p.request)).digest('hex'));assert.equal(p.native_opening_operation_id,'native-opening');assert.notEqual(p.outer_opening_operation_id,p.native_opening_operation_id);assert.equal(p.opening_epoch,'epoch');assert.ok(p.deadline>Date.now());
   assert.equal('signal' in p,false);assert.equal('admission' in p,false);assert.equal('diagnosticRead' in env.outcome,false);assert.equal('cleanupComplete' in env.outcome,false);assert.equal('replacementOriginal' in body.result,false);
   if(scenario==='duplicate'){const second=await f.call('dock_node_wait',{operation_id:'apply',timeout_ms:1000});assert.ok(second.error);assert.equal(second.result,undefined)}
  }else{assert.ok(reply.error,JSON.stringify(reply)+' '+f.logs());assert.equal(reply.result,undefined);if(scenario.startsWith('primary-'))assert.equal(reply.error,scenario==='primary-error'?'LOGINOM_STORE_READ_FAILED':'LOGINOM_RUNTIME_FAILED')}
  console.log('STOCK_DELIVERY '+JSON.stringify({scenario,reply,native:false,Page_auth_driver:'doubles',managed_bridge_executor_MCP_IPC_FS:'real'}));
 }finally{await f.cleanup()}
},{timeout:30000});
for(const scenario of ['generic-replacement','generic-import'])test(scenario+' wait keeps generic ABI',async()=>{
 const f=await fixture(scenario,null);
 try{const reply=await f.call('dock_node_wait',{operation_id:'apply',timeout_ms:1000});assert.equal(reply.error,undefined,JSON.stringify(reply));assert.equal('replacementOriginal' in reply.result,false);assert.deepEqual(Object.keys(reply.result).sort(),['activeWork','recoveryPending','result']);}finally{await f.cleanup()}
},{timeout:30000});
