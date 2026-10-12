import {constants} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {open,unlink,readFile,mkdir,writeFile,mkdtemp,rm,rename} from 'node:fs/promises';
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
   if(fn.toString().includes('const documentMatches=')){events.push('guard-read');await page.onGuard?.();const result=vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',pageState);await page.afterGuard?.(result);return result;}
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
 const functions=vm.runInNewContext(code+';({loginBrowser,checkConnection,startupReadiness,startupOwner})',{require,mkdir,open,rename,unlink,constants,writeFile,readFile,createHash,runtimeModulePath:path instanceof URL?path.pathname:path,join,dirname,randomUUID,URL,process,Error,
  setTimeout,clearTimeout,AbortController,browserLaunch:()=>({args:[],viewport:{}}),browserDownloadScript:()=>''});
 const options={profile:directory,browserPath:'/fixture',candidate:{url:'https://loginom.invalid/app',username:'user',password:'',apiKey:'fixture'},endpoint:'https://knowledge.invalid',owner};
 return {owner,options,functions,events,context,page,pageState,connection,logout:()=>logout,contextClose:()=>contextClose};
}



// Reviewer-only exposure of exact lifecycle functions. Page/Application/auth
// doubles, real filesystem; no native menu, logout, context exit or IPC ACK.
for (const [name,count,running,positive] of [
 ['both-undefined-null',undefined,null,true],
 ['both-null-undefined',null,undefined,true],
 ['count-string','0',null,false],
 ['count-boolean',false,null,false],
 ['count-busy',1,undefined,false],
 ['count-negative',-1,null,false],
])test('joint classification complement '+name,async()=>{
 const root=await mkdtemp(join(tmpdir(),'review-joint-extra-')),f=fixture(root);
 f.owner.deadline=Date.now()+5000;f.owner.deadlineSource='reviewer_fixture';
 let reads=0,countReads=0,runningReads=0;
 f.page.onGuard=()=>{
  reads++;const m=f.pageState.bg.app.Application.FInstance.FMainForm.FMapTree;
  Object.defineProperty(m.PackageNodes,'Count',{configurable:true,get(){countReads++;return reads===1?count:0}});
  m.HasRunningNodes=()=>{runningReads++;return reads===1?running:false};
 };
 try {
  f.functions.startupOwner(f.owner,root,f.options.candidate);
  await f.page.goto();f.connection.Connected=true;f.owner.context=f.context;f.owner.page=f.page;
  f.pageState.__loginomStartupV1={document:f.pageState.document,id:f.owner.id,account:f.owner.account};
  const observed=await f.functions.startupReadiness(f.owner);
  assert.equal(reads,positive?2:1);assert.equal(countReads,reads);assert.equal(runningReads,reads);
  assert.equal(observed.authenticated===true,positive);
  assert.equal(f.owner.evidence.first_guard.count.is_undefined,count===undefined);
  assert.equal(f.owner.evidence.first_guard.running.is_undefined,running===undefined);
  assert.equal(f.owner.evidence.first_guard.running.observed,true);
  assert.equal(f.owner.evidence.first_guard.running.available,true);
  assert.equal(f.owner.evidence.first_guard.result.authenticated,false);
  assert.equal(f.owner.evidence.guard_observations.length,reads);
  assert.equal(f.owner.evidence.initial_readiness.effective_deadline,f.owner.initialReadiness.effective_deadline);
  assert.equal(f.owner.readinessBinding.context,f.context);assert.equal(f.owner.readinessBinding.page,f.page);
  assert.equal(f.logout(),0);assert.equal(f.contextClose(),0);
  if(process.env.REVIEW_RESULTS){await mkdir(process.env.REVIEW_RESULTS,{recursive:true});await writeFile(join(process.env.REVIEW_RESULTS,name+'.json'),JSON.stringify({fixture:true,name,reads,countReads,runningReads,observed,evidence:f.owner.evidence},null,2)+'\n')}
 }finally {await rm(root,{recursive:true,force:true})}
});
