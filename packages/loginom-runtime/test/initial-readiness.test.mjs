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
function fixture(directory,phase,rejected,controls={}){
 const ClockDate=controls.clock?class extends Date{constructor(...args){super(...(args.length?args:[controls.clock()]))}static now(){return controls.clock()}}:Date;
 const events=[],document={querySelectorAll:()=>[]},connection={Connected:false,UserName:'user'};
 const pageState=vm.createContext({document,location:{href:'about:blank',origin:'null'},getComputedStyle:()=>({visibility:'visible'}),Error,Date:ClockDate});
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
 const functions=vm.runInNewContext(code+';({loginBrowser,checkConnection,startupReadiness,startupEvidence})',{require,mkdir,open:controls.open??open,rename,unlink,constants,writeFile,readFile,createHash,Date:ClockDate,runtimeModulePath:path instanceof URL?path.pathname:path,join,dirname,randomUUID,URL,process,Error,
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

test('file sync crosses same initial clock deadline without publishing ready; next receipt carries duration',async()=>{
 const root=await mkdtemp(join(tmpdir(),'initial-sync-deadline-'));let now=1000000,armed=false;
 const timedOpen=async(...args)=>{const file=await open(...args);return {
  writeFile:file.writeFile.bind(file),close:file.close.bind(file),async sync(){await file.sync();if(armed&&args[0]!==root){armed=false;now+=5001;}}
 };};
 const f=fixture(root,undefined,undefined,{clock:()=>now,open:timedOpen});
 try{
  await f.functions.loginBrowser({...f.options,keepOpen:true});
  delete f.owner.initialReadiness;f.owner.evidence={stages:[]};f.owner.phaseTiming=[];f.owner.phaseTimingTruncated=false;
  f.page.onGuard=()=>{f.pageState.bg.app.Application.FInstance.FMainForm.FMapTree.HasRunningNodes=()=>undefined;};armed=true;
  await assert.rejects(f.functions.startupReadiness(f.owner),{message:'LOGINOM_INITIAL_READINESS_DEADLINE'});
  assert.equal(f.owner.evidence.initial_readiness.status,'not_ready');assert.equal('guard_read'in f.owner.evidence,false);
  assert.equal('persistence_failure'in f.owner.evidence,false);assert.equal(f.owner.evidence.initial_readiness.budget_ms,5000);
  const first=JSON.parse(await readFile(join(root,'startup-cleanup.json'),'utf8'));assert.equal(JSON.stringify(first),JSON.stringify(f.owner.evidence));
  assert.equal(first.phase_timing.some(x=>x.name==='file_sync'),false);
  await f.functions.startupEvidence(f.owner);const next=JSON.parse(await readFile(join(root,'startup-cleanup.json'),'utf8'));
  assert.equal(next.phase_timing.find(x=>x.name==='file_sync').duration_ms,5001);
  assert.equal(next.phase_timing.find(x=>x.name==='post_guard').at_ms,5001);
  assert.equal(next.initial_readiness.status,'not_ready');assert.equal('guard_read'in next,false);
  assert.equal(f.logout(),0);assert.equal(f.contextClose(),0);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('pending memory advances to next observe without a duplicate atomic write',async()=>{
 const root=await mkdtemp(join(tmpdir(),'initial-single-write-'));let now=1000000,armed=false,reads=0;
 const events=[],writes=[];
 const timedOpen=async(...args)=>{const file=await open(...args);const directory=args[0]===root;return {
  writeFile:async bytes=>{if(armed){events.push('write');writes.push(JSON.parse(bytes))}return file.writeFile(bytes)},
  close:file.close.bind(file),async sync(){await file.sync();if(armed){events.push(directory?'directory_sync':'file_sync');if(!directory)now+=17;}}
 };};
 const f=fixture(root,undefined,undefined,{clock:()=>now,open:timedOpen});
 try{
  await f.functions.loginBrowser({...f.options,keepOpen:true});
  delete f.owner.initialReadiness;f.owner.evidence={stages:[]};f.owner.phaseTiming=[];f.owner.phaseTimingTruncated=false;armed=true;
  f.page.onGuard=async()=>{
   reads++;events.push('observe'+reads);
   if(reads===2){
    assert.deepEqual(events,['observe1','write','file_sync','directory_sync','observe2']);
    assert.equal(writes.length,1);assert.equal(f.owner.evidence.initial_readiness.status,'pending');assert.equal(f.owner.evidence.initial_readiness.observations,1);
    const disk=JSON.parse(await readFile(join(root,'startup-cleanup.json'),'utf8'));assert.equal(disk.initial_readiness.status,'not_ready');
    assert.ok(f.owner.phaseTiming.some(x=>x.name==='post_guard'&&x.at_ms===17));
   }
   f.pageState.bg.app.Application.FInstance.FMainForm.FMapTree.HasRunningNodes=()=>reads===1?undefined:false;
  };
  const result=await f.functions.startupReadiness(f.owner);assert.equal(result.authenticated,true);assert.equal(reads,2);assert.equal(writes.length,2);
  assert.equal(writes[1].initial_readiness.status,'ready');assert.equal(writes[1].guard_observations.length,2);
  assert.equal(writes[1].guard_observations[0].result.reason,'STARTUP_NOT_OWN_EMPTY_IDLE');
  assert.equal(writes[1].phase_timing.find(x=>x.name==='file_sync').duration_ms,17);
  assert.equal(writes[1].phase_timing.find(x=>x.name==='directory_sync').duration_ms,0);
  assert.equal(writes[1].phase_timing.filter(x=>x.name==='post_guard').length,2);
  assert.equal(f.logout(),0);assert.equal(f.contextClose(),0);
 }finally{await rm(root,{recursive:true,force:true})}
});
