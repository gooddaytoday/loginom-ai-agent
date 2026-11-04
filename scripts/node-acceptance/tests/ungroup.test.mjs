import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('ungroup catalog keeps independent typed Decimal oracles out of model inputs',()=>{
 const script=`import importlib.util,json,subprocess,sys
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py')
s=importlib.util.spec_from_file_location('run_check',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
for name,variant,rows in [('ungroup-shares','',13),('ungroup-null','null',4),('ungroup-empty','empty',0),('ungroup-rounding','rounding',3)]:
 c=m.scenario(name);e=m.expected_for(c,'/own/test.lgp')
 assert e['package_path']=='/own/test.lgp' and c['base'] is None
 outputs=e.get('outputs',[e])
 assert len(outputs)==(5 if variant=='rounding' else 1)
 for o in outputs:
  assert o['output_node_type']=='transform.ungroup_data' and o['output_port']==0
  assert len(o['rows'])==rows and o['ordered'] is True and o['column_order']=='exact'
 assert c['prompt'].is_file() and all((c['data']/f).is_file() for f in c['input_files'])
 assert all(f.endswith('.csv') for f in c['input_files'])
 oracle=c['source']/'oracle.py'
 expected=json.loads(subprocess.check_output([sys.executable,str(oracle)]+([variant] if variant else [])))
 frozen=json.loads((c['source']/c['expected_name']).read_text())
 assert expected==frozen
print('PASS')`;
 const r=spawnSync('python3',['-B','-c',script],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
