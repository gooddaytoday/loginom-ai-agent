import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('text auto-type scenarios export exactly as many CSV files as their expected outputs', () => {
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util
s=importlib.util.spec_from_file_location('run-check','scripts/node-acceptance/run-check.py')
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
for name in ['text-auto-types','text-auto-update']:
 c=r.scenario(name);e=r.expected_for(c,'/own/run.lgp')
 assert c['prompt'].is_file() and (c['source']/'oracle.py').is_file()
 assert all((c['data']/f).is_file() for f in c['input_files'])
 assert c.get('export_count',1)==len(e['outputs'])==1,(name,c.get('export_count'),len(e['outputs']))
`], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
});
