import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {privateWhole} from './fixtures/replacement-private-whole.mjs';
import {captureFixture} from './fixtures/replacement-capture/fixture.mjs';
import {makeReplacementCaptureCode} from '../replacement-capture.mjs';
const values=[['Error',Error('original private refusal',{cause:0})],['undefined',undefined],['null',null],['false',false],['zero',0],['empty','']];
const exact=(f,raw)=>{assert.equal(f.owner.failed,true);assert.equal(f.owner.error.cause,raw);assert.equal(f.owner.primaryFailure,raw);assert.equal(f.owner.startupOwner.primaryFailure,raw);assert.equal(f.owner.context,f.context);assert.equal(f.owner.page,f.page);assert.equal(f.owner.startupOwner.context,f.context);assert.equal(f.owner.startupOwner.page,f.page);assert.equal(typeof f.owner.execute,'function');assert.equal(typeof f.owner.recover,'function')};
for(const [label,raw]of values)test('whole ee8/real FS private init: exact '+label,async()=>{
 const f=await privateWhole({raw});try{exact(f,raw);assert.equal(f.owner.closed,true);assert.equal(f.counts().closeCalls,1);assert.equal(f.counts().launchCalls,1);
 const receipt=JSON.parse(await readFile(join(f.out,'startup/startup-cleanup.json'),'utf8'));assert.equal(receipt.cleanup_complete,true);assert.equal(receipt.native.unauthenticated,true);assert.equal(receipt.native.logged_out,false);
 const close=f.events.indexOf('context-close-double');assert.ok(close>0);assert.deepEqual(f.events.slice(close-3,close),['rename','directory-sync','directory-close']);assert.deepEqual(f.events.slice(-6),['file-write','file-sync','file-close','rename','directory-sync','directory-close']);
 }finally{await f.dispose()}
});
for(const [stage,raw]of [['observer',Error('observer',{cause:null})],['login',false]])test('whole helper private '+stage+' keeps primary/handles',async()=>{const f=await privateWhole({raw,stage});try{exact(f,raw);assert.ok(!f.events.includes('unexpected-gesture'));assert.equal(f.counts().launchCalls,1)}finally{await f.dispose()}});
for(const storage of ['before','after'])test('private storage-only recovery '+storage+' context close without replay',async()=>{
 const raw=Error('init primary',{cause:0}),f=await privateWhole({raw,storage});try{exact(f,raw);assert.notEqual(f.owner.closed,true);assert.equal(f.owner.startupOwner.cleanupFailure,f.persistence);assert.equal(f.counts().closeCalls,storage==='after'?1:0);
 const first=JSON.stringify(f.owner.startupOwner.evidence.first_guard),context=f.owner.context,page=f.owner.page,execute=f.owner.execute;
 await assert.rejects(f.owner.recover(),e=>e===f.persistence);assert.equal(f.owner.cleanupFailure,f.persistence);const reads=f.counts().nativeReads;f.unblock();
 const r=await f.owner.recover();assert.equal(r.owner_id,f.owner.startupOwner.id);assert.equal(r.cleanup_complete,true);assert.equal(f.owner.closed,true);assert.equal(f.counts().closeCalls,1);assert.equal(f.counts().launchCalls,1);assert.equal(f.counts().initCalls,1);
 if(storage==='after')assert.equal(f.counts().nativeReads,reads);assert.equal(JSON.stringify(f.owner.startupOwner.evidence.first_guard),first);exact(f,raw);assert.equal(f.owner.context,context);assert.equal(f.owner.page,page);assert.equal(f.owner.execute,execute);
 const receipt=JSON.parse(await readFile(join(f.out,'startup/startup-cleanup.json'),'utf8'));assert.equal(receipt.cleanup_complete,true);assert.equal(f.events.at(-1),'directory-close');
 }finally{await f.dispose()}
});
test('private retained owner refuses pending/foreign recovery before FS or context close',async()=>{const f=await privateWhole({raw:null,storage:'before'});try{const length=f.events.length;f.owner.runtime={hasUnsettledWork:()=>true};await assert.rejects(f.owner.recover(),/PENDING_OPERATION_PRESERVED/);f.owner.runtime=undefined;f.owner.page={};await assert.rejects(f.owner.recover(),/STARTUP_OWNER_CHANGED/);assert.equal(f.events.length,length);assert.equal(f.counts().closeCalls,0)}finally{await f.dispose()}});
const request=f=>({binding:structuredClone(f.binding),account:'lab-73-monkey-47274bad-b33b-4a2a-bf2d-60b0c951c36e',package_path:f.packagePath,origin:'https://loginom.test',build:'7.4.2',port_guid:f.proof.result.input_port.port_guid,opening_operation_id:f.proof.result.input_port.opening_operation_id});
// Synthetic native realm is attached to the SAME retained Page double. It is
// an independent offline consumer prerequisite, not recovered native history,
// startup admission, real opening authority or permission for a new capture.
for(const mode of ['coherent','changed','lost-falsy'])test('whole-helper foreground execute/capture composition '+mode,async()=>{
 const raw=Error('startup retained'),f=await privateWhole({raw,storage:'before'});try{exact(f,raw);const c=await captureFixture(),evaluate=c.page.evaluate.bind(c.page);let reads=0;
 if(mode==='changed')c.f.prep.inputPortOpenReceipts.get('open').operation_id='foreign-opening';
 if(mode==='lost-falsy')c.page.evaluate=(fn,arg)=>{if(String(fn).includes('semantic_connections_verified')){reads++;throw false}return evaluate(fn,arg)};
 f.capture(c);const code=makeReplacementCaptureCode(request(c));
 if(mode==='lost-falsy'){let caught=false,value;try{await f.owner.execute(code)}catch(e){caught=true;value=e}assert.equal(caught,true);assert.equal(value,false);assert.equal(reads,1)}else{const r=await f.owner.execute(code);assert.equal(r.status,mode==='coherent'?'DIAGNOSTIC_READ':'NOT_APPLIED');assert.equal(r.effect_possible,false);assert.equal(r.native_capture_admitted,false);assert.ok(Object.values(r.gates).every(v=>v==='not_verified'));if(mode==='coherent'){assert.deepEqual(r.native_before,r.native_after);assert.equal(r.raw.grids[0].rows.length,5)}}
 assert.deepEqual(c.page.events,[]);assert.equal(f.counts().closeCalls,0);assert.equal(f.counts().launchCalls,1);exact(f,raw);
 const pinned=f.owner.page;f.owner.page={};await assert.rejects(async()=>f.owner.execute(code),/STARTUP_PAGE_BINDING_REQUIRED/);f.owner.page=pinned;
 }finally{await f.dispose()}
});
