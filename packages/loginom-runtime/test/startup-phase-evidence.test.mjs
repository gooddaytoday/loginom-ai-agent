import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import vm from 'node:vm';
const names=['launchPersistentContext','addInitScript','createStartupStaticLoader'];
const source=new URL('../src/connection-check.mjs',import.meta.url);
const serial=v=>v instanceof Error?{kind:'Error',name:v.name,message:v.message,...('cause'in v?{cause:serial(v.cause)}:{})}:{kind:'value',value:v===undefined?null:v,is_undefined:v===undefined};
async function fixture(options,check){
 const directory=await fs.mkdtemp(join(tmpdir(),'loginom-phase-'));const calls=Object.fromEntries([...names,'goto','close'].map(n=>[n,0]));
 const owner={id:'original',account:'own',origin:'https://own.invalid',directory,artifacts:{},deadline:Date.now()+25000,evidence:{stages:[]},close:async()=>{calls.close++}};
 const deadline=owner.deadline;let release,enteredResolve;const entered=new Promise(r=>enteredResolve=r),pending=new Promise(r=>release=r);let writerFaulted=false;
 const read=async()=>JSON.parse(await fs.readFile(join(directory,'startup-cleanup.json'),'utf8'));
 const operation=async(name,value)=>{calls[name]++;assert.equal(owner.deadline,deadline);enteredResolve();
  const saved=await read();assert.equal(saved.startup_phases[name].settled_at,null);
  if(options.phase===name){if(options.pending)await pending;if(Object.hasOwn(options,'rejection'))throw options.rejection}
  return value;
 };
 const page={};let evals=0;
 page.goto=async()=>{calls.goto++};page.evaluate=async()=>++evals===1?undefined:'own';page.waitForFunction=async()=>{};
 page.locator=()=>({or(){return this},first(){return this},waitFor:async()=>{},isVisible:async()=>true});
 const context={pages:()=>[page],addInitScript:async input=>{assert.deepEqual(Object.keys(input),['content']);return operation('addInitScript') }};
 const chromium={launchPersistentContext:async(profile,args)=>{
  assert.equal(profile,join(directory,'profile'));assert.equal(args.chromiumSandbox,true);assert.equal(args.headless,true);assert.equal(args.executablePath,'browser-double');assert.ok(args.args.includes('--no-proxy-server'));
  return operation('launchPersistentContext',context);
 }};
 const open=async(path,flags,mode)=>{const fd=await fs.open(path,flags,mode);return {async writeFile(bytes){
  const data=JSON.parse(bytes),phase=data.startup_phases?.[options.phase];
  const at=phase?.rejection?'rejected':phase?.settled_at?'settled':'entry';
  if(!writerFaulted&&options.writerAt===at&&phase){writerFaulted=true;throw options.writerError}
  return fd.writeFile(bytes);
 },sync:()=>fd.sync(),close:()=>fd.close()}};
 const code=(await fs.readFile(source,'utf8')).split('export function browserEnvironment')[1];
 const functions=vm.runInNewContext('function browserEnvironment'+code.replaceAll('export ','')+';({loginBrowser})',{
  ...fs,open,constants,join,dirname,randomUUID,createHash,URL,process,Error,runtimeModulePath:source.pathname,
  require:()=>({chromium}),browserLaunch:()=>({args:[],viewport:{width:1280,height:800}}),browserDownloadScript:()=>'',
  createStartupStaticLoader:async(p,c,o,expires)=>{assert.equal(p,page);assert.equal(c,context);assert.equal(o,owner);assert.equal(expires,deadline);return operation('createStartupStaticLoader',{evidence:{},stop:async()=>{}})}
 });
 try{await check({owner,calls,read,entered,release,writerFaulted:()=>writerFaulted,
  run:()=>functions.loginBrowser({browserPath:'browser-double',profile:join(directory,'profile'),candidate:{url:owner.origin,username:'own',password:''},headless:true,keepOpen:true,owner})})}
 finally{release();await fs.rm(directory,{recursive:true,force:true})}
}
function followingAreZero(calls,name){for(const next of names.slice(names.indexOf(name)+1))assert.equal(calls[next],0);assert.equal(calls.goto,0)}
async function caught(run){try{return {ok:true,value:await run()}}catch(error){return {ok:false,value:error}}}
for(const phase of names){
 test(phase+' pending durable entry; no following operation, then successful settlement',async()=>fixture({phase,pending:true},async f=>{
  const run=f.run();while(!f.calls[phase])await new Promise(r=>setImmediate(r));
  const data=await f.read();assert.ok(Date.parse(data.startup_phases[phase].entered_at));assert.equal(data.startup_phases[phase].settled_at,null);assert.equal(data.startup_phases[phase].rejection,undefined);followingAreZero(f.calls,phase);
  f.release();const result=await run;assert.equal(result.context,f.owner.context);assert.equal(f.calls.close,0);
  const final=await f.read();for(const name of names){assert.equal(f.calls[name],1);assert.ok(Date.parse(final.startup_phases[name].settled_at));assert.equal(final.startup_phases[name].rejection,undefined)}
  assert.equal(final.cleanup_complete,undefined);assert.equal(final.close_authority,undefined);assert.equal(f.calls.goto,1);
 }));
 for(const rejection of [Error('native first',{cause:Error('cause')}),undefined,null,false,0,''])
 for(const secondaryWriter of [false,true])
 test(phase+' rejection '+String(rejection)+' secondary writer '+secondaryWriter,async()=>fixture({phase,rejection,...(secondaryWriter?{writerAt:'rejected',writerError:Error('secondary writer')}:{})},async f=>{
  const r=await caught(f.run);assert.equal(r.ok,false);assert.equal(r.value.cause,rejection);assert.equal(f.owner.primaryFailure,rejection);assert.equal(f.calls[phase],1);followingAreZero(f.calls,phase);assert.equal(f.calls.close,1);
  const data=await f.read(),saved=data.startup_phases[phase];assert.equal(saved.settled_at,null);assert.ok(Date.parse(saved.rejected_at));assert.deepEqual(saved.rejection,serial(rejection));assert.equal(data.cleanup_complete,undefined);
  if(secondaryWriter)assert.equal(data.persistence_failure.message,'secondary writer');
 }));
 for(const writerAt of ['entry','settled','rejected'])test(phase+' writer refusal '+writerAt,async()=>{
  const writerError=Error('writer first',{cause:false}),nativeError=Error('native primary',{cause:0});
  await fixture({phase,writerAt,writerError,...(writerAt==='rejected'?{rejection:nativeError}:{})},async f=>{
   const r=await caught(f.run);assert.equal(r.ok,false);assert.equal(r.value.cause,writerAt==='rejected'?nativeError:writerError);assert.equal(f.owner.primaryFailure,writerAt==='rejected'?nativeError:writerError);assert.equal(f.writerFaulted(),true);
   assert.equal(f.calls[phase],writerAt==='entry'?0:1);followingAreZero(f.calls,phase);assert.equal(f.calls.close,1);
   if(phase==='launchPersistentContext'&&writerAt==='settled')assert.ok(f.owner.context,'context custody captured before settlement writer');
   const data=await f.read();assert.equal(data.cleanup_complete,undefined);assert.equal(data.persistence_failure.message,'writer first');
  });
 });
}
