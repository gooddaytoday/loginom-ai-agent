// Assertions only. Adapter must exercise source guards; no fallback gate/mint.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';
const spec=JSON.parse(await readFile(new URL('./cases.json',import.meta.url),'utf8'));
assert.equal(new Set(spec.cases.map(c=>c.id)).size,spec.cases.length);
for(const id of ['clean-native-writable-task-readonly','dirty-missing','dirty-string-false','wrong-lease','wrong-page','wrong-import_guid','wrong-output0','fresh-running-global','fresh-running-package','upstream-deadline-after-await','unsettled','unknown','receipt-json-clone','receipt-other-bridge','proof-persistence-refusal','cleanup-persistence-refusal','confirmed-evidence-retry-no-replay','lost-native-reply','ordinary-save-guard'])assert.ok(spec.cases.some(c=>c.id===id),'missing '+id);
for(const c of spec.cases)for(const p of ['configure','apply','finish','execute'])assert.equal(c.expected[p],0);
if(process.argv.includes('--check-plan')){console.log(JSON.stringify({status:'SPEC_CHECK_ONLY',cases:spec.cases.length,executed_lifecycle_cases:0,baseline_product_sha:spec.baseline_product_sha}));process.exit(0);}
const index=process.argv.indexOf('--adapter'),file=process.argv[index+1];
if(index<0||!file){console.log(JSON.stringify({status:'SOURCE_PENDING',cases:spec.cases.length,executed_lifecycle_cases:0}));process.exit(2);}
assert.ok(isAbsolute(file),'explicit absolute source-owned test adapter required');
const adapter=await import(pathToFileURL(file).href);
assert.equal(typeof adapter.exerciseCase,'function');assert.match(adapter.source_sha??'',/^[a-f0-9]{40}$/);
assert.ok(['source','actual_bundle'].includes(adapter.path_kind));assert.equal(adapter.native_is_fixture,true);
const results=[];
for(const c of spec.cases){
 const r=await adapter.exerciseCase(structuredClone(c));
 for(const key of ['configure','apply','finish','execute','native_close','native_logout'])assert.equal(r.calls?.[key],c.expected[key],c.id+': '+key);
 assert.equal(r.ack,c.expected.ack,c.id+': ack');assert.equal(r.release,c.expected.release,c.id+': release');
 assert.equal(r.same_owner_retained_until_settled,true,c.id+': retained owner');
 assert.equal(r.deadline_renewals,0,c.id+': original upstream deadline');
 assert.equal(r.public_api_changed,false,c.id+': public API');
 assert.equal(r.native_save_calls,0,c.id+': save');assert.equal(r.native_discard_calls,0,c.id+': discard');
 assert.equal(r.synthetic_authority_accepted,false,c.id+': authority');assert.equal(r.ordinary_save_guard_preserved,true,c.id+': Save guard');
 assert.ok(Array.isArray(r.events));
 const positions=c.expected.ordered_events.map(e=>{const matches=r.events.flatMap((v,i)=>v===e?[i]:[]);assert.equal(matches.length,1,c.id+': unique '+e);return matches[0];});
 assert.deepEqual(positions,[...positions].sort((a,b)=>a-b),c.id+': ordering');
 if(!c.expected.ack){assert.ok(!r.events.includes('ack'));assert.ok(!r.events.includes('release'));}
 if(c.id==='confirmed-evidence-retry-no-replay')assert.equal(r.evidence_write_attempts,2,c.id);
 if(c.id==='lost-native-reply')assert.equal(r.replay_attempts,0,c.id);
 results.push({id:c.id,status:'FIXTURE_PASS'});
}
console.log(JSON.stringify({status:'SOURCE_ADAPTER_FIXTURE_CHECK',source_sha:adapter.source_sha,path_kind:adapter.path_kind,cases:results,native_pass:false}));
