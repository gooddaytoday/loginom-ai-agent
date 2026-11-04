import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('DataToVar routing and node reference fit owner budgets and use tool parameters without slash placeholders',async()=>{
 const root=new URL('../../../product/skills/loginom-automation/',import.meta.url);
 const skill=await readFile(new URL('SKILL.md',root),'utf8'),reference=await readFile(new URL('references/nodes/variables.from_table.md',root),'utf8');
 const rows=skill.split('\n').filter(line=>line.startsWith('|')&&line.includes('references/nodes/variables.from_table.md'));
 assert.equal(rows.length,1);assert.ok(Buffer.byteLength(rows[0]+'\n')<=150);
 assert.ok(Buffer.byteLength(skill)<=40000);assert.ok(Buffer.byteLength(reference)<=6000);
 assert.doesNotMatch(rows[0]+reference,/\$(?:[1-9][0-9]*|ARGUMENTS)\b/);
 assert.match(reference,/dock_node_apply/);assert.match(reference,/variable_ports/);assert.match(reference,/aggregations/);
});
