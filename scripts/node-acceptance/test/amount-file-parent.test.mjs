import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{pathToFileURL}from'node:url';
const root=process.argv[2]??new URL('../../../packages/loginom-runtime',import.meta.url).pathname;
const load=p=>import(pathToFileURL(root+'/'+p));const{createAmountFileRead}=await load('src/amount-file-bytes.mjs'),{retainAmountManagedStartup}=await load('src/fp-managed-startup.mjs'),{retainCaptureOwner,bindCaptureRuntime}=await load('src/retained-capture.mjs'),{retainAmountCaptureProxy,assertAmountCaptureProxy}=await load('src/amount-capture-proxy.mjs');
const txt=await readFile(new URL('../../../packages/loginom-runtime/test/diagnostics/amount-capture-proxy/run.mjs',import.meta.url),'utf8');
const fixture=Function('retainAmountManagedStartup','retainCaptureOwner','bindCaptureRuntime','retainAmountCaptureProxy',txt.slice(txt.indexOf('function fixture('),txt.indexOf('const rows=[];'))+'return fixture;')(retainAmountManagedStartup,retainCaptureOwner,bindCaptureRuntime,retainAmountCaptureProxy);
let pass=0;
for(const mode of ['positive','preabort','record-false','read-false','read-undefined','equal-secondary','lost','pending-release']){
 const f=fixture(),calls=[],records=[];let releaseResolve;
 f.page.evaluate=async(fn,{expected,phase})=>{calls.push(phase);assert.equal(expected.operation,f.input.amountStartup.operation);assert.equal(expected.request,f.input.amountStartup.request);assert.equal(expected.deadline,Math.min(f.input.amountStartup.deadline,f.binding.expires));
  if(phase==='read'&&mode==='lost')throw Error('lost',{cause:0});
  if((phase==='read'&&['read-false','read-undefined','equal-secondary'].includes(mode))||(phase==='release'&&mode==='equal-secondary'))return{ok:false,origin:'await',phase,operation:expected.operation,path:expected.path,rejection:{kind:'value',undefined:mode==='read-undefined',value:mode==='read-undefined'?null:false}};
  if(phase==='release'&&mode==='pending-release')await new Promise(resolve=>releaseResolve=resolve);
  return {ok:true,phase,operation:expected.operation,path:expected.path,...(phase==='read'?{base64:Buffer.from('bytes').toString('base64'),bytes:5}:{}),...(phase==='release'?{released:true}:{})};
 };
 const manager=createAmountFileRead(f.retained,{guard:()=>assertAmountCaptureProxy(f.proxy,f.binding,f.controller.signal),signal:f.controller.signal,record:async r=>{records.push(r);if(mode==='record-false')throw false}});
 if(mode==='preabort')f.controller.abort(false);
 let failed=false,reason;const task=manager.read().catch(v=>{failed=true;reason=v});
 if(mode==='pending-release'){await new Promise(resolve=>setTimeout(resolve,0));assert(manager.unsettled());assert.equal(records.length,0);releaseResolve()}
 await task;
 if(mode==='positive'||mode==='pending-release'){assert(!failed);assert.equal(records.length,1);assert.equal(records[0].receipt.release_confirmed,true);assert(!manager.unsettled());await assert.rejects(manager.read(),/ALREADY_ATTEMPTED/)}
 else{assert(failed);if(mode!=='lost')assert.equal(reason,mode==='read-undefined'?undefined:false);if(mode==='preabort')assert.equal(calls.length,0);if(mode==='lost'){assert(manager.unsettled());assert(!calls.includes('release'));assert.equal(reason.cause,0)}if(mode==='record-false')assert(manager.unsettled());if(mode==='equal-secondary'){assert.equal(manager.failures().failure,false);assert.equal(f.startup.secondary.value,false)}}
 pass++;console.log('PASS',mode);
}console.log(JSON.stringify({pass,fail:0,scope:'real managed/capture control and parent reader; Page/native/record doubles'}));
