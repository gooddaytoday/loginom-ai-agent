import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('tree-dates binds the approved task, unchanged CSV and a private date-only expected projection',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
c=r.scenario('tree-dates');e=r.expected_for(c,'/owned/tree.lgp')
assert c['tree_only'] and c['external'] and c['base'] is None
assert c['prompt'].name=='task-dates.md' and c['input_files']==['documents.csv']
approved=r.read(c['source']/'expected.json')['cases']['dates']['tree_outputs']
assert e['outputs']==[] and e['tree_outputs']==approved and e['package_path']=='/owned/tree.lgp'
assert e.get('proposed_tree_output')==approved[0], 'main tree audit contract missing'
assert r.expected_for(c,'/owned/tree.lgp',cold=True)==e
assert all(n['label_any'] for n in e['nodes'])
class StopBeforeModel(Exception):pass
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);folder=root/'tree-dates';folder.mkdir();workspace=root/'workspace';workspace.mkdir()
 runner=object.__new__(r.Runner);runner.options={};runner.env={};runner.out=root
 def stop(*args,**kwargs):raise StopBeforeModel()
 runner.phase=stop
 try:runner.model('tree-dates',folder,root/'profile',workspace,'/owned/tree.lgp',{'package_directory':'/owned'},root/'build')
 except StopBeforeModel:pass
 prompt=(folder/'task.md').read_text()
 assert prompt.startswith(c['prompt'].read_text().replace('{{PACKAGE_PATH}}','/owned/tree.lgp'))
 assert 'oracle' not in prompt and 'итоговый CSV' not in prompt
 assert sorted(p.name for p in workspace.iterdir())==['documents.csv']
 assert (workspace/'documents.csv').read_bytes()==(c['data']/'documents.csv').read_bytes()
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});

test('tree datetime matching requires exact civil milliseconds and preserves typed NULL',()=>{
 const r=spawnSync('python3',['-B','-c',`import copy,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
e=r.read(Path('docs/node-development/nodes/trees-jsontotree/acceptance/typed/expected.json'))['cases']['dates']['tree_outputs'][0]
schema=[dict(index=0,path='',name='Root',type='object',is_container=True,is_array=False,children=[1]),
 dict(index=1,path='/items',name='items',type='object',is_container=True,is_array=True,children=[2,3]),
 dict(index=2,path='/items/id',name='id',type='integer',is_container=False,is_array=False,children=[]),
 dict(index=3,path='/items/when',name='when',type='datetime',is_container=False,is_array=False,children=[])]
instances=[]
def walk(node,parent=None,schema_path=''):
 index=len(instances);binding=next(n for n in schema if n['path']==schema_path)
 cell=dict(index=index,parent=parent,path=node['path'],schema_index=binding['index'],type=node['type'])
 instances.append(cell)
 if 'children' in node:
  cell['children']=[]
  for child in node['children']:
   path=schema_path if node['type']=='array' else schema_path+'/'+child['path'].rsplit('/',1)[-1]
   cell['children'].append(walk(child,index,path))
 else:
  null=node['type']=='null';cell.update(type=binding['type'],is_null=null,value=node['value'])
  cell['precision']='exact_null' if null else 'exact_integer' if node['type']=='integer' else 'millisecond'
  if not null and node['type']=='datetime':cell['representation']='local_datetime'
 return index
walk(e['document'])
p=dict(port_kind='tree',sample_complete=True,tree=dict(complete=True,schema=schema,instances=instances,node_count=len(instances),max_depth=4))
r.check_tree(p,e)
for fault in ['precision','representation','milliseconds','timezone','civil','null']:
 actual=copy.deepcopy(p);expected=copy.deepcopy(e)
 cell=next(n for n in actual['tree']['instances'] if n['path']=='/items/0/when')
 if fault=='precision':cell['precision']='unverified'
 if fault=='representation':cell['representation']='formatted_display'
 if fault=='milliseconds':
  cell['value']=cell['value'][:-4]
  expected['document']['children'][0]['children'][0]['children'][1]['value']=cell['value']
 if fault=='timezone':
  cell['value']+='Z'
  expected['document']['children'][0]['children'][0]['children'][1]['value']=cell['value']
 if fault=='civil':cell['value']='2026-01-15T17:00:00.000'
 if fault=='null':next(n for n in actual['tree']['instances'] if n['path']=='/items/2/when')['is_null']=False
 try:r.check_tree(actual,expected)
 except AssertionError:pass
 else:raise AssertionError(fault+' was accepted')
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
