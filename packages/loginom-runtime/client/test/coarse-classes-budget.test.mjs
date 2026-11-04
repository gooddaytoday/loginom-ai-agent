import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nodeApiTools} from '../lib/node-api.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
const bytes=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v));
test('Coarse classes fits the approved model-visible budgets',async()=>{
 const apply=nodeApiTools.find(t=>t.name==='dock_node_apply');
 assert.ok(bytes(userNodeTool(apply).inputSchema)<=20000);
 const card=describeNodeTypes(['preprocessing.coarse_classes'],{},new Map(),createCandidateNodeSupport({}).nodeApplyHandlers)[0];
 assert.ok(bytes(card)<=12000);
 const main=await readFile(new URL('../../../product/skills/loginom-automation/SKILL.md',import.meta.url),'utf8');
 const node=await readFile(new URL('../../../product/skills/loginom-automation/references/nodes/preprocessing.coarse_classes.md',import.meta.url),'utf8');
 assert.ok(bytes(main)<=40000,bytes(main));assert.ok(bytes(node)<=6000);
 assert.match(main,/references\/nodes\/preprocessing.coarse_classes.md/);
 assert.doesNotMatch(node,/\$(?:\d+|ARGUMENTS)/);
});
