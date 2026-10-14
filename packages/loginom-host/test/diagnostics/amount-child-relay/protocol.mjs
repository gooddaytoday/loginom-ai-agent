import assert from'node:assert/strict';import{mkdtemp,readFile,writeFile}from'node:fs/promises';import{join,resolve}from'node:path';import{pathToFileURL}from'node:url';
const[module,rawOut,node]=process.argv.slice(2),out=resolve(rawOut),{supervise}=await import(pathToFileURL(resolve(module)));const rows=[];
for(const mode of ['immediate','cancel-false','cancel-fulfilled','unknown-fulfilled']){
 const root=await mkdtemp(join(out,mode+'-')),controller=new AbortController(),deadline=Date.now()+10000;let primary,secondary;
 const binding={revision:1,harness:'amount-import-type-v1',owner:'labelled',run:'run',lease:'labelled:run',generation:39,chat:'chat',account:'account',packagePath:'/account/a.lgp',admission:'labelled',expires:deadline};
 const startup={signal:controller.signal,deadline,requestId:'original-start',authorization:'a'.repeat(64),harness:'amount-import-type-v1',operation:'original-operation',request:'original-request',phase:'capture',binding,
 guard(){if(primary)throw primary.value;controller.signal.throwIfAborted()},reject(value){if(primary)secondary??={value};else primary={value};return primary.value},receive(value,origin,second){if(primary&&origin==='await')secondary??={value};primary??={value};if(second)secondary??=second;return primary.value},retain(){}};
 const runtime=await supervise({node,entry:join(import.meta.dirname,'protocol-child.mjs'),resources:root,stateDir:root,generation:39,chat:'chat',endpoint:'labelled',connection:{username:'account',apiKey:'labelled',password:'labelled',url:'https://labelled.invalid'},acceptanceCapture:binding},startup);
 const id='10000000-0000-0000-0000-000000000000';let settled=false;const promise=runtime.captureAmount(id).then(value=>{settled=true;return{value}},error=>{settled=true;return{error,rejected:true}});
 const wait=async test=>{for(let i=0;i<500;i++){const data=await readFile(join(root,'trace.jsonl'),'utf8').catch(()=> '');const a=data.trim()?data.trim().split('\n').map(JSON.parse):[];if(test(a))return a;await new Promise(r=>setTimeout(r,2))}throw Error('fixture trace missing')};
 const a=await wait(a=>a.some(x=>x.capture)),frame=a[0].capture.amountCapture;assert.equal(frame.outerRequestId,id);assert.equal(frame.captureRequestId,id);assert.equal(frame.managedRequestId,a[0].capture.id);assert.equal(frame.deadline,deadline);
 await assert.rejects(runtime.captureAmount(id));
 if(mode!=='immediate'){assert.equal(settled,false);controller.abort(false);await wait(a=>a.some(x=>x.cancel));assert.equal(settled,false)}
 const result=await promise;assert.equal(result.rejected,true);if(mode.startsWith('unknown'))assert.equal(result.error.message,'LOGINOM_AMOUNT_CAPTURE_RECEIPT_UNKNOWN');else assert.equal(result.error,false);
 if(mode==='cancel-false')assert.deepEqual(secondary,{value:false});
 const trace=await readFile(join(root,'trace.jsonl'),'utf8');assert.equal(trace.trim().split('\n').filter(l=>JSON.parse(l).capture).length,1);
 await runtime.close();rows.push({mode,pass:true,native:false});
}
await writeFile(join(out,'results.json'),JSON.stringify({pass:rows.length,rows,limits:'SOURCE_COMPILED supervisor + actual Node IPC; supplied labelled control and protocol child only. This is not original factory/managed/native provider authority.'},null,2));console.log(rows.length,'supervisor capture receipt/cancel controls PASS');
