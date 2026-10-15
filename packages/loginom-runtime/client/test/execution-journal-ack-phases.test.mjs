import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const lib=process.env.JOURNAL_RUNTIME_LIB?pathToFileURL(resolve(process.env.JOURNAL_RUNTIME_LIB)+'/'):new URL('../lib/',import.meta.url);
const {createExecutionJournal,executionJournalAcknowledgement:timing}=await import(new URL('execution-journal.mjs',lib));
const {createNodeProcedure,NodeReadinessTimeout}=await import(new URL('node-procedure.mjs',lib));
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};

test('real FS acknowledgement keeps exact durable bytes and private frozen timing',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'journal-ack-phases-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const record=createExecutionJournal({directory,metadata:{sessionId:'own-file-only'}}),ack=await record({phase:'sample',password:'redacted'});
 assert.equal(await readFile(join(directory,'execution-events.jsonl'),'utf8'),JSON.stringify(ack)+'\n');
 const phases=timing(ack);assert.ok(Object.isFrozen(phases));assert.equal(ack.password,'[redacted]');assert.equal(JSON.stringify(ack).includes('acknowledged_ms'),false);
 const values=Object.values(phases);for(let i=1;i<values.length;i++)assert.ok(values[i]>=values[i-1]);assert.equal(timing(structuredClone(ack)),undefined);
});
test('slow sync class is separated from open/write/close waits on monotonic boundaries',async()=>{
 let clock=0;const io={open:async()=>{clock+=2000;return{writeFile:async()=>{clock+=3},sync:async()=>{clock+=11434},close:async()=>{clock+=4}}}};
 const ack=await createExecutionJournal({directory:'unused',metadata:{},io,monotonicNow:()=>clock})({phase:'file-only'}),m=timing(ack);
 assert.equal(m.opened_ms-m.open_started_ms,2000);assert.equal(m.written_ms-m.write_started_ms,3);assert.equal(m.synced_ms-m.sync_started_ms,11434);assert.equal(m.closed_ms-m.close_started_ms,4);assert.equal(m.acknowledged_ms,13441);
});
test('pending record queue is separate from the next record filesystem phases',async()=>{
 let clock=0,n=0;const entered=gate(),release=gate();const record=createExecutionJournal({directory:'unused',metadata:{},monotonicNow:()=>clock,io:{open:async()=>({writeFile:async()=>{},sync:async()=>{if(++n===1){entered.resolve();await release.promise}},close:async()=>{}})}});
 const first=record({id:1});await entered.promise;const second=record({id:2});clock=2100;release.resolve();await first;const m=timing(await second);assert.equal(m.dequeued_ms,2100);assert.equal(m.opened_ms-m.open_started_ms,0);assert.equal(m.synced_ms-m.sync_started_ms,0);
});
test('write/sync rejection remains primary even when close also rejects, including falsy',async()=>{
 for(const stage of ['writeFile','sync'])for(const primary of [Error('primary'),undefined,null,false,0,'',NaN]){
  let closed=0;const h={writeFile:async()=>{},sync:async()=>{},close:async()=>{closed++;throw Error('secondary close')}};h[stage]=async()=>{throw primary};
  const record=createExecutionJournal({directory:'unused',metadata:{},io:{open:async()=>h}});let caught=false;
  try{await record({phase:'intent'})}catch(e){caught=true;assert.ok(Object.is(e,primary))}assert.equal(caught,true);assert.equal(closed,1);
 }
});
test('successful sync does not acknowledge before close, and a close failure refuses ACK',async()=>{
 const entered=gate(),release=gate();let settled=false;const record=createExecutionJournal({directory:'unused',metadata:{},io:{open:async()=>({writeFile:async()=>{},sync:async()=>{},close:async()=>{entered.resolve();await release.promise;throw Error('close failed')}})}});
 const pending=record({phase:'intent'});pending.then(()=>{settled=true},()=>{settled=true});await entered.promise;assert.equal(settled,false);release.resolve();await assert.rejects(pending,/close failed/);
});
test('late durable sample exposes private journal phases only in timeout; pending/deadline unchanged',async()=>{
 let clock=1,current;const records=[];const record=createExecutionJournal({directory:'unused',metadata:{},monotonicNow:()=>clock,io:{open:async()=>({writeFile:async bytes=>{current=JSON.parse(bytes);records.push(current)},sync:async()=>{if(current.phase==='node_observation_sample')clock+=26730.510},close:async()=>{}})}});
 const pending={phase:'read',effect_possible:true},operation={id:'fresh-journal-control',action:{action_key:'node.apply',revision:'1'},deadline:60000,pending,checkpoint:{workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'},document_id:'doc'}};
 const state={origin:'https://example.test',loginom_build:'7.4.2',workflow_ref:operation.checkpoint.workflow_ref,dom_epoch:{document:'doc',revision:1},scan:{complete:true},wizard:{status:'absent'},ui:{masks:[],dialogs:[],truncated:{elements:false,masks:false,dialogs:false},elements:[]}};
 const channel=createNodeProcedure({operation,now:()=>clock,monotonicNow:()=>clock,maxSteps:8,targetOrigin:state.origin,targetBuild:state.loginom_build,record,execute:async()=>({status:'SUCCEEDED',output:structuredClone(state)}),wrapMutation:()=>{throw Error('unexpected mutation')}});
 await assert.rejects(channel.observe({condition:'fresh readonly fixture',ready:()=>true,timeoutMs:15000}),NodeReadinessTimeout);
 const timeout=records.find(r=>r.phase==='node_observation_timeout'),m=timeout.last_sample_acknowledgement.journal;
 assert.ok(Math.abs(m.synced_ms-m.sync_started_ms-26730.510)<0.001);assert.equal(m.closed_ms,m.acknowledged_ms);assert.equal(records.some(r=>r.phase==='node_observation_completed'),false);assert.strictEqual(operation.pending,pending);assert.equal(operation.deadline,60000);await assert.rejects(channel.act({verb:'click',ref:'unusable'}),/fresh internal observation/);
});
