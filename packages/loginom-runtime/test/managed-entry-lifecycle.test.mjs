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

test('existing IPC owner inspects exact actual pending runtime then closes',async()=>{
 const {Page,runtime,nodeParameters}=await import('../client/test/support/executor-fixture.mjs');const page=new Page();page.failDrag=true;const actual=runtime(page);const outcome=await actual.run('node.add',nodeParameters);assert.equal(outcome.status,'AMBIGUOUS');assert.equal(actual.hasUnsettledWork(),true);const drops=page.drops;
 const events=[],messages=[],listeners={},state={client:{close:async()=>{},callTool:async input=>actual.inspect(input.arguments)},bridge:{hasUnsettledWork:actual.hasUnsettledWork,hasActiveWork:actual.hasActiveWork,close:async()=>({browser_transport_closed:!actual.hasUnsettledWork()})},browser:{page,close:async()=>events.push('browser-close')}};
 const process={connected:true,on:(name,fn)=>listeners[name]=fn,exit:code=>events.push('exit:'+code),send:(m,cb)=>{messages.push(m);cb()},disconnect:()=>{process.connected=false;events.push('disconnect')}};
 const send=source.slice(source.indexOf('const send ='),source.indexOf('function close()'));
 const close=source.slice(source.indexOf('function close()'),source.indexOf('process.on("message"'));
 const handle=source.slice(source.indexOf('async function handle(message)'));
 const api=vm.runInNewContext(send+close+handle+';({handle})',{state,requests:new Set(),process,Promise,Error,AbortController,setImmediate});
 await api.handle({id:'refusal',operation:'close'});assert.equal(process.connected,true);assert.deepEqual(events,[]);assert.equal(state.browser.page,page);assert.equal(actual.hasUnsettledWork(),true);
 await api.handle({id:'original-inspect',operation:'call',input:{name:'dock_operation_inspect',arguments:{operation_id:outcome.operation_id}}});
 assert.ok(messages.find(m=>m.id==='original-inspect')?.result);assert.equal(state.browser.page,page);assert.equal(actual.hasUnsettledWork(),false);assert.equal(page.drops,drops);
 await api.handle({id:'settled-close',operation:'close'});assert.deepEqual(events,['browser-close','disconnect']);assert.equal(page.drops,drops);
});
