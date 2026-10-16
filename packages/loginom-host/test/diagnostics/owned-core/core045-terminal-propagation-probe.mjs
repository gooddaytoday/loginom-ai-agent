import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {privateNodeHostTransport}=await import(pathToFileURL(resolve(process.argv[2])));const rows=[];
for(const mode of ['original-cancel-then-peer-loss','controlled-peer-loss-before-cancel']){
 const events=new EventEmitter(),controller=new AbortController(),ledger={},packets=[];let closed=false,off=0,removed=0,attempts=0,raw;
 const port={on(event,f){events.on(event,f)},off(event,f){off++;events.off(event,f)},start(){},onClose(f){events.on('close',f);return()=>{removed++;events.off('close',f)}},postMessage(p){attempts++;if(closed)throw new Error('LOGINOM_HOST_CLOSED');packets.push(p)}};
 const client=privateNodeHostTransport(port),deadline=Date.now()+60000;
 const pending=client.requestOwnedAcquire({run:'original',receiverPurpose:'union-acquired-service-v1'},ledger,{signal:controller.signal,deadline}).catch(v=>{raw=v});
 assert.equal(packets.length,1);assert.equal(ledger.pending,true);assert.equal(packets[0].deadline,deadline);
 if(mode==='original-cancel-then-peer-loss')controller.abort(false);
 closed=true;events.emit('close');await pending;
 let passed=true,message;
 try{
  if(mode==='original-cancel-then-peer-loss')assert.equal(raw,false);
  else assert.equal(raw.message,'LOGINOM_HOST_CLOSED');
  assert(ledger.primary);assert.equal(Object.hasOwn(ledger,'secondary'),false,'Terminal close propagation must not fabricate a second rejected owned operation');
  assert.equal(ledger.pending,false);assert.equal(off,1);assert.equal(removed,1);
 }catch(error){passed=false;message=error.message}
 rows.push({mode,pass:passed,error:message,originalRequestID:packets[0].id,deadline,primaryPresent:!!ledger.primary,secondaryPresent:Object.hasOwn(ledger,'secondary'),secondary:ledger.secondary?.value?.message,signalAborted:controller.signal.aborted,deliveredPackets:packets.length,postAttempts:attempts,off,removed,pending:ledger.pending});client.close();assert.equal(off,1);assert.equal(removed,1);
}
const result={pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,rows,limits:'Genuine production registry, real EventEmitter/AbortController/microtasks. Closed Port implements the genuine factory closed-channel guard; peer-loss delivery is a named protocol double. No fresh SDK/native fault/provider/factory execution.'};await writeFile(process.argv[3],JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(result.fail)process.exitCode=1;
