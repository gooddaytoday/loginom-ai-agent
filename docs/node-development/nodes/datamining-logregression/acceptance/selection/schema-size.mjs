// Measure the shipped schema and the additive selection registration.
import assert from 'node:assert/strict';
import {nodeApiTools} from '../../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
const schema=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema);
const bytes=()=>Buffer.byteLength(JSON.stringify(schema),'utf8');
const production=bytes();
assert.ok(production<46000);
assert.deepEqual(schema.properties.mode.enum.filter(m=>['forward','backward','stepwise'].includes(m)),['forward','backward','stepwise']);
assert.ok(schema.properties.parameters.properties.logistic.properties.selection);
delete schema.properties.parameters.properties.logistic.properties.selection;
schema.properties.mode.enum=schema.properties.mode.enum.filter(m=>!['forward','backward','stepwise'].includes(m));
console.log(JSON.stringify({base:bytes(),production,delta:production-bytes(),limit:46000}));
