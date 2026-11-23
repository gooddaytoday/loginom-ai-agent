import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {checkGmeansRound,checkGmeansMain,checkGmeansSeedRepeat} from '../clustering-gmeans.mjs';

const root=new URL('../../../docs/node-development/nodes/datamining-clustering/acceptance/v040/',import.meta.url);
const expected=JSON.parse(readFileSync(new URL('expected-g-means-run.json',root),'utf8'));
function records(groups=[[1,2,3,4],[5,6]]){
 const c=expected.clustering_gmeans,centers=groups.map((ids,i)=>({Cluster:17+i,...Object.fromEntries(c.features.map(k=>[k,c.source.filter(r=>ids.includes(r.RowID)).reduce((sum,r)=>sum+r[k],0)/ids.length]))}));
 const rows=[c.source.map(r=>{const Cluster=17+groups.findIndex(g=>g.includes(r.RowID)),center=centers.find(c=>c.Cluster===Cluster);return {...r,Cluster,Distance:Math.hypot(r.X-center.X,r.Y-center.Y)};}),centers];
 return expected.outputs.map((o,port)=>({type:'datamining.clustering',output_port:port,data:{schema:o.columns.map(({name,type})=>({name,type})),row_count:rows[port].length,sample_complete:true,precision:{numbers_verified:true},sample:rows[port].map(row=>o.columns.map(f=>({type:f.type,is_null:false,value:f.type==='integer'?String(row[f.name]):row[f.name]})))}}));
}
const receipt=(id='exec1',tables=records())=>({status:'SUCCEEDED',cleanup_complete:true,node:{node_id:'one'},execution:{status:'completed',execution_id:id},configuration:{readback:{kind:'clustering',mode:'g_means',features:['X','Y'],seed:42,min_clusters:2,max_clusters:4,threshold:1,normalization:'none'}},output:{ports:tables.map(r=>({...r.data,port:r.output_port,fresh:true,freshness_basis:'completed_execution_port_source',execution_id:id}))}});
test('g-means admits different bounded k and nonrank cluster IDs using independent geometry',()=>{
 for(const groups of [[[1,2,3,4],[5,6]],[[1,2],[3,4],[5,6]]])assert.equal(checkGmeansRound(expected,records(groups)).outputs[1].rows.length,groups.length);
});
test('cold uses the exact observed native used-fields-first order while hot and other orders still refuse',()=>{
 const cold=records();
 const permutation=[0,1,3,4,2,5,6];
 cold[0].data.schema=permutation.map(i=>cold[0].data.schema[i]);
 cold[0].data.sample=cold[0].data.sample.map(row=>permutation.map(i=>row[i]));
 assert.throws(()=>checkGmeansRound(expected,cold),/NATIVE_SCHEMA_ORDER/);
 assert.equal(checkGmeansRound(expected,cold,{cold:true}).outputs[0].columns[2].name,'X');
 cold[0].data.schema.reverse();
 assert.throws(()=>checkGmeansRound(expected,cold,{cold:true}),/NATIVE_SCHEMA_ORDER/);
});
test('g-means refuses source changes, missing/NULL cells, wrong native types/order, geometry and cross-port IDs',()=>{
 for(const change of [r=>r.pop(),r=>r[0].data.sample.pop(),r=>r[0].data.sample[0][2].value='2',r=>r[0].data.sample[0][5].value='Other',r=>r[0].data.sample[0][6].is_null=true,r=>r[0].data.sample[0][2].type='real',r=>r[1].data.sample[0][1].value+=0.01,r=>r[0].data.sample[0][1].value=0,r=>r[1].data.sample[0][0].value='99',r=>r[1].data.sample.reverse(),r=>r[0].data.schema.reverse(),r=>r[0].data.precision.numbers_verified=false]){
  const r=records();change(r);assert.throws(()=>checkGmeansRound(expected,r),/CLUSTERING_GMEANS/);
 }
});
test('g-means accepts one model execution and validates any extra receipts',()=>{
 const replies=[receipt(),receipt('exec2')];assert.equal(checkGmeansMain(expected,replies).outputs[0].rows.length,6);
 assert.equal(checkGmeansMain(expected,[receipt()]).outputs[0].rows.length,6);
 assert.throws(()=>checkGmeansMain(expected,[]),/VERIFIED_EXECUTION/);
 for(const change of [r=>r[1].node.node_id='other',r=>r[1].configuration.readback.threshold=2,r=>r[1].configuration.readback.mode='k_means',r=>r[1].output.ports[0].fresh=false,r=>r[1].output.ports[1].sample.forEach(row=>row[0].value='100')]){
  const r=structuredClone(replies);change(r);assert.throws(()=>checkGmeansMain(expected,r),/CLUSTERING_GMEANS/);
 }
 assert.throws(()=>checkGmeansMain(expected,[receipt(),receipt('exec2',records([[1,2],[3,4],[5,6]]))]),/SEED_REPEAT/);
});
test('registered g-means scenario sends only the approved task and probe.csv',()=>{
 const r=spawnSync('python3',['-B','-c',"import importlib.util,json; s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py'); r=importlib.util.module_from_spec(s); s.loader.exec_module(r); c=r.scenario('clustering-gmeans'); print(json.dumps({k:str(v) for k,v in c.items()}))"],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const c=JSON.parse(r.stdout);
 assert.match(c.prompt,/v040\/task-g-means.md$/);assert.equal(c.input_files,"['probe.csv']");assert.equal(c.export_count,'2');
 assert.equal(c.expected_name,'expected-g-means-run.json');
 const oracle=spawnSync('python3',[new URL('oracle.py',root).pathname,'--check'],{encoding:'utf8'});assert.equal(oracle.status,0,oracle.stderr);
 const stage0=JSON.parse(spawnSync('python3',[new URL('oracle.py',root).pathname],{encoding:'utf8'}).stdout);
 assert.deepEqual(expected.clustering_gmeans.source,stage0.g_means.source);
 for(const k of ['min_clusters','max_clusters','threshold'])assert.equal(expected.clustering_gmeans[k],stage0.g_means[k]);
});

test('harness repeat compares two complete cold rounds of one node with distinct execution proofs',()=>{
 const round=(id,groups)=>records(groups).map(r=>({...r,node:{node_id:'one'},execution:{execution_id:id,status:'completed',verified:true,owner_verified:true},data:{...r.data,schema:expected.clustering_gmeans.cold_column_order[r.output_port].map(name=>r.data.schema.find(f=>f.name===name)),sample:r.data.sample.map(row=>expected.clustering_gmeans.cold_column_order[r.output_port].map(name=>row[r.data.schema.findIndex(f=>f.name===name)]))}}));
 const first=round('a'),second=round('b');
 assert.equal(checkGmeansSeedRepeat(expected,first,second).verified,true);
 for(const change of [r=>r.pop(),r=>r[0].node.node_id='other',r=>r[0].execution.verified=false,r=>r.forEach(x=>x.execution.execution_id='a')]){
  const bad=structuredClone(second);change(bad);assert.throws(()=>checkGmeansSeedRepeat(expected,first,bad),/CLUSTERING_GMEANS/);
 }
 assert.throws(()=>checkGmeansSeedRepeat(expected,first,round('c',[[1,2],[3,4],[5,6]])),/SEED_REPEAT/);
});
