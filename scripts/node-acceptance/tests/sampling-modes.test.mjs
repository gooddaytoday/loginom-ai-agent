import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeSamplingExpected,parseSamplingExpected,checkSamplingMain,checkSamplingCold,checkSamplingGraph,observeSamplingColdMapping} from '../sampling-modes.mjs';
import {parseExpectedOutputs,matchExpectedOutputs} from '../expected-outputs.mjs';

const proposal=slug=>JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/'+slug+'/acceptance/modes/expected.json',import.meta.url)));
function fixture(partition=false,mode='stratified'){
 const p=proposal(partition?'preprocessing-datapartition':'preprocessing-sampling');
 const expected=makeSamplingExpected(p,mode,'/test/sample.lgp'),source=p.source.rows;
 const train=[...source.slice(0,4),...source.slice(10,14)],held=[...source.slice(4,6),...source.slice(14,16)];
 const tables=partition?[[...train.map(r=>({IsTestSet:false,...r})),...held.map(r=>({IsTestSet:true,...r}))],train,held]:[train];
 const actual=['first','second'].flatMap(execution_id=>expected.outputs.map((want,i)=>({
  node:{document_id:'doc',workflow_id:'flow',node_id:'sample'},type:p.node_type,output_port:want.output_port,execution:{status:'completed',execution_id},
  sampling_mapping:{verified:true,node:{document_id:'doc',workflow_id:'flow',node_id:'sample'},port:want.output_port,
   columns:want.columns.map(({name,type})=>({name,type})),cleanup_complete:true,settings_applied:false},
  data:{port:want.output_port,fresh:true,freshness_basis:'completed_execution_port_source',execution_id,
   schema:want.columns.map((c,index)=>({index,name:c.name,label:'free '+c.name,type:c.type})),
   row_count:tables[i].length,sample_complete:true,precision:{numbers_verified:true},
   sample:tables[i].map(r=>want.columns.map(c=>({type:c.type,value:c.type==='integer'?String(r[c.name]):r[c.name],is_null:false})))}})));
 const replies=['first','second'].map(execution_id=>({status:'SUCCEEDED',node:{node_id:'sample'},cleanup_complete:true,
  execution:{status:'completed',execution_id},configuration:{readback:{kind:partition?'data_partition':'sampling',mode,seed:42,
   counts:Object.values(p.requested_sizes),strata_fields:mode==='stratified'?['Class']:[],test_priority:false}},
  output:{ports:actual.filter(r=>r.execution.execution_id===execution_id).map(r=>r.data)}}));
 const csvs=[0,1].flatMap(()=>expected.outputs.map((want,i)=>[want.columns.map(c=>c.name),...tables[i].map(r=>want.columns.map(c=>String(r[c.name])))]));
 return {expected,actual,replies,csvs};
}
for(const partition of [false,true])for(const mode of ['random','stratified'])test(`${partition?'partition':'sampling'} ${mode}: independent repeats, exact types/values, CSV and cold`,()=>{
 const {expected,actual,replies,csvs}=fixture(partition,mode);
 assert.equal(parseSamplingExpected(expected).sample_rows,20);
 const baseline=checkSamplingMain(expected,[{output:{outcome:replies}},...replies],csvs);
 const cold=structuredClone(actual);cold.forEach(r=>r.execution.execution_id='cold-'+r.execution.execution_id);
 const result=checkSamplingCold(expected,cold,baseline);
 assert.deepEqual(result.evidence.repeat_execution_ids,['cold-first','cold-second']);
 assert.equal(result.correspondence.length,partition?3:1);
});
test('proposal remains rejected by stock parser; ordinary exact expectations retain matching and failures',()=>{
 assert.throws(()=>parseExpectedOutputs({...proposal('preprocessing-sampling'),package_path:'/test/x.lgp'}),/EXPECTED_SHAPE_INVALID/);
 const {expected,actual}=fixture();
 const exact={package_path:expected.package_path,nodes:expected.nodes,outputs:[{...expected.outputs[0],rows:[1,2,3,4,11,12,13,14].map(i=>expected.sampling_modes.source[i-1])}]};
 assert.equal(matchExpectedOutputs([actual[0]],parseExpectedOutputs(exact).outputs).length,1);
 exact.outputs[0].rows[0].Value=999;
 assert.throws(()=>matchExpectedOutputs([actual[0]],parseExpectedOutputs(exact).outputs));
 assert.throws(()=>makeSamplingExpected(proposal('preprocessing-sampling'),'biased','/test/x.lgp'),/MODE_UNSUPPORTED/);
});
test('invariants reject missing or conflicting executions, foreign rows, values/types, ordering, quota, CSV and cleanup',()=>{
 const mutations=[
  f=>f.replies.pop(),
  f=>f.replies[1].execution.execution_id='first',
  f=>f.replies[0].output.ports[0].sample[0][0].value='999',
  f=>f.replies[0].output.ports[0].sample[0][2].value='999',
  f=>f.replies[0].output.ports[0].sample[0][2].type='string',
  f=>f.replies[0].output.ports[0].sample.reverse(),
  f=>f.replies[0].output.ports[0].schema.reverse(),
  f=>f.replies[0].output.ports[0].sample[0]=structuredClone(f.replies[0].output.ports[0].sample[1]),
  f=>f.replies[0].output.ports[0].sample_complete=false,
  f=>f.replies[0].output.ports[0].precision.numbers_verified=false,
  f=>f.replies[0].output.ports[0].execution_id='foreign',
  f=>f.replies[0].cleanup_complete=false,
  f=>f.replies[0].configuration.readback.seed=43,
  f=>f.csvs[1][1][2]='wrong',
  f=>f.csvs.pop(),
 ];
 for(const mutate of mutations){const f=fixture();mutate(f);assert.throws(()=>checkSamplingMain(f.expected,f.replies,f.csvs));}
 const f=fixture();
 for(const r of f.replies)for(const row of r.output.ports[0].sample)if(row[1].value==='B'){row[0].value=String(Number(row[0].value)-6);row[1].value='A';row[2].value=String(Number(row[0].value)*10);}
 assert.throws(()=>checkSamplingMain(f.expected,f.replies,f.csvs),/CLASS_QUOTA/);
});
test('partition requires disjoint subsets, complete ports and exact combined flags/order; cold must match main',()=>{
 const f=fixture(true),baseline=checkSamplingMain(f.expected,f.replies,f.csvs);
 for(const mutate of [a=>a[0].data.sample[0][0].value=true,a=>a.splice(1,1),
  a=>a[2].data.sample[0]=structuredClone(a[1].data.sample[0]),a=>a[0].node.node_id='other',
  a=>a[0].execution.status='running',a=>a[3].data.sample.reverse()]){
  const bad=structuredClone(f.actual);mutate(bad);assert.throws(()=>checkSamplingCold(f.expected,bad,baseline));
 }
 assert.throws(()=>checkSamplingCold(f.expected,f.actual,{...baseline,node_id:'foreign'}),/COLD_BASELINE_IDENTITY/);
 const changed=structuredClone(baseline);changed.ports[0].rows[0].Value=999;
 assert.throws(()=>checkSamplingCold(f.expected,f.actual,changed),/COLD_MAIN_MISMATCH/);
});
test('cold graph requires direct source, own target identity and no substitute transformation',()=>{
 const f=fixture(),baseline=checkSamplingMain(f.expected,f.replies,f.csvs);
 const graph={complete:true,nodes:[{type:'imports.text',ref:{node_id:'in'}},{type:'preprocessing.sampling',ref:{node_id:'sample'}},{type:'exports.text',ref:{node_id:'out'}}],
  links:[{source:'in',target:'sample',input:0,output:0},{source:'sample',target:'out',input:0,output:0}]};
 assert.equal(checkSamplingGraph(f.expected,graph,baseline),true);
 const reopened=structuredClone(graph);reopened.nodes[1].ref.node_id='reopened';
 assert.throws(()=>checkSamplingGraph(f.expected,reopened,baseline),error=>error.message.includes('"node_id":"reopened"')&&error.message.includes('"main_node_id":"sample"'));
 for(const mutate of [g=>g.complete=false,g=>g.nodes.push({type:'programming.javascript',ref:{node_id:'js'}}),g=>g.links[0].source='out',g=>g.links[1].output=1]){
  const bad=structuredClone(graph);mutate(bad);assert.throws(()=>checkSamplingGraph(f.expected,bad,baseline));
 }
});
test('saved native model-variables service is admitted only without tabular ports or links',()=>{
 const f=fixture(),baseline=checkSamplingMain(f.expected,f.replies,f.csvs);
 const graph={complete:true,nodes:[{type:'imports.text',ref:{node_id:'in'}},{type:'preprocessing.sampling',ref:{node_id:'sample'}},
  {type:'exports.text',ref:{node_id:'out'}},{type:'bg-vendor-icon-modelvariables',ref:{node_id:'variables'},inputs:[],outputs:[]}],
  links:[{source:'in',target:'sample',input:0,output:0},{source:'sample',target:'out',input:0,output:0}]};
 assert.equal(checkSamplingGraph(f.expected,graph,baseline),true);
 for(const mutate of [g=>g.nodes[3].inputs.push(0),g=>g.nodes[3].outputs.push(0),
  g=>g.links.push({source:'variables',target:'sample',input:0,output:0}),g=>g.nodes.push({...g.nodes[3],ref:{node_id:'variables-2'}})]){
  const bad=structuredClone(graph);mutate(bad);assert.throws(()=>checkSamplingGraph(f.expected,bad,baseline));
 }
});
test('cold Table presentation permutations require an independently verified unchanged native output order',()=>{
 const f=fixture(true),baseline=checkSamplingMain(f.expected,f.replies,f.csvs),cold=structuredClone(f.actual);
 for(const r of cold){
  const order=r.output_port===0?[0,2,1,3]:[1,0,2];
  r.data.schema=order.map((i,index)=>({...r.data.schema[i],index}));
  r.data.sample=r.data.sample.map(row=>order.map(i=>row[i]));
 }
 assert.equal(checkSamplingCold(f.expected,cold,baseline).evidence.native_column_order,true);
 for(const mutate of [r=>delete r.sampling_mapping,r=>r.sampling_mapping.settings_applied=true,
  r=>r.sampling_mapping.node.node_id='foreign',r=>r.sampling_mapping.columns.reverse(),r=>r.sampling_mapping.port=99,
  r=>r.data.schema[1].name='unknown',r=>r.data.sample[0][2].type='string']){
  const bad=structuredClone(cold);mutate(bad[0]);assert.throws(()=>checkSamplingCold(f.expected,bad,baseline));
 }
});
test('cold output definition uses owned port, complete native schema and verified cancellation without applying settings',async()=>{
 for(const port of [0,1,2])for(const fault of ['', 'order','excluded','owner','port','source','cancel']){
  const f=fixture(true),node=f.actual[0].node,want=f.expected.outputs[port];
  const mapping={verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...node,output_port:{direction:'output',port}},
   target_fields:want.columns.map(c=>({...c,excluded:false}))};
  if(fault==='order')mapping.target_fields.reverse();
  if(fault==='excluded')mapping.target_fields[0].excluded=true;
  if(fault==='owner')mapping.node_context.node_id='foreign';
  if(fault==='port')mapping.node_context.output_port.port=99;
  if(fault==='source')mapping.source_identity_verified=false;
  const calls=[],channel={openOutputPort:async p=>calls.push(p),observe:async o=>{assert.equal(o.readMappings,true);assert.ok(o.ready({node_mapping:mapping}));return {node_mapping:mapping};}};
  const load=async()=>({showMissingValuesMappingTable:async c=>{assert.equal(c,channel);calls.push('table');},
   closePreparedWizard:async c=>{assert.equal(c,channel);calls.push('cancel');return {verified:true,cleanup_complete:true,settings_applied:fault==='cancel'};}});
  const result=observeSamplingColdMapping({load,channel,node,port,expected:f.expected});
  if(fault)await assert.rejects(result,/SAMPLING_/);
  else assert.deepEqual((await result).columns,want.columns.map(({name,type})=>({name,type})));
  assert.deepEqual(calls,[port,'table','cancel']);
 }
});
