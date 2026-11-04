import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('small positional matrix tasks partition the original 62 outputs exactly once without changing expectations',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util,json
from pathlib import Path
from collections import Counter
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
total=2
for kind in ['regular','reverse','empty-main','empty-attached','both-empty']:
 original=r.scenario('colunion-matrix-'+kind)
 expected=r.expected_for(original,'/owned/test.lgp')
 suffixes=['a','b','c'] if kind in ['regular','reverse'] else ['minimum','maximum','main','attached']
 seen=[]
 for suffix in suffixes:
  part=r.scenario('colunion-matrix-'+kind+'-'+suffix)
  subset=r.expected_for(part,'/owned/test.lgp')
  assert part['input_files']==original['input_files'] and part['data']==original['data']
  assert part['source']==original['source'] and part['expected_name']==original['expected_name']
  assert 1<=len(subset['outputs'])<=4 and part['export_count']==len(subset['outputs'])
  assert {k:v for k,v in subset.items() if k!='outputs'}=={k:v for k,v in expected.items() if k!='outputs'}
  prompt=part['prompt'].read_text()
  assert part['prompt'].is_file() and all(o['output_node_label'] in prompt for o in subset['outputs'])
  assert 'двенадцать' not in prompt
  if kind not in ['regular','reverse']:
   assert len(subset['outputs'])==3
   assert len({o['output_node_label'].split(':')[0] for o in subset['outputs']})==1
  for o in subset['outputs']:
   assert o in expected['outputs']
   seen.append(json.dumps(o,sort_keys=True,ensure_ascii=False))
  total+=len(subset['outputs'])
 assert Counter(seen)==Counter(json.dumps(o,sort_keys=True,ensure_ascii=False) for o in expected['outputs'])
 assert all(n==1 for n in Counter(seen).values())
for name in ['edit','repeat']:
 assert len(r.expected_for(r.scenario('colunion-'+name),'/owned/test.lgp')['outputs'])==1
assert total==62
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
test('positional union catalog keeps the seven approved tasks and all 62 independent ordered outputs',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
count=0
for name in ['edit','repeat','matrix-regular','matrix-reverse','matrix-empty-main','matrix-empty-attached','matrix-both-empty']:
 c=r.scenario('colunion-'+name);e=r.expected_for(c,'/owned/test.lgp')
 assert c['prompt'].is_file() and c['base'] is None
 assert len(c['input_files'])==2 and all((c['data']/f).is_file() for f in c['input_files'])
 assert all(f.endswith('.csv') for f in c['input_files'])
 assert c['export_count']==len(e['outputs'])
 for o in e['outputs']:
  assert o['output_node_type']=='transform.col_union_data' and o['output_port']==0
  assert o['ordered'] is True and o['column_order']=='exact' and len(o['columns'])==8
  assert [f['name'] for f in o['columns']]==['RowID','Code','Amount','Flag','Day','BRowID','AttachedCode','Rate']
  assert all(f['tolerance']==dict(abs=0,rel=0) for f in o['columns'] if f['type']=='real')
 count+=len(e['outputs'])
assert count==62
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
