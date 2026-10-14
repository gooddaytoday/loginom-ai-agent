import assert from 'node:assert/strict';import {pathToFileURL}from'node:url';import{resolve}from'node:path';import{writeFile}from'node:fs/promises';
const {privateNodeHostTransport,transport}=await import(pathToFileURL(resolve(process.argv[2]))),rows=[];
for(const first of [false,undefined]){
 let receive,disconnect,off=0,removed=0,sends=[];const ledger={primary:{value:first}};
 const client=privateNodeHostTransport({on(_,f){receive=f},off(){off++},start(){},onClose(f){disconnect=f;return()=>removed++},postMessage(p){sends.push(p)}});
 let settled=false,raw;const pending=client.requestOwnedAcquire({run:'original',receiverPurpose:'union-acquired-service-v1'},ledger).catch(value=>{settled=true;raw=value});await Promise.resolve();assert.equal(settled,false);assert.equal(sends.length,1);
 receive({data:{id:sends[0].id,rejection:{kind:'value',value:first??null,is_undefined:first===undefined}}});await pending;
 assert.equal(raw,first);assert.notEqual(ledger.primary,ledger.secondary);assert.equal(ledger.secondary.value,first);
 client.close();disconnect();client.close();assert.equal(off,1);assert.equal(removed,1);
 receive({data:{id:sends[0].id,result:{generation:99}}});await assert.rejects(client.requestOwnedAcquire({run:'successor',receiverPurpose:'union-acquired-service-v1'},{}),/HOST_CLOSED/);assert.equal(sends.length,1);
 rows.push({mode:first===undefined?'equal-undefined':'equal-false',pass:true,pendingBeforePeer:true,off,removed,sends:sends.length});
}
{
 let receive,disconnect,off=0,removed=0,sends=[];const controller=new AbortController(),ledger={},deadline=Date.now()+10000;
 const client=privateNodeHostTransport({on(_,f){receive=f},off(){off++},start(){},onClose(f){disconnect=f;return()=>removed++},postMessage(p){sends.push(p)}});
 let settled=false,raw;const pending=client.requestOwnedAcquire({run:'run',receiverPurpose:'union-acquired-service-v1'},ledger,{signal:controller.signal,deadline}).catch(v=>{settled=true;raw=v});
 controller.abort(false);await Promise.resolve();assert.equal(settled,false);assert.equal(sends[0].deadline,deadline);assert.equal(sends.length,2);assert.equal(sends[1].input.requestId,sends[0].id);
 disconnect();await pending;assert.equal(raw,false);assert.equal(off,1);assert.equal(removed,1);assert.equal(sends.length,2);
 rows.push({mode:'original-cancel-terminal',pass:true,pending:true,exactID:true,deadline,off,removed});
}
{
 let receive;const client=transport({on(_,f){receive=f},start(){},postMessage(p){queueMicrotask(()=>receive({data:{id:p.id,result:7}}))}});assert.equal(await client.request('ordinary',{}),7);client.close();rows.push({mode:'ordinary',pass:true});
}
await writeFile(process.argv[3],JSON.stringify({pass:rows.length,rows,limits:'Private registry/real microtasks; message/port/accepted-primary operands labelled, not factory or native authority.'},null,2));
