import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nodeApiTools} from '../lib/node-api.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';

test('variables.to_table fits the apply, type card and route budgets',async()=>{
 const t=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 assert.ok(Buffer.byteLength(JSON.stringify({name:t.name,description:t.description,inputSchema:t.inputSchema}))<=20000);
 const card=describeNodeTypes(['variables.to_table'],{},new Map(),createCandidateNodeSupport({}).nodeApplyHandlers)[0];
 assert.ok(Buffer.byteLength(JSON.stringify(card))<=12000);
 const skill=await readFile(new URL('../../../product/skills/loginom-automation/SKILL.md',import.meta.url),'utf8');
 const route=skill.split('\n').find(line=>line.includes('references/nodes/variables.to_table.md'));
 assert.ok(route&&Buffer.byteLength(route)<=200);
 console.log('SIZES',Buffer.byteLength(JSON.stringify(card)),Buffer.byteLength(route));
});
test('variables.to_table reference teaches in-place mode switch and source edit within the node budget',async()=>{
 const root=new URL('../../../product/skills/loginom-automation/',import.meta.url);
 const reference=await readFile(new URL('references/nodes/variables.to_table.md',root),'utf8');
 assert.ok(Buffer.byteLength(reference)<=6000);
 assert.doesNotMatch(reference,/\$(?:[1-9][0-9]*|ARGUMENTS)\b/);
 assert.match(reference,/<!-- mode: columns rows -->/);assert.match(reference,/<!-- \/mode -->/);
 for(const term of ['target:{kind:"existing"','mode`','parameters:{}','mappings:[]','variable_inputs','том же узле','в самом источнике'])assert.ok(reference.includes(term),term);
 assert.doesNotMatch(reference,/Переключение режима существующего узла/);
});
