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
  const events = [], state = {account:'test-2', path:options.packagePath, modified:false, running:false,
    count:1, tab:true, dialog:false, loggedOut:false, readonly:false, closeResult:true, ...overrides};
  const node = {DisplayName:'result',get PackageFileName(){return state.path;}, get ReadOnly(){return state.readonly;},
    Package:{}, HasRunningNodes:() => state.running};
  const m = {PackageNodes:{get Count(){return state.count;}, Items:() => node}, HasRunningNodes:() => state.running,
    FServerConnection:{get UserName(){return state.account;}, Connected:true, Session:{IsPackageModified:async () => {
      events.push('modified-read'); if (state.racePath) state.path = state.racePath; return state.modified;
    }}}, async ClosePackage(target, suppressEvents, processAfterCall) {
      events.push('close'); assert.equal(target,node); assert.equal(suppressEvents,false); assert.equal(processAfterCall,true);
      if (state.closePrompt || state.modified) { state.dialog=true; return new Promise(resolve => {
        state.confirm=()=>{state.count=0;state.tab=false;state.dialog=false;resolve(true);};
      }); }
      if (state.closeThrows) throw Error('upstream private failure');
      if (state.closeResult) { state.count=0; state.tab=false; }
      return state.closeResult;
    }};
  const dialog = {getBoundingClientRect:() => ({width:10,height:10})};
  const doc = {querySelectorAll:() => state.dialog ? [dialog] : []};
  const context = vm.createContext({document:doc, location:{origin:'http://loginom.invalid'},
    getComputedStyle:() => ({visibility:'visible'}), bg:{app:{Version:'7.4.2', Application:{FInstance:{FMainForm:{FMapTree:m}}}}}});
  vm.runInContext(`globalThis.__loginomDockPreparationV1={document,id:'owned-document',receipts:new Map([['prepare',{request:JSON.stringify({session:'owned-session'})}]])}`,context);
  const locator = query => ({
    locator:() => locator(query+' input'),
    async waitFor() {
      events.push(query.includes('LoginForm') ? 'login-visible' : 'tab-detached');
      if (query.includes('LoginForm') ? !state.loggedOut : state.tab) throw Error('UI wait failed');
    }, async click() {
      if (query.includes('tlb;no')) {events.push('discard');state.confirm();}
      else if (query.includes('btnLogOut')) { events.push('logout'); state.loggedOut=true; }
      else events.push('avatar');
    }, async count(){return state.dialog?1:0;},
    async innerText(){return query.includes('cnt;cnt;cmp')?(state.prompt??'Сохранить изменения в пакете "result"?'):state.account;},
    async isVisible(){return !state.loggedOut;},
  });
  const page = {locator,
    async evaluate(fn,arg){return vm.runInContext('('+fn.toString()+')',context)(arg);},
    async waitForFunction(fn,arg){for(let i=0;i<8;i++){if(await this.evaluate(fn,arg))return;await Promise.resolve();}throw Error('timeout');},
  };
  return {state,events,context, run:changed => vm.runInThisContext('('+makePackageCleanupCode({...options,...changed})+')')(page)};
}

test('saved owned package closes with native guards, tabs disappear, then logout', async () => {
  const f=fixture(), result=await f.run();
  assert.equal(result.status,'SUCCEEDED'); assert.equal(result.package_closed,true); assert.equal(result.logged_out,true);
  assert.equal(result.unsaved_changes_discarded,false);
  assert.deepEqual(f.events,['modified-read','close','tab-detached','avatar','logout','login-visible']);
  const again=await f.run();assert.equal(again.reason,'CLEANUP_ALREADY_ATTEMPTED');assert.equal(f.events.filter(e=>e==='close').length,1);
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
