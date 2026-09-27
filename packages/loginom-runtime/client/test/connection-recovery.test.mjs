import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {withStorageIdentity,createStorageBinding} from '../lib/storage-policy.mjs';

function fixture(managedLoginBarrier=false){
 const c={Connected:true,UserName:'mimo',FRemoteSession:{},FSession:{}};
 const packageNode={PackageFileName:'/mimo/result.lgp'}, packages=[packageNode];
 const form={FReconnecting:false,FMapTree:{FServerConnection:c,PackageNodes:{get Count(){return packages.length;},Items:i=>packages[i]}}};
 const globals={document:{},location:{origin:'http://test.local'},bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:form}}}},__loginomDockPreparationV1:{id:'doc'}};
 const binding=createStorageBinding({sessionId:'s',origin:globals.location.origin,build:'7.4.2',documentId:'doc',account:'mimo',managedLoginBarrier,directories:{packages:'/mimo',inputs:'/mimo',exports:'/mimo'}});
 const state={locators:0,clicks:0,effects:0,timeout:false,title:'Восстановление сессии',onClick:()=>{c.Connected=true;form.FReconnecting=false;}};
 const evaluate=async(fn,arg)=>vm.runInNewContext('('+fn.toString()+')(input)',{...globals,input:arg});
 const page={evaluate,effect:()=>++state.effects,
  locator:selector=>{state.locators++;return {waitFor:async()=>{},count:async()=>1,isVisible:async()=>true,
   innerText:async()=>selector.includes('p.h;p.t')?state.title:selector.includes('tlb;yes')?'Восстановить':'Обнаружен разрыв связи. Восстановить сессию?',
   click:async()=>{state.clicks++;await state.onClick();}};},
  waitForFunction:async fn=>{if(state.timeout||!await evaluate(fn))throw Error('timeout');}};
 const run=vm.runInNewContext('('+withStorageIdentity('async page=>page.effect()',binding)+')');
 return {c,form,globals,packages,packageNode,state,page,run:()=>run(page)};
}
test('original session recovery makes one gesture and invokes caller once',async()=>{
 const f=fixture();await f.run();f.c.Connected=false;f.form.FReconnecting=true;
 assert.equal(await f.run(),2);assert.equal(f.state.clicks,1);
 await f.run();assert.equal(f.state.clicks,1);
});
for(const changed of ['account','document','connection','remote','session','package','path','dialog'])test('recovery refuses changed '+changed+' before any gesture',async()=>{
 const f=fixture();await f.run();f.c.Connected=false;
 if(changed==='account')f.c.UserName='other';
 if(changed==='document')f.globals.document={};
 if(changed==='connection')f.form.FMapTree.FServerConnection={...f.c};
 if(changed==='remote')f.c.FRemoteSession={};
 if(changed==='session')f.c.FSession={};
 if(changed==='package')f.packages[0]={...f.packageNode};
 if(changed==='path')f.packageNode.PackageFileName='/mimo/other.lgp';
 if(changed==='dialog')f.state.title='Loginom 7.4.2';
 await assert.rejects(f.run());assert.equal(f.state.effects,1);assert.equal(f.state.clicks,0);
});
test('unknown connection cannot be recovered without connected baseline',async()=>{
 const f=fixture();f.c.Connected=false;await assert.rejects(f.run());assert.equal(f.state.clicks,0);assert.equal(f.state.effects,0);
});
test('lost restore response does not repeat the gesture or run the caller',async()=>{
 const f=fixture();await f.run();f.c.Connected=false;f.state.onClick=()=>{};f.state.timeout=true;
 await assert.rejects(f.run());await assert.rejects(f.run());assert.equal(f.state.clicks,1);assert.equal(f.state.effects,1);
 f.c.Connected=true;f.form.FReconnecting=false;f.state.timeout=false;
 assert.equal(await f.run(),2);assert.equal(f.state.clicks,1);
});
test('replacement session after restoration blocks caller',async()=>{
 const f=fixture();await f.run();f.c.Connected=false;f.state.onClick=()=>{f.c.Connected=true;f.c.FSession={};};
 await assert.rejects(f.run());assert.equal(f.state.effects,1);assert.equal(f.state.clicks,1);
});
test('caller failure is never replayed by connection guard',async()=>{
 const f=fixture();await f.run();f.c.Connected=false;
 f.page.effect=()=>{f.state.effects++;throw Error('uncertain original gesture');};
 await assert.rejects(f.run(),/uncertain original gesture/);assert.equal(f.state.effects,2);assert.equal(f.state.clicks,1);
});

for(const condition of ['disconnected','reconnecting'])test('managed login refuses '+condition+' before restore UI and keeps refusal after native reconnect',async()=>{
 const f=fixture(true);assert.equal(await f.run(),1);
 if(condition==='disconnected')f.c.Connected=false;
 if(condition==='reconnecting')f.form.FReconnecting=true;
 await assert.rejects(f.run(),/LOGINOM_LOGIN_BARRIER_UNKNOWN/);
 assert.equal(f.state.locators,0);assert.equal(f.state.clicks,0);assert.equal(f.state.effects,1);
 f.c.Connected=true;f.form.FReconnecting=false;
 await assert.rejects(f.run(),/LOGINOM_LOGIN_BARRIER_UNKNOWN/);
 f.c.FSession={};f.c.FRemoteSession={};
 await assert.rejects(f.run(),/LOGINOM_LOGIN_BARRIER_UNKNOWN/);
 assert.equal(f.state.locators,0);assert.equal(f.state.clicks,0);assert.equal(f.state.effects,1);
});
test('managed first observation disconnected cannot later adopt a connected session',async()=>{
 const f=fixture(true);f.c.Connected=false;
 await assert.rejects(f.run(),/LOGINOM_LOGIN_BARRIER_UNKNOWN/);
 f.c.Connected=true;
 await assert.rejects(f.run(),/LOGINOM_LOGIN_BARRIER_UNKNOWN/);
 assert.equal(f.state.effects,0);assert.equal(f.state.locators,0);
});
for(const changed of ['connection','remote','session'])test('managed connected baseline rejects '+changed+' replacement without adoption',async()=>{
 const f=fixture(true);await f.run();
 if(changed==='connection')f.form.FMapTree.FServerConnection={...f.c};
 if(changed==='remote')f.c.FRemoteSession={};
 if(changed==='session')f.c.FSession={};
 await assert.rejects(f.run(),/LOGINOM_LOGIN_BARRIER_UNKNOWN/);
 assert.equal(f.state.effects,1);assert.equal(f.state.clicks,0);assert.equal(f.state.locators,0);
});
test('managed barrier stays local to its prepared session and requires actual native proof',async()=>{
 const stopped=fixture(true),fresh=fixture(true);
 await stopped.run();stopped.c.Connected=false;
 await assert.rejects(stopped.run(),/LOGINOM_LOGIN_BARRIER_UNKNOWN/);
 assert.equal(await fresh.run(),1);assert.equal(await fresh.run(),2);
 const unproved=fixture(true);delete unproved.c.FRemoteSession;
 await assert.rejects(unproved.run(),/LOGINOM_LOGIN_BARRIER_UNKNOWN/);
 unproved.c.FRemoteSession={};
 await assert.rejects(unproved.run(),/LOGINOM_LOGIN_BARRIER_UNKNOWN/);
 assert.equal(unproved.state.effects,0);assert.equal(unproved.state.locators,0);
});
test('managed flag is explicit immutable constructor policy; legacy binding shape is unchanged',()=>{
 const input={sessionId:'s',origin:'http://test.local',build:'7.4.2',documentId:'doc',account:'mimo',directories:{packages:'/mimo',inputs:'/mimo',exports:'/mimo'}};
 const managed=createStorageBinding({...input,managedLoginBarrier:true});
 assert.equal(managed.managed_login_barrier,true);assert.ok(Object.isFrozen(managed));
 assert.equal(Object.hasOwn(createStorageBinding(input),'managed_login_barrier'),false);
 for(const invalid of [null,1,'true',{}])assert.throws(()=>createStorageBinding({...input,managedLoginBarrier:invalid}));
});

test('managed connected session may create and save its own packages without being reclassified as a new login',async()=>{
 const f=fixture(true);await f.run();
 f.packageNode.PackageFileName='/mimo/saved.lgp';
 assert.equal(await f.run(),2);
 f.packages.push({PackageFileName:'/mimo/second.lgp'});
 assert.equal(await f.run(),3);
 assert.equal(f.state.clicks,0);assert.equal(f.state.locators,0);
 f.c.Connected=false;
 await assert.rejects(f.run(),/LOGINOM_LOGIN_BARRIER_UNKNOWN/);
 assert.equal(f.state.effects,3);assert.equal(f.state.clicks,0);
});
