// Projection only: does not register handlers or edit production schemas.
import {readFileSync} from 'node:fs';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {describeNodeTypes} from '../../../../../packages/loginom-runtime/client/lib/node-contracts.mjs';
import {userNodeTool} from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';

const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const modelDefinition=tool=>({name:tool.name,description:tool.description,inputSchema:tool.inputSchema});
const full=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply'));
const before={full:bytes(full.inputSchema),compact:bytes(userNodeTool(full).inputSchema),compact_model_definition:bytes(modelDefinition(userNodeTool(full))),mcp_tool_with_output_schema:bytes(userNodeTool(full))};
const read=relative=>JSON.parse(readFileSync(new URL(relative,import.meta.url)));
const proposals=[read('./type-proposal.json'),read('../../exports-lgd/acceptance/type-proposal.json')];
for(const proposal of proposals){
 full.inputSchema.properties.target.properties.type.enum.push(proposal.type);
 for(const [key,schema] of Object.entries(proposal.parameter_schema.properties))
  if(key!=='source')full.inputSchema.properties.parameters.properties[key]=schema;
}
full.inputSchema.properties.mode.enum.push('native');
// Import source already uses the existing delivery schema. Export ports constraint.
full.inputSchema.allOf.push({if:{properties:{target:{properties:{type:{const:'exports.lgd'}},required:['type']}},required:['target']},then:{properties:{read:{properties:{ports:{maxItems:0}}}}}});
const pins={catalog_version:'2026.09.14-rc6-linux-candidate',action_catalog_sha256:'0'.repeat(64),selector_catalog_sha256:'0'.repeat(64)};
const prototype=describeNodeTypes(['exports.excel'],pins)[0];
const cards=proposals.map(proposal=>{
 const card={...structuredClone(prototype),...proposal,configuration_handler:'lgd-v1',configuration_status:'candidate_pending_autonomous_acceptance',candidate_node_apply_available:true,candidate_apply_tool:'dock_node_apply',candidate_modes:['native']};
 card.icon=proposal.type==='imports.lgd'?'importnative':'exportnative';
 card.input_kinds=proposal.tabular_inputs?['table']:[];
 card.output_kinds=proposal.tabular_outputs?['table']:[];
 card.sources.help_path='data/integration/'+(proposal.tabular_inputs?'export':'import')+'/ldf.md';
 return {type:proposal.type,card_bytes:bytes(card),single_card_envelope_bytes:bytes({node_types:[card]})};
});
const skill=new URL('../../../../../packages/product/skills/loginom-automation/SKILL.md',import.meta.url);
const routing=readFileSync(new URL('./skill-routing.txt',import.meta.url));
const references=proposals.map(p=>({type:p.type,bytes:readFileSync(new URL('./'+p.type+'.md',import.meta.url)).byteLength}));
console.log(JSON.stringify({measurement:'proposal; actual registration must be remeasured',schema_before:before,schema_projected:{full:bytes(full.inputSchema),compact:bytes(userNodeTool(full).inputSchema),compact_model_definition:bytes(modelDefinition(userNodeTool(full))),mcp_tool_with_output_schema:bytes(userNodeTool(full))},cards,skill_current_bytes:readFileSync(skill).byteLength,routing_lines_bytes:routing.toString().trimEnd().split('\n').map(s=>Buffer.byteLength(s+'\n')),skill_projected_bytes:readFileSync(skill).byteLength+routing.byteLength,references},null,2));
