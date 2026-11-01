import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {checkClusteringRound,checkClusteringMain} from '../clustering-normalized.mjs';

const root=new URL('../../../docs/node-development/nodes/datamining-clustering/acceptance/normalized/',import.meta.url);
const expected=JSON.parse(readFileSync(new URL('expected.json',root),'utf8'));
function records(){return expected.outputs.map(o=>({type:'datamining.clustering',output_port:o.output_port,
 data:{schema:o.columns.map(({name,type})=>({name,type})),row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},
 sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:false,value:c.type==='integer'?String(r[c.name]):r[c.name]})))}}));}

test('expected is reproducible from independent source arithmetic',()=>{
 const result=spawnSync('python3',[new URL('oracle.py',root).pathname],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),expected);
});
test('geometry checks both ports, means in original units and complete membership',()=>{
 assert.equal(checkClusteringRound(expected,records()).length,2);
 for(const change of [r=>r[0].data.sample.pop(),r=>r[0].data.sample[0][4].value='999',
  r=>r[1].data.sample[0][1].value=2,r=>r[0].data.sample[0][1].value=0,
  r=>r[0].data.sample[0][0].value='99',r=>r[0].data.precision.numbers_verified=false]){
  const r=records();change(r);assert.throws(()=>checkClusteringRound(expected,r),/CLUSTERING_NORMALIZED/);
 }
 const r=records();r[1].data.sample[0][0].value='99';
 // Each independent table still admits a label bijection, but the cross-port
 // mean/membership check must reject a center with no assigned objects.
 assert.throws(()=>checkClusteringRound(expected,r),/EMPTY_CLUSTER/);
});
test('a successful normalized table alone cannot prove repeat or raw comparison',()=>{
 assert.throws(()=>checkClusteringMain(expected,[]),/SAME_NODE_RAW_AND_TWO_NORMALIZED/);
});
test('registered scenario exposes only user task and data to the model',()=>{
 const result=spawnSync('python3',['-c',"import importlib.util,json; s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py'); r=importlib.util.module_from_spec(s); s.loader.exec_module(r); c=r.scenario('clustering-normalized'); print(json.dumps({k:str(v) for k,v in c.items()}))"],
  {cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const c=JSON.parse(result.stdout);assert.match(c.prompt,/normalized\/task.md$/);assert.match(c.data,/normalized\/data$/);
 assert.equal(c.export_count,'2');assert.equal(c.base,'None');
});
