import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseCapabilityResult} from '../lib/executor.mjs';
import {withStorageIdentity,createStorageBinding} from '../lib/storage-policy.mjs';
import {connectionTimelineScript} from '../lib/connection-recovery.mjs';

test('passive connection timeline timestamps native loss without a server call or gesture',()=>{
 let at=1000,tick,intervals=0;
 const connection={Connected:true,FRemoteSession:{},FSession:{}};
 const form={FMapTree:{FServerConnection:connection},FReconnecting:false};
 const context=vm.createContext({location:{origin:'https://loginom.invalid'},
  document:{querySelector:()=>null},bg:{app:{Application:{FInstance:{FMainForm:form}}}},
  Date:{now:()=>at},setInterval:(callback,ms)=>{assert.equal(ms,1000);intervals++;tick=callback;}});
 const script=connectionTimelineScript('https://loginom.invalid/app/');
 vm.runInContext(script,context);vm.runInContext(script,context);assert.equal(intervals,1);
 at=30000;tick();assert.equal(context.__loginomConnectionTimelineV1.samples.length,1);
 at=121000;connection.Connected=false;form.FReconnecting=true;tick();
 const samples=context.__loginomConnectionTimelineV1.samples;
 assert.equal(samples.length,2);assert.equal(samples[1].at,121000);assert.equal(samples[1].connected,false);
 assert.equal(samples[1].local_session,true);assert.equal(samples[1].remote_session,true);
 for(let i=0;i<200;i++){connection.Connected=!connection.Connected;tick();}
 assert.equal(samples.length,128);assert.equal(context.__loginomConnectionTimelineV1.dropped,74);
});

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

test('serialized connection guard refusal keeps its cause through the browser error boundary',async()=>{
 const f=fixture();await f.run();f.c.Connected=false;f.c.FSession={};
 let response;
 try{await f.run();}catch(error){response={isError:true,content:[{type:'text',text:String(error)}]};}
 assert.ok(response);
 assert.throws(()=>parseCapabilityResult(response),{message:'Pinned browser capability call failed [LOGINOM_DISCONNECTED] (reason=owner)'});
 assert.equal(f.state.effects,1);assert.equal(f.state.clicks,0);
});
