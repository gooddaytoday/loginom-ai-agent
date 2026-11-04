import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('enrich catalog isolates tasks and CSV from oracle and retains exact independent expectations',()=>{
 const script=`import importlib.util,json,subprocess
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py')
s=importlib.util.spec_from_file_location('run_check',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
for name,kind,count,width in [('enrich-data-left','final',13,7),('enrich-data-composite','composite',7,4)]:
 c=m.scenario(name); e=m.expected_for(c,'/own/test.lgp')
 assert e['package_path']=='/own/test.lgp'
 wanted=json.loads(subprocess.check_output(['python3',str(c['source']/'oracle.py'),'--case',kind]))
 assert e['outputs']==wanted['outputs']
 o=e['outputs'][0]
 assert o['output_node_type']=='transform.enrich_data' and o['output_port']==0
 assert len(o['rows'])==count and len(o['columns'])==width
 assert o['ordered'] is False and o['column_order']=='exact'
 assert all(f.get('tolerance',{'abs':0,'rel':0})=={'abs':0,'rel':0} for f in o['columns'])
 assert len(c['input_files'])==(4 if kind=='final' else 2)
 assert all(f.endswith('.csv') and (c['data']/f).is_file() for f in c['input_files'])
 assert c['prompt'].is_file() and 'expected' not in c['prompt'].read_text()
s=importlib.util.spec_from_file_location('required',Path('scripts/node-acceptance/required-checks.py')); checks=importlib.util.module_from_spec(s);s.loader.exec_module(checks)
for path in [checks.C+'enrich-node.mjs',checks.C+'enrich-parameters.mjs','docs/node-development/nodes/transform-enrichdata/acceptance/task.md']:
 assert {'enrich-data-left','enrich-data-composite'}<=set(checks.select([path])[1])
print('PASS')`;
 const r=spawnSync('python3',['-B','-c',script],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
