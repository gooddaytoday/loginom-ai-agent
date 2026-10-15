// Synthetic assertion attacks only. No source/native lifecycle or browser runs.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const runner=fileURLToPath(new URL('./run-cases.mjs',import.meta.url));
const spec=JSON.parse(readFileSync(new URL('./cases.json',import.meta.url),'utf8'));
function probe(target,attack){
 const dir=mkdtempSync(join(tmpdir(),'join-consumer-assertions-'));
 try{
  const adapter=join(dir,'synthetic-adapter.mjs');
  writeFileSync(adapter,`
// SYNTHETIC: expected traces are manufactured only to attack runner assertions.
export const source_sha='0f85bff910d25d71eff716e17979bf3a2055ae8e';
export const path_kind='source';export const native_is_fixture=true;
const spec=${JSON.stringify(spec)};
export async function exerciseCase({id}){
 const c=spec.cases.find(c=>c.id===id);
 const r={calls:Object.fromEntries(['configure','apply','finish','execute','native_close','native_logout'].map(k=>[k,c.expected[k]])),ack:c.expected.ack,release:c.expected.release,same_owner_retained_until_settled:true,deadline_renewals:0,public_api_changed:false,native_save_calls:0,native_discard_calls:0,synthetic_authority_accepted:false,ordinary_save_guard_preserved:true,events:[...c.expected.ordered_events],refused_phase_attempts:['configure','apply','finish','execute'],replay_attempts:0,evidence_write_attempts:id==='confirmed-evidence-retry-no-replay'?2:1};
 if(id===${JSON.stringify(target)}){${attack}}
 return r;
}
`);
  const result=spawnSync(process.execPath,[runner,'--adapter',adapter],{encoding:'utf8'});
  assert.equal(result.error,undefined);assert.equal(result.signal,null);
  return result;
 }finally{rmSync(dir,{recursive:true,force:true});}
}
for(const target of ['cleanup-persistence-refusal','lost-native-reply']){
 test(target+': correct synthetic trace preserves native prefix and refuses ack/release',()=>{
  const r=probe(target,'');assert.equal(r.status,0,r.stderr);
  const out=JSON.parse(r.stdout);assert.equal(out.cases.length,53);assert.equal(out.native_pass,false);
 });
 for(const omitted of ['all','configure','apply','finish','execute'])test(target+': reject missing '+omitted+' phase attempt',()=>{
  const attack=omitted==='all'?'r.refused_phase_attempts=[];':`r.refused_phase_attempts=r.refused_phase_attempts.filter(p=>p!==${JSON.stringify(omitted)});`;
  const r=probe(target,attack);assert.equal(r.status,1,r.stdout);assert.match(r.stderr,/exercise gates/);
 });
 for(const [name,attack] of [
  ['native-prefix','r.calls.native_close=0;'],
  ['replay','r.replay_attempts=1;'],
  ['renewed-deadline','r.deadline_renewals=1;'],
  ['ack','r.ack=true;'],
  ['release','r.release=true;'],
  ['reordered-native-trace','r.events.reverse();'],
 ])test(target+': reject '+name,()=>{const r=probe(target,attack);assert.equal(r.status,1,r.stdout);assert.match(r.stderr,/AssertionError/);});
}
test('dirty-true still rejects all missing phase attempts',()=>{const r=probe('dirty-true','r.refused_phase_attempts=[];');assert.equal(r.status,1);assert.match(r.stderr,/exercise gates/);});
test('confirmed evidence retry retains one native prefix, without replay',()=>{
 assert.equal(probe('confirmed-evidence-retry-no-replay','').status,0);
 assert.equal(probe('confirmed-evidence-retry-no-replay','r.replay_attempts=1;').status,1);
});
test('spec-only and no-adapter statuses do not execute lifecycle cases',()=>{
 for(const [args,exit,status] of [[['--check-plan'],0,'SPEC_CHECK_ONLY'],[[],2,'SOURCE_PENDING']]){
  const r=spawnSync(process.execPath,[runner,...args],{encoding:'utf8'});assert.equal(r.status,exit);
  const o=JSON.parse(r.stdout);assert.equal(o.status,status);assert.equal(o.executed_lifecycle_cases,0);
 }
});
