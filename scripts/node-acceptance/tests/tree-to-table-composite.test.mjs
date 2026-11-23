import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseExpectedOutputs} from '../expected-outputs.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
test('trees-to-table-composite binds the prepared labelled tree, portable source and the native Root expectation',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util,json,runpy,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
c=r.scenario('trees-to-table-composite');e=r.expected_for(c,'/owned/tree.lgp')
assert c['external'] and c['base'] is None and not c.get('tree_only')
assert c['input_files']==['documents.csv'] and c['seed_files']==['documents.csv'] and c['prepared_tree_source']=='DocumentTree'
task=c['prompt'].read_text()
assert c['prompt'].name=='task-composite.md' and 'Root' not in task and 'oracle' not in task and 'expected' not in task
assert 'input.json' not in task and 'Позиции' not in task
assert e['package_path']=='/owned/tree.lgp' and r.expected_for(c,'/owned/tree.lgp',cold=True)==e
assert [n['type'] for n in e['nodes']]==['imports.text','trees.from_json','trees.to_table']
[o]=e['outputs'];assert o['output_node_type']=='trees.to_table' and o['column_order']=='exact' and o['ordered']
assert [(x['name'],x['label'],x['type']) for x in o['columns']]==[('Root_items_code','Root.Позиции.Код','string'),('Root_items_qty','Root.Позиции.Количество','integer')]
assert o['rows']==[{'Root_items_code':'x','Root_items_qty':2},{'Root_items_code':'y','Root_items_qty':0}]
oracle=runpy.run_path(str(Path('docs/node-development/nodes/trees-datatotree/acceptance/modes/oracle.py')))
assert e==dict(oracle['tree_to_table_composite_projection'](),package_path='/owned/tree.lgp')
case=next(x for x in json.loads((c['source']/'expected.json').read_text())['cases'] if x['id']=='composite')
assert case['native_status']=='observed' and case['output']['columns']==o['columns'] and case['output']['rows']==o['rows']
with zipfile.ZipFile(c['source_package']) as package:
 unit=ET.fromstring(package.read('Unit_0/Unit.xml'))
 nodes=unit.find('WorkFlow/Nodes').findall('Item')
 assert {n.get('DisplayName') for n in nodes}=={'Documents','DocumentTree'}
 types=[v.get('{http://www.w3.org/2001/XMLSchema-instance}type') for v in unit.iter('Engine')]
 assert 'TBGImportTextFile' in types and 'TBGJSONToTreeEngine' in types and not any('TreeToData' in (t or '') for t in types)
 source=next(n for n in nodes if n.get('DisplayName')=='Documents').find('Component/Engine')
 assert source.get('FileName')==c['seed_files'][0], 'source must resolve in the current own package folder'
 labels={i.get('Name'):i.get('DisplayName') for i in unit.iter('Item') if i.get('Name') in ('batch','items','code','qty') and i.get('DisplayName')}
 assert labels=={'batch':'Партия','items':'Позиции','code':'Код','qty':'Количество'},labels
print(json.dumps(e))
`],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
 const expected=JSON.parse(result.stdout);for(const o of expected.outputs)delete o.export_destination;
 assert.doesNotThrow(()=>parseExpectedOutputs(expected));
});

test('trees-to-table-composite prompt names the prepared tree node without leaking expected names or labels',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util,inspect
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
source=inspect.getsource(r.Runner.model) if hasattr(r,'Runner') else Path('scripts/node-acceptance/run-check.py').read_text()
line=next(l for l in source.splitlines() if 'prepared_tree_source' in l and 'prompt +=' in l)
assert 'Root' not in line and 'Позиции' not in line and 'Код' not in line and 'When' not in line
`],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
