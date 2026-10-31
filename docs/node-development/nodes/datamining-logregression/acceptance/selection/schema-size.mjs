// Proposal only. Production schema and descriptions are not mutated.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nodeApiTools} from '../../../../../../packages/loginom-runtime/client/lib/node-api.mjs';

const schema=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema);
const bytes=()=>Buffer.byteLength(JSON.stringify(schema),'utf8');
const base=bytes();
assert.ok(schema.properties.target.properties.type.enum.includes('datamining.log_regression'));
assert.deepEqual(schema.properties.mode.enum.filter(m=>['forward','backward','stepwise'].includes(m)),[]);
schema.properties.mode.enum.push('forward','backward','stepwise');
const modes=bytes();
assert.ok(!Object.hasOwn(schema.properties.parameters.properties.logistic.properties,'selection'));
schema.properties.parameters.properties.logistic.properties.selection=JSON.parse(readFileSync(new URL('selection-schema.json',import.meta.url),'utf8'));
const proposal=bytes();
console.log(JSON.stringify({base,modes_only:modes,mode_enum_delta:modes-base,selection_delta:proposal-modes,
  proposal,delta:proposal-base,limit:46000,over_limit:Math.max(0,proposal-46000)}));
