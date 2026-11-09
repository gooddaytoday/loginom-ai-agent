import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkReformCache,verifyReformCache} from '../reform-cache.mjs';
const root=new URL('../../../docs/node-development/nodes/field-parameters/acceptance/v040/',import.meta.url);
const expected={...JSON.parse(readFileSync(new URL('expected-cache.json',root))),reform_cache:JSON.parse(readFileSync(new URL('expected-cache-settings.json',root)))};
const receipt=(value)=>({status:'SUCCEEDED',cleanup_complete:true,node:{node_id:'one'},execution:{status:'completed',execution_id:'exec-'+value},
 configuration:{readback:{kind:'field_parameters',caching:expected.reform_cache.sequence[value],fields:expected.reform_cache.fields,preservation:{caching:true}}},
 output:{ports:expected.outputs.map(o=>({port:0,fresh:true,freshness_basis:'completed_execution_port_source',execution_id:'exec-'+value,sample_complete:true,precision:{numbers_verified:true},
  row_count:o.rows.length,schema:o.columns.map(({name,type})=>({name,type})),sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:false,value:c.type==='integer'?String(r[c.name]):r[c.name]})))}))}});
test('cache audit refuses unchanged CSV without all four settings executions on one node',()=>{
 const replies=[0,1,2,3].map(receipt);
 assert.equal(checkReformCache(expected,replies).execution_ids.length,4);
 for(const mutate of [r=>r.splice(1,1),r=>r.reverse(),r=>r[3].node.node_id='new',r=>r[2].execution.status='not_requested',
  r=>r[1].output.ports[0].sample[0][1].value='999',r=>r[3].configuration.readback.fields[1].caching_method=0,
  r=>r[3].configuration.readback.caching.value=0,r=>r[0].output.ports[0].sample_complete=false]){
  const candidate=structuredClone(replies);mutate(candidate);assert.throws(()=>checkReformCache(expected,candidate));
 }
});
test('saved settings audit compares every field and literal node cache',()=>{
 const c=receipt(3).configuration.readback;assert.doesNotThrow(()=>verifyReformCache(c,expected.reform_cache));
 for(const mutate of [c=>c.caching.variable=true,c=>c.fields.pop(),c=>c.fields.reverse(),c=>c.fields[0].caching_method=2]){
  const bad=structuredClone(c);mutate(bad);assert.throws(()=>verifyReformCache(bad,expected.reform_cache));
 }
});
