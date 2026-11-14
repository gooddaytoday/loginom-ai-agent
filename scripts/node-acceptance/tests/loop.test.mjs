import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('Loop cases retain the frozen kit and expose only original CSV inputs',()=>{
 const result=JSON.parse(execFileSync('python3',['-c',`import runpy,json
m=runpy.run_path('scripts/node-acceptance/run-check.py')
print(json.dumps([{k:str(v) if k in ['source','prompt','data','oracle'] else v for k,v in m['scenario'](n).items()} for n in ['loop-pages-offline','loop-pages-rest']]))`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'}));
 for(const s of result){assert.deepEqual(s.input_files,['pages.csv']);assert.equal(s.base,null);assert.ok(s.source.endsWith('control-loop/acceptance'));assert.ok(s.oracle.endsWith('control-loop/acceptance/oracle.py'));}
 assert.ok(result[0].prompt.endsWith('task-offline.md'));assert.equal(result[0].expected_name,'expected-offline.json');
 assert.ok(result[1].prompt.endsWith('task.md'));assert.equal(result[1].expected_name,'expected.json');
});
