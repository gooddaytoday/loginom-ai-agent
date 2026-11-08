import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {checkApplyRound,checkApplyMain,applyColdExpected} from '../clustering-apply.mjs';
const root=new URL('../../../docs/node-development/nodes/datamining-clustering/acceptance/v040/',import.meta.url);
const expected=JSON.parse(readFileSync(new URL('expected-apply-run.json',root),'utf8'));
function records(e=expected){
 return e.outputs.map((o,port)=>({type:'datamining.clustering',output_port:port,data:{schema:o.columns.map(({name,type})=>({name,type})),row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},sample:o.rows.map(row=>o.columns.map(f=>({type:f.type,is_null:false,value:f.type==='integer'?String(row[f.name]+(f.name==='Cluster'?17:0)):row[f.name]})))}}));
}
function receipt(mode,id){return {status:'SUCCEEDED',cleanup_complete:true,node:{node_id:'same'},execution:{status:'completed',execution_id:id},configuration:{readback:{kind:'clustering',mode,features:['X','Y'],clusters:3,seed:42,normalization:'none',training:{status:mode==='apply'?'not_requested':'trained'}}},output:{ports:records().map(r=>({...r.data,port:r.output_port,fresh:true,freshness_basis:'completed_execution_port_source',execution_id:id}))}};}
test('apply resolves arbitrary labels without deriving centers from holdout',()=>{
 const e=checkApplyRound(expected,records());
 assert.equal(e.outputs[0].rows[3].Distance,80);assert.equal(e.outputs[0].rows[3].Cluster,18);
 assert.deepEqual(e.outputs[1].rows.map(r=>[r.X,r.Y]),[[2,2],[20,2],[2,20]]);
});
test('retraining, wrong assignments, NULL/types/order and incomplete reads refuse',()=>{
 for(const mutate of [r=>r[1].data.sample[1][1].value=59,r=>r[0].data.sample[3][1].value=41,r=>r[0].data.sample[0][0].value='18',r=>r[0].data.sample[0][5].is_null=true,r=>r[0].data.sample[0][2].type='real',r=>r[0].data.schema.reverse(),r=>r[0].data.sample.pop(),r=>r.pop(),r=>r[0].data.precision.numbers_verified=false]){
  const r=records();mutate(r);assert.throws(()=>checkApplyRound(expected,r),/CLUSTERING_APPLY/);
 }
});
test('apply requires training first, same node, fresh proof and no Teach receipt',()=>{
 assert.ok(checkApplyMain(expected,[receipt('k_means','train'),receipt('apply','apply')]));
 for(const mutate of [r=>r.shift(),r=>r.reverse(),r=>r[1].node.node_id='other',r=>r[1].configuration.readback.training.status='trained',r=>r[1].output.ports[0].fresh=false,r=>r[1].configuration.readback.seed=7]){
  const r=[receipt('k_means','train'),receipt('apply','apply')];mutate(r);assert.throws(()=>checkApplyMain(expected,r),/CLUSTERING_APPLY/);
 }
});
test('cold requires its exact column order and preserves resolved labels',()=>{
 const e=checkApplyRound(expected,records()),cold=applyColdExpected(e);
 const r=records(cold);r.forEach(t=>t.data.sample.forEach(row=>row[0].value=String(Number(row[0].value)-17)));
 assert.ok(checkApplyRound(e,r,{cold:true}));
 assert.throws(()=>checkApplyRound(e,r),/NATIVE_SCHEMA_ORDER/);
});
test('catalog uses approved task/two CSVs and expected binds stage-0 geometry',()=>{
 const r=spawnSync('python3',['-B','-c',"import importlib.util,json; s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py'); r=importlib.util.module_from_spec(s); s.loader.exec_module(r); c=r.scenario('clustering-apply'); print(json.dumps({k:str(v) for k,v in c.items()}))"],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const c=JSON.parse(r.stdout);
 assert.match(c.prompt,/v040\/task-apply.md$/);assert.equal(c.input_files,"['train.csv', 'holdout.csv']");assert.equal(c.export_count,'2');
 const o=JSON.parse(spawnSync('python3',[new URL('oracle.py',root).pathname],{encoding:'utf8'}).stdout);
 assert.deepEqual(expected.clustering_apply.centers,Object.values(o.separated_centers));
 assert.deepEqual(expected.outputs[0].rows.map(r=>r.Distance),o.raw_holdout.map(r=>r.distance));
 assert.equal(expected.clustering_apply.seed,o.seed);
});
