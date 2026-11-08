import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createBundledSkillFixture} from './support/bundled-skill-fixture.mjs';

// LAB-1165: the models read workflow.md but not browser.md, then called
// abandon_operation and node_resume although inspect offered neither.
test('workflow guidance limits node resume and release to the inspected recovery options',async t=>{
 const source=await createBundledSkillFixture(t);
 const workflow=await readFile(join(source.directory,'references/workflow.md'),'utf8');
 const line=workflow.split('\n').find(l=>l.includes('loginom_dock_node_resume')&&l.includes('recovery_options'));
 assert.ok(line,'workflow.md names the recovery_options gate for node resume');
 assert.match(line,/abandon_operation/);
 assert.match(line,/request_rejected/);
 assert.match(line,/browser\.md/);
});
