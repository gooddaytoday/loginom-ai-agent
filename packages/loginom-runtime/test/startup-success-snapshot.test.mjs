import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {createContext,runInContext} from 'node:vm';
import {createRequire} from 'node:module';
import {loginBrowser} from '../src/connection-check.mjs';

// Actual loginBrowser/static loader/atomic FS writer. Browser/native providers
// are doubles; browser functions execute serialized in a separate VM realm.
const {chromium}=createRequire(new URL('../client/package.json',import.meta.url))('playwright-core');
async function fixture(options,check) {
 const directory=await mkdtemp(join(tmpdir(),'loginom-startup-snapshot-'));
 const page=new EventEmitter(),frame={},context={closed:false,pages:()=>[page],async close(){this.closed=true}};
 const realm=createContext({document:{},location:{origin:'https://fixture.invalid',pathname:'/app/'},
  fetch:()=>{throw Error('unexpected browser fetch')},
  bg:{app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'User',Connected:true},FPackagesParentNode:{}}}}}}}});
 const invoke=(fn,arg)=>runInContext('('+fn.toString()+')',realm)(arg);
 const owner={id:'original',account:'User',origin:'https://fixture.invalid',directory,artifacts:{},
  evidence:{version:1,owner_id:'original',account:'User',origin:'https://fixture.invalid',stages:[]}};
 let routeHandler,closeCalls=0;
 const originalClose=async function(){
  assert.equal(this,owner);closeCalls++;options.onClose?.({owner,context,directory});
  if(Object.hasOwn(options,'closeError'))throw options.closeError;
  await context.close();
 };
 owner.close=originalClose;
 context.addInitScript=async(fn,arg)=>typeof fn==='function'?invoke(fn,arg):runInContext(fn.content,realm);
 page.context=()=>context;page.mainFrame=()=>frame;
 page.route=async(_pattern,fn)=>{routeHandler=fn};page.unroute=async()=>{};
 page.goto=async()=>{
  const request={url:()=>owner.origin+'/app/?testable=true',resourceType:()=> 'document',method:()=> 'GET',frame:()=>frame};
  page.emit('request',request);
  await routeHandler({request:()=>request,continue:async()=>{},abort:async()=>{throw Error('document abort unexpected')}});
  page.emit('requestfinished',request);
 };
 const locator={or(){return this},first(){return this},async waitFor(){},async isVisible(){return true}};
 page.locator=()=>locator;page.evaluate=async(fn,arg)=>invoke(fn,arg);
 page.waitForFunction=(fn,arg)=>({then(resolve,reject){
  try {
   assert.equal(invoke(fn,arg),true);resolve();
   // Fulfill the final provider first: loginPage finishes its own page check,
   // then this mutation runs before its caller's success continuation.
   queueMicrotask(()=>{
    if(options.blockDirectory)owner.directory=join(directory,'not-a-directory');
    if(Object.hasOwn(options,'serializationError'))owner.evidence.toJSON=()=>{throw options.serializationError};
    options.afterLogin?.({owner,page,context});
   });
  }catch(error){reject(error)}
 }});
 if(options.blockDirectory)await writeFile(join(directory,'not-a-directory'),'occupied');
 const originalLaunch=chromium.launchPersistentContext;
 chromium.launchPersistentContext=async()=>context;
 try {
  await check({owner,page,context,directory,closeCalls:()=>closeCalls,
   run:keepOpen=>loginBrowser({browserPath:join(directory,'browser-double'),profile:join(directory,'profile'),candidate:{url:owner.origin+'/app/',username:'User',password:''},headless:true,keepOpen,owner})});
 }finally{chromium.launchPersistentContext=originalLaunch;await context.close();await rm(directory,{recursive:true,force:true})}
}

async function assertOnlyPhaseSnapshot(directory) {
 const data=JSON.parse(await readFile(join(directory,'startup-cleanup.json'),'utf8'));
 assert.equal(data.owner_id,'original');
 assert.ok(data.startup_phases.createStartupStaticLoader.settled_at);
 assert.equal(data.goto,undefined);assert.equal(data.startup_diagnostics,undefined);
 assert.equal(data.cleanup_complete,undefined);
}

test('successful keepOpen snapshot is durable0600 while original context stays open, without cleanup authority',async()=>{
 await fixture({},async f=>{
  const result=await f.run(true);assert.equal(result.context,f.context);assert.equal(f.context.closed,false);assert.equal(f.closeCalls(),0);
  const path=join(f.directory,'startup-cleanup.json'),data=JSON.parse(await readFile(path,'utf8'));
  assert.equal((await stat(path)).mode&0o777,0o600);assert.equal(data.cleanup_complete,undefined);assert.equal(data.close_authority,undefined);
  assert.equal(Number.isFinite(Date.parse(data.startup_diagnostics.started_at)),true);
  const document=data.startup_diagnostics.requests.find(r=>r.pathname==='/app/');assert.equal(Number.isFinite(Date.parse(document.started_at)),true);
  const first=data.startup_static_loader.first_route;assert.deepEqual(Object.keys(first).sort(),['continued_at','eligible','entered_at','resource_type']);
  assert.equal(first.resource_type,'document');assert.equal(first.eligible,false);assert.equal(Number.isFinite(Date.parse(first.entered_at)),true);assert.equal(Number.isFinite(Date.parse(first.continued_at)),true);
 });
});

for(const key of ['id','account','origin','context','page'])test('keepOpen '+key+' drift after login success refuses publication and invokes original close once',async()=>{
 await fixture({afterLogin:({owner})=>{owner[key]=['context','page'].includes(key)?{}:'foreign';owner.close=()=>{throw Error('substituted close must not run')}}},async f=>{
  await assert.rejects(f.run(true),e=>e.message==='LOGINOM_STARTUP_OWNER_CHANGED');
  await assertOnlyPhaseSnapshot(f.directory);assert.equal(f.closeCalls(),1);
 });
});

test('owner drift during snapshot serialization is rejected before atomic publication',async()=>{
 await fixture({afterLogin:({owner})=>{
  const loader=owner.evidence.startup_static_loader;
  loader.toJSON=()=>{owner.id='foreign';return {version:loader.version,reads:loader.reads,first_route:loader.first_route,stopped:loader.stopped}};
 }},async f=>{
  await assert.rejects(f.run(true),e=>e.message==='LOGINOM_STARTUP_OWNER_CHANGED');
  await assertOnlyPhaseSnapshot(f.directory);assert.equal(f.closeCalls(),1);
 });
});

test('real FS persistence refusal never returns ready or wraps the first error as login unavailable',async()=>{
 const secondary=Error('close secondary');
 await fixture({blockDirectory:true,closeError:secondary},async f=>{
  let caught;
  try{await f.run(true)}catch(error){caught=error}
  assert.ok(caught);assert.equal(caught.code,'ENOTDIR');assert.notEqual(caught.message,'LOGINOM_LOGIN_UNAVAILABLE');
  assert.equal(f.owner.primaryFailure,caught);assert.equal(f.owner.cleanupFailure,secondary);assert.equal(f.closeCalls(),1);
 });
});

for(const first of [Error('snapshot first',{cause:Error('original cause')}),undefined,null,false,0,''])test('snapshot rejection preserves original '+String(first)+' independently of close refusal',async()=>{
 const secondary=Error('close secondary');
 await fixture({serializationError:first,closeError:secondary},async f=>{
  let caught=false,value;try{await f.run(true)}catch(error){caught=true;value=error}
  assert.equal(caught,true);assert.equal(value,first);assert.equal(f.owner.primaryFailure,first);assert.equal(f.owner.cleanupFailure,secondary);assert.equal(f.closeCalls(),1);
  await assertOnlyPhaseSnapshot(f.directory);
 });
});

test('non-keepOpen branch delegates to existing close without a success snapshot',async()=>{
 await fixture({onClose:({owner})=>{assert.equal(owner.evidence.persistence_attempts,undefined)}},async f=>{
  const result=await f.run(false);assert.deepEqual(result,{authenticated:true});assert.equal(f.closeCalls(),1);
  await assertOnlyPhaseSnapshot(f.directory);
 });
});
