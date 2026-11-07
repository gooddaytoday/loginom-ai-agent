import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('collapse-variant and collapse-mixed attach only mixed.csv and carry typed Variant expectations',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
for name,task,rows in [('collapse-mixed','task-mixed.md',15),('collapse-variant','task-variant.md',15)]:
 c=r.scenario(name); e=r.expected_for(c,'/owned/collapse.lgp')
 assert c['base'] is None and c['input_files']==['mixed.csv'] and c['prompt'].name==task
 assert (c['data']/'mixed.csv').is_file() and 'mixed.csv' in c['prompt'].read_text()
 assert e['package_path']=='/owned/collapse.lgp' and e['null_marker']=='?'
 o=e['outputs'][0]
 assert o['output_node_type']=='transform.collapse_columns' and o['column_order']=='exact' and len(o['rows'])==rows
 assert [f['name'] for f in o['columns']]==['RowID','Field','FieldLabel','Cell','Kind']
 assert next(f for f in o['columns'] if f['name']=='Cell')['type']=='variant'
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
import {selectColdOutputReads} from '../expected-outputs.mjs';
test('cold selector reads only the labelled Collapse when two Collapse nodes exist',()=>{
 const node=(id,label)=>({type:'transform.collapse_columns',label,ref:{node_id:id},outputs:[0]});
 const graph={nodes:[node('a','Свёртка столбцов'),node('b','Повторная свёртка')]};
 const reads=selectColdOutputReads(graph,[{output_node_type:'transform.collapse_columns',output_node_label:'Повторная свёртка',output_port:0}]);
 assert.deepEqual(reads.map(r=>r.node.ref.node_id),['b']);
 assert.throws(()=>selectColdOutputReads(graph,[{output_node_type:'transform.collapse_columns',output_port:0}]),/COLD_EXTRA_OR_MISSING_OUTPUT_NODE/);
});
