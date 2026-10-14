import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [root,out]=process.argv.slice(2),load=p=>import(pathToFileURL(resolve(root,p)).href);
const {retainAmountManagedStartup,assertAmountManagedStartup}=await load('src/fp-managed-startup.mjs');
const {retainCaptureOwner,bindCaptureRuntime,assertCaptureOwner}=await load('src/retained-capture.mjs');
const {retainAmountCaptureProxy}=await load('src/amount-capture-proxy.mjs');
const fixturePath=join(root,'test/diagnostics/amount-capture-proxy/run.mjs');
const fixtures=await readFile(fixturePath,'utf8');
const fixture=Function('retainAmountManagedStartup','retainCaptureOwner','bindCaptureRuntime','retainAmountCaptureProxy',fixtures.slice(fixtures.indexOf('function fixture('),fixtures.indexOf('const rows=[];'))+'return fixture;')(retainAmountManagedStartup,retainCaptureOwner,bindCaptureRuntime,retainAmountCaptureProxy);
const text=await readFile(join(root,'src/managed-entry.mjs'),'utf8'),start=text.indexOf('    if (message.operation === "acceptance.files"'),end=text.indexOf('    if (message.operation === "admit")',start);
assert(start>=0&&end>start);const run=Object.getPrototypeOf(async function(){}).constructor('state','message','assertAmountManagedStartup','assertCaptureOwner','send','closeRejection','AbortController',text.slice(start,end));
const rows=[];
for(const mode of ['original-controller','missing-completion','late-abort-false']){
 const f=fixture(),replies=[];let captures=0,verified=0;
 f.state.captureRetained=f.retained;f.state.amountCaptureProxy=f.proxy;
 f.state.bridge.inspectAmountFile=async({signal})=>{captures++;assert.equal(signal,f.controller.signal);assert.equal(f.state.controller,f.controller);await Promise.resolve();if(mode==='late-abort-false')f.controller.abort(false);return {fileReadComplete:true}};
 f.state.bridge.assertAmountFile=(result,signal)=>{assert.equal(signal,f.controller.signal);verified++;if(mode==='missing-completion')throw Error('LOGINOM_AMOUNT_PHYSICAL_COMPLETION_UNAVAILABLE');f.controller.signal.throwIfAborted();return true};
 await run(f.state,{id:'original-request',operation:'acceptance.files',deadline:f.input.amountStartup.deadline},assertAmountManagedStartup,assertCaptureOwner,x=>replies.push(x),x=>x,AbortController);
 assert.equal(captures,1);assert.equal(verified,1);assert.equal(replies.length,1);assert.equal(f.state.controller,undefined);
 if(mode==='original-controller')assert.equal(replies[0].result.fileReadComplete,true);
 else{assert.equal(replies[0].result.refused,true);assert.equal(replies[0].result.cleanupComplete,false);if(mode==='late-abort-false')assert.equal(replies[0].result.rejected,false)}
 rows.push({mode,pass:true,originalControllerReference:true,originalSignalReference:true,captures,verified});
}
await writeFile(out,JSON.stringify({pass:rows.length,rows,limits:'Literal managed acceptance branch and genuine startup/retainer/proxy modules. Bridge consumer/completion and Page/native/SDK are labelled doubles; not selected embedded host/native positive path.'},null,2));console.log(rows.length);
