import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
const {privateAmountTransport}=await import(pathToFileURL(resolve(process.argv[2]))),rows=[];
const encode=value=>value instanceof Error?{kind:'Error',name:value.name,message:value.message,cause:encode(value.cause)}:{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined};
for(const mode of ['false','undefined','Error','fulfilled-after-cancel','generic-after-cancel','preabort','expiry','channel-lost']) {
 const {port1,port2}=new MessageChannel(),listeners=new Map(),frames=[],controller=new AbortController();
 const value=mode==='undefined'?undefined:mode==='Error'?Error('original',{cause:0}):false;
 let primary,secondary;
 const client=privateAmountTransport({postMessage:m=>port1.postMessage(m),on(e,f){const fn=data=>f({data});listeners.set(f,fn);port1.on(e,fn)},off(e,f){port1.off(e,listeners.get(f))},start(){port1.start()}},(v,origin,second)=>{
  if(primary&&origin==='await')secondary??={value:v};primary??={value:v};if(second)secondary??=second;return primary.value;
 });
 const control={signal:controller.signal,deadline:Date.now()+10000,operation:'original-operation',request:'original-request'};
 const input={run:'original-run',authorization:'a'.repeat(64),amountControl:{authorization:'a'.repeat(64),operation:control.operation,request:control.request}},before=JSON.stringify(input);
 let capture,cancel,resolveCapture,resolveCancel;
 const dispatched=new Promise(r=>resolveCapture=r),cancelled=new Promise(r=>resolveCancel=r);
 port2.on('message',m=>{frames.push(m);if(m.method==='acceptance.capture'){capture=m;resolveCapture()}else{cancel=m;resolveCancel()}});
 if(mode==='preabort')controller.abort(value);if(mode==='expiry')control.deadline=Date.now()-1;
 let settled=false;
 const pending=Promise.resolve().then(()=>client.capture(input,control)).then(result=>{settled=true;return {result}},error=>{settled=true;return {error,rejected:true}});
 if(mode==='preabort'||mode==='expiry') {
  const result=await pending;assert.equal(result.rejected,true);assert.equal(frames.length,0);
 }else{
  await dispatched;assert.equal(capture.input.captureRequestId,capture.id);assert.equal(capture.deadline,control.deadline);assert.equal(settled,false);
  controller.abort(mode==='undefined'?false:value);await cancelled;
  assert.equal(cancel.input.phase,'capture');assert.equal(cancel.input.requestId,capture.id);assert.equal(cancel.input.captureRequestId,capture.id);
  for(const key of ['run','authorization','operation','request','deadline'])assert.equal(cancel.input[key],key==='run'?input.run:key==='authorization'?input.authorization:control[key]);
  assert.equal(settled,false);
  if(mode==='channel-lost')client.close();
  else if(mode==='generic-after-cancel')port2.postMessage({id:capture.id,error:'LOGINOM_HOST_REQUEST_FAILED'});
  else if(mode==='fulfilled-after-cancel')port2.postMessage({id:capture.id,result:{cleanupComplete:true}});
  else port2.postMessage({id:capture.id,rejection:encode(value),rejectionOrigin:'await'});
  const result=await pending;assert.equal(result.rejected,true);assert.equal(result.error,mode==='undefined'?false:value);
  if(['false','undefined','Error'].includes(mode)){assert(secondary);if(value instanceof Error){assert.equal(secondary.value.cause,0);assert.equal(secondary.value.message,value.message)}else assert.equal(secondary.value,value)}
  else if(mode==='generic-after-cancel')assert.equal(secondary.value.message,'LOGINOM_HOST_REQUEST_FAILED');else if(mode==='channel-lost')assert.equal(secondary.value.message,'LOGINOM_HOST_CLOSED');else assert.equal(secondary,undefined);
  assert.equal(frames.filter(m=>m.method==='acceptance.capture').length,1);assert.equal(frames.filter(m=>m.method==='readonly.preReady.cancel').length,1);
 }
 assert.equal(JSON.stringify(input),before);client.close();port1.close();port2.close();rows.push({mode,pass:true,native:false});
}
await writeFile(process.argv[3],JSON.stringify({rows,pass:rows.length,limits:'Real MessageChannel; labelled protocol peer, not installed factory/provider/physical cleanup authority.'},null,2));console.log(rows.length,'Amount capture sender protocol controls PASS');
