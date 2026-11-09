import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('text auto-type scenarios check every CSV stage and cold checks the final state', () => {
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util
s=importlib.util.spec_from_file_location('run-check','scripts/node-acceptance/run-check.py')
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
for name in ['text-auto-types','text-auto-update']:
 c=r.scenario(name);e=r.expected_for(c,'/own/run.lgp')
 assert c['prompt'].is_file() and (c['source']/'oracle.py').is_file()
 assert all((c['data']/f).is_file() for f in c['input_files'])
 stages=r.text_update_stages(c) if c.get('text_update') else e['outputs']
 assert c.get('export_count',1)==len(stages),(name,c.get('export_count'),len(stages))
 assert e['outputs']==stages[-1:]
 assert r.expected_for(c,'/own/run.lgp',cold=True)['outputs']==stages[-1:]
`], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
});
