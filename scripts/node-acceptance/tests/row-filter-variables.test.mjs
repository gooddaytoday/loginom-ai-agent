import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('row-filter scenarios use approved tasks, exact fixtures and stock typed control cold',()=>{
 const code=`import importlib.util,json
s=importlib.util.spec_from_file_location('run_check','scripts/node-acceptance/run-check.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
print(json.dumps([{k:str(v) if hasattr(v,'__fspath__') else v for k,v in m.scenario(n).items()} for n in ['row-filter-variables','row-filter-list','row-filter-scalar','row-filter-empty']]))`;
 const specs=JSON.parse(execFileSync('python3',['-c',code],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'}));
 for(const spec of specs){
  assert.match(spec.prompt,/row-filter\/acceptance\/task-variable-/);
  assert.deepEqual(spec.input_files,[spec.filter_initial===null?'variables-empty.csv':'variables.csv']);
  assert.equal(spec.export_count,spec.filter_initial===null?2:4);
  const expected=JSON.parse(readFileSync(spec.source+'/'+spec.expected_name,'utf8'));
  assert.deepEqual(expected.outputs.map(o=>o.output_port),[0,1]);
  assert.equal(expected.variable_inventory.links[0].kind,'control');
  assert.equal(expected.variable_inventory.outputs[0].port,4);
 }
});
