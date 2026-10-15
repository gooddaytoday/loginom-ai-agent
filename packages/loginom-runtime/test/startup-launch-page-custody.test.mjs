import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import vm from 'node:vm';
const source=process.env.STARTUP_SOURCE??new URL('../src/connection-check.mjs',import.meta.url).pathname;
const serial=v=>v instanceof Error?{kind:'Error',name:v.name,message:v.message,...('cause'in v?{cause:serial(v.cause)}:{})}:{kind:'value',value:v===undefined?null:v,is_undefined:v===undefined};
// Actual serialized loginBrowser/startupOwner.close/atomic writer + real FS.
// Only the launch/Page/context/loader providers are doubles. No close override.
async function run(scenario,writerFailure,check){
 const directory=await fs.mkdtemp(join(tmpdir(),'startup-page-custody-'));
 const owner={directory,artifacts:{}},calls={launch:0,evaluate:0,contextClose:0,newPage:0,addInitScript:0,loader:0};
 const realm=vm.createContext({document:{querySelectorAll:()=>[],title:'',readyState:'complete'},
  location:scenario==='foreign-document'?{href:'https://foreign.invalid/app/',origin:'https://foreign.invalid',pathname:'/app/'}:{href:'about:blank',origin:'null',pathname:'blank'}});
 const page={evaluate:async(fn,input)=>{calls.evaluate++;return vm.runInContext('('+fn.toString()+')',realm)(input)}};
 let pageReads=0;
 const context={pages:()=>{
  pageReads++;
  if(scenario==='empty')return [];
  if(scenario==='multiple')return [page,{}];
  if(scenario==='replaced'&&pageReads>1)return [{}];
  return [page];
 },close:async()=>{calls.contextClose++},newPage:async()=>{calls.newPage++;throw Error('newPage prohibited')},addInitScript:async()=>{calls.addInitScript++}};
 let faulted=false;
 const open=async(path,flags,mode)=>{
  const fd=await fs.open(path,flags,mode);return {async writeFile(bytes){
   if(!faulted&&JSON.parse(bytes).startup_phases?.launchPersistentContext?.settled_at){faulted=true;throw writerFailure}
   return fd.writeFile(bytes);
  },sync:()=>fd.sync(),close:()=>fd.close()};
 };
 try{
  const tail=(await fs.readFile(source,'utf8')).split('export function browserEnvironment')[1];
  const {loginBrowser}=vm.runInNewContext('function browserEnvironment'+tail.replaceAll('export ','')+';({loginBrowser})',{
   ...fs,open,constants,join,dirname,randomUUID,createHash,URL,process,Error,runtimeModulePath:source,
   require:()=>({chromium:{launchPersistentContext:async()=>{calls.launch++;return context}}}),
   browserLaunch:()=>({args:[],viewport:{width:1280,height:800}}),browserDownloadScript:()=>'',
   createStartupStaticLoader:async()=>{calls.loader++;throw Error('loader prohibited')}
  });
  let caught=false,failure;try{await loginBrowser({browserPath:'browser-double',profile:join(directory,'profile'),candidate:{url:'https://own.invalid',username:'own',password:''},headless:true,keepOpen:true,owner})}catch(error){caught=true;failure=error}
  assert.equal(caught,true);assert.equal(faulted,true);assert.equal(failure.cause,writerFailure);assert.equal(owner.primaryFailure,writerFailure);assert.equal(owner.context,context);
  assert.equal(calls.launch,1);assert.equal(calls.newPage,0);assert.equal(calls.addInitScript,0);assert.equal(calls.loader,0);
  const saved=JSON.parse(await fs.readFile(join(directory,'startup-cleanup.json'),'utf8'));
  assert.deepEqual(saved.primary_rejection,serial(writerFailure));assert.deepEqual(saved.persistence_failure,serial(writerFailure));assert.ok(saved.startup_phases.launchPersistentContext.settled_at);
  await check({owner,page,calls,saved,failure});
 }finally{await fs.rm(directory,{recursive:true,force:true})}
}
for(const primary of [Error('settlement refused',{cause:false}),undefined,null,false,0,''])
 test('own blank page remains closeable after settlement-writer refusal '+String(primary),async()=>run('own-blank',primary,async f=>{
  assert.equal(f.owner.page,f.page);assert.equal(f.calls.evaluate,1);assert.equal(f.calls.contextClose,1);
  assert.equal(f.owner.cleanupFailure,undefined);assert.equal(f.saved.cleanup_complete,true);
  assert.deepEqual(f.saved.native,{logged_out:false,unauthenticated:true});
  assert.equal(f.owner.closed,true);assert.equal(f.owner.receipt.context_closed,true);
  assert.equal(f.saved.close_authority,undefined);
 }));
for(const scenario of ['empty','multiple','replaced','foreign-document'])
 test('settlement-writer refusal remains fail-closed for '+scenario,async()=>run(scenario,Error('writer primary',{cause:0}),async f=>{
  assert.equal(f.saved.cleanup_complete,false);assert.equal(f.calls.contextClose,0);assert.notEqual(f.owner.closed,true);
  assert.equal(f.saved.cleanup_rejection.message,scenario==='foreign-document'?'LOGINOM_STARTUP_CLEANUP_BLOCKED':'LOGINOM_STARTUP_PAGE_CHANGED');
  assert.equal(f.calls.evaluate,scenario==='foreign-document'?1:0);
 }));
