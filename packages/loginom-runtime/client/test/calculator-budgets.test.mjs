import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nodeApiTools} from '../lib/node-api.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
test('calculator fits the apply, type card, node reference and route budgets and publishes syntax',async()=>{
 const t=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 assert.ok(Buffer.byteLength(JSON.stringify({name:t.name,description:t.description,inputSchema:t.inputSchema}))<=20000);
 const card=describeNodeTypes(['transform.calculator'],{},new Map(),createCandidateNodeSupport({}).nodeApplyHandlers)[0];
 assert.ok(Buffer.byteLength(JSON.stringify(card))<=12000);
 assert.ok(JSON.stringify(card).includes('"syntax"'));
 const skill=await readFile(new URL('../../../product/skills/loginom-automation/SKILL.md',import.meta.url),'utf8');
 assert.ok(Buffer.byteLength(skill)<=40000);
 const route=skill.split('\n').find(line=>line.includes('references/nodes/transform.calculator.md'));
 assert.ok(route&&Buffer.byteLength(route)<=200);
});
