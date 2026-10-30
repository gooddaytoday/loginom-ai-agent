import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('Pearson catalog resolves user tasks, independent expected data and single input files',()=>{
 const script=`import importlib.util,json
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py')
s=importlib.util.spec_from_file_location('run_check',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
for name,rows in [('corr-pairs',4),('corr-null',4),('corr-age',1)]:
 c=m.scenario(name); e=m.expected_for(c,'/own/test.lgp')
 assert e['package_path']=='/own/test.lgp'
 native=next(o for o in e['outputs'] if o['output_node_type']=='research.corr_analysis')
 assert len(native['rows'])==rows
 assert native['ordered'] is True
 assert native['columns'][-1]['name']=='Pirson'
 if name=='corr-age': assert e['outputs'][0]['output_node_type']=='export_input'
 assert len(c['input_files'])==1 and (c['data']/c['input_files'][0]).is_file()
 assert c['prompt'].is_file()
print('PASS')`;
 const r=spawnSync('python3',['-B','-c',script],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
