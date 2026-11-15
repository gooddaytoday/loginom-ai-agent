import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('tree-scalar-arrays binds its approved task and private scalar-only projection',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
c=r.scenario('tree-scalar-arrays');e=r.expected_for(c,'/owned/tree.lgp')
assert c['tree_only'] and c['external'] and c['base'] is None
assert c['prompt'].name=='task-scalar-arrays.md' and c['input_files']==['documents.csv']
approved=r.read(c['source']/'expected.json')['cases']['scalar_arrays']['tree_outputs']
assert e['outputs']==[] and e['tree_outputs']==approved and e['package_path']=='/owned/tree.lgp'
assert e.get('proposed_tree_output')==approved[0]
assert r.expected_for(c,'/owned/tree.lgp',cold=True)==e
assert all(n['label_any'] for n in e['nodes'])
class StopBeforeModel(Exception):pass
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);folder=root/'tree-scalar-arrays';folder.mkdir();workspace=root/'workspace';workspace.mkdir()
 runner=object.__new__(r.Runner);runner.options={};runner.env={};runner.out=root
 def stop(*args,**kwargs):raise StopBeforeModel()
 runner.phase=stop
 try:runner.model('tree-scalar-arrays',folder,root/'profile',workspace,'/owned/tree.lgp',{'package_directory':'/owned'},root/'build')
 except StopBeforeModel:pass
 prompt=(folder/'task.md').read_text()
 assert prompt.startswith(c['prompt'].read_text().replace('{{PACKAGE_PATH}}','/owned/tree.lgp'))
 assert 'oracle' not in prompt and 'итоговый CSV' not in prompt
 assert sorted(p.name for p in workspace.iterdir())==['documents.csv']
 assert (workspace/'documents.csv').read_bytes()==(c['data']/'documents.csv').read_bytes()
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});

test('scalar array matching rejects lost empties, shifted records and scalar type changes',()=>{
 const r=spawnSync('python3',['-B','-c',`import copy,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
e=r.read(Path('docs/node-development/nodes/trees-jsontotree/acceptance/typed/expected-scalar-arrays.json'))['tree_outputs'][0]
schema=[dict(index=0,path='',name='Root',type='object',is_container=True,is_array=False,children=[1]),
 dict(index=1,path='/items',name='items',type='object',is_container=True,is_array=True,children=[2,3,4])]
for name,kind in [('id','integer'),('tags','string'),('scores','real')]:
 schema.append(dict(index=len(schema),path='/items/'+name,name=name,type=kind,is_container=False,is_array=name!='id',children=[]))
instances=[]
def walk(node,parent=None,schema_path=''):
 index=len(instances);binding=next(n for n in schema if n['path']==schema_path)
 cell=dict(index=index,parent=parent,path=node['path'],schema_index=binding['index'],type=node['type']);instances.append(cell)
 if 'children' in node:
  cell['children']=[]
  for child in node['children']:
   path=schema_path if node['type']=='array' else schema_path+'/'+child['path'].rsplit('/',1)[-1]
   cell['children'].append(walk(child,index,path))
 else:
  kind=node['type'];value=node['value']
  cell.update(is_null=False,value=float(value) if kind=='real' else value,
   precision='exact_integer' if kind=='integer' else '17_significant_digits' if kind=='real' else 'source_text')
 return index
walk(e['document'])
p=dict(port_kind='tree',sample_complete=True,tree=dict(complete=True,schema=schema,instances=instances,node_count=len(instances),max_depth=5))
r.check_tree(p,e)
for fault in ['schema_type','schema_array','empty','row','value','binding','precision']:
 actual=copy.deepcopy(p);tree=actual['tree']
 if fault=='schema_type':tree['schema'][3]['type']='object'
 if fault=='schema_array':tree['schema'][3]['is_array']=False
 if fault=='empty':next(n for n in tree['instances'] if n['path']=='/items/1/tags')['children']=[0]
 if fault=='row':next(n for n in tree['instances'] if n['path']=='/items/2/tags/0')['value']='a'
 if fault=='value':next(n for n in tree['instances'] if n['path']=='/items/0/scores/0')['value']=2.5
 if fault=='binding':next(n for n in tree['instances'] if n['path']=='/items/0/tags/0')['schema_index']=4
 if fault=='precision':next(n for n in tree['instances'] if n['path']=='/items/0/scores/0')['precision']='unverified'
 try:r.check_tree(actual,e)
 except AssertionError:pass
 else:raise AssertionError(fault+' was accepted')
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
