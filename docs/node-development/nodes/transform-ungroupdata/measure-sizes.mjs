// Proposal only: measure without registering a runtime type or changing tools.
import {readFileSync} from 'node:fs';
import {nodeApiTools} from '../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {userNodeTool} from '../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';
import {describeNodeTypes} from '../../../../packages/loginom-runtime/client/lib/node-contracts.mjs';

const read=name=>readFileSync(new URL(name,import.meta.url));
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const schema=JSON.parse(read('parameter-schema.proposal.json'));
const card=JSON.parse(read('node-card.proposal.json'));
const tool=nodeApiTools.find(tool=>tool.name==='dock_node_apply');
const proposed=structuredClone(tool);
proposed.inputSchema.properties.target.properties.type.enum.push('transform.ungroup_data');
proposed.inputSchema.properties.mode.enum.push('shares');
proposed.inputSchema.properties.parameters.properties.ungroup=schema.properties.ungroup;
const compact=userNodeTool(proposed);
// Use the current describe envelope; replace all type-specific fields from
// the proposal. Empty pins mean the real session manifest needs extra space.
const envelope=describeNodeTypes(['transform.join_data'],{},new Map(),new Map([
  ['transform.join_data',{revision:'ungroup-data-v1',modes:['shares'],parameter_schema:schema}],
]))[0];
console.log(JSON.stringify({
  full_schema_base:bytes(tool.inputSchema),
  full_schema_proposal:bytes(proposed.inputSchema),
  compact_schema:bytes(compact.inputSchema),
  compact_model_tool:bytes({name:compact.name,description:compact.description,inputSchema:compact.inputSchema}),
  node_card:bytes({...envelope,...card,cache_key:'0'.repeat(64)}),
  parameter_schema:bytes(schema),
  skill_base:read('../../../../packages/product/skills/loginom-automation/SKILL.md').length,
  skill_route:read('skill-route.proposal.txt').length,
  skill_node:read('skill-node.proposal.md').length,
},null,2));
