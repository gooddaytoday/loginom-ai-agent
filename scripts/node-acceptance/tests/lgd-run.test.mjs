import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('LGD runner uses original binary paths and requires checksum refusal plus cleanup',()=>{
 const r=spawnSync('python3',['-B','-m','unittest','discover','-s','scripts/node-acceptance/tests','-p','test_lgd.py','-v'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
