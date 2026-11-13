import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('Top-N registers the approved task, two private ordered phases and builtin control source',()=>{
 const code=`import importlib.util
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('row-filter-top-n')
assert c['prompt'].name=='task-top-n.md' and c['input_files']==['rows.csv']
assert c['export_count']==4 and c['filter_top_n'] is True and c['base'] is None
assert c['filter_initial']=='expected-top-initial.json' and c['expected_name']=='expected-top-final.json'
`;
 execFileSync('python3',['-B','-c',code],{cwd:new URL('../../../',import.meta.url)});
 const root=new URL('../../../docs/node-development/nodes/row-filter/acceptance/typed/',import.meta.url);
 for(const [phase,n] of [['initial',3],['final',5]]){
  const e=JSON.parse(readFileSync(new URL('expected-top-'+phase+'.json',root)));
  assert.equal(e.row_filter_top_n,true);assert.ok(e.outputs.every(o=>o.ordered));
  assert.deepEqual(e.outputs[0].rows.map(r=>r.RowID),Array.from({length:n},(_,i)=>i+1));
  assert.equal(e.variable_inventory.outputs[0].variables[0].value,n);
  assert.equal(e.variable_inventory.links[0].kind,'control');
 }
 execFileSync('python3',['-B',new URL('oracle.py',root).pathname,'--check']);
});

test('row-filter scenarios use approved tasks, exact fixtures and stock typed control cold',()=>{
 const code=`import importlib.util,json
s=importlib.util.spec_from_file_location('run_check','scripts/node-acceptance/run-check.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
print(json.dumps([{k:str(v) if hasattr(v,'__fspath__') else v for k,v in m.scenario(n).items()} for n in ['row-filter-variables','row-filter-list','row-filter-scalar','row-filter-empty','row-filter-none']]))`;
 const specs=JSON.parse(execFileSync('python3',['-c',code],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'}));
 for(const spec of specs){
  assert.match(spec.prompt,/row-filter\/acceptance\/task-variable-/);
  assert.deepEqual(spec.input_files,[spec.filter_initial===null?'variables-empty.csv':'variables.csv']);
  assert.equal(spec.export_count,spec.filter_initial===null?2:4);
  const expected=JSON.parse(readFileSync(spec.source+'/'+spec.expected_name,'utf8'));
  assert.deepEqual(expected.outputs.map(o=>o.output_port),[0,1]);
  assert.equal(expected.variable_inventory.links[0].kind,'control');
  assert.equal(expected.variable_inventory.outputs[0].port,0);
  assert.equal(expected.variable_inventory.outputs[0].node.type,'variables.calculator');
 }
});

test('row-filter-value-list uses the approved literal-list kit and both ports',()=>{
 const code=`import importlib.util,json
s=importlib.util.spec_from_file_location('run_check','scripts/node-acceptance/run-check.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
r=importlib.util.spec_from_file_location('required_checks','scripts/node-acceptance/required-checks.py')
q=importlib.util.module_from_spec(r);r.loader.exec_module(q)
print(json.dumps(dict(spec={k:str(v) if hasattr(v,'__fspath__') else v for k,v in m.scenario('row-filter-value-list').items()},
 cases=sorted({c for globs,_,cases in q.RULES if any(g.endswith('row-filter/acceptance/**') for g in globs) for c in cases}))))`;
 const {spec,cases}=JSON.parse(execFileSync('python3',['-c',code],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'}));
 assert.match(spec.prompt,/row-filter\/acceptance\/task-value-list\.md$/);
 assert.match(spec.data,/row-filter\/fixtures\/v040$/);
 assert.deepEqual(spec.input_files,['rows.csv']);
 assert.match(spec.oracle,/row-filter\/acceptance\/oracle-v040\.py$/);
 assert.equal(spec.base,null);
 const expected=JSON.parse(readFileSync(spec.source+'/'+spec.expected_name,'utf8'));
 assert.deepEqual(expected.outputs.map(o=>[o.output_port,o.rows.map(r=>r.RowID)]),[[0,[1,2,3]],[1,[4,5,6]]]);
 // Owner decision v040-filter-value-list-order: saved Filter autosync reorders fields after reopen.
 assert.deepEqual(expected.outputs.map(o=>o.column_order),['any','any']);
 assert.ok(cases.includes('row-filter-value-list'));
 execFileSync('python3',[spec.oracle,'--check'],{encoding:'utf8'});
});
