import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('delta cases resolve stock fixtures and path-specific live obligations', () => {
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util
def module(name):
 s=importlib.util.spec_from_file_location(name,'scripts/node-acceptance/'+name+'.py')
 m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
r=module('run-check');checks=module('required-checks')
for name in ['calculator-viewport','linreg-short','throw1','js-declared-empty']:
 c=r.scenario(name);e=r.expected_for(c,'/own/run.lgp')
 assert c['prompt'].is_file() and (c['source']/'oracle.py').is_file()
 assert all((c['data']/f).is_file() for f in c['input_files'])
 assert not c.get('upload_only') and e['package_path']=='/own/run.lgp'
 assert bool(e.get('execution_error')) == (name in ['linreg-short','throw1'])
 if e.get('execution_error'): assert e['outputs']==[]
 else: assert len(e['outputs'])==1
 paths=[str(c['prompt'].relative_to(r.REPO))]
 assert name in checks.select(paths)[1]
for path,names in [
 ('node-port-output.mjs',['calculator-viewport']),
 ('node-port-open.mjs',['calculator-viewport']),
 ('node-execution-evidence.mjs',['linreg-short','throw1']),
 ('node-process-context.mjs',['linreg-short','throw1']),
 ('executor.mjs',['linreg-short','throw1']),
 ('javascript-declared-schema.mjs',['js-declared-empty','throw1'])]:
 assert set(names)<=set(checks.select([checks.C+path])[1])
`], {cwd: fileURLToPath(new URL('../../../', import.meta.url)), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
