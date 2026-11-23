import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {mkdtempSync,cpSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const node='docs/node-development/nodes/datamining-logregression';
const check=root=>spawnSync('python3',['-I',join(root,'acceptance/modes/oracle.py'),'--check'],{encoding:'utf8'});
test('logreg modes oracle --check accepts merged expected on this libm',()=>{
 const r=check(node);
 assert.equal(r.status,0,r.stderr);
});
test('logreg modes oracle --check still rejects a changed value',()=>{
 const root=mkdtempSync(join(tmpdir(),'logreg-oracle-'));
 cpSync(node,root,{recursive:true});
 const path=join(root,'acceptance/modes/coefficients/expected.json');
 const e=JSON.parse(readFileSync(path,'utf8'));
 e.outputs[0].rows[1].Target_waldPValue*=1+1e-9;
 writeFileSync(path,JSON.stringify(e,null,2)+'\n');
 assert.notEqual(check(root).status,0);
});
