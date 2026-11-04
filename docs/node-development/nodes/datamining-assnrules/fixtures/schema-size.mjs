// Stage-zero estimates using production serializers, with no runtime mutation.
import { readFileSync } from 'node:fs';
import { nodeApiTools, nodeApplyInputSchema } from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import { describeNodeTypes } from '../../../../../packages/loginom-runtime/client/lib/node-contracts.mjs';
import { userNodeTool, userActionInventory } from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const definition = read('./node-type.json');
const parameters = read('./parameter-schema.json');
const extend = schema => {
  const proposed = structuredClone(schema);
  proposed.properties.target.properties.type.enum.push(definition.type);
  proposed.properties.mode.enum.push('fp_growth');
  Object.assign(proposed.properties.parameters.properties, parameters.properties);
  return proposed;
};
const published = nodeApiTools.find(tool => tool.name === 'dock_node_apply');
const proposedPublished = { ...published, inputSchema: extend(published.inputSchema) };
const compact = userNodeTool(published), proposedCompact = userNodeTool(proposedPublished);
const envelope = tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema });
const card = { ...describeNodeTypes(['datamining.clustering'])[0], ...definition,
  configuration_handler: 'assn-rules-v1-internal-1',
  configuration_status: 'candidate_pending_autonomous_acceptance',
  candidate_node_apply_available: true, candidate_apply_tool: 'dock_node_apply',
  candidate_modes: ['fp_growth'], parameter_schema: parameters };
const delivered = userActionInventory({ node_types: [card] }).node_types[0];
const skill = readFileSync(new URL('../../../../../packages/product/skills/loginom-automation/SKILL.md', import.meta.url));
const routing = readFileSync(new URL('./skill-routing.txt', import.meta.url));
const nodeSkill = readFileSync(new URL('./skill-node.md', import.meta.url));
console.log(JSON.stringify({
  full_input_schema: { base: bytes(nodeApplyInputSchema), proposed: bytes(extend(nodeApplyInputSchema)), limit: null },
  published_input_schema: { base: bytes(published.inputSchema), proposed: bytes(proposedPublished.inputSchema), limit: null },
  compact_input_schema: { base: bytes(compact.inputSchema), proposed: bytes(proposedCompact.inputSchema), limit: 20000 },
  compact_input_tool: { base: bytes(envelope(compact)), proposed: bytes(envelope(proposedCompact)), limit: 20000 },
  type_card_estimate: { bytes: bytes(delivered), limit: 12000, session_pins: 'empty; production adds session-specific metadata' },
  skill: { base: skill.length, proposed: skill.length + routing.length, limit: 40000,
    routing: routing.length, routing_limit_approx: 200, node_file: nodeSkill.length, node_limit: 6000 }
}, null, 2));
