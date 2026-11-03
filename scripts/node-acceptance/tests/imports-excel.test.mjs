import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parseExpectedOutputs} from '../expected-outputs.mjs';

for(const name of ['excel-import-sheet','excel-import-wide','excel-import-single'])test(name+' resolves only its original XLSX and user task',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('${name}');assert c['prompt'].name=='task.md'
assert len(list(c['data'].iterdir()))==1;assert next(c['data'].iterdir()).suffix=='.xlsx'
e=m.expected_for(c,'/worker/test.lgp');assert e['package_path']=='/worker/test.lgp'
assert all(f['label_any'] for f in e['outputs'][0]['columns'])
`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
for(const [name,width]of [['excel-import-sheet',3],['excel-import-wide',12]])test(name+' has a complete typed cold expectation',()=>{
 const expected=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/imports-excel/acceptance/'+name+'/expected.json',import.meta.url)));
 expected.package_path='/worker/test.lgp';
 // The runner consumes this routing hint before its stock cold contract.
 assert.match(expected.outputs[0].export_destination,/^(sheet|wide)-result\.csv$/);
 delete expected.outputs[0].export_destination;
 const output=parseExpectedOutputs(expected).outputs[0];
 assert.equal(output.columns.length,width);assert.equal(output.rows.length,4);
 assert.equal(output.column_order,'exact');assert.equal(output.ordered,true);
 assert.ok(output.rows.some(r=>Object.values(r).some(v=>v===null)));
 if(width===12){assert.deepEqual([...new Set(output.columns.map(c=>c.type))].sort(),['datetime','integer','real','string']);assert.equal(output.columns.at(-1).name,'Balance');}
});
