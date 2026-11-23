import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('sorting-locale checks both locale stages and saves the locale-aware one',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py')
s=importlib.util.spec_from_file_location('run_check',p)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('sorting-locale');e=m.expected_for(c,'/own/locale.lgp')
assert c['prompt'].name=='task-locale.md' and c['export_count']==2 and c['base'] is None
assert c['input_files']==['modes.csv'] and (c['data']/'modes.csv').is_file()
assert (c['source']/'oracle.py').is_file()
assert e['package_path']=='/own/locale.lgp'
assert [n['type'] for n in e['nodes']]==['imports.text','transform.sorting','exports.text']
assert len(e['outputs'])==1
o=e['outputs'][0]
assert o['output_node_type']=='transform.sorting' and o['output_port']==0 and o['ordered'] and o['column_order']=='exact'
assert [f['name'] for f in o['columns']]==['RowID','Word','Amount']
assert [r['RowID'] for r in o['rows']]==[9,10,3,6,2,5,1,4,7,8]
first=m.sorting_stages(c)[0]
assert [r['RowID'] for r in first['rows']]==[9,10,7,8,6,2,4,3,5,1] and first['column_order']=='exact'
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});

test('sorting-variant freezes the independent ordered typed projection and repeats it twice',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util, json, subprocess, sys
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py')
s=importlib.util.spec_from_file_location('run_check',p)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('sorting-variant');e=m.expected_for(c,'/own/variant.lgp')
assert c['prompt'].name=='task-variant.md' and c['export_count']==2 and c['base'] is None
assert c['input_files']==['variant-wide.csv'] and (c['data']/c['input_files'][0]).is_file()
assert [n['type'] for n in e['nodes']]==['imports.text','transform.collapse_columns','transform.sorting','exports.text']
assert e['package_path']=='/own/variant.lgp' and e['sorting_mode']=='variant'
assert e['sorting_stages']==e['outputs']*2
o=e['outputs'][0]
assert o['ordered'] and o['column_order']=='exact' and len(o['rows'])==9
assert [f['name'] for f in o['columns']]==['RowID','Names','Values']
assert [r['Values'] for r in o['rows'][:3]]==[None]*3
assert [r['Values']['cell_type'] for r in o['rows'][3:]]==['integer','real','real','integer','string','string']
proposal=json.loads(subprocess.check_output([sys.executable,str(c['source']/'oracle.py')]))
assert o==dict(proposal['cases']['variant']['stages'][0],column_order='exact')
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
