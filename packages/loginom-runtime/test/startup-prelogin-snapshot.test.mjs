import {constants} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {open,unlink,readFile,writeFile,mkdir,mkdtemp,rm,rename} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
const path=process.env.STARTUP_SOURCE??new URL('../src/connection-check.mjs',import.meta.url);
const source=await readFile(path,'utf8');
const code=source.slice(source.indexOf('export function browserEnvironment')).replaceAll('export ','');
const timeout=Error('locator.waitFor: Timeout 60000ms exceeded');timeout.name='TimeoutError';
async function fixture(primary,{blocked=false,dialogs=false,loginVisible=false}={}) {
 const directory=await mkdtemp(join(tmpdir(),'prelogin-snapshot-'));
 const owner={directory,artifacts:{fixture:true}},events=[];
 const document={querySelectorAll:()=>dialogs?[{getBoundingClientRect:()=>({width:1,height:1})}]:[]};
 const state=vm.createContext({document,location:{href:'about:blank',origin:'null'},Error,getComputedStyle:()=>({visibility:'visible'})});
 const page={
  goto:async()=>{state.location={href:'https://own.invalid/app/',origin:'https://own.invalid'};
   state.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{Connected:false}}}}}}}},
  evaluate:async(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',state),
  locator:selector=>({or(){return this},first(){return this},locator(){return this},
   waitFor:async()=>{throw primary},isVisible:async()=>selector.includes('LoginForm')&&loginVisible,
   click:async()=>{events.push('native');throw Error('unexpected native gesture')}})
 };
 const context={pages:()=>[page],addInitScript:async()=>{},close:async()=>{
  const evidence=JSON.parse(await readFile(join(directory,'startup-cleanup.json'),'utf8'));
  assert.equal(evidence.native.unauthenticated,true);events.push('context-close')}};
 const require=()=>({chromium:{launchPersistentContext:async()=>context}});
 const {loginBrowser}=vm.runInNewContext(code+';({loginBrowser})',{require,mkdir,open,rename,unlink,constants,writeFile,readFile,createHash,runtimeModulePath:String(path),join,dirname,randomUUID,URL,process,Error,setTimeout,clearTimeout,AbortController,
  browserLaunch:()=>({args:[],viewport:{}}),browserDownloadScript:()=>''});
 if(blocked)await mkdir(join(directory,'startup-cleanup.json'));
 let failure;try{await loginBrowser({profile:directory,browserPath:'/fixture',candidate:{url:'https://own.invalid/app/',username:'own',password:''},owner})}catch(e){failure=e}
 return {owner,context,page,events,directory,failure,dispose:()=>rm(directory,{recursive:true,force:true})};
}
for(const [label,primary] of [['TimeoutError',timeout],['undefined',undefined],['null',null],['false',false],['zero',0],['empty','']])for(const blocked of [false,true])
 test('actual prelogin owner: exact '+label+' writeBlocked='+blocked,async()=>{
 const f=await fixture(primary,{blocked});
 try {
  assert.equal(f.failure.message,'LOGINOM_LOGIN_UNAVAILABLE');assert.equal(f.failure.cause,primary);
  assert.equal(f.owner.primaryFailure,primary);assert.equal(f.owner.loginSubmitted,undefined);
  const initial=JSON.stringify(f.owner.evidence.first_guard);
  const s=f.owner.evidence.first_guard;
  assert.equal(s.result.reason,'LOGIN_EFFECT_UNKNOWN');assert.equal(s.result.authenticated,false);
  assert.equal(s.count.type,'undefined');assert.equal(s.count.is_undefined,true);
  assert.equal(s.running.type,'undefined');assert.equal(s.running.is_undefined,true);
  assert.equal(s.identity_matches,false);assert.equal(s.connected.value,false);assert.equal(s.build.value,'7.4.2');
  assert.equal(s.package_parent_ready,false);assert.equal(s.dialogs.visible,false);
  assert.equal(s.deadline,null);assert.equal(s.deadline_available,false);
  assert.equal(f.owner.evidence.cleanup_complete,false);assert.equal(f.owner.evidence.effect_possible,false);
  assert.equal(f.owner.context,f.context);assert.equal(f.owner.page,f.page);assert.deepEqual(f.events,[]);
  if(blocked){assert.ok(f.owner.evidence.persistence_failure);assert.ok(f.owner.evidence.guard_persistence_failure);
   await rename(join(f.directory,'startup-cleanup.json'),join(f.directory,'failed-evidence'))}
  await assert.rejects(f.owner.close(),e=>e.message==='LOGINOM_STARTUP_CLEANUP_BLOCKED'&&e.cause.reason==='LOGIN_EFFECT_UNKNOWN');
  assert.equal(JSON.stringify(f.owner.evidence.first_guard),initial);assert.equal(f.owner.primaryFailure,primary);
  const durable=JSON.parse(await readFile(join(f.directory,'startup-cleanup.json'),'utf8'));
  assert.equal(JSON.stringify(durable.first_guard),initial);assert.equal(durable.cleanup_complete,false);
  assert.ok(Object.hasOwn(durable,'primary_rejection'));assert.deepEqual(f.events,[]);
 }finally{await f.dispose()}
});
for(const blocked of [false,true])test('first visible dialog is durable before retry; not inferred from later DOM',async()=>{
 const f=await fixture(timeout,{dialogs:true,blocked});
 try{
  assert.equal(f.owner.evidence.first_guard.result.reason,'STARTUP_OPERATION_OPEN');
  assert.equal(f.owner.evidence.first_guard.dialogs.visible,true);
  if(blocked)await rename(join(f.directory,'startup-cleanup.json'),join(f.directory,'failed-evidence'));
  await assert.rejects(f.owner.close());assert.deepEqual(f.events,[]);assert.equal(f.owner.primaryFailure,timeout);
 }finally{await f.dispose()}
});
test('visible own login form enables ordinary unauthenticated cleanup, never claims native logout',async()=>{
 const f=await fixture(timeout,{loginVisible:true});
 try{
  assert.equal(f.failure.cause,timeout);assert.equal(f.owner.receipt.cleanup_complete,true);
  assert.equal(f.owner.receipt.unauthenticated,true);assert.equal(f.owner.receipt.logged_out,false);
  assert.deepEqual(f.events,['context-close']);assert.equal(f.owner.evidence.first_guard.result.reason,'LOGIN_EFFECT_UNKNOWN');
 }finally{await f.dispose()}
});
