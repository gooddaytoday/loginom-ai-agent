// Stage-0 sizing fixture. Does not register or mutate a runtime type.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';

const schema=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema);
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const before=bytes(schema);
assert.ok(!schema.properties.target.properties.type.enum.includes('research.auto_correlation'));
schema.properties.target.properties.type.enum.push('research.auto_correlation');
schema.properties.mode.enum.push('time_domain');
const enums=bytes(schema)-before;
Object.assign(schema.properties.parameters.properties,
 JSON.parse(await readFile(new URL('./parameter-schema.json',import.meta.url),'utf8')).properties);
const delta=bytes(schema)-before;
assert.ok(delta<=1050,`Proposed type adds ${delta} UTF-8 bytes`);
console.log(JSON.stringify({baseline_bytes:before,enum_bytes:enums,parameter_bytes:delta-enums,
 delta_bytes:delta,proposed_full_bytes:bytes(schema),remaining_to_46000:46000-bytes(schema)}));
