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
function fixture(directory,phase,rejected,clock=Date){
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
 const functions=vm.runInNewContext(code+';({loginBrowser,checkConnection,startupReadiness})',{require,mkdir,open:async(...args)=>{const h=await open(...args);try{await page.onEvidenceOpen?.(String(args[0]));return h}catch(error){await h.close();throw error}},rename,unlink,constants,writeFile,readFile,createHash,runtimeModulePath:path instanceof URL?path.pathname:path,join,dirname,randomUUID,URL,process,Error,Date:clock,
  setTimeout,clearTimeout,AbortController,browserLaunch:()=>({args:[],viewport:{}}),browserDownloadScript:()=>''});
 const options={profile:directory,browserPath:'/fixture',candidate:{url:'https://loginom.invalid/app',username:'user',password:'',apiKey:'fixture'},endpoint:'https://knowledge.invalid',owner};
 return {owner,options,functions,events,context,page,pageState,connection,logout:()=>logout,contextClose:()=>contextClose};
}

const scenarios=['ready','running-pending-ready','count-pending-ready','count-null-ready','null-pending-ready','parent-diagnostic','persistent','read-deadline','read-cancel','local-cap','expired','cancelled','count-busy','count-string','running-busy','running-number','foreign-account','foreign-build','dialog','replaced-page','replaced-context','after-await-identity','deadline-renewal','fresh-before-menu','persistence','confirmed-receipt-retry',...['error','undefined','null','false','zero','empty'].map(x=>'throw-'+x),...['error','undefined','null','false','zero','empty'].map(x=>'persist-throw-'+x)];
for(const scenario of scenarios)test('bounded initial readiness '+scenario,async()=>{
 const root=await mkdtemp(join(tmpdir(),'initial-ready-'));const f=fixture(root,scenario==='confirmed-receipt-retry'?'context-write':undefined),controller=new AbortController();f.owner.signal=controller.signal;
 f.owner.deadline=Date.now()+(['persistent','read-deadline','read-cancel'].includes(scenario)?1000:scenario==='expired'?-1:5000);f.owner.deadlineSource='fixture_private_request';if(scenario==='local-cap'){f.owner.deadline=null;f.owner.deadlineSource='NOT_SUPPLIED'}
 let reads=0;
 f.page.onGuard=async()=>{
  if(scenario==='read-cancel')setImmediate(()=>controller.abort(false));
  if(['read-cancel','read-deadline'].includes(scenario))await new Promise(r=>setTimeout(r,1200));
  const m=f.pageState.bg.app.Application.FInstance.FMainForm.FMapTree;reads++;
  m.HasRunningNodes=()=>false;
  if(scenario==='running-pending-ready'&&reads===1)m.HasRunningNodes=()=>undefined;
  if(scenario==='count-null-ready')m.PackageNodes.Count=reads===1?null:0;
  if(scenario==='count-pending-ready'&&reads===1)m.PackageNodes.Count=undefined;else if(scenario==='count-pending-ready')m.PackageNodes.Count=0;
  if(scenario==='null-pending-ready'&&reads===1)m.HasRunningNodes=()=>null;

  if(scenario==='parent-diagnostic')m.FPackagesParentNode=undefined;
  if(scenario==='persistent'||scenario==='local-cap')m.HasRunningNodes=()=>undefined;
  if(scenario==='cancelled'){m.HasRunningNodes=()=>undefined;setImmediate(()=>controller.abort(0))}
  if(scenario==='count-busy')m.PackageNodes.Count=1;
  if(scenario==='count-string')m.PackageNodes.Count='0';
  if(scenario==='running-busy')m.HasRunningNodes=()=>true;
  if(scenario==='running-number')m.HasRunningNodes=()=>0;
  if(scenario==='foreign-account')f.connection.UserName='foreign';
  if(scenario==='foreign-build')f.pageState.bg.app.Version='foreign';
  if(scenario==='dialog')f.pageState.document.querySelectorAll=()=>[{getBoundingClientRect:()=>({width:10,height:10})}];
  if(scenario.startsWith('persist-throw-'))m.HasRunningNodes=()=>{const v={error:Error('raw guard',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''};throw v[scenario.slice(14)]};
  if(scenario.startsWith('throw-'))m.HasRunningNodes=()=>{const v={error:Error('raw guard',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''};throw v[scenario.slice(6)]};
  if(scenario==='persistence'||scenario.startsWith('persist-throw-'))return mkdir(join(root,'startup-cleanup.json'));
 };
 f.page.afterGuard=()=>{
  if(scenario==='deadline-renewal')f.owner.deadline+=100000;
  if(scenario==='replaced-page')f.owner.page={};
  if(scenario==='replaced-context')f.owner.context={pages:()=>[]};
  if(scenario==='after-await-identity')f.owner.account='foreign';
  if(scenario==='fresh-before-menu'&&reads===2)f.connection.UserName='foreign';
 };
 try{
  const positive=['ready','running-pending-ready','count-pending-ready','count-null-ready','null-pending-ready','parent-diagnostic'].includes(scenario);
  let failure;
  try{const result=await f.functions.checkConnection(f.options);assert.equal(positive,true,'refusal must not become startup success');assert.equal(result.authenticated,true)}catch(error){failure=error;if(positive)throw error;assert.equal(error.startupOwner,f.owner)}
  if(positive){assert.equal(f.logout(),1);assert.equal(f.contextClose(),1);assert.equal(f.owner.receipt.cleanup_complete,true);await f.owner.close();assert.equal(f.logout(),1);assert.equal(f.contextClose(),1)}
  else if(scenario==='confirmed-receipt-retry'){assert.equal(f.logout(),1);assert.equal(f.contextClose(),1);await rm(join(root,'startup-cleanup.json'),{recursive:true});const repaired=await f.owner.close();assert.equal(repaired.cleanup_complete,true);assert.equal(f.logout(),1);assert.equal(f.contextClose(),1)}
  else{assert.equal(f.logout(),0);assert.equal(f.contextClose(),0);assert.ok(f.owner.context);if(scenario==='cancelled')assert.equal(failure.cause,0)}
  if(['running-pending-ready','count-pending-ready','count-null-ready','null-pending-ready'].includes(scenario)){assert.equal(f.owner.evidence.first_guard.result.authenticated,false);assert.equal(f.owner.evidence.guard_observations.at(-1).result.authenticated,true);assert.ok(f.owner.evidence.initial_refusal)}
  if(scenario==='local-cap'){assert.equal(f.owner.evidence.first_guard.deadline,null);assert.equal(f.owner.evidence.initial_readiness.upstream_available,false);assert.equal(f.owner.evidence.initial_readiness.budget_ms,5000);assert.equal(f.owner.evidence.initial_readiness.provenance,'NOT_SUPPLIED')}
  if(scenario==='parent-diagnostic')assert.equal(f.owner.evidence.first_guard.package_parent_ready,false);
  if(!['expired','read-deadline','read-cancel'].includes(scenario))assert.ok(f.owner.evidence.first_guard);
  if(scenario.startsWith('persist-throw-')){assert.ok(f.owner.evidence.persistence_failure);assert.equal(f.owner.evidence.guard_rejection.kind,scenario.endsWith('error')?'Error':'value')}
  if(scenario.startsWith('throw-'))assert.equal(f.owner.evidence.guard_rejection.kind,scenario==='throw-error'?'Error':'value');
  if(scenario==='replaced-context')assert.equal(f.owner.readinessBinding.context,f.context);
  if(scenario==='replaced-page')assert.equal(f.owner.readinessBinding.page,f.page);
  if(process.env.READINESS_RESULTS){await mkdir(process.env.READINESS_RESULTS,{recursive:true});await writeFile(join(process.env.READINESS_RESULTS,scenario+'.json'),JSON.stringify({scenario,fixture:true,source:String(path),reads,native_logout_calls:f.logout(),context_close_calls:f.contextClose(),evidence:f.owner.evidence,failure:failure&&{message:failure.message,cause:failure.cause},scope:'whole actual connection-check functions; labelled Page/Application/auth doubles, real FS; original owner retained; no native Loginom'},null,2)+'\n')}
 }finally{if(f.owner.guardReadOperation?.state==='pending')await f.owner.guardReadOperation.promise.catch(()=>{});await rm(root,{recursive:true,force:true})}
});

// Joint tuple controls: a missing Count must not hide a terminal running
// value/rejection. These invoke the actual gate without cleanup/native gestures.
for(const count of [undefined,null])for(const running of [true,0,'throw-zero'])test(`joint operands Count=${String(count)} running=${running}`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'joint-ready-')),f=fixture(root);
 try{
  await f.functions.loginBrowser({...f.options,keepOpen:true});
  delete f.owner.evidence.first_guard;delete f.owner.evidence.initial_refusal;f.owner.evidence.guard_observations=[];
  let reads=0,runningReads=0,countReads=0;
  f.page.onGuard=()=>{reads++;const m=f.pageState.bg.app.Application.FInstance.FMainForm.FMapTree;
   Object.defineProperty(m.PackageNodes,'Count',{configurable:true,get(){countReads++;return reads===1?count:0}});
   m.HasRunningNodes=()=>{runningReads++;if(reads>1)return false;if(running==='throw-zero')throw 0;return running};
  };
  let result,rejected=false,value;try{result=await f.functions.startupReadiness(f.owner)}catch(error){rejected=true;value=error}
  assert.equal(reads,1);assert.equal(countReads,1);assert.equal(runningReads,1);
  assert.equal(f.owner.evidence.first_guard.count.is_undefined,count===undefined);
  if(running==='throw-zero'){assert.equal(rejected,true);assert.equal(value,0);assert.equal(f.owner.guardFailure.value,0);assert.equal(f.owner.evidence.guard_rejection.value,0)}
  else {assert.equal(rejected,false);assert.equal(result.authenticated,undefined);assert.equal(result.snapshot.running.value,running)}
  const evidence=JSON.parse(await readFile(join(root,'startup-cleanup.json'),'utf8'));
  assert.equal(evidence.first_guard.running.observed,true);assert.equal(f.logout(),0);assert.equal(f.contextClose(),0);
  if(process.env.READINESS_RESULTS)await writeFile(join(process.env.READINESS_RESULTS,`joint-${String(count)}-${running}.json`),JSON.stringify({fixture:true,reads,countReads,runningReads,rejected,value,evidence},null,2));
 }finally{await rm(root,{recursive:true,force:true})}
});
for(const [kind,value] of Object.entries({error:Error('joint running',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''}))for(const persistence of [false,true])test(`joint missing Count rejection ${kind} persistence=${persistence}`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'joint-reject-')),f=fixture(root);
 try{
  await f.functions.loginBrowser({...f.options,keepOpen:true});
  let reads=0;f.page.onGuard=async()=>{reads++;const m=f.pageState.bg.app.Application.FInstance.FMainForm.FMapTree;m.PackageNodes.Count=undefined;m.HasRunningNodes=()=>{throw value};if(persistence)await mkdir(join(root,'startup-cleanup.json'))};
  if(persistence)await rm(join(root,'startup-cleanup.json'));
  let rejected=false,raw;try{await f.functions.startupReadiness(f.owner)}catch(error){rejected=true;raw=error}
  assert.equal(rejected,true);assert.equal(raw,value);assert.equal(f.owner.guardFailure.value,value);assert.equal(reads,1);
  if(kind==='error')assert.equal(f.owner.evidence.guard_rejection.cause.value,0);
  if(persistence)assert.ok(f.owner.evidence.guard_persistence_failure);
  assert.equal(f.logout(),0);assert.equal(f.contextClose(),0);
 }finally{await rm(root,{recursive:true,force:true})}
});

// The whole actual gate, labelled Page/native doubles and real FS. A virtual
// clock models receipt latency without a long sleep or a renewed deadline.
for(const scenario of ['pending-ready','ready','late-read','parent-expiry','parent-cancel','parent-renewal','unknown-parent','known-busy','first-rejection'])test('qualified readiness receipt '+scenario,async()=>{
 const root=await mkdtemp(join(tmpdir(),'ready-publication-'));let offset=0;
 class Clock extends Date{static now(){return Date.now()+offset}}
 const f=fixture(root,undefined,undefined,Clock),controller=new AbortController();
 f.owner.signal=controller.signal;f.owner.deadline=scenario==='unknown-parent'?null:Date.now()+30000;f.owner.deadlineSource=scenario==='unknown-parent'?'NOT_SUPPLIED':'fixture_original_parent';
 let reads=0,firstPublicationReads=null,publication=0;const reason=Error('original running',{cause:0});
 f.page.onGuard=()=>{
  reads++;const m=f.pageState.bg.app.Application.FInstance.FMainForm.FMapTree;
  m.HasRunningNodes=()=>scenario==='pending-ready'&&reads===1?undefined:scenario==='known-busy'?true:false;
  if(scenario==='first-rejection')m.HasRunningNodes=()=>{throw reason};
  if(scenario==='late-read')offset=6000;
 };
 f.page.onEvidenceOpen=async name=>{
  if(!name.includes('.startup-cleanup-')||!f.owner.evidence.guard_observations?.length)return;
  if(firstPublicationReads===null)firstPublicationReads=reads;
  if(publication++===0){assert.equal(f.logout(),0);assert.equal(f.contextClose(),0);offset=scenario==='parent-expiry'?31000:6000;
   if(scenario==='parent-cancel')controller.abort(false);
   if(scenario==='parent-renewal')f.owner.deadline+=100000;
  }
 };
 let failure;
 try{
  try{await f.functions.checkConnection(f.options)}catch(error){failure=error}
  if(['pending-ready','ready'].includes(scenario)){
   assert.equal(failure,undefined);assert.equal(f.logout(),1);assert.equal(f.contextClose(),1);
   assert.equal(firstPublicationReads,scenario==='pending-ready'?2:1);
   assert.equal(f.owner.evidence.initial_readiness.budget_ms,5000);
   assert.equal(f.owner.evidence.guard_observations[0].result.authenticated,scenario==='ready');
   await f.owner.close();assert.equal(f.logout(),1);assert.equal(f.contextClose(),1);
  }else{
   assert.ok(failure);assert.equal(f.logout(),0);assert.equal(f.contextClose(),0);
   if(scenario==='parent-cancel')assert.equal(failure.cause,false);
   if(scenario==='first-rejection')assert.equal(failure.cause,reason);
   if(scenario==='parent-renewal')assert.equal(f.owner.readinessBinding.deadline,f.owner.deadline-100000);
   assert.equal(reads,1);
  }
 }finally{await rm(root,{recursive:true,force:true})}
});
