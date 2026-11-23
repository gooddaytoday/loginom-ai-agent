import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('tree-variant binds the approved task, unchanged CSV and a private Variant-only expected projection',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
c=r.scenario('tree-variant');e=r.expected_for(c,'/owned/tree.lgp')
assert c['tree_only'] and c['external'] and c['base'] is None
assert c['prompt'].name=='task-variant.md' and c['input_files']==['documents.csv']
approved=r.read(c['source']/'expected.json')['cases']['variant']['tree_outputs']
assert e['outputs']==[] and e['tree_outputs']==approved and e['package_path']=='/owned/tree.lgp'
assert e.get('proposed_tree_output')==approved[0], 'main tree audit contract missing'
assert r.expected_for(c,'/owned/tree.lgp',cold=True)==e
assert all(n['label_any'] for n in e['nodes'])
class StopBeforeModel(Exception):pass
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);folder=root/'tree-variant';folder.mkdir();workspace=root/'workspace';workspace.mkdir()
 runner=object.__new__(r.Runner);runner.options={};runner.env={};runner.out=root
 def stop(*args,**kwargs):raise StopBeforeModel()
 runner.phase=stop
 try:runner.model('tree-variant',folder,root/'profile',workspace,'/owned/tree.lgp',{'package_directory':'/owned'},root/'build')
 except StopBeforeModel:pass
 prompt=(folder/'task.md').read_text()
 assert prompt.startswith(c['prompt'].read_text().replace('{{PACKAGE_PATH}}','/owned/tree.lgp'))
 assert 'oracle' not in prompt and 'итоговый CSV' not in prompt
 assert sorted(p.name for p in workspace.iterdir())==['documents.csv']
 assert (workspace/'documents.csv').read_bytes()==(c['data']/'documents.csv').read_bytes()
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});

test('tree Variant matcher requires exact cell_type and value, including typed NULL',()=>{
 const r=spawnSync('python3',['-B','-c',`import copy,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
e=r.expected_for(r.scenario('tree-variant'),'/owned/tree.lgp')['tree_outputs'][0]
schema=[dict(index=0,path='',name='Root',type='object',is_container=True,is_array=False,children=[1]),
 dict(index=1,path='/items',name='items',type='object',is_container=True,is_array=True,children=[2,3]),
 dict(index=2,path='/items/id',name='id',type='integer',is_container=False,is_array=False,children=[]),
 dict(index=3,path='/items/value',name='value',type='variant',is_container=False,is_array=False,children=[])]
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
  cell['precision']='exact_integer' if binding['type']=='integer' else 'exact_native'
  if binding['type']=='variant':
   cell['cell_type']=node.get('cell_type','null')
   cell['native']={'tag':{'null':1,'real':5,'string':8,'boolean':11,'integer':20}[cell['cell_type']]}
 return index
walk(e['document'])
p=dict(port_kind='tree',sample_complete=True,tree=dict(complete=True,schema=schema,instances=instances,node_count=len(instances),max_depth=4))
r.check_tree(p,e)
for fault in ['subtype','missing_subtype','display','rounding','real','boolean','null','null_subtype','tag','schema']:
 actual=copy.deepcopy(p)
 cells={n['path']:n for n in actual['tree']['instances']}
 cell=cells['/items/0/value']
 if fault=='subtype':cell['cell_type']='real'
 if fault=='missing_subtype':del cell['cell_type']
 if fault=='display':cell['precision']='unverified'
 if fault=='rounding':cells['/items/5/value']['value']='9007199254740992'
 if fault=='real':cells['/items/4/value']['value']=2.5
 if fault=='boolean':cells['/items/2/value']['value']=0
 if fault=='null':cells['/items/3/value']['is_null']=False
 if fault=='null_subtype':cells['/items/3/value']['cell_type']='integer'
 if fault=='tag':cell['native']['tag']=5
 if fault=='schema':cell['schema_index']=2
 try:r.check_tree(actual,e)
 except AssertionError:pass
 else:raise AssertionError(fault+' was accepted')
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
