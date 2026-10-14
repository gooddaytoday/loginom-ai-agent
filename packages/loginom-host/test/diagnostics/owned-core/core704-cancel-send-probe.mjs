import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {privateNodeHostTransport}=await import(pathToFileURL(resolve(process.argv[2])));
const rows=[];
for(const mode of ['canonical','throw-undefined','throw-false','throw-Error']){
 const fault=mode==='throw-Error'?new Error('original cancel send failure',{cause:0}):mode==='throw-false'?false:undefined;
 const controller=new AbortController(),ledger={},packets=[];let peer,close,off=0,removed=0,settled=false,raw;
 const port={on(_,f){peer=f},off(){off++},start(){},onClose(f){close=f;return()=>removed++},postMessage(p){packets.push(p);if(p.method==='readonly.preReady.cancel'&&mode!=='canonical')throw fault}};
 const client=privateNodeHostTransport(port);const deadline=Date.now()+10000;
 const pending=client.requestOwnedAcquire({run:'original',receiverPurpose:'union-acquired-service-v1'},ledger,{signal:controller.signal,deadline}).catch(v=>{settled=true;raw=v});
 controller.abort(false);await Promise.resolve();
 try{
  assert.equal(settled,false);assert.equal(packets.length,2);assert.equal(packets[1].input.requestId,packets[0].id);assert.equal(ledger.primary.value,false);
  if(mode==='canonical')assert.equal(Object.hasOwn(ledger,'secondary'),false);
  else{assert(Object.hasOwn(ledger,'secondary'),'rejected owned cancellation post must retain genuine secondary before terminal closure');assert.notEqual(ledger.primary,ledger.secondary);assert.equal(ledger.secondary.value,fault)}
  rows.push({mode,pass:true});
 }catch(error){rows.push({mode,pass:false,error:error.message,primaryPresent:Object.hasOwn(ledger,'primary'),secondaryPresent:Object.hasOwn(ledger,'secondary'),pending:ledger.pending,sends:packets.length})}
 finally{close();await pending;assert.equal(raw,false);assert.equal(off,1);assert.equal(removed,1);assert.equal(ledger.pending,false);client.close()}
}
const result={pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,rows,limits:'Genuine production registry. Real AbortController/microtasks; synchronous Port cancellation throws and peer-loss are named protocol doubles. No factory/host/provider/native replacement or execution.'};
await writeFile(process.argv[3],JSON.stringify(result,null,2));console.log(JSON.stringify(result));
if(result.fail)process.exitCode=1;
