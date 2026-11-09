import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseExpectedOutputs} from '../expected-outputs.mjs';
import {readFileSync} from 'node:fs';

test('tree-only expectations require a nonempty tree contract when no tables are requested',()=>{
 const base={package_path:'/owned/tree.lgp',nodes:[],outputs:[]};
 const tree={output_node_type:'trees.from_json',output_port:0,document:{path:'',type:'object',children:[]}};
 assert.deepEqual(parseExpectedOutputs({...base,tree_outputs:[tree]}),{multiple:true,outputs:[]});
 for(const tree_outputs of [undefined,null,[],{},'tree'])
  assert.throws(()=>parseExpectedOutputs({...base,tree_outputs}),/EXPECTED_OUTPUTS_INVALID/);
});

test('cold tree-only read planning selects the tree and skips tabular outputs',()=>{
 const source=readFileSync(new URL('../cold-check.mjs',import.meta.url),'utf8');
 const start=source.indexOf('  const reads=expectedOutputs.length===0');
 const end=source.indexOf('  if(expected.sorting_mode)',start);
 assert.ok(start>=0&&end>start);
 const plan=new Function('expected','graph',`const expectedOutputs=[],state={},variableInventory={outputs:[]},multiple=true,saved={},exportInput=null;
 const selectColdOutputReads=()=>{throw Error('TABULAR_READ_FOR_TREE_ONLY')};
 ${source.slice(start,end)};return reads;`);
 const tree={output_node_type:'trees.from_json',output_port:0};
 const node={type:'trees.from_json',ref:{node_id:'tree'},outputs:[0]};
 const graph={nodes:[node,{type:'imports.text',ref:{node_id:'import'},outputs:[0]}]};
 assert.deepEqual(plan({tree_outputs:[tree]},graph),[{node,ports:[{port:0}],treeContract:tree}]);
 assert.throws(()=>plan({tree_outputs:[]},graph),/TABULAR_READ/);
 assert.throws(()=>plan({tree_outputs:[tree]},{nodes:[]}),/COLD_TREE_NODE_AMBIGUOUS/);
 assert.throws(()=>plan({tree_outputs:[tree]},{nodes:[node,node]}),/COLD_TREE_NODE_AMBIGUOUS/);
});

test('tree-only scenarios retain approved trees and send only their task and documents.csv',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util,json,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class StopBeforeModel(Exception):pass
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory)
 runner=object.__new__(r.Runner);runner.options={};runner.env={};runner.out=root/'run'
 def phase(*args,**kwargs):raise StopBeforeModel()
 runner.phase=phase
 for name,key,task in [('tree-null-leaves','null','null-leaves'),('tree-nested-records','nested','nested-records'),('tree-empty-containers','empty','empty-containers')]:
  case=r.scenario(name)
  assert case['tree_only'] and case['external'] and case['base'] is None
  assert case['source'].name=='nested-records' and case['data'].name=='nested-records'
  assert case['input_files']==['documents.csv'] and case['prompt'].name=='task-'+task+'.md'
  approved=r.read(case['source']/'expected.json')['cases'][key]
  for cold in [False,True]:
   e=r.expected_for(case,'/owned/tree.lgp',cold=cold)
   assert e['outputs']==[] and e['package_path']=='/owned/tree.lgp'
   assert e['proposed_tree_output']==approved['proposed_tree_output']
   assert e['tree_outputs']==[approved['proposed_tree_output']]
  folder=root/name/name;folder.mkdir(parents=True)
  workspace=root/name/'workspace';workspace.mkdir()
  try:runner.model(name,folder,root/name/'profile',workspace,'/owned/tree.lgp',{'package_directory':'/owned'},root/'build')
  except StopBeforeModel:pass
  prompt=(folder/'task.md').read_text()
  assert prompt.startswith(case['prompt'].read_text().replace('{{PACKAGE_PATH}}','/owned/tree.lgp'))
  assert 'CSV' not in prompt and 'Выгрузи' not in prompt and 'oracle' not in prompt
  assert sorted(p.name for p in workspace.iterdir())==['documents.csv']
  assert (workspace/'documents.csv').read_bytes()==(case['data']/'documents.csv').read_bytes()
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
test('tree scenarios bind both immutable tasks, original CSV, export destination and private tree oracle',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
for name in ['tree-repeat','tree-no-repeat']:
 c=r.scenario(name); e=r.expected_for(c,'/owned/tree.lgp')
 assert c['external'] and c['base'] is None
 assert [p.name for p in c['data'].glob('*.csv')]==['documents.csv']
 assert c['prompt'].name=='task.md' and 'oracle' not in c['prompt'].read_text()
 assert e['outputs'][0]['export_destination']=='tree-result.csv'
 assert e['outputs'][0]['output_node_type']=='trees.to_table'
 assert e['proposed_tree_output']['document']['children'][0]['value']=='9007199254740993'
 assert e['outputs'][0]['rows'][1]['id']==('9007199254740993' if name=='tree-repeat' else None)
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
test('tree oracle rejects rounded Int64, altered NULL, reordered instances and foreign schema binding',()=>{
 const r=spawnSync('python3',['-B','-c',`import copy,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
e=r.expected_for(r.scenario('tree-repeat'),'/owned/tree.lgp')['proposed_tree_output']
schema=[dict(index=0,parent=None,path='',name='Root',type='object',is_container=True,is_array=False,children=[])]
for path,kind in e['schema_types'].items():
 parent=next(n['index'] for n in schema if n['path']==path.rsplit('/',1)[0])
 index=len(schema);schema[parent]['children'].append(index)
 schema.append(dict(index=index,parent=parent,path=path,name=path.rsplit('/',1)[1],type='object' if kind=='object_array' else kind,is_container=kind=='object_array',is_array=kind=='object_array',children=[]))
instances=[]
def add(node,parent=None,path=''):
 index=len(instances);binding=next(n for n in schema if n['path']==path)
 value=dict(index=index,parent=parent,path=node['path'],schema_index=binding['index'],type=node['type'])
 instances.append(value)
 if 'children' in node:
  value['children']=[]
  for child in node['children']:
   childpath=path if node['type']=='array' else path+'/'+child['path'].rsplit('/',1)[-1]
   value['children'].append(add(child,index,childpath))
 else:
  null=node['type']=='null';value['type']=binding['type'];value['is_null']=null
  value['value']=float(node['value']) if node['type']=='real' else node['value']
  value['precision']='exact_null' if null else 'exact_integer' if node['type']=='integer' else '17_significant_digits' if node['type']=='real' else 'source_text'
 return index
add(e['document'])
p=dict(port_kind='tree',sample_complete=True,tree=dict(complete=True,schema=schema,instances=instances,node_count=len(instances),max_depth=4))
r.check_tree(p,e)
for fault in ['integer','null','order','binding','children']:
 q=copy.deepcopy(p);rows=q['tree']['instances']
 if fault=='integer': rows[1]['value']='9007199254740992'
 if fault=='null': next(n for n in rows if n['path']=='/items/0/note')['value']=''
 if fault=='order': rows[4],rows[9]=rows[9],rows[4]
 if fault=='binding': rows[1]['schema_index']=2
 if fault=='children': rows[3]['children'].reverse()
 try:r.check_tree(q,e)
 except AssertionError:pass
 else:raise AssertionError(fault+' was accepted')
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});

test('tree model preparation consumes export routing before the real cold output contract',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util,json,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class StopBeforeModel(Exception):pass
results=[]
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory)
 runner=object.__new__(r.Runner);runner.options={};runner.env={};runner.out=root/'run'
 def phase(*args,**kwargs):raise StopBeforeModel()
 runner.phase=phase
 for name in ['tree-repeat','tree-no-repeat']:
  folder=root/name/name;folder.mkdir(parents=True)
  workspace=root/name/'workspace';workspace.mkdir()
  original=r.expected_for(r.scenario(name),'/owned/tree.lgp')
  try:runner.model(name,folder,root/name/'profile',workspace,'/owned/tree.lgp',{'package_directory':'/owned'},root/'build')
  except StopBeforeModel:pass
  prepared=json.loads((folder/'expected.json').read_text())
  assert prepared['outputs'][0]['rows']==original['outputs'][0]['rows']
  assert prepared['proposed_tree_output']==original['proposed_tree_output']
  assert '/owned/run-'+name+'-tree-result.csv' in (folder/'task.md').read_text()
  assert (workspace/'documents.csv').read_bytes()==(r.scenario(name)['data']/'documents.csv').read_bytes()
  results.append(prepared)
print(json.dumps(results))
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
 for(const expected of JSON.parse(r.stdout))assert.doesNotThrow(()=>parseExpectedOutputs(expected));
});

test('trees-to-table-indices binds the approved task, documents.csv and expected derived from the independent oracle',()=>{
 const r=spawnSync('python3',['-B','-c',`import csv,importlib.util,io,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
c=r.scenario('trees-to-table-indices');e=r.expected_for(c,'/owned/tree.lgp')
assert c['external'] and c['base'] is None
assert [p.name for p in c['data'].glob('*.csv')]==['documents.csv']
task=c['prompt'].read_text()
assert c['prompt'].name=='task-indices.md' and 'documents.csv' in task and 'oracle' not in task and 'input.json' not in task and 'group' not in task
oracle=json.loads((c['source']/'expected.json').read_text())
case=next(x for x in oracle['cases'] if x['id']=='indices')
assert [o['export_destination'] for o in e['outputs']]==['indices.csv']
out,want=e['outputs'][0],case['output']
assert out['output_node_type']=='trees.to_table' and out['column_order']=='exact' and out['ordered']
assert out['columns']==want['columns'] and out['rows']==want['rows']
assert [c['name'] for c in out['columns']]==['batch','item_index','code','qty'] and out['columns'][1]['name_any']
assert [r['item_index'] for r in out['rows']]==[0,1]
source=json.loads((c['data']/'input.json').read_text())
rows=list(csv.DictReader(io.StringIO((c['data']/'documents.csv').read_text())))
assert [int(x['RowID']) for x in rows]==[1]
assert json.loads(rows[0]['Document'])=={'batch':source['document']['batch'],'items':source['document']['items']}
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
 const e=JSON.parse(spawnSync('python3',['-B','-c',`import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
e=r.expected_for(r.scenario('trees-to-table-indices'),'/owned/tree.lgp')
for o in e['outputs']:o.pop('export_destination')
print(json.dumps(e))`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'}).stdout);
 assert.doesNotThrow(()=>parseExpectedOutputs(e));
});
