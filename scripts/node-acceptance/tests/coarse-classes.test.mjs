import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readColdNativeOutput} from '../cold-reader-policy.mjs';
test('cold class reports opt into exact Variant decoding; unrelated native reads retain their request',async()=>{
 const execution={execution_id:'fresh'};let seen;
 const channel={readOutputPort:async request=>{seen=request;return {verified:true,cleanup_complete:true};}};
 await readColdNativeOutput(channel,{type:'preprocessing.coarse_classes',port:1,execution});
 assert.equal(seen.typedVariants,true);assert.equal(seen.execution,execution);assert.equal(seen.port,1);
 for(const type of ['trees.to_table','trees.to_json','research.quality']){
  await readColdNativeOutput(channel,{type,port:0,execution});
  assert.deepEqual(seen,{port:0,execution,sampleRows:100,requireExactNumbers:true});
 }
});
test('coarse classes catalog keeps independent train/apply expectations outside model inputs',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
for name,rows in [('coarse-classes-train',20),('coarse-classes-apply',3),('coarse-classes-continuous-manual',9)]:
 c=r.scenario(name);e=r.expected_for(c,'/owned/coarse.lgp')
 assert c['base'] is None and c['export_count']==3
 assert c['input_files']==(['continuous.csv'] if rows==9 else ['train.csv'] if rows==20 else ['train.csv','holdout.csv'])
 if rows==9:
  assert c['expected_name']=='modes/expected.json'
  assert next(row for row in e['outputs'][0]['rows'] if row['X']==7)['X_ClassNum']==0
 assert all((c['data']/f).is_file() for f in c['input_files'])
 assert [o['output_port'] for o in e['outputs']]==[0,1,2]
 assert [len(o['rows']) for o in e['outputs']]==[rows,2,1]
 assert [len(o['columns']) for o in e['outputs']]==([6,17,9] if rows==9 else [7,17,9])
 assert all(o['ordered'] and o['column_order']=='exact' for o in e['outputs'])
 assert all(o['output_node_type']=='preprocessing.coarse_classes' for o in e['outputs'])
 assert 'oracle' not in c['prompt'].read_text()
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});

test('new coarse classes bounds accept typed exact NULL without inventing native byte provenance',async()=>{
 const {matchesExpectedOutput}=await import('../expected-outputs.mjs');
 const columns=['LowerBound','UpperBound'].map(name=>({name,type:'variant'}));
 const expected={output_node_type:'preprocessing.coarse_classes',output_port:1,columns,rows:[{LowerBound:null,UpperBound:null}],ordered:true,column_order:'exact'};
 const cell={type:'variant',is_null:true,value:null,precision:'exact_null'};
 const data={row_count:1,sample_complete:true,precision:{numbers_verified:true},schema:columns.map(c=>({...c,label:c.name})),sample:[[structuredClone(cell),structuredClone(cell)]]};
 assert.equal(matchesExpectedOutput(data,expected),true);
 assert.equal(matchesExpectedOutput(data,{...expected,output_node_type:'transform.cross_table'}),false);
 assert.equal(matchesExpectedOutput(data,{...expected,output_port:0}),false);
 for(const patch of [{precision:'display_text'},{is_null:false},{value:0},{type:'string'}]){
  const invalid=structuredClone(data);Object.assign(invalid.sample[0][0],patch);assert.equal(matchesExpectedOutput(invalid,expected),false);
 }
 const native=structuredClone(data);native.sample[0][0]={...cell,cell_type:'null',precision:'exact_native',native:{tag:1}};
 assert.equal(matchesExpectedOutput(native,expected),true);
});
