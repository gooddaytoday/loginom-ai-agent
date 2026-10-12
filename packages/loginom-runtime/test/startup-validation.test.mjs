import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdir,writeFile,mkdtemp,rm,rename} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
const path=process.env.STARTUP_SOURCE??new URL('../src/connection-check.mjs',import.meta.url);
const source=await readFile(path,'utf8');
const code=source.slice(source.indexOf('export function browserEnvironment')).replaceAll('export ','');
const managed=await readFile(process.env.STARTUP_MANAGED??new URL('../src/managed-entry.mjs',import.meta.url),'utf8');
const managedCode=managed.slice(managed.indexOf('function closeRejection('),managed.indexOf('const stop ='));
const values=[Error('original startup refusal'),undefined,null,false,0,''];
function fixture(directory,phase,rejected){
 const events=[],document={querySelectorAll:()=>[]},connection={Connected:false,UserName:'user'};
 const pageState=vm.createContext({document,location:{href:'about:blank',origin:'null'},getComputedStyle:()=>({visibility:'visible'}),Error});
 const native=()=>{pageState.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:connection,PackageNodes:{Count:phase==='packages'?1:0},HasRunningNodes:()=>false}}}}}}};
 const owner={directory};let logout=0,contextClose=0;
 const page={
  async goto(){events.push('goto');if(phase==='goto')throw rejected;pageState.location={href:'https://loginom.invalid/app',origin:'https://loginom.invalid'};native()},
  async evaluate(fn,arg){
   if(fn.toString().includes('?? null') && ['identity','identity-write'].includes(phase)){
    if(phase==='identity-write')await mkdir(join(directory,'startup-cleanup.json'));
    throw rejected;
   }
   return vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',pageState);
  },
  locator(selector){
   const avatar=selector.includes('btnAvatar'),logoutButton=selector.includes('btnLogOut'),loginButton=selector.includes('btnLogin');
   return {locator(){return this},or(){return this},first(){return this},fill:async()=>{},inputValue:async()=>'',innerText:async()=>connection.UserName,
    async isVisible(){return avatar?connection.Connected:true},
    async waitFor(){if(phase==='login-reply'&&avatar)throw rejected},
    async click(){if(loginButton){events.push('login');connection.Connected=true;if(phase==='mismatch')connection.UserName='foreign'}
     if(logoutButton){events.push('native-logout');logout++;if(phase==='logout')throw rejected;connection.Connected=false;if(phase==='lost-reply')throw rejected}}
   };
  }
 };
 const context={pages:()=>phase==='page'?[]:[page],newPage:async()=>{if(phase==='page')throw rejected;return page},
  async addInitScript(){events.push('init');this.inspect?.();if(phase==='init')throw rejected},
  async close(){events.push('context-close');contextClose++;const proof=JSON.parse(await readFile(join(directory,'startup-cleanup.json'),'utf8'));
   assert.ok(proof.native.logged_out||proof.native.unauthenticated);if(phase==='context')throw rejected;
   if(phase==='context-write'){await rename(join(directory,'startup-cleanup.json'),join(directory,'startup-cleanup.prior'));await mkdir(join(directory,'startup-cleanup.json'))}}
 };
 class Client {async connect(){events.push('knowledge');if(phase==='knowledge')throw rejected}async close(){events.push('knowledge-close');if(phase==='knowledge-close')throw rejected}}
 const require=name=>{if(phase==='require'||phase==='knowledge-require')throw rejected;return name==='playwright-core'?{chromium:{async launchPersistentContext(){events.push('launch');if(phase==='launch')throw rejected;return context}}}:
  name.includes('streamableHttp')?{StreamableHTTPClientTransport:class{}}:{Client}};
 const functions=vm.runInNewContext(code+';({loginBrowser,checkConnection})',{require,mkdir,writeFile,readFile,createHash,runtimeModulePath:path instanceof URL?path.pathname:path,join,dirname,randomUUID,URL,process,Error,
  browserLaunch:()=>({args:[],viewport:{}}),browserDownloadScript:()=>''});
 const options={profile:directory,browserPath:'/fixture',candidate:{url:'https://loginom.invalid/app',username:'user',password:'',apiKey:'fixture'},endpoint:'https://knowledge.invalid',owner};
 return {owner,options,functions,events,context,page,logout:()=>logout,contextClose:()=>contextClose};
}
test('ordinary validation: actual checkConnection/loginPage/cleanup, native receipt before context exit',async()=>{
 const root=await mkdtemp(join(tmpdir(),'startup-normal-'));const f=fixture(root);
 try{assert.equal((await f.functions.checkConnection(f.options)).authenticated,true);assert.equal(f.logout(),1);assert.equal(f.contextClose(),1);
  assert.equal(f.owner.receipt.cleanup_complete,true);assert.ok(f.events.indexOf('native-logout')<f.events.indexOf('context-close'))}
 finally{await rm(root,{recursive:true,force:true})}
});
for(const phase of ['require','knowledge-require','launch','page','init','goto','identity','login-reply','logout','lost-reply','context','knowledge','knowledge-close'])for(const rejected of values)
 test('startup preserves '+phase+' '+String(rejected),async()=>{
 const root=await mkdtemp(join(tmpdir(),'startup-refusal-'));const f=fixture(root,phase,rejected);
 try{
  let caught,failed=false;try{await (phase==='require'?f.functions.loginBrowser(f.options):f.functions.checkConnection(f.options))}catch(error){caught=error;failed=true}
  assert.equal(failed,true); // Includes undefined/falsy, never truthiness.
  const original=Object.hasOwn(caught,'cause')?caught.cause:caught;
  const unwrap=value=>{while(value!==rejected&&value instanceof Error&&Object.hasOwn(value,'cause'))value=value.cause;return value};
  assert.equal(unwrap(original),rejected);assert.equal(unwrap(f.owner.primaryFailure),rejected);
  if(['goto','logout','lost-reply'].includes(phase))assert.equal(f.contextClose(),0);
  if(['launch','knowledge','knowledge-close'].includes(phase))assert.equal(f.logout(),0);
  if(['init','identity'].includes(phase))assert.equal(f.owner.receipt.cleanup_complete,true);
  if(['logout','lost-reply','context','knowledge-close'].includes(phase)){
   const before=f.logout();await assert.rejects(f.owner.close());assert.equal(f.logout(),before);
  }
 }finally{await rm(root,{recursive:true,force:true})}
});
for(const rejected of values)test('primary survives evidence failure and confirmed native retry '+String(rejected),async()=>{
 const root=await mkdtemp(join(tmpdir(),'startup-write-'));const f=fixture(root,'identity-write',rejected);
 try{
  let caught;try{await f.functions.loginBrowser(f.options)}catch(error){caught=error}
  assert.equal(caught.cause,rejected);assert.equal(f.owner.primaryFailure,rejected);assert.equal(f.logout(),0);assert.equal(f.contextClose(),0);
  assert.equal(f.owner.evidence.persistence_failure.kind,'Error');await rename(join(root,'startup-cleanup.json'),join(root,'failed-write'));
  assert.equal((await f.owner.close()).cleanup_complete,true);assert.equal(f.logout(),1);assert.equal(f.contextClose(),1);
  const proof=JSON.parse(await readFile(join(root,'startup-cleanup.json'),'utf8'));assert.ok(Object.hasOwn(proof,'primary_rejection'));
 }finally{await rm(root,{recursive:true,force:true})}
});
for(const phase of ['mismatch','packages'])test('startup forbids foreign account/package close '+phase,async()=>{
 const root=await mkdtemp(join(tmpdir(),'startup-guard-'));const f=fixture(root,phase);
 try{await assert.rejects(f.functions.checkConnection(f.options));assert.equal(f.logout(),0);assert.equal(f.contextClose(),0)}
 finally{await rm(root,{recursive:true,force:true})}
});
test('managed close recovers exact pre-binding owner; unknown refuses acknowledgement',async()=>{
 for(const phase of ['identity','lost-reply']){
  const root=await mkdtemp(join(tmpdir(),'startup-managed-'));const f=fixture(root,phase,0);
  try{
   await assert.rejects(f.functions.checkConnection(f.options));
   const state={startupOwner:f.owner,browser:f.context,session:{directory:root}};
   const actual=vm.runInNewContext(managedCode+';({close})',{state,requests:new Set(),writeFile,join,rm,Promise,Error});
   if(phase==='identity'){await actual.close();assert.equal(state.browser,undefined);assert.equal(state.shutdown.stages.at(-1).status,'allowed')}
   else{await assert.rejects(actual.close());assert.notEqual(state.shutdown.stages.at(-1).status,'allowed');assert.equal(f.contextClose(),0)}
   assert.equal(f.logout(),1);
  }finally{await rm(root,{recursive:true,force:true})}
 }
});
for(const validation of [true,false])for(const phase of [undefined,'init','goto'])
 test('actual managed startup assigns owner before await: validation='+validation+' phase='+phase,async()=>{
 const root=await mkdtemp(join(tmpdir(),'startup-entry-'));const f=fixture(root,phase,0),state={},replies=[];
 const start=managed.slice(managed.indexOf('state.startupOwner={directory,'),managed.indexOf('      const config =',managed.indexOf('state.startupOwner={directory,')));
 f.context.inspect=()=>assert.equal(state.startupOwner.context,f.context);
 const run=vm.runInNewContext('(async()=>{'+start+'})',{
  state,directory:root,browserProfile:root,resources:{browserPath:'/fixture'},input:{connection:f.options.candidate,endpoint:f.options.endpoint,validation},
  message:{id:'original'},send:reply=>replies.push(reply),checkConnection:f.functions.checkConnection,loginBrowser:f.functions.loginBrowser});
 try{
  if(phase){await assert.rejects(run());assert.equal(state.startupOwner.context,f.context);if(phase==='goto')assert.equal(f.contextClose(),0)}
  else{await run();if(validation){assert.equal(replies[0].result.checked,true);assert.equal(state.startupOwner.closed,true)}
   else{assert.equal(state.browser,f.context);assert.equal(f.contextClose(),0);await state.startupOwner.close()}}
 }finally{await rm(root,{recursive:true,force:true})}
});
test('confirmed native/context results survive final receipt failure without replay',async()=>{
 const root=await mkdtemp(join(tmpdir(),'startup-final-write-'));const f=fixture(root,'context-write');
 try{
  await assert.rejects(f.functions.checkConnection(f.options));assert.equal(f.owner.closed,undefined);
  assert.equal(f.logout(),1);assert.equal(f.contextClose(),1);
  await rename(join(root,'startup-cleanup.json'),join(root,'failed-final-write'));
  assert.equal((await f.owner.close()).cleanup_complete,true);assert.equal(f.logout(),1);assert.equal(f.contextClose(),1);
 }finally{await rm(root,{recursive:true,force:true})}
});

function serial(value) {
 return value instanceof Error ? {kind:'Error',name:value.name,message:value.message,
  ...('cause' in value?{cause:serial(value.cause)}:{})} :
  {kind:'value',value:value===undefined?null:value,is_undefined:value===undefined};
}
function contains(tree, wanted) {
 if(tree && typeof tree==='object') {
  if(JSON.stringify(tree)===JSON.stringify(wanted)) return true;
  return Object.values(tree).some(value=>contains(value,wanted));
 }
 return false;
}
for(const [label,native] of [['Error',Error('independent native refusal')],['undefined',undefined],['null',null],['false',false],['zero',0],['empty','']])
 for(const blocked of [false,true]) test('independent linked authentication/native refusal survives managed retry: '+label+' writeBlocked='+blocked,async()=>{
  const root=await mkdtemp(join(tmpdir(),'review-startup-linked-'));
  const authentication=Error('independent authentication refusal');
  const f=fixture(root,'identity',authentication);
  const locator=f.page.locator.bind(f.page);
  let nativeCalls=0;
  f.page.locator=selector=>{
   const handle=locator(selector);
   if(selector.includes('btnLogOut'))handle.click=async()=>{
    nativeCalls++;
    if(blocked) {
     await rename(join(root,'startup-cleanup.json'),join(root,'before-native-refusal.json'));
     await mkdir(join(root,'startup-cleanup.json'));
    }
    throw native;
   };
   return handle;
  };
  let caller;
  try{await f.functions.checkConnection(f.options)}catch(error){caller=error}
  assert.equal(caller.cause,authentication);
  assert.equal(f.owner.primaryFailure,authentication);
  const before=structuredClone(f.owner.evidence);
  assert.ok(contains(before,serial(native)),'first native rejection must be present');
  if(blocked)await rename(join(root,'startup-cleanup.json'),join(root,'failed-evidence-write'));
  const state={startupOwner:f.owner,browser:f.context,session:{directory:root}};
  const close=vm.runInNewContext(managedCode+';({close})',{state,requests:new Set(),writeFile,join,rm,Promise,Error}).close;
  let managedFailure;
  try{await close()}catch(error){managedFailure=error}
  assert.ok(managedFailure instanceof Error);
  assert.equal(managedFailure.cause,native);
  assert.equal(f.owner.cleanupFailure,native);
  assert.equal(f.owner.nativeFailure.value,native);
  assert.equal(f.owner.nativeFailure.stage,'native_logout');
  assert.deepEqual(structuredClone(f.owner.evidence.native_failure),before.native_failure);
  assert.equal(state.shutdown.stages.some(stage=>stage.status==='allowed'),false);
  assert.equal(nativeCalls,1,'unknown native effect must never be replayed');
  assert.equal(f.contextClose(),0,'context must remain retained');
  assert.equal(state.browser,f.context,'original context remains with foreground owner');
  assert.equal(f.owner.primaryFailure,authentication);
  const durable=JSON.parse(await readFile(join(root,'startup-cleanup.json'),'utf8'));
  assert.equal(durable.cleanup_complete,false);
  const evidence={label,writeBlocked:blocked,fixture:true,production:process.env.STARTUP_SOURCE,
   before,after:durable,caller:serial(caller),managed:serial(managedFailure),nativeCalls,contextCalls:f.contextClose()};
  if(process.env.REVIEW_RESULTS)await writeFile(join(process.env.REVIEW_RESULTS,label+'-'+blocked+'.json'),JSON.stringify(evidence,null,2)+'\n');
  try {
   assert.ok(contains(durable,serial(native)), 'durable retry must retain original native rejection separately from authentication/unknown/persistence failures');
  } finally {await rm(root,{recursive:true,force:true})}
 });
