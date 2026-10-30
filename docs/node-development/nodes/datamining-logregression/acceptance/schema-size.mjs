// Offline estimate only: do not register the proposed node in production.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';

const schema=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema);
const bytes=()=>Buffer.byteLength(JSON.stringify(schema));
const base=bytes();
assert.ok(!schema.properties.target.properties.type.enum.includes('datamining.log_regression'));
assert.ok(!Object.hasOwn(schema.properties.parameters.properties,'logistic'));
schema.properties.target.properties.type.enum.push('datamining.log_regression');
schema.properties.parameters.properties.logistic=JSON.parse(readFileSync(new URL('parameter-schema.json',import.meta.url),'utf8'));
const proposal=bytes(),delta=proposal-base;
assert.ok(delta<=1050);
console.log(JSON.stringify({base,proposal,delta,limit:46000,over_limit:Math.max(0,proposal-46000)}));
