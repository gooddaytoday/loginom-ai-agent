import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {fixture,captureControlledAmount} from './fixtures/amount-controlled-page.mjs';
const root=process.env.AMOUNT_RUNTIME??new URL('..',import.meta.url).pathname;
const controls=await import(pathToFileURL(root+'/src/acceptance/amount-caller-control.mjs'));
function controlled(f,controller=new AbortController(),deadline=Date.now()+50000) {
 const tuple={operation:'original-operation',request:'original-request',...Object.fromEntries(['owner','run','lease','generation','chat','account'].map(k=>[k,f.binding[k]]))};
 const control=controls.registerAmountControlProxy({signal:controller.signal,deadline,tuple},f.binding);
 return {...f,control,controller,tuple,deadline};
}
test('controlled fixed Amount uses original scalar deadline and preserves legacy cancel/result (Page doubles)',async()=>{
 const f=controlled(fixture('success'));const call=f.browser.callTool;const budgets=[];
 f.browser.callTool=async(...args)=>{budgets.push(args[2].timeout);return call(...args);};
 const result=await captureControlledAmount(f);
 assert.equal(result.cancel_verified,true);assert.equal(result.settings_applied,false);assert.ok(budgets.length>1);
 assert.ok(budgets.every(n=>n<=50000));assert.equal(f.events.filter(e=>e==='cancel').length,1);
 await assert.rejects(captureControlledAmount(f),/CONTROL_REQUIRED/);
});
for(const stage of ['missing','preabort','read-abort','read-tuple','record-abort','record-tuple','record-expiry'])test('controlled Amount refuses '+stage+' before next read/cancel',async()=>{
 const f=controlled(fixture('success'));let expected,hasExpected=false;
 if(stage==='missing')f.control={};
 if(stage==='preabort'){expected=0;hasExpected=true;f.controller.abort(expected);}
 const call=f.browser.callTool;
 if(stage.startsWith('read-'))f.browser.callTool=async(...args)=>{const result=await call(...args);if(stage==='read-abort'){expected=false;hasExpected=true;f.controller.abort(expected);}else f.tuple.chat='foreign';return result;};
 const record=f.record;
 if(stage.startsWith('record-'))f.record=async v=>{await record(v);if(stage==='record-abort'){expected='';hasExpected=true;f.controller.abort(expected);}else if(stage==='record-tuple')f.tuple.run='foreign';else {const old=Date.now;Date.now=()=>f.deadline+1;f.restore=()=>{Date.now=old;};}};
 let caught,present=false;try{await captureControlledAmount(f);}catch(e){caught=e;present=true;}finally{f.restore?.();}
 assert.equal(present,true);if(hasExpected)assert.equal(caught,expected);else assert.match(String(caught),/CONTROL_REQUIRED/);
 assert.equal(f.events.filter(e=>e==='cancel').length,0);
 if(stage==='missing'||stage==='preabort')assert.equal(f.events.filter(e=>e==='browser').length,0);
 if(stage.startsWith('read-'))assert.equal(f.events.filter(e=>e==='browser').length,1);
});
for(const value of [undefined,null,false,0,'',new Error('first',{cause:0})])test('controlled Amount preserves thrown value presence: '+String(value),async()=>{
 const f=controlled(fixture('success'));f.browser.callTool=async()=>{throw value;};
 let caught,present=false;try{await captureControlledAmount(f);}catch(e){caught=e;present=true;}
 assert.equal(present,true);assert.equal(caught,value);assert.equal(f.events.includes('cancel'),false);
});
