// Stage-0 estimate only: the runtime schema and handler are unchanged.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';

const proposal=JSON.parse(await readFile(new URL('./iso-operations.proposal.json',import.meta.url),'utf8'));
const base=nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema;
const proposed=structuredClone(base);
const operation=proposed.properties.parameters.properties.fields.anyOf[0].items.properties.transformations.items.properties.operation;
const additions=proposal.operations.map(o=>o.operation);
assert.equal(new Set(additions).size,additions.length);
assert.ok(additions.every(o=>!operation.enum.includes(o)));
operation.enum.push(...additions);
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
console.log(JSON.stringify({baseline_bytes:bytes(base),new_enum_values:additions,enum_delta_bytes:bytes(proposed)-bytes(base),
 proposed_full_bytes:bytes(proposed),headroom_to_46000:46000-bytes(proposed),
 new_mode_bytes:0,limit_changes_bytes:0,description_changes:'not included; measure after stage-1 wording approval'},null,2));
