import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
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
  const dialog = {getBoundingClientRect:() => ({width:10,height:10})};
  const tab = {getAttribute:() => state.tabTid ?? options.tabTid};
  const doc = {querySelectorAll:query => {
    if(query.includes('MF;AppMenuForm'))return state.menu ? Array(state.menuCount??1).fill(dialog) : [];
    if(query.includes('btnAvatar'))return state.avatarAbsent ? [] : [dialog];
    // Timeout adds a plain backdrop; initial masks also expose busy markers.
    return state.dialog || state.mask && (query.split(',').includes('.x-mask') || !state.maskAfterTimeout) ? [dialog] : [];
  }, contains:value => value === tab && state.tab};
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
      assert.ok(settings.timeout > 0 && settings.timeout <= (state.timeoutMs??options.timeoutMs));
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
  return {state,events,context, run:changed => {
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
