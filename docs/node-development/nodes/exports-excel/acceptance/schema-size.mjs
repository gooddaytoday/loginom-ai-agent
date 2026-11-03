// Sizing fixture only: never registers or changes a runtime node.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';

const parameters = JSON.parse(readFileSync(new URL('./parameter-schema.json', import.meta.url)));
const full = structuredClone(nodeApiTools.find(t => t.name === 'dock_node_apply').inputSchema);
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const before = bytes(full);
assert.equal(full.properties.target.properties.type.enum.includes('exports.excel'), false);
full.properties.target.properties.type.enum.push('exports.excel');
const typeBytes = bytes(full) - before;
assert.ok(full.properties.mode.enum.includes('xlsx'));
assert.equal(Object.hasOwn(full.properties.parameters.properties, 'excel_export'), false);
Object.assign(full.properties.parameters.properties, parameters.properties);
const parameterBytes = bytes(full) - before - typeBytes;
full.allOf.push({if: {properties: {target: {properties: {type: {const: 'exports.excel'}}, required: ['type']}}, required: ['target']},
  then: {properties: {read: {properties: {ports: {maxItems: 0}}}}}});
const after = bytes(full);
assert.ok(after - before <= 1050);
assert.ok(after <= 46000);
console.log(JSON.stringify({before, type_bytes: typeBytes, parameter_bytes: parameterBytes,
  conditional_bytes: after - before - typeBytes - parameterBytes, growth: after - before, after}));
