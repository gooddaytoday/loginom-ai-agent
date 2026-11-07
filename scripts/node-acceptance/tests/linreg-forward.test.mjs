import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('C1 catalog delivers only the approved task and selection.csv, with distinct independent F/R2 expectations',()=>{
 const result=JSON.parse(execFileSync('python3',['-c',`import importlib.util,json
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py')
spec=importlib.util.spec_from_file_location('runner',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
out=[]
for name in ['linreg-forward-f','linreg-forward-r2']:
 c=m.scenario(name);e=m.expected_for(c,'/worker/c1.lgp')
 out.append(dict(name=name,task=c['prompt'].name,files=c['input_files'],data=c['data'].name,expected=e))
print(json.dumps(out))`],{encoding:'utf8'}));
 assert.deepEqual(result.map(c=>c.files),[['selection.csv'],['selection.csv']]);
 assert.deepEqual(result.map(c=>c.task),['task-forward.md','task-forward-r2.md']);
 for(const c of result){assert.equal(c.expected.package_path,'/worker/c1.lgp');assert.equal(c.expected.outputs.length,2);assert.equal(c.expected.outputs[0].rows.length,16);assert.equal(c.expected.outputs[0].columns[0].label,'Y|Регрессия');assert.equal(c.expected.outputs[1].columns[0].label,'Имена входных полей');assert.equal(c.expected.outputs[1].columns[1].label,'Y|Коэффициенты');assert.deepEqual(c.expected.outputs[0].columns.filter(f=>/^X/.test(f.name)).map(f=>f.type),['integer','integer','integer']);}
 assert.deepEqual(result.map(c=>c.expected.outputs[1].rows.map(r=>r.Name)),[['<Константа>','X1','X2'],['<Константа>','X1','X2','X3']]);
});

test('R2 0/1 diagnostic retains the approved independent expected file',()=>{
 const value=JSON.parse(execFileSync('python3',['-c',`import importlib.util,json
s=importlib.util.spec_from_file_location('runner','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('linreg-forward-r2-cutoffs');print(json.dumps(dict(task=c['prompt'].name,expected=c['expected_name'],files=c['input_files'])))`],{encoding:'utf8'}));
 assert.deepEqual(value,{task:'task-forward-r2-cutoffs.md',expected:'expected/forward-r2.json',files:['selection.csv']});
});

test('C2 Backward delivers the original business task and only selection.csv with C1 F oracle',()=>{
 const value=JSON.parse(execFileSync('python3',['-c',`import importlib.util,json
s=importlib.util.spec_from_file_location('runner','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('linreg-backward-f');f=m.scenario('linreg-forward-f');e=m.expected_for(c,'/worker/c2.lgp')
assert e==m.expected_for(f,'/worker/c2.lgp')
print(json.dumps(dict(task=c['prompt'].name,expected=c['expected_name'],files=c['input_files'])))`],{encoding:'utf8'}));
 assert.deepEqual(value,{task:'task-backward.md',expected:'expected/forward-f.json',files:['selection.csv']});
});

test('C3 Stepwise delivers only the approved task and CSV with unchanged F expectations',()=>{
 const value=JSON.parse(execFileSync('python3',['-c',`import importlib.util,json
s=importlib.util.spec_from_file_location('runner','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('linreg-stepwise-f');f=m.scenario('linreg-forward-f')
assert m.expected_for(c,'/worker/c3.lgp')==m.expected_for(f,'/worker/c3.lgp')
print(json.dumps(dict(task=c['prompt'].name,expected=c['expected_name'],files=c['input_files'])))`],{encoding:'utf8'}));
 assert.deepEqual(value,{task:'task-stepwise.md',expected:'expected/forward-f.json',files:['selection.csv']});
});
