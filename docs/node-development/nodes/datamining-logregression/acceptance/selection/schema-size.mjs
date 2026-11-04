// Measure the shipped schema and the additive selection registration.
import assert from 'node:assert/strict';
import {nodeApiTools} from '../../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {userNodeTool} from '../../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';
import {describeNodeTypes} from '../../../../../../packages/loginom-runtime/client/lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
const schema=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema);
const bytes=()=>Buffer.byteLength(JSON.stringify(schema),'utf8');
const production=bytes();
const compact=Buffer.byteLength(JSON.stringify(userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply')).inputSchema),'utf8');
const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
const card=describeNodeTypes(['datamining.log_regression'],{},new Map(),support.nodeApplyHandlers,'7.4.2')[0];
const describe=Buffer.byteLength(JSON.stringify(card),'utf8');
assert.ok(compact<=12000);
assert.ok(describe<=12000);
assert.deepEqual(schema.properties.mode.enum.filter(m=>['forward','backward','stepwise'].includes(m)),['forward','backward','stepwise']);
assert.ok(schema.properties.parameters.properties.logistic.properties.selection);
delete schema.properties.parameters.properties.logistic.properties.selection;

console.log(JSON.stringify({base:bytes(),production,delta:production-bytes(),compact,describe,limit:12000}));
