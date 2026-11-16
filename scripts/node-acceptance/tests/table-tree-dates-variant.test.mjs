import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('table-tree typed fixture is source-only, portable and bound to the independent R1/R3 projection',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util,runpy,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
c=r.scenario('table-tree-dates-variant');e=r.expected_for(c,'/owned/tree.lgp')
assert c['tree_only'] and c['external'] and c['base'] is None
assert c['input_files']==['rows.csv','input.json'] and c['seed_files']==['lab1685-types.csv']
assert c['prompt'].name=='task-dates-variant.md' and c['prepared_table_source']=='TypedSource'
assert e['outputs']==[] and e['package_path']=='/owned/tree.lgp'
assert e['tree_outputs'][0]==e['proposed_tree_output']
assert r.expected_for(c,'/owned/tree.lgp',cold=True)==e
assert all(n['label_any'] for n in e['nodes'])
oracle=runpy.run_path(str(c['oracle']))
assert e['tree_outputs']==oracle['dates_variant_projection']()['tree_outputs']
with zipfile.ZipFile(c['source_package']) as package:
 unit=ET.fromstring(package.read('Unit_0/Unit.xml'))
 nodes=unit.find('WorkFlow/Nodes').findall('Item')
 assert {n.get('DisplayName') for n in nodes}=={'TypedInput','TypedSource'}
 source=next(n for n in nodes if n.get('DisplayName')=='TypedInput').find('Component/Engine')
 assert source.get('FileName')==c['seed_files'][0], 'source must resolve in the current own package folder'
 assert [(v.get('Name'),v.get('DataType')) for v in source.find('ColumnDefs')]==[
  ('When','dtDateTime'),('IntegerValue','dtInteger'),('BooleanValue','dtBoolean'),('StringValue','dtString')]
 assert not any('DataToTree' in v.attrib.get('{http://www.w3.org/2001/XMLSchema-instance}type','') for v in unit.iter())
values=[n['children'][1] for n in e['tree_outputs'][0]['document']['children'][0]['children']]
assert [(n['type'],n['cell_type'],n['value']) for n in values]==[
 ('variant','integer','9007199254740993'),('variant','boolean',False),('variant','string','')]
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
