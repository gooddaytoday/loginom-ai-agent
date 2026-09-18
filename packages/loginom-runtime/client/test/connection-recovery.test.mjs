import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {withStorageIdentity,createStorageBinding} from '../lib/storage-policy.mjs';

function fixture(){
 const c={Connected:true,UserName:'mimo',FRemoteSession:{},FSession:{}};
 const packageNode={PackageFileName:'/mimo/result.lgp'}, packages=[packageNode];
 const form={FReconnecting:false,FMapTree:{FServerConnection:c,PackageNodes:{get Count(){return packages.length;},Items:i=>packages[i]}}};
 const globals={document:{},location:{origin:'http://test.local'},bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:form}}}},__loginomDockPreparationV1:{id:'doc'}};
 const binding=createStorageBinding({sessionId:'s',origin:globals.location.origin,build:'7.4.2',documentId:'doc',account:'mimo',directories:{packages:'/mimo',inputs:'/mimo',exports:'/mimo'}});
 const state={clicks:0,effects:0,timeout:false,title:'Восстановление сессии',onClick:()=>{c.Connected=true;form.FReconnecting=false;}};
 const evaluate=async(fn,arg)=>vm.runInNewContext('('+fn.toString()+')(input)',{...globals,input:arg});
 const page={evaluate,effect:()=>++state.effects,
  locator:selector=>({waitFor:async()=>{},count:async()=>1,isVisible:async()=>true,
   innerText:async()=>selector.includes('p.h;p.t')?state.title:selector.includes('tlb;yes')?'Восстановить':'Обнаружен разрыв связи. Восстановить сессию?',
   click:async()=>{state.clicks++;await state.onClick();}}),
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
