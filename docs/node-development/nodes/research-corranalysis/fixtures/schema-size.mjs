// Stage-zero estimate only; no production schema is mutated.
import { readFileSync } from 'node:fs';
import { nodeApiTools } from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';

const current = nodeApiTools.find(tool => tool.name === 'dock_node_apply').inputSchema;
const proposed = structuredClone(current);
const parameters = JSON.parse(readFileSync(new URL('./parameter-schema.json', import.meta.url), 'utf8'));
proposed.properties.target.properties.type.enum.push('research.corr_analysis');
proposed.properties.mode.enum.push('pearson');
Object.assign(proposed.properties.parameters.properties, parameters.properties);
const bytes = value => Buffer.byteLength(JSON.stringify(value));
console.log(JSON.stringify({ current: bytes(current), proposed: bytes(proposed), delta: bytes(proposed) - bytes(current), limit: 46000 }));
