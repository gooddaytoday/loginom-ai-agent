import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
const module=await import(process.env.STARTUP_SOURCE??'../src/connection-check.mjs');
test('pre-widget pending/finished/failed capture is bounded and does not retain private data',()=>{
 const page=new EventEmitter(),d=module.startupPageDiagnostics(page,'https://own.invalid');
 const request=()=>({url:()=> 'https://own.invalid/GetCredential?password=SECRET',method:()=> 'POST',resourceType:()=> 'xhr',postData(){throw Error('MUST_NOT_READ_BODY')}});
 for(let i=0;i<500;i++)page.emit('request',{resourceType:()=> 'script'});assert.equal(d.evidence.static_requests,500);assert.equal(d.evidence.requests.length,0);
 const a=request(),b=request();page.emit('request',a);page.emit('request',b);page.emit('requestfinished',a);
 page.emit('pageerror',Error('SECRET'));page.emit('console',{type:()=> 'error',text(){throw Error('MUST_NOT_READ_TEXT')}});
 assert.equal(d.evidence.requests[0].state,'finished');assert.equal(d.evidence.requests[1].state,'pending');assert.equal(d.evidence.requests[1].pathname,'/GetCredential');
 page.emit('requestfailed',b);assert.equal(d.evidence.requests[1].state,'failed');
 for(let i=0;i<70;i++)page.emit('request',request());assert.equal(d.evidence.requests.length,64);assert.equal(d.evidence.dropped_requests,8);
 assert.equal(d.evidence.console_counts.error,1);assert.equal(JSON.stringify(d.evidence).includes('SECRET'),false);
 d.stop();d.stop();assert.equal(page.eventNames().length,0);assert.equal(d.evidence.stopped,true);
});
for(const [i,primary]of [Error('original'),undefined,null,false,0,''].entries())test('actual login pre-widget refusal retains first value and stops diagnostics '+i,async()=>{
 const page=new EventEmitter(),request={url:()=> 'https://own.invalid/LoadClientConfig?secret=omitted',method:()=> 'GET',resourceType:()=> 'xhr'};
 page.goto=async()=>{page.emit('request',request)};page.evaluate=async()=>{};
 page.locator=()=>({or(){return this},first(){return this},async waitFor(){throw primary}});
 const owner={id:'original',origin:'https://own.invalid',account:'own',evidence:{}};
 let failed=false,value;try{await module.loginPage(page,{url:'https://own.invalid/app/',username:'own',password:'not-read'},owner)}catch(e){failed=true;value=e}
 assert.equal(failed,true);assert.equal(value,primary);assert.equal(owner.loginSubmitted,undefined);
 assert.equal(owner.evidence.startup_diagnostics.requests[0].state,'pending');assert.equal(owner.evidence.startup_diagnostics.stopped,true);assert.equal(page.eventNames().length,0);
});
