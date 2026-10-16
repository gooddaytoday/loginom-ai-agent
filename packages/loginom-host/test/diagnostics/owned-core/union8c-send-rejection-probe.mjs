import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
const {privateNodeHostTransport}=await import(pathToFileURL(resolve(process.argv[2])));
const rows=[];
for(const mode of ['canonical','throw-false','throw-undefined','primary-false-then-send-undefined']){
 let receive,closeCallback,dispatches=0;
 const first=mode==='primary-false-then-send-undefined'?{primary:{value:false}}:{};
 const port={on(_event,listener){receive=listener},off(){},start(){},onClose(listener){closeCallback=listener;return()=>{closeCallback=undefined}},postMessage(packet){
  dispatches++;
  if(mode==='canonical'){queueMicrotask(()=>receive({data:{id:packet.id,result:{generation:39}}}));return}
  if(mode==='throw-false')throw false;
  throw undefined;
 }};
 const client=privateNodeHostTransport(port);let rejected=false,raw,result;
 try{result=await client.requestOwnedAcquire({run:'run',session:'session',receiverPurpose:'union-acquired-service-v1'},first)}catch(value){rejected=true;raw=value}
 let pass=true,assertion;
 try{
  assert.equal(dispatches,1);
  if(mode==='canonical'){assert.equal(rejected,false);assert.deepEqual(result,{generation:39});assert.equal(first.primary,undefined)}
  else{assert.equal(rejected,true);assert.equal(raw,mode==='throw-undefined'?undefined:false);assert.deepEqual(first.primary,{value:mode==='throw-undefined'?undefined:false});
   if(mode==='primary-false-then-send-undefined')assert.deepEqual(first.secondary,{value:undefined});}
 }catch(error){pass=false;assertion=error.message}
 client.close();rows.push({mode,pass,rejected,raw:raw instanceof Error?{name:raw.name,message:raw.message}:raw,rawUndefined:raw===undefined,primaryPresent:!!first.primary,primary:first.primary?.value,primaryUndefined:first.primary?.value===undefined,secondaryPresent:!!first.secondary,secondaryUndefined:first.secondary?.value===undefined,dispatches,assertion});
}
const result={pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,rows,limits:'Actual SOURCE_COMPILED private owned transport, named postMessage fault/accepted-primary doubles. No host/native/SDK/grant authority. Canonical reply control; no recovery/replay.'};
await writeFile(process.argv[3],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
