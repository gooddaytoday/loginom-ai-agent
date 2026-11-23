import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
test('C11 catalog uses the frozen original task, categorical.csv and all exact outputs',()=>{
 const value=JSON.parse(execFileSync('python3',['-c',`import importlib.util,json
s=importlib.util.spec_from_file_location('runner','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('linreg-categorical');e=m.expected_for(c,'/worker/c11.lgp')
print(json.dumps(dict(task=c['prompt'].name,files=c['input_files'],oracle=c['oracle'].name,expected=e)))`],{encoding:'utf8'}));
 const approved=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/datamining-linregression/acceptance/modes/categorical/expected.json',import.meta.url),'utf8'));
 assert.equal(value.task,'task-categorical.md');assert.deepEqual(value.files,['categorical.csv']);assert.equal(value.oracle,'oracle.py');
 assert.deepEqual(value.expected.outputs.map(o=>o.rows),approved.outputs.map(o=>o.rows));assert.equal(value.expected.package_path,'/worker/c11.lgp');
 assert.deepEqual(value.expected.outputs.map(o=>o.columns.map(c=>[c.name,c.type])),approved.outputs.map(o=>o.columns.map(c=>[c.name,c.type])));
 assert.equal(value.expected.outputs[1].columns[0].label,'Имена входных полей');assert.equal(value.expected.outputs[1].columns[3].label,'Y|Коэффициенты');
 assert.equal(value.expected.outputs[0].rows.length,18);assert.equal(value.expected.outputs[1].rows[2].Y_coefficients,0);assert.equal(value.expected.outputs[1].rows[2].Y_stdError,null);
});
