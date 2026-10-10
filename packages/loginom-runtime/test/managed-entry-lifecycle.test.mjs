import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';
const source=await fs.readFile(process.env.MANAGED_ENTRY_SOURCE??new URL('../src/managed-entry.mjs',import.meta.url),'utf8');
function fixture(receipt,{startup=false,missingBridge=false}={}){
 const events=[],failure=Error('evidence persistence failed'),page={id:'original-page',closed:false},bridge={receipt,async close(){events.push('bridge');if(this.receipt==='throw')throw failure;return this.receipt}},state={controller:{abort(){events.push('abort')}},client:{async close(){events.push('client')}},bridge:missingBridge?undefined:bridge,browser:startup?undefined:{page,async close(){page.closed=true;events.push('browser')}},browserProfile:startup?undefined:'original-profile'};
 if(startup)state.bridge=undefined;
 const listeners={},sandbox={state,requests:new Set(),Promise,Error,rm:async()=>events.push('remove-profile'),process:{on:(name,fn)=>listeners[name]=fn,exit:code=>events.push('exit:'+code)}};
 const chunk=source.slice(source.indexOf('function close() {'),source.indexOf('process.on("message"'));
 const api=vm.runInNewContext(chunk+';({close,stop})',sandbox);
 return {state,page,bridge,events,failure,listeners,...api};
}
for(const [name,receipt] of [['unsettled',{browser_transport_closed:false}],['identity',{browser_transport_closed:false}],['persistence','throw'],['missing',undefined],['false',false],['empty',{}]]){
 test('close retains original handles and rejection: '+name,async()=>{const f=fixture(receipt);await assert.rejects(f.close());assert.equal(f.page.closed,false);assert.deepEqual(f.events,['bridge']);assert.equal(f.state.browser.page,f.page);assert.equal(f.state.bridge,f.bridge);assert.ok(f.state.closeFailure);if(receipt==='throw')assert.equal(f.state.closeFailure,f.failure);
 f.bridge.receipt={browser_transport_closed:true};await f.close();assert.equal(f.page.closed,true);assert.deepEqual(f.events,['bridge','bridge','abort','client','browser','remove-profile']);});
 for(const route of ['disconnect','SIGTERM'])test(route+' does not exit after refusal: '+name,async()=>{const f=fixture(receipt);f.listeners[route]();await new Promise(r=>setImmediate(r));assert.equal(f.page.closed,false);assert.deepEqual(f.events,['bridge']);assert.ok(f.state.closeFailure);f.bridge.receipt={browser_transport_closed:true};f.stop();await new Promise(r=>setImmediate(r));assert.ok(f.events.includes('exit:0'));});
}
test('settled shutdown requires explicit receipt',async()=>{const f=fixture({browser_transport_closed:true});await f.close();assert.equal(f.page.closed,true)});
test('startup without browser requires no bridge',async()=>{const f=fixture(undefined,{startup:true});await f.close();assert.equal(f.page.closed,false);assert.deepEqual(f.events,['abort','client'])});
test('created browser without bridge is retained',async()=>{const f=fixture(undefined,{missingBridge:true});await assert.rejects(f.close());assert.equal(f.page.closed,false);assert.deepEqual(f.events,[])});
