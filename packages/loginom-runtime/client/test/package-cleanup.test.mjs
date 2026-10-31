import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {makePackageCleanupCode,parsePackageCleanupResult} from '../lib/package-cleanup.mjs';

const options = {sessionId:'owned-session', documentId:'owned-document', account:'test-2',
  packagePath:'/test-2/packages/result.lgp', loginomUrl:'http://loginom.invalid/app/?testable=true',
  loginomBuild:'7.4.2', tabTid:'own-tab', timeoutMs:100};

// Run the serialized browser body. Replace only the external Loginom and UI,
// retaining the actual guards, async close, prompt handling and logout order.
function fixture(overrides = {}) {
  const events = [], state = {clock:Date.now(), avatarClicks:0, avatarBudgets:[], menu:false, account:'test-2', path:options.packagePath, modified:false, running:false,
    count:1, tab:true, dialog:false, loggedOut:false, readonly:false, closeResult:true, ...overrides};
  const fail = stage => {if(state.failStage===stage)throw Error('private upstream failure: do not persist');};
  const timed = (stage, settings) => {
    (state.apiBudgets??=[]).push({stage,timeout:settings.timeout,at:state.clock});
    const elapsed=state.apiElapsed?.[stage]??0;
    state.clock+=Math.min(elapsed,settings.timeout);
    if(elapsed>0&&elapsed>=settings.timeout)throw Object.assign(Error('simulated bounded UI timeout'),{name:'TimeoutError'});
  };
  const node = {DisplayName:'result',get PackageFileName(){return state.path;}, get ReadOnly(){return state.readonly;},
    Package:{}, HasRunningNodes:() => state.running};
  const m = {PackageNodes:{get Count(){return state.count;}, Items:() => node}, HasRunningNodes:() => state.running,
    FServerConnection:{get UserName(){return state.account;}, Connected:true, Session:{IsPackageModified:async () => {
      events.push('modified-read'); if (state.racePath) state.path = state.racePath; if(state.raceReadOnly!==undefined)state.readonly=state.raceReadOnly;
      if(state.raceTab)state.tab=false; if(state.raceTabTid)state.tabTid=state.raceTabTid;
      if(state.maskOnModifiedRead){state.mask=true;state.maskOnModifiedRead=false;}
      state.clock+=state.modifiedReadElapsed??0;
      return state.modified;
    }}}, async ClosePackage(target, suppressEvents, processAfterCall) {
      events.push('close'); assert.equal(target,node); assert.equal(suppressEvents,false); assert.equal(processAfterCall,true);
      if ((state.closePrompt || state.modified)&&!state.closeWithoutPrompt) { state.dialog=true; return new Promise(resolve => {
        state.confirm=()=>{state.count=0;state.tab=false;state.dialog=false;resolve(true);};
      }); }
      if (state.closeThrows) throw Error('upstream private failure');
      if (state.closeResult) { state.count=0; state.tab=false; }
      return state.closeResult;
    }};
  const dialog = {getBoundingClientRect:() => ({x:0,y:0,width:10,height:10}),getAttribute:()=>'fixture-mask',closest:()=>dialog};
  const tab = {getAttribute:() => state.tabTid ?? options.tabTid};
  const doc = {querySelectorAll:query => {
    if(query.includes('MF;AppMenuForm'))return state.menu ? Array(state.menuCount??1).fill(dialog) : [];
    if(query.includes('btnAvatar'))return state.avatarAbsent ? [] : [dialog];
    // Timeout adds a plain backdrop; initial masks also expose busy markers.
    return state.dialog || state.mask && (query.split(',').includes('.x-mask') || !state.maskAfterTimeout) ? [dialog] : [];
  }, contains:value => value === tab && state.tab,elementFromPoint:()=>dialog};
  const context = vm.createContext({document:doc, location:{origin:'http://loginom.invalid'},
    ownedPackage:state.foreignPreparedPackage ? {} : node, ownedTab:tab,
    getComputedStyle:() => ({visibility:'visible'}), bg:{app:{Version:'7.4.2', Application:{FInstance:{FMainForm:{FMapTree:m}}}}}});
  vm.runInContext(`globalThis.__loginomDockPreparationV1={document,id:'owned-document',receipts:new Map([['prepare',{request:JSON.stringify({session:'owned-session'}),packageNode:ownedPackage,tab:ownedTab}]])}`,context);
  const locator = query => ({
    locator:() => locator(query+' input'),
    async waitFor(settings) {
      assert.ok(settings.timeout > 0 && settings.timeout <= (state.timeoutMs??options.timeoutMs));
      timed(query.includes('LoginForm')?'login_form_wait':'tab_detach',settings);
      fail(query.includes('LoginForm')?'login_form_wait':'tab_detach');
      events.push(query.includes('LoginForm') ? 'login-visible' : 'tab-detached');
      if (query.includes('LoginForm') ? !state.loggedOut : state.tab) throw Error('UI wait failed');
    }, async click(settings) {
      assert.ok(settings.timeout > 0 && settings.timeout <= (state.timeoutMs??options.timeoutMs));
      timed(query.includes('tlb;no')?'discard_click':query.includes('btnLogOut')?'logout_click':'logout_menu_open',settings);
      fail(query.includes('tlb;no')?'discard_click':query.includes('btnLogOut')?'logout_click':'logout_menu_open');
      if (query.includes('tlb;no')) {events.push('discard');state.confirm();}
      else if (query.includes('btnLogOut')) { events.push('logout'); state.loggedOut=true; }
      else {
        state.avatarClicks++; state.avatarBudgets.push(settings.timeout); events.push('avatar');
        if(state.avatarTimeouts >= state.avatarClicks){
          state.clock += state.avatarElapsed??(state.timeoutMs??options.timeoutMs);
          if(state.menuAfterTimeout)state.menu=true;
          if(state.maskAfterTimeout)state.mask=true;
          if(state.dialogAfterTimeout)state.dialog=true;
          if(state.accountAfterTimeout)state.account=state.accountAfterTimeout;
          throw Object.assign(Error('private click timeout'),{name:'TimeoutError'});
        }
        state.menu=true;
      }
    }, async count(){return state.dialog?1:0;},
    async innerText(){fail('logout_account_readback');return query.includes('cnt;cnt;cmp')?(state.prompt??'Сохранить изменения в пакете "result"?'):state.account;},
    async isVisible(){fail('logout_readback');return !state.loggedOut;},
  });
  const page = {locator,
    async waitForTimeout(ms){
      if(events.includes('close')){
        (state.diagnosticWaitBudgets??=[]).push(ms);
        return new Promise(resolve=>{const timer=setTimeout(resolve,ms);timer.unref?.();});
      }
      assert.ok(ms>0&&ms<=100);events.push('idle-wait');state.clock+=state.idleElapsed??ms;
      if(state.clearBlocker){state.mask=false;state.dialog=false;}
      Object.assign(state,state.idleChange??{});
      if(state.changePreparation)context.__loginomDockPreparationV1.id='foreign-document';
    },
    async evaluate(fn,arg){
      if(state.failDiagnostic&&fn.toString().includes("s?.document!==document"))throw Error('Diagnostic transport unavailable');
      if(state.diagnosticDelay&&fn.toString().includes("s?.document!==document"))await new Promise(resolve=>setTimeout(resolve,state.diagnosticDelay));
      if(fn.toString().includes('m.ClosePackage(node, false, true)'))fail('close_request');
      if(fn.toString().includes('remaining:globalThis'))fail('close_readback');
      if(fn.toString().includes('m?.PackageNodes?.Count === 0'))fail('logout_inventory_readback');
      return vm.runInContext('('+fn.toString()+')',context)(arg);
    },
    async waitForFunction(fn,arg,settings){
      assert.ok(settings.timeout > 0 && settings.timeout <= (fn.toString().includes('const menu =')?state.deadline-state.clock:(state.timeoutMs??options.timeoutMs)));
      timed(fn.toString().includes('const menu =')?'logout_observe':fn.toString().includes('globalThis.__loginomDockCleanupV1?.done === true')?'discard_close_wait':'close_wait',settings);
      if(fn.toString().includes('const menu =')){
        events.push('logout-observe'); state.observeTimeout=settings.timeout;
        for(let i=0;i<2;i++){
          const value=await this.evaluate(fn,arg);
          if(value)return {jsonValue:async()=>value,dispose:async()=>{}};
          if(state.clearMask){state.mask=false;state.clock+=state.maskElapsed??10;}
        }
        throw Error('observation timeout');
      }
      fail('close_wait');for(let i=0;i<8;i++){if(await this.evaluate(fn,arg))return;await Promise.resolve();}throw Error('timeout');
    },
  };
  const Clock = class extends Date {static now(){return state.clock;}};
  return {state,events,context,page, run:changed => {
    const code=makePackageCleanupCode({...options,timeoutMs:state.timeoutMs??options.timeoutMs,...changed});
    state.deadline=Number(code.match(/,(\d+)\)$/)[1]);
    state.clock=state.deadline-30000;
    context.Date=Clock;
    return vm.runInNewContext('('+code+')',{Date:Clock})(page);
  }};
}

test('saved owned package closes with native guards, tabs disappear, then logout', async () => {
  const f=fixture(), result=await f.run();
  assert.equal(result.status,'SUCCEEDED'); assert.equal(result.package_closed,true); assert.equal(result.logged_out,true);
  assert.equal(result.stage,'complete');
  assert.equal(result.unsaved_changes_discarded,false);
  assert.deepEqual(f.events,['modified-read','close','tab-detached','avatar','logout','login-visible']);
  const again=await f.run();assert.equal(again.reason,'CLEANUP_ALREADY_ATTEMPTED');assert.equal(f.events.filter(e=>e==='close').length,1);
});

for(const mode of ['saved','readonly','diagnostic discard'])for(const changedAt of ['native Close','logout account readback'])
test('cleanup refuses a replacement server session after '+changedAt+' for '+mode,async()=>{
 const f=fixture({readonly:mode==='readonly',modified:mode==='diagnostic discard'});
 const m=f.context.bg.app.Application.FInstance.FMainForm.FMapTree;
 const foreignSession={marker:'foreign-session'};
 if(changedAt==='native Close'){
  const close=m.ClosePackage;
  m.ClosePackage=async(...args)=>{const result=await close(...args);m.FServerConnection.Session=foreignSession;return result;};
 }else{
  const locator=f.page.locator;
  f.page.locator=query=>{
   const target=locator(query),read=target.innerText;
   target.innerText=async(...args)=>{const text=await read(...args);if(query.includes('MF;AppMenuForm;p.h;p.t'))m.FServerConnection.Session=foreignSession;return text;};
   return target;
  };
 }
 const result=await f.run({diagnosticReadOnly:mode==='readonly',diagnosticDiscard:mode==='diagnostic discard'});
 assert.equal(result.status,'BLOCKED');assert.equal(result.reason,'LOGOUT_SESSION_CHANGED');
 assert.equal(result.package_closed,true);assert.equal(result.logged_out,false);
 assert.equal(f.events.filter(e=>e==='close').length,1);assert.equal(f.events.includes('logout'),false);
});

test('D75 idle wait pins original connection/session through dirty read and Close',async()=>{
 for(const phase of ['idle_session','idle_connection','dirty_session','dirty_connection']) {
  const f=fixture({running:phase.startsWith('idle'),timeoutMs:8000,idleChange:{running:false}});
  const m=f.context.bg.app.Application.FInstance.FMainForm.FMapTree,connection=m.FServerConnection,session=connection.Session;
  const replace=()=>{if(phase.endsWith('connection'))m.FServerConnection={...connection};
   else connection.Session={IsPackageModified:async()=>false};};
  if(phase.startsWith('idle')){const wait=f.page.waitForTimeout.bind(f.page);f.page.waitForTimeout=async ms=>{await wait(ms);replace();};}
  else session.IsPackageModified=async()=>{replace();return false;};
  const result=await f.run();
  assert.equal(result.status,'BLOCKED',phase);assert.equal(result.reason,'CLEANUP_SESSION_CHANGED',phase);
  assert.equal(f.events.includes('close'),false,phase);assert.equal(f.events.includes('logout'),false,phase);
 }
});

test('D75 cleanup waits for confirmed own running package and rechecks identity before Close',async()=>{
 for(const fault of [null,'foreign','unknown','expired']) {
  const f=fixture({running:fault==='unknown'?undefined:true,timeoutMs:8000,
   idleChange:fault==='expired'?{}:fault==='foreign'?{path:'/test-2/other.lgp'}:{running:false}});
  const r=await f.run();
  assert.equal(r.status,fault?'BLOCKED':'SUCCEEDED',fault);
  assert.equal(f.events.filter(e=>e==='close').length,fault?0:1);
  if(!fault){assert.ok(f.events.includes('idle-wait'));assert.equal(r.logged_out,true);}
 }
});

for(const blocker of ['mask','dialog'])test('cold cleanup waits read-only for a transient '+blocker+' before one native close/logout',async()=>{
 const f=fixture({[blocker]:true,clearBlocker:true,timeoutMs:8000}),r=await f.run({diagnosticDiscard:true,diagnosticWaitForIdle:true});
 assert.equal(r.status,'SUCCEEDED');assert.equal(r.package_closed,true);assert.equal(r.logged_out,true);
 assert.deepEqual(f.events,['idle-wait','modified-read','close','tab-detached','avatar','logout','login-visible']);
 assert.equal(r.unsaved_changes_discarded,false);
});

test('cold idle wait also rechecks blockers after the asynchronous dirty-state read',async()=>{
 const f=fixture({maskOnModifiedRead:true,clearBlocker:true,timeoutMs:8000}),r=await f.run({diagnosticDiscard:true,diagnosticWaitForIdle:true});
 assert.equal(r.status,'SUCCEEDED');assert.equal(r.logged_out,true);
 assert.deepEqual(f.events.slice(0,4),['modified-read','idle-wait','modified-read','close']);
 assert.equal(f.events.filter(e=>e==='close').length,1);
});

test('cold idle wait retains the exact owned temporary-view discard confirmation',async()=>{
 const f=fixture({mask:true,clearBlocker:true,modified:true,timeoutMs:8000}),r=await f.run({diagnosticDiscard:true,diagnosticWaitForIdle:true});
 assert.equal(r.status,'SUCCEEDED');assert.equal(r.package_closed,true);assert.equal(r.logged_out,true);
 assert.equal(r.unsaved_changes_discarded,true);
 assert.deepEqual(f.events,['idle-wait','modified-read','close','discard','tab-detached','avatar','logout','login-visible']);
});

test('cold idle wait never retries an unconfirmed native close',async()=>{
 const f=fixture({mask:true,clearBlocker:true,closeResult:false,timeoutMs:8000}),r=await f.run({diagnosticDiscard:true,diagnosticWaitForIdle:true});
 assert.equal(r.reason,'NATIVE_CLOSE_UNCONFIRMED');assert.equal(r.package_closed,false);assert.equal(r.logged_out,false);
 assert.equal(f.events.filter(e=>e==='idle-wait').length,1);assert.equal(f.events.filter(e=>e==='close').length,1);
 assert.equal(f.events.includes('logout'),false);
});

test('all cleanup waits and clicks share the remainder after idle and server delay',async()=>{
 const f=fixture({mask:true,clearBlocker:true,modified:true,timeoutMs:8000,idleElapsed:7900,modifiedReadElapsed:22000,
  apiElapsed:{close_wait:20,discard_click:20,discard_close_wait:20,tab_detach:20}});
 const r=await f.run({diagnosticDiscard:true,diagnosticWaitForIdle:true});
 assert.equal(r.status,'SUCCEEDED');assert.equal(r.package_closed,true);assert.equal(r.logged_out,true);
 assert.deepEqual(f.state.apiBudgets.slice(0,4).map(b=>[b.stage,b.timeout]),
  [['close_wait',100],['discard_click',80],['discard_close_wait',60],['tab_detach',40]]);
 assert.ok(f.state.apiBudgets.every(b=>b.timeout>0&&b.at+b.timeout<=f.state.deadline));
 assert.ok(f.state.clock<=f.state.deadline);
});

for(const stage of ['close_wait','discard_click','discard_close_wait','tab_detach'])
 test('cleanup stops within the absolute deadline when '+stage+' stalls after idle wait',async()=>{
  const f=fixture({mask:true,clearBlocker:true,modified:true,timeoutMs:8000,idleElapsed:7900,modifiedReadElapsed:22000,
   apiElapsed:{[stage]:20000}}),r=await f.run({diagnosticDiscard:true,diagnosticWaitForIdle:true});
  assert.equal(r.status,'BLOCKED');assert.equal(r.stage,stage);assert.equal(r.logged_out,false);
  assert.ok(f.state.clock<=f.state.deadline);assert.ok(f.state.apiBudgets.every(b=>b.at+b.timeout<=f.state.deadline));
  assert.equal(f.state.apiBudgets.at(-1).stage,stage);assert.equal(f.events.filter(e=>e==='close').length,1);
  assert.equal(f.events.includes('logout'),false);
 });

for(const [change,reason] of [[{account:'foreign'},'ACCOUNT_CHANGED'],[{path:'/foreign/result.lgp'},'PACKAGE_IDENTITY_CHANGED'],
 [{count:2},'PACKAGE_INVENTORY_CHANGED'],[{tab:false},'TAB_IDENTITY_CHANGED'],[{running:true},'RUNNING_NODES'],[{readonly:true},'PACKAGE_IDENTITY_CHANGED']])
 test('cold idle wait preserves ownership and running-node refusal: '+JSON.stringify(change),async()=>{
  const f=fixture({mask:true,clearBlocker:true,idleChange:change,timeoutMs:8000}),r=await f.run({diagnosticDiscard:true,diagnosticWaitForIdle:true});
  assert.equal(r.reason,reason);
  assert.equal(r.status,'BLOCKED');assert.equal(r.package_closed,false);assert.equal(r.logged_out,false);
  assert.equal(f.events.includes('close'),false);assert.equal(f.events.includes('logout'),false);
 });

test('cold idle wait refuses a changed preparation document',async()=>{
 const f=fixture({mask:true,clearBlocker:true,changePreparation:true,timeoutMs:8000}),r=await f.run({diagnosticDiscard:true,diagnosticWaitForIdle:true});
 assert.equal(r.reason,'DOCUMENT_IDENTITY_CHANGED');assert.deepEqual(f.events,['idle-wait']);
});

for(const blocker of ['mask','dialog'])test('persistent '+blocker+' keeps cold cleanup blocked within its original wait allowance',async()=>{
 const f=fixture({[blocker]:true}),r=await f.run({diagnosticDiscard:true,diagnosticWaitForIdle:true});
 assert.equal(r.reason,'DIALOG_OR_OPERATION_OPEN');assert.equal(r.stage,'idle_wait');
 assert.equal(r.package_closed,false);assert.equal(r.logged_out,false);assert.deepEqual(f.events,['idle-wait']);
});

test('cold cleanup never closes after idle wait or server read exhausts the original deadline',async()=>{
 for(const change of [{mask:true,clearBlocker:true,idleElapsed:30001},{modifiedReadElapsed:30001}]){
  const f=fixture(change),r=await f.run({diagnosticDiscard:true,diagnosticWaitForIdle:true});
  assert.equal(r.status,'BLOCKED');assert.equal(r.package_closed,false);assert.equal(r.logged_out,false);
  assert.equal(f.events.includes('close'),false);assert.equal(f.events.includes('logout'),false);
 }
});

test('idle waiting is opt-in for isolated diagnostics, ordinary cleanup still refuses immediately',async()=>{
 for(const changed of [{},{diagnosticDiscard:true}]){
  const f=fixture({mask:true}),r=await f.run(changed);
  assert.equal(r.reason,'DIALOG_OR_OPERATION_OPEN');assert.deepEqual(f.events,[]);
 }
 for(const changed of [{diagnosticWaitForIdle:true},{diagnosticDiscard:true,diagnosticWaitForIdle:'true'}])
  assert.throws(()=>makePackageCleanupCode({...options,...changed}));
});

test('avatar timeout observes cleared masks and retries once before confirmed logout',async()=>{
  const f=fixture({avatarTimeouts:1,maskAfterTimeout:true,clearMask:true,timeoutMs:8000}),r=await f.run();
  assert.equal(r.status,'SUCCEEDED');assert.equal(r.logged_out,true);assert.equal(r.package_closed,true);
  assert.deepEqual(f.events,['modified-read','close','tab-detached','avatar','logout-observe','avatar','logout','login-visible']);
});

test('second avatar timeout keeps the original unconfirmed cleanup refusal',async()=>{
  const f=fixture({avatarTimeouts:2,timeoutMs:8000}),r=await f.run();
  assert.equal(r.status,'BLOCKED');assert.equal(r.reason,'CLEANUP_UNCONFIRMED');assert.equal(r.stage,'logout_menu_open');
  assert.equal(r.package_closed,true);assert.equal(r.logged_out,false);assert.equal(f.state.avatarClicks,2);
  assert.equal(f.events.includes('logout'),false);assert.doesNotMatch(JSON.stringify(r),/private click timeout/);
});

test('D81 success adds no diagnostic browser reads or waits',async()=>{
  const f=fixture();let reads=0;
  const evaluate=f.page.evaluate.bind(f.page);
  f.page.evaluate=(fn,arg)=>{if(fn.toString().includes('const groups='))reads++;return evaluate(fn,arg);};
  const r=await f.run();
  assert.equal(r.status,'SUCCEEDED');assert.equal(r.logout_menu_step,'first_click');
  assert.equal(Date.parse(r.deadline_at),f.state.deadline);
  assert.equal(reads,0);assert.equal(r.logout_menu_readback,undefined);
  assert.equal(r.logout_menu_failed_at,undefined);assert.equal(f.state.diagnosticWaitBudgets,undefined);
  assert.deepEqual(f.events,['modified-read','close','tab-detached','avatar','logout','login-visible']);
});

test('D81 refused avatar records the covering mask without retrying Close or logout',async()=>{
  const f=fixture({avatarTimeouts:1,maskAfterTimeout:true}),r=await f.run();
  assert.equal(r.status,'BLOCKED');assert.equal(r.reason,'CLEANUP_UNCONFIRMED');
  assert.equal(r.logout_menu_step,'observe_after_timeout');
  assert.ok(Number.isFinite(Date.parse(r.logout_menu_failed_at)));
  assert.equal(Date.parse(r.deadline_at),f.state.deadline);
  assert.equal(r.logout_menu_readback.status,'observed');
  assert.equal(r.logout_menu_readback.masks[0].tid,null);
  assert.equal(r.logout_menu_readback.avatar[0].hit_tid,null);
  assert.equal(r.package_closed,true);assert.equal(r.logged_out,false);
  assert.equal(f.events.filter(e=>e==='close').length,1);assert.equal(f.state.avatarClicks,1);
  assert.equal(f.events.includes('logout'),false);assert.equal(r.unsaved_changes_discarded,false);
});

test('D81 expired deadline records the refusal without starting a diagnostic read',async()=>{
  const f=fixture({avatarTimeouts:1,avatarElapsed:30001,timeoutMs:8000}),r=await f.run();
  assert.equal(r.status,'BLOCKED');assert.equal(r.logout_menu_step,'observe_after_timeout');
  assert.ok(Number.isFinite(Date.parse(r.logout_menu_failed_at)));
  assert.equal(r.logout_menu_readback,undefined);assert.equal(f.state.diagnosticWaitBudgets,undefined);
  assert.equal(f.state.avatarClicks,1);assert.equal(r.logged_out,false);
});

test('D81 unavailable diagnostic cannot alter the refusal or extend its original deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture({avatarTimeouts:1,maskAfterTimeout:true,avatarElapsed:27500});
  const evaluate=f.page.evaluate.bind(f.page);
  f.page.evaluate=(fn,arg)=>fn.toString().includes('const groups=')
    ?new Promise(resolve=>setTimeout(()=>resolve({status:'observed'}),31000)):evaluate(fn,arg);
  let result,settledAt;
  const pending=f.run().then(r=>{result=r;settledAt=f.state.clock;});
  const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
  await flush();const left=f.state.deadline-f.state.clock;
  assert.equal(left,2500);
  f.state.clock+=500;t.mock.timers.tick(500);await flush();
  assert.ok(result);assert.equal(settledAt,f.state.deadline-2000);
  const refusal=result;
  f.state.clock+=31000-left;t.mock.timers.tick(31000-left);await pending;
  assert.equal(result,refusal);assert.equal(result.status,'BLOCKED');
  assert.equal(result.reason,'CLEANUP_UNCONFIRMED');assert.equal(result.logged_out,false);
  assert.equal(result.logout_menu_readback.status,'unavailable');
  assert.deepEqual(f.state.diagnosticWaitBudgets,[500]);
  assert.equal(f.state.avatarClicks,1);assert.equal(f.events.filter(e=>e==='close').length,1);
});

test('a menu opened by a timed-out avatar click is not toggled again',async()=>{
  for(const maskAfterTimeout of [false,true]){
    const f=fixture({avatarTimeouts:1,menuAfterTimeout:true,maskAfterTimeout}),r=await f.run();
    assert.equal(r.status,'SUCCEEDED');assert.equal(r.logged_out,true);assert.equal(f.state.avatarClicks,1);
    assert.deepEqual(f.events,['modified-read','close','tab-detached','avatar','logout-observe','logout','login-visible']);
  }
});

test('a dialog still blocks avatar-timeout recovery with an open or closed menu',async()=>{
  for(const menuAfterTimeout of [false,true]){
    const f=fixture({avatarTimeouts:1,menuAfterTimeout,maskAfterTimeout:true,dialogAfterTimeout:true}),r=await f.run();
    assert.equal(r.status,'BLOCKED');assert.equal(r.stage,'logout_menu_open');
    assert.equal(r.reason,'CLEANUP_UNCONFIRMED');assert.equal(r.package_closed,true);assert.equal(r.logged_out,false);
    assert.equal(f.state.avatarClicks,1);assert.equal(f.events.includes('logout'),false);
  }
});

test('ambiguous open menus refuse logout after an avatar timeout',async()=>{
  const f=fixture({avatarTimeouts:1,menuAfterTimeout:true,menuCount:2,maskAfterTimeout:true}),r=await f.run();
  assert.equal(r.status,'BLOCKED');assert.equal(r.reason,'CLEANUP_UNCONFIRMED');
  assert.equal(r.logged_out,false);assert.equal(f.state.avatarClicks,1);assert.equal(f.events.includes('logout'),false);
});

test('avatar retry uses the original cleanup deadline and never passes timeout zero',async()=>{
  const f=fixture({avatarTimeouts:1,avatarElapsed:29950,timeoutMs:8000}),r=await f.run();
  assert.equal(r.status,'SUCCEEDED');assert.ok(f.state.observeTimeout<=50);assert.ok(f.state.avatarBudgets[1]<=50);assert.equal(f.state.avatarClicks,2);
  const expired=fixture({avatarTimeouts:1,avatarElapsed:30001,timeoutMs:8000}),blocked=await expired.run();
  assert.equal(blocked.reason,'CLEANUP_UNCONFIRMED');assert.equal(expired.state.avatarClicks,1);
  assert.equal(expired.events.includes('logout-observe'),false);assert.equal(expired.events.includes('logout'),false);
});

test('avatar retry refuses a changed account or masks that remain visible',async()=>{
  for(const change of [{accountAfterTimeout:'foreign'},{accountAfterTimeout:'foreign',menuAfterTimeout:true,maskAfterTimeout:true},{maskAfterTimeout:true}]){
    const f=fixture({avatarTimeouts:1,...change}),r=await f.run();
    assert.equal(r.reason,'CLEANUP_UNCONFIRMED');assert.equal(r.logged_out,false);assert.equal(f.state.avatarClicks,1);
    assert.equal(f.events.includes('logout'),false);
  }
});

for(const stage of ['close_request','close_wait','close_readback','tab_detach','logout_menu_open','logout_account_readback','logout_inventory_readback','logout_click','login_form_wait','logout_readback'])
 test('private cleanup receipt pinpoints '+stage+' without certifying unconfirmed cleanup',async()=>{
  const f=fixture({failStage:stage}),r=await f.run();
  assert.equal(r.status,'BLOCKED');assert.equal(r.reason,'CLEANUP_UNCONFIRMED');assert.equal(r.stage,stage);
  assert.equal(r.package_closed,stage.startsWith('logout_')||stage==='login_form_wait');
  assert.equal(r.logged_out,false);assert.equal(r.unsaved_changes_discarded,false);
  if(['login_form_wait','logout_readback'].includes(stage))assert.equal(f.state.loggedOut,true);
  assert.ok(f.events.filter(e=>e==='close').length<=1);assert.ok(f.events.filter(e=>e==='logout').length<=1);
  assert.doesNotMatch(JSON.stringify(r),/private upstream failure/);
  assert.equal(parsePackageCleanupResult({content:[{type:'text',text:JSON.stringify(r)}]},options).stage,stage);
 });

test('missing prepared tab refuses before native package close', async () => {
  const f=fixture({tab:false}), result=await f.run();
  assert.equal(result.status,'BLOCKED');assert.equal(result.reason,'TAB_IDENTITY_CHANGED');
  assert.equal(f.events.includes('close'),false);assert.equal(f.events.includes('logout'),false);
});

test('prepared tab changes during dirty-state read refuse before native close', async () => {
  for(const changed of [{raceTab:true},{raceTabTid:'foreign-tab'}]){
    const f=fixture(changed), result=await f.run();
    assert.equal(result.status,'BLOCKED');assert.equal(result.reason,'TAB_IDENTITY_CHANGED');
    assert.deepEqual(f.events,['modified-read']);
  }
});

test('foreign prepared package or tab refuses before native close', async () => {
  for(const changed of [{foreignPreparedPackage:true},{tabTid:'foreign-tab'}]){
    const f=fixture(changed), result=await f.run();
    assert.equal(result.reason,'TAB_IDENTITY_CHANGED');assert.deepEqual(f.events,[]);
  }
  const f=fixture();assert.equal((await f.run({tabTid:'foreign-tab'})).reason,'TAB_IDENTITY_CHANGED');
  assert.deepEqual(f.events,[]);
});

for (const [change,reason] of [
  [{modified:true},'UNSAVED_CHANGES'], [{running:true},'RUNNING_NODES'],
  [{account:'another-user'},'ACCOUNT_CHANGED'], [{path:'/other/result.lgp'},'PACKAGE_IDENTITY_CHANGED'],
  [{readonly:true},'PACKAGE_IDENTITY_CHANGED'], [{count:2},'PACKAGE_INVENTORY_CHANGED'],
  [{dialog:true},'DIALOG_OR_OPERATION_OPEN'], [{racePath:'/changed/result.lgp'},'PACKAGE_CHANGED_DURING_CHECK'],
]) test('refuses before closing: '+reason, async () => {
  const f=fixture(change),result=await f.run();
  assert.equal(result.status,'BLOCKED');assert.equal(result.reason,reason);
  assert.equal(f.events.includes('close'),false);assert.equal(f.events.includes('logout'),false);assert.equal(f.state.tab,true);
});

test('refuses a different document or preparation owner', async () => {
  for(const changed of [{documentId:'other'},{sessionId:'other'}]){
    const f=fixture();assert.equal((await f.run(changed)).reason,'DOCUMENT_IDENTITY_CHANGED');assert.deepEqual(f.events,[]);
  }
});

for(const change of [{closePrompt:true},{closeThrows:true},{closeResult:false}])
  test('native refusal/prompt preserves the session without answering or logging out: '+JSON.stringify(change),async()=>{
    const f=fixture(change),r=await f.run();assert.equal(r.status,'BLOCKED');assert.equal(r.package_closed,false);
    assert.equal(f.state.tab,true);assert.equal(f.events.includes('logout'),false);assert.equal(r.unsaved_changes_discarded,false);
  });

test('only the verified build and exact safe path can generate cleanup code',()=>{
  for(const changed of [{packagePath:'../result.lgp'},{packagePath:'/test-2/../other.lgp'},{loginomBuild:'unknown'},
    {documentId:''},{account:''},{loginomUrl:'http://name:secret@loginom.invalid'}])
    assert.throws(()=>makePackageCleanupCode({...options,...changed}));
});

test('cleanup response must prove the same session, package and completed logout',async()=>{
  const receipt=await fixture().run(), response=v=>({content:[{type:'text',text:'### Result\n'+JSON.stringify(v)+'\n### Page'}]});
  assert.equal(parsePackageCleanupResult(response(receipt),options).status,'SUCCEEDED');
  for(const changed of [{session_id:'other'},{package_path:'/other.lgp'},{logged_out:false},{package_closed:false},
    {unsaved_changes_discarded:true},{packages_after:1}])assert.throws(()=>parsePackageCleanupResult(response({...receipt,...changed}),options));
});

test('independent QA may explicitly discard only its confirmed package save prompt',async()=>{
  const f=fixture({modified:true}),r=await f.run({diagnosticDiscard:true});
  assert.equal(r.status,'SUCCEEDED');assert.equal(r.unsaved_changes_discarded,true);
  assert.equal(f.events.filter(e=>e==='discard').length,1);
  assert.throws(()=>parsePackageCleanupResult({content:[{type:'text',text:JSON.stringify(r)}]},options));
  assert.equal(parsePackageCleanupResult({content:[{type:'text',text:JSON.stringify(r)}]},{...options,diagnosticDiscard:true}).status,'SUCCEEDED');
});

test('QA discard does not answer a running-node or foreign-package prompt',async()=>{
  for(const prompt of ['Сохранить изменения в пакете "foreign"?','Узлы заблокированы; отменить активные процессы в result?']){
    const f=fixture({modified:true,prompt}),r=await f.run({diagnosticDiscard:true});
    assert.equal(r.status,'BLOCKED');assert.equal(f.events.includes('discard'),false);assert.equal(f.state.tab,true);
  }
});


test('explicit read-only diagnostic cleanup closes only the owned unmodified copy',async()=>{
 const f=fixture({readonly:true});const r=await f.run({diagnosticReadOnly:true});
 assert.equal(r.status,'SUCCEEDED');assert.equal(r.unsaved_changes_discarded,false);
 assert.deepEqual(f.events,['modified-read','close','tab-detached','avatar','logout','login-visible']);
 for(const change of [{readonly:false},{readonly:true,path:'/foreign/result.lgp'},{readonly:true,account:'other'}]){
  const bad=fixture(change);assert.equal((await bad.run({diagnosticReadOnly:true})).status,'BLOCKED');
  assert.equal(bad.events.includes('close'),false);
 }
 const dirty=fixture({readonly:true,modified:true});assert.equal((await dirty.run({diagnosticReadOnly:true})).reason,'UNSAVED_CHANGES');
 assert.throws(()=>makePackageCleanupCode({...options,diagnosticReadOnly:'true'}));
});

test('read-only mode cannot change during the server dirty-state check',async()=>{
 for(const [readonly,raceReadOnly] of [[true,false],[false,true]]){
  const f=fixture({readonly,raceReadOnly});const r=await f.run({diagnosticReadOnly:readonly});
  assert.equal(r.reason,'PACKAGE_CHANGED_DURING_CHECK');assert.equal(f.events.includes('close'),false);
 }
});


test('D70 diagnostic records native Close without changing missing-prompt refusal or discarding',async()=>{
 const f=fixture({modified:true,closeWithoutPrompt:true}),r=await f.run({diagnosticDiscard:true});
 assert.equal(r.reason,'DIAGNOSTIC_SAVE_PROMPT_MISSING');assert.equal(r.status,'BLOCKED');
 assert.equal(r.package_closed,false);assert.equal(r.unsaved_changes_discarded,false);
 assert.equal(r.modified_before_close,true);
 assert.equal(r.native_close_readback.status,'observed');assert.equal(r.native_close_readback.done,true);
 assert.equal(r.native_close_readback.closed,true);assert.equal(r.native_close_readback.result,'true');
 assert.equal(r.native_close_readback.packages_after,0);assert.equal(r.native_close_readback.original_tab_attached,false);
 assert.equal(f.events.filter(e=>e==='close').length,1);assert.equal(f.events.includes('discard'),false);assert.equal(f.events.includes('logout'),false);
});

test('D70 diagnostic keeps native Close false and rejected outcomes distinct without a retry',async()=>{
 for(const overrides of [{closeResult:false},{closeThrows:true}]) {
  const f=fixture(overrides),r=await f.run();
  assert.equal(r.reason,'NATIVE_CLOSE_UNCONFIRMED');assert.equal(r.status,'BLOCKED');
  assert.equal(r.native_close_readback.done,true);assert.equal(r.native_close_readback.closed,false);
  assert.equal(r.native_close_readback.failed,!!overrides.closeThrows);
  assert.equal(r.native_close_readback.packages_after,1);
  assert.equal(f.events.filter(e=>e==='close').length,1);assert.equal(f.events.includes('discard'),false);assert.equal(f.events.includes('logout'),false);
 }
});

test('D70 diagnostic transport failure cannot change cleanup refusal or repeat Close',async()=>{
 const f=fixture({modified:true,closeWithoutPrompt:true,failDiagnostic:true}),r=await f.run({diagnosticDiscard:true});
 assert.equal(r.status,'BLOCKED');assert.equal(r.reason,'DIAGNOSTIC_SAVE_PROMPT_MISSING');
 assert.equal(r.native_close_readback.status,'unavailable');assert.equal(r.unsaved_changes_discarded,false);
 assert.equal(f.events.filter(e=>e==='close').length,1);assert.equal(f.events.includes('logout'),false);
});

for(const elapsed of [0,27500])test('D70 delayed diagnostic respects original deadline after '+elapsed+' ms',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const f=fixture({modified:true,closeWithoutPrompt:true,modifiedReadElapsed:elapsed,diagnosticDelay:31000});
 let result,settledAt;
 const pending=f.run({diagnosticDiscard:true}).then(value=>{result=value;settledAt=f.state.clock;});
 const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
 await flush();
 const remaining=f.state.deadline-f.state.clock;
 assert.equal(remaining,30000-elapsed);
 f.state.clock+=remaining;t.mock.timers.tick(remaining);await flush();
 const resultAtDeadline=result;
 // Also settle the late read, proving it cannot replace the published refusal.
 const late=31000-remaining;
 f.state.clock+=late;t.mock.timers.tick(late);await pending;
 t.diagnostic(JSON.stringify({diagnostic_delay_ms:31000,remaining_ms:remaining,receipt_elapsed_ms:settledAt-(f.state.deadline-30000)}));
 assert.ok(resultAtDeadline,'diagnostic must not delay an accepted refusal beyond its original deadline');
 assert.ok(settledAt<=f.state.deadline);
 assert.deepEqual(f.state.diagnosticWaitBudgets,[remaining]);
 assert.equal(result,resultAtDeadline);
 assert.equal(result.status,'BLOCKED');assert.equal(result.reason,'DIAGNOSTIC_SAVE_PROMPT_MISSING');
 assert.equal(result.native_close_readback.status,'unavailable');
 assert.equal(result.native_close_readback.reason,'deadline_exceeded');
 assert.equal(result.package_closed,false);assert.equal(result.logged_out,false);
 assert.equal(result.unsaved_changes_discarded,false);
 assert.equal(f.events.filter(e=>e==='close').length,1);
 assert.equal(f.events.includes('discard'),false);assert.equal(f.events.includes('logout'),false);
});

for(const fault of ['none','dirty','foreign path','foreign account','connection','existing inventory','old tab','not submitted','wrong request','readonly','server session','foreign document','two packages','unknown mode','reserve account','expired','session changes during read','session changes after close','foreign window','own hidden picker','own active picker','foreign hidden picker'])test('D56c failed Open uses only the new owned package: '+fault,async()=>{
 const {makeFailedOpenCleanupCode}=await import('../lib/package-cleanup.mjs');
 const f=fixture({modified:fault==='dirty',readonly:fault==='readonly'}),c=f.context;
 const m=c.bg.app.Application.FInstance.FMainForm.FMapTree;
 const node=m.PackageNodes.Items(0),tab=c.ownedTab;
 f.state.tabTid='MF;cntMain;cntWorkspace;Workspace;t.br;tb-1';tab.classList={contains:()=>true};
 c.bg.app.Application.FInstance.FMainForm.Items={Workspace:{getActiveTab:()=>({Controller:{Node:{data:{node}}}})}};
 const query=c.document.querySelectorAll;
 c.document.querySelectorAll=q=>q.startsWith('[data-tid^="MF;cntMain;cntWorkspace')?[tab]:query(q);
 const receipt=c.__loginomDockPreparationV1.receipts.get('prepare');
 receipt.request=JSON.stringify({session:options.sessionId,intent:'open_package',packagePath:options.packagePath});
 receipt.phase='effect_possible';receipt.before=[];receipt.openSubmitted=true;
 receipt.openAccount=options.account;receipt.openConnection=m.FServerConnection;receipt.openServerSession=m.FServerConnection.Session;receipt.packageInventoryBefore=0;
 delete receipt.tab;delete receipt.packageNode;
 if(fault==='foreign path')f.state.path='/foreign/other.lgp';
 if(fault==='foreign account')f.state.account='foreign';
 if(fault==='connection')receipt.openConnection={};
 if(fault==='server session')receipt.openServerSession={};
 if(fault==='foreign document')c.__loginomDockPreparationV1.document={};
 if(fault==='two packages')f.state.count=2;
 if(fault==='unknown mode')f.state.readonly=undefined;
 if(fault==='reserve account')receipt.openAccount='foreign';
 if(fault==='existing inventory')receipt.packageInventoryBefore=1;
 if(fault==='old tab')receipt.before=[tab];
 if(fault==='not submitted')receipt.openSubmitted=false;
 if(['foreign window','own hidden picker','own active picker','foreign hidden picker'].includes(fault)){
  const window={id:'picker',getBoundingClientRect:()=>({x:283,y:-2327,width:730,height:500})};
  const component={$className:'bg.filedialog.view.OpenDialogForm',el:{dom:window},hidden:fault!=='own active picker'};
  c.Ext={getCmp:()=>component};
  if(fault.startsWith('own ')){receipt.openDialogElement=window;receipt.openDialog=component;}
  const find=c.document.querySelectorAll;c.document.querySelectorAll=q=>q.includes('.x-window')?[window]:find(q);
 }
 if(fault==='wrong request')receipt.request=JSON.stringify({session:'foreign',intent:'open_package',packagePath:options.packagePath});
 const wait=f.page.waitForTimeout;f.page.waitForTimeout=ms=>ms>100?new Promise(()=>{}):wait(ms);
 const code=makeFailedOpenCleanupCode({...options,operationId:'prepare'});
 if(fault==='expired'){const deadline=Number(code.match(/deadline=(\d+)/)[1]);c.Date=class extends Date {static now(){return deadline;}};}
 if(fault==='session changes during read'){const read=m.FServerConnection.Session.IsPackageModified;m.FServerConnection.Session.IsPackageModified=async()=>{const result=await read();m.FServerConnection.Session={};return result;};}
 if(fault==='session changes after close'){const close=m.ClosePackage;m.ClosePackage=async(...args)=>{const result=await close(...args);m.FServerConnection.Session={};return result;};}
 const result=await vm.runInContext('('+code+')',c)(f.page);
 const success=['none','readonly','own hidden picker'].includes(fault);
 assert.equal(result.status,success?'SUCCEEDED':'BLOCKED',JSON.stringify(result));
 const closed=success||fault==='session changes after close';
 assert.equal(result.package_closed,closed);assert.equal(result.logged_out,success);
 assert.equal(f.events.includes('close'),closed);assert.equal(f.events.includes('discard'),false);
 if(fault==='session changes after close'){assert.equal(result.reason,'LOGOUT_SESSION_CHANGED');assert.equal(f.events.includes('logout'),false);}
 if(fault==='dirty')assert.equal(result.reason,'UNSAVED_CHANGES');
});

test('D56c Open diagnostics read native inventory/errors without binding or RPC guesses',async()=>{
 const {makeColdOpenDiagnosticCode}=await import('../lib/package-cleanup.mjs');
 const f=fixture(),m=f.context.bg.app.Application.FInstance.FMainForm.FMapTree;
 m.FServerConnection.Session.SessionID='server-session';
 Object.defineProperty(m.FServerConnection.Session,'ID',{get(){throw Error('never invoke guessed RPC getter');}});
 const query=f.context.document.querySelectorAll;
 f.context.document.querySelectorAll=q=>q==='.bg-error-messages'?[{textContent:'Open rejected',getBoundingClientRect:()=>({width:20,height:10})}]:query(q);
 const receipt=f.context.__loginomDockPreparationV1.receipts.get('prepare');
 const result=await vm.runInContext('('+makeColdOpenDiagnosticCode(options)+')',f.context)(f.page);
 assert.equal(result.packages[0].path,options.packagePath);assert.equal(result.packages[0].read_only,false);
 assert.equal(result.inventory_complete,true);assert.equal(result.server_session,'server-session');
 assert.equal(result.errors[0].text,'Open rejected');assert.equal(receipt.failedOpenCleanup,undefined);
 assert.deepEqual(f.events,[]);
});

// The retained cold journals show an exact new package, writable mode,
// PACKAGE_OPEN_REJECTED and the same renderer text under the TabForm mask.
// Modal ownership below models the native ErrorMsg/FMessages contract; the
// historical journals did not capture its data-tid or DOM (not a live proof).
function failedOpenFixture(fault='none') {
 const f=fixture(),c=f.context,m=c.bg.app.Application.FInstance.FMainForm.FMapTree;
 const node=m.PackageNodes.Items(0),tab=c.ownedTab,r=c.__loginomDockPreparationV1.receipts.get('prepare');
 f.state.tabTid='MF;cntMain;cntWorkspace;Workspace;t.br;tb-1';tab.classList={contains:()=>true};
 const element=(tid,text='')=>({id:tid,isConnected:true,textContent:text,innerText:text,getAttribute:()=>tid,
  contains(e){return e===this;},closest(){return null;},matches:()=>false,
  getBoundingClientRect:()=>({x:100,y:100,width:200,height:100})});
 const root=element('MF;TF-1'),error=element('msgbox'),body=element('messages',"Cannot read properties of undefined (reading 'TestableCellRenderer')"),ok=element('msgbox;tlb;ok','OK');
 f.state.mask=true;f.state.openError=true;f.state.dismissals=0;
 root.matches=()=>f.state.mask;root.contains=e=>e===root;
 error.contains=e=>[error,body,ok].includes(e);
 for(const e of [error,body,ok])e.getBoundingClientRect=()=>({x:100,y:100,width:f.state.openError?200:0,height:f.state.openError?100:0});
 const native={$className:'bg.app.view.TabForm',el:{dom:root},hidden:false,Controller:{Node:{data:{node}}}};
 const message={el:{dom:error}},messages={el:{dom:body}},info={};
 const instance={FMessageBox:message,FMessages:messages,FErrorMessageInfo:info};
 const button={el:{dom:ok},disabled:false,ownerCt:message};
 c.bg.ext={errormessage:{ErrorMsg:{FInstance:instance}}};
 c.Ext={getCmp:id=>id===root.id?native:id===error.id?message:id===ok.id?button:null};
 c.innerWidth=1280;c.innerHeight=800;
 c.bg.app.Application.FInstance.FMainForm.Items={Workspace:{getActiveTab:()=>native}};
 const query=c.document.querySelectorAll;
 c.document.querySelectorAll=q=>q.startsWith('[data-tid^="MF;cntMain;cntWorkspace')?[tab]:
  q==='[data-tid="MF;TF-1"]'?[root]:q==='.bg-error-messages'?[body]:q==='[data-tid="msgbox;tlb;ok"]'?[ok]:
  q==='[data-tid^="msgbox;tlb;"]'?(fault==='confirmation'?[ok,element('msgbox;tlb;yes')]:[ok]):
  q.startsWith('[role="dialog"]')?[...(f.state.mask?[root]:[]),...(f.state.openError?[error]:[]),...(fault==='foreign dialog'?[element('foreign')]:[])]:query(q);
 c.document.elementFromPoint=()=>fault==='covered'?element('cover'):ok;
 Object.assign(r,{request:JSON.stringify({session:options.sessionId,intent:'open_package',packagePath:options.packagePath}),phase:'effect_possible',before:[],openSubmitted:true,
  openAccount:options.account,openConnection:m.FServerConnection,openServerSession:m.FServerConnection.Session,packageInventoryBefore:0,
  openError:{instance,message,root:error,messages,info,element:body}});
 delete r.tab;delete r.packageNode;
 if(fault==='unknown error')body.textContent='Unknown error';
 if(fault==='unbound error')delete r.openError;
 if(fault==='changed native')instance.FErrorMessageInfo={};
 if(fault==='foreign account')f.state.account='foreign';
 if(fault==='dirty')f.state.modified=true;
 if(fault==='running')f.state.running=true;
 const wait=f.page.waitForTimeout;
 f.page.waitForTimeout=async ms=>{
  if(ms>100)return new Promise(()=>{});
  await wait(ms);
  if(!['permanent mask','late modal'].includes(fault))f.state.mask=false;
  if(fault==='late modal'){f.state.openError=false;f.state.mask=false;}
  if(fault==='session after wait')m.FServerConnection.Session={};
  if(fault==='late wait')f.state.clock+=30000;
 };
 ok.click=()=>{f.state.dismissals++;f.events.push('error-ok');if(fault!=='late modal')f.state.openError=false;
  if(fault==='lost click')throw Error('lost OK reply');
  if(fault==='late click')f.state.clock+=30000;
 };
 f.page.mouse={async click(){return ok.click();}};
 return {...f,runFailed:async()=>{
  const {makeFailedOpenCleanupCode}=await import(process.env.D78_CLEANUP_MODULE??'../lib/package-cleanup.mjs');
  const code=makeFailedOpenCleanupCode({...options,operationId:'prepare'});
  f.state.deadline=Number(code.match(/deadline=(\d+)/)[1]);f.state.clock=f.state.deadline-30000;
  c.Date=class extends Date {static now(){return f.state.clock;}};
  return vm.runInContext('('+code+')',c)(f.page);
 }};
}

for(const sample of ['p15 cold:1–2','LAB-173 p24 cold1:1–2'])test('D78 replay '+sample+' dismisses only owned error, waits mask and closes/logs out',async()=>{
 const f=failedOpenFixture(),result=await f.runFailed();
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.equal(result.package_closed,true);assert.equal(result.logged_out,true);assert.equal(result.unsaved_changes_discarded,false);
 assert.equal(f.state.dismissals,1);assert.equal(f.events.filter(x=>x==='close').length,1);
 assert.ok(f.events.indexOf('error-ok')<f.events.indexOf('idle-wait'));
 assert.ok(f.events.indexOf('idle-wait')<f.events.indexOf('close'));
 assert.ok(f.events.indexOf('close')<f.events.indexOf('logout'));
});

test('D78 late own modal disappearance is read-only settlement, never another OK',async()=>{
 const f=failedOpenFixture('late modal'),r=await f.runFailed();
 assert.equal(r.status,'SUCCEEDED');assert.equal(f.state.dismissals,1);assert.equal(r.package_closed,true);assert.equal(r.logged_out,true);
});

// LAB-510 native-messagebox.json: details, mailto and an unlabeled control
// accompany OK; only the message-box toolbar offers a response choice.
for(const outcome of ['hidden body', 'released native handles', 'persistent window', 'replacement window'])
test('D78 Loginom 7.4.2 four-button error settles after its own OK: '+outcome,async()=>{
 const f=failedOpenFixture('late modal'),c=f.context;
 const r=c.__loginomDockPreparationV1.receipts.get('prepare'),error=r.openError;
 const query=c.document.querySelectorAll;
 const extras=[['DetailPanel;btnDetais','Технические подробности'],['DetailPanel;btnMailto','Сообщить об ошибке'],['b','']]
  .map(([tid,label])=>({getAttribute:()=>tid,innerText:label,getBoundingClientRect:()=>({width:20,height:10})}));
 const contains=error.root.contains;error.root.contains=e=>extras.includes(e)||contains(e);
 c.document.querySelectorAll=q=>q==='[data-tid^="DetailPanel;"]'?extras.slice(0,2):q==='[data-tid="b"]'?[extras[2]]:query(q);
 const ok=query('[data-tid="msgbox;tlb;ok"]')[0],click=ok.click;
 ok.click=()=>{
  click();
  // The close animation can hide the messages before its window disappears.
  error.element.getBoundingClientRect=()=>({width:0,height:0});
 };
 const wait=f.page.waitForTimeout;
 let waits=0;
 f.page.waitForTimeout=async ms=>{
  await wait(ms);
  if(ms>100)return;
  waits++;
  if(outcome==='hidden body'&&waits===1)f.state.openError=true;
  if(outcome==='released native handles'){
   error.message.el=null;error.messages.el=null;c.bg.ext.errormessage.ErrorMsg.FInstance=null;
  }
  if(outcome==='persistent window')f.state.openError=true;
  if(outcome==='replacement window'){
   f.state.openError=true;c.bg.ext.errormessage.ErrorMsg.FInstance={};
  }
 };
 const result=await f.runFailed(),success=['hidden body','released native handles'].includes(outcome);
 assert.equal(result.status,success?'SUCCEEDED':'BLOCKED',JSON.stringify(result));
 assert.equal(result.package_closed,success);assert.equal(result.logged_out,success);
 assert.equal(f.state.dismissals,1);assert.equal(f.events.filter(x=>x==='close').length,success?1:0);
 assert.equal(result.unsaved_changes_discarded,false);
 if(success)assert.ok(f.events.indexOf('idle-wait')<f.events.indexOf('close'));
 if(outcome==='hidden body')assert.equal(waits,2);
 if(outcome==='persistent window')assert.equal(f.state.clock,f.state.deadline);
});

test('D78 a later cleanup call cannot renew the failed Open cleanup deadline',async()=>{
 const f=failedOpenFixture();
 const r=f.context.__loginomDockPreparationV1.receipts.get('prepare');
 r.failedOpenCleanupDeadline=Date.now()-1;
 const result=await f.runFailed();
 assert.equal(result.status,'BLOCKED');assert.equal(f.state.dismissals,0);assert.equal(f.events.includes('close'),false);
});

for(const fault of ['foreign dialog','covered','confirmation','unknown error','unbound error','changed native','foreign account','dirty','running',
 'session after wait','permanent mask','lost click','late click','late wait'])test('D78 keeps refusal/one-flight/deadline: '+fault,async()=>{
 const f=failedOpenFixture(fault),result=await f.runFailed();
 assert.equal(result.status,'BLOCKED',JSON.stringify(result));assert.equal(result.package_closed,false);assert.equal(result.logged_out,false);
 assert.ok(f.state.dismissals<=1);assert.equal(f.events.includes('close'),false);assert.equal(f.events.includes('logout'),false);
 if(['foreign dialog','covered','confirmation','unknown error','unbound error','changed native','foreign account'].includes(fault))assert.equal(f.state.dismissals,0);
 assert.equal(result.unsaved_changes_discarded,false);
});

for(const race of ['foreign error','replacement session','moved button'])test('D78 OK transport race has zero gestures: '+race,async()=>{
 const f=failedOpenFixture(),evaluate=f.page.evaluate;let changed=false;
 f.page.evaluate=async(fn,arg)=>{
  const value=await evaluate(fn,arg);
  if(value?.dismiss&&!changed){
   changed=true;
   if(race==='foreign error')f.context.bg.ext.errormessage.ErrorMsg.FInstance.FErrorMessageInfo={foreign:true};
   if(race==='replacement session')f.context.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.Session={foreign:true};
   if(race==='moved button')f.context.document.elementFromPoint=()=>({id:'foreign-destructive-control'});
  }
  return value;
 };
 const result=await f.runFailed();
 assert.equal(changed,true);assert.equal(result.status,'BLOCKED');
 assert.equal(f.state.dismissals,0);assert.equal(f.events.includes('close'),false);assert.equal(f.events.includes('logout'),false);
});

for(const race of ['button reference','native control','geometry','label','deadline'])test('D78 pins exact OK reference/signature and original deadline: '+race,async()=>{
 const f=failedOpenFixture(),c=f.context,evaluate=f.page.evaluate;
 f.page.evaluate=async(fn,arg)=>{
  const value=await evaluate(fn,arg);
  if(value?.reason==='OWNED_OPEN_ERROR'){
   const ok=c.document.querySelectorAll('[data-tid="msgbox;tlb;ok"]')[0];
   if(race==='button reference'){
    const replacement={...ok};
    const query=c.document.querySelectorAll;
    c.document.querySelectorAll=q=>query(q).map(e=>e===ok?replacement:e);
   }
   if(race==='native control'){
    const get=c.Ext.getCmp,control=get(ok.id);c.Ext.getCmp=id=>id===ok.id?{...control}:get(id);
   }
   if(race==='geometry')ok.getBoundingClientRect=()=>({x:110,y:100,width:200,height:100});
   if(race==='label')ok.innerText='Different';
   if(race==='deadline')f.state.clock+=30000;
  }
  return value;
 };
 const result=await f.runFailed();
 assert.equal(result.status,'BLOCKED');assert.equal(f.state.dismissals,0);
 assert.equal(f.events.includes('close'),false);assert.equal(f.events.includes('logout'),false);
});

test('D78 OK receipt is retained and an ACK loss cannot repeat the gesture',async()=>{
 const f=failedOpenFixture(),evaluate=f.page.evaluate;
 f.page.evaluate=async(fn,arg)=>{
  const result=await evaluate(fn,arg);
  if(result?.gesture_returned===true)throw Error('lost guarded gesture ACK');
  return result;
 };
 const first=await f.runFailed();assert.equal(first.status,'BLOCKED');assert.equal(f.state.dismissals,1);
 const ledger=f.page[Symbol.for('loginom-dock.operation-receipts.v1')];
 assert.equal(ledger.size,1);assert.equal([...ledger.values()][0].state,'unknown');
 f.state.openError=true; // No acknowledgement and the same modal is still visible.
 const second=await f.runFailed();assert.equal(second.status,'BLOCKED');assert.equal(f.state.dismissals,1);
 assert.equal(f.events.includes('close'),false);assert.equal(f.events.includes('logout'),false);
});

for(const keepMask of [false,true])test('D78 own error disappearing before OK continues normal cleanup, mask='+keepMask,async()=>{
 const f=failedOpenFixture(),evaluate=f.page.evaluate;let disappeared=false,okCallback=false;
 const m=f.context.bg.app.Application.FInstance.FMainForm.FMapTree,close=m.ClosePackage;
 m.ClosePackage=(...args)=>{assert.equal(okCallback,false,'OK callback must never start native Close');return close(...args);};
 f.page.evaluate=async(fn,arg)=>{
  okCallback=arg?.dismissOpenError===true;
  const value=await evaluate(fn,arg);
  if(okCallback)assert.notEqual(value?.started,true,'OK callback only dismisses its own error');
  okCallback=false;
  if(value?.reason==='OWNED_OPEN_ERROR'&&!disappeared){
   disappeared=true;f.state.openError=false;f.state.mask=keepMask;
  }
  return value;
 };
 const result=await f.runFailed();
 assert.equal(disappeared,true);assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.equal(result.package_closed,true);assert.equal(result.logged_out,true);assert.equal(result.unsaved_changes_discarded,false);
 assert.equal(f.state.dismissals,0);assert.equal(f.events.includes('error-ok'),false);
 assert.equal(f.events.filter(x=>x==='close').length,1);assert.equal(f.events.filter(x=>x==='logout').length,1);
 if(keepMask)assert.ok(f.events.indexOf('idle-wait')<f.events.indexOf('close'));
 assert.ok(f.events.indexOf('close')<f.events.indexOf('logout'));assert.ok(f.state.clock<f.state.deadline);
});

test('review privacy: diagnostic does not persist a file-name canary from a hit target',async()=>{
  const f=fixture({avatarTimeouts:1,maskAfterTimeout:true});
  const canary='alice.smith@example.invalid.csv';
  const tid='MF;TF-1;FileStorageForm;colName_'+canary;
  f.context.document.elementFromPoint=()=>({closest:()=>({getAttribute:()=>tid})});
  const r=await f.run();
  assert.equal(JSON.stringify(r).includes(canary),false);
});
test('review deadline: outer 30000ms call retains the original refusal and package facts',async t=>{
  const f=fixture({avatarTimeouts:1,maskAfterTimeout:true,avatarElapsed:27500});
  const evaluate=f.page.evaluate.bind(f.page);
  f.page.evaluate=(fn,arg)=>fn.toString().includes('const groups=')?new Promise(()=>{}):evaluate(fn,arg);
  const locator=f.page.locator;
  f.page.locator=query=>{
    const l=locator(query);
    if(query.includes('btnAvatar')){
      const click=l.click;
      l.click=async settings=>{try{return await click(settings);}finally{t.mock.timers.tick(27500);}};
    }
    return l;
  };
  const server=new Server({name:'review-browser',version:'1'},{capabilities:{tools:{}}});
  const client=new Client({name:'review-bridge',version:'1'});
  server.setRequestHandler(CallToolRequestSchema,async()=>({content:[{type:'text',text:JSON.stringify(await f.run())}]}));
  const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(b);await client.connect(a);
  t.mock.timers.enable({apis:['setTimeout']});
  let result;
  const pending=client.callTool({name:'browser_run_code_unsafe',arguments:{}},undefined,{timeout:30000})
    .then(r=>{result=JSON.parse(r.content[0].text);},error=>{result={status:'BLOCKED',reason:'CLEANUP_OR_OPERATION_UNCONFIRMED',transport_error:error.message};});
  const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
  await flush();
  f.state.clock+=500;t.mock.timers.tick(500);await flush();
  assert.ok(result,'receipt arrives before the outer deadline');
  f.state.clock+=2000;t.mock.timers.tick(2000);await flush();await pending;
  await client.close();await server.close();
  assert.equal(result.reason,'CLEANUP_UNCONFIRMED');
  assert.equal(result.package_closed,true);
});

for(const elapsed of [28900,29000,29500])test('D81 diagnostic leaves delivery reserve after '+elapsed+' ms',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture({avatarTimeouts:1,maskAfterTimeout:true,avatarElapsed:elapsed});
  const evaluate=f.page.evaluate.bind(f.page);let reads=0;
  f.page.evaluate=(fn,arg)=>{
    if(fn.toString().includes('const groups=')){reads++;return new Promise(()=>{});}
    return evaluate(fn,arg);
  };
  let result;
  const pending=f.run().then(r=>{result=r;});
  const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
  await flush();
  if(elapsed<29000){f.state.clock+=100;t.mock.timers.tick(100);await flush();}
  assert.ok(result);await pending;
  assert.equal(reads,elapsed<29000?1:0);
  assert.equal(result.reason,'CLEANUP_UNCONFIRMED');assert.equal(result.package_closed,true);
  assert.equal(result.logged_out,false);assert.equal(result.unsaved_changes_discarded,false);
  assert.equal(f.events.filter(e=>e==='close').length,1);
});

test('D81 diagnostic redacts dynamic IDs on both observed elements and hit targets',async()=>{
  const f=fixture({avatarTimeouts:1,maskAfterTimeout:true});
  const canary='private-name@example.invalid';
  for(const element of f.context.document.querySelectorAll('[data-tid*="btnAvatar"]'))
    element.getAttribute=()=> 'MF;TF-1;FileStorageForm;colName_'+canary;
  const r=await f.run();
  assert.equal(JSON.stringify(r).includes(canary),false);
  assert.equal(r.logout_menu_readback.avatar[0].tid,null);
  assert.equal(r.logout_menu_readback.avatar[0].hit_tid,null);
});

test('D81 diagnostic retains fixed safe control IDs',async()=>{
  const f=fixture({avatarTimeouts:1,maskAfterTimeout:true});
  const tid='MF;cntMain;tlbMainToolbar;btnAvatar';
  for(const element of f.context.document.querySelectorAll('[data-tid*="btnAvatar"]'))element.getAttribute=()=>tid;
  const r=await f.run();
  assert.equal(r.logout_menu_readback.avatar[0].tid,tid);
  assert.equal(r.logout_menu_readback.avatar[0].hit_tid,tid);
});

for(const mode of ['clean','dirty','foreign-intent','persisted','foreign-tab','running'])
 test('unsaved prepared draft cleanup retains native guards: '+mode,async()=>{
  const f=fixture({path:mode==='persisted'?options.packagePath:null,modified:mode==='dirty',running:mode==='running'});
  const r=f.context.__loginomDockPreparationV1.receipts.get('prepare');
  r.request=JSON.stringify({session:options.sessionId,intent:mode==='foreign-intent'?'existing_workflow':'new_draft'});
  r.phase='verified';r.packageInventoryBefore=0;
  if(mode==='foreign-tab')f.state.tab=false;
  const result=await f.run({packagePath:null,unsavedDraft:true});
  assert.equal(result.status,mode==='clean'?'SUCCEEDED':'BLOCKED');
  assert.equal(f.events.includes('close'),mode==='clean');
  assert.equal(result.unsaved_changes_discarded,false);
  if(mode==='clean'){
   assert.equal(result.package_path,null);assert.equal(result.logged_out,true);
   parsePackageCleanupResult({content:[{type:'text',text:JSON.stringify(result)}]},
    {sessionId:options.sessionId,documentId:options.documentId,account:options.account,packagePath:null});
  }
 });
