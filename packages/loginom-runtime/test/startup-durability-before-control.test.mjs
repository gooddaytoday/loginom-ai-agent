import test from 'node:test';import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {durabilityFixture} from './startup-durability-fixture.mjs';
const source=process.env.STARTUP_SOURCE??new URL('../src/connection-check.mjs',import.meta.url).pathname;
const managed=process.env.STARTUP_MANAGED??new URL('../src/managed-entry.mjs',import.meta.url).pathname;
test('sync refusal must deny context exit/ack: before-counterexample with real producer and lifecycle',async()=>{
 const f=await durabilityFixture({source,managed,phase:'file_sync',when:'after',rejected:0,verifyDurability:false});
 try{
 let refused=false,returned;try{returned=await f.lifecycle.close()}catch{refused=true}
 if(process.env.REVIEW_RESULTS)await writeFile(join(process.env.REVIEW_RESULTS,'before-after.json'),JSON.stringify({fixture:true,refused,returned:returned??null,closed:f.owner.closed===true,native:f.native(),context:f.context(),events:f.events,evidence:f.owner.evidence},null,2)+'\n');
 assert.equal(refused,true,'producer must execute and observe sync refusal');assert.equal(f.native(),1);assert.equal(f.context(),0);
 assert.equal(f.owner.closed,undefined);await f.lifecycle.close();assert.equal(f.native(),1);assert.equal(f.context(),1);
 }finally{await f.dispose()}
});
