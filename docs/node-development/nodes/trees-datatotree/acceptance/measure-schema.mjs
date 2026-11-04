// Documentation-only candidate estimates; no runtime registrations or mutations.
import {readFile} from 'node:fs/promises';
import {nodeApiTools,nodeApplyInputSchema} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {describeNodeTypes} from '../../../../../packages/loginom-runtime/client/lib/node-contracts.mjs';
import {userNodeTool} from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';

const proposal=JSON.parse(await readFile(new URL('./schema-proposal.json',import.meta.url),'utf8'));
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const tool=nodeApiTools.find(t=>t.name==='dock_node_apply');
const compact=userNodeTool(tool).inputSchema;
const published=structuredClone(tool.inputSchema),inline=structuredClone(nodeApplyInputSchema);
for(const [type,definition] of Object.entries(proposal)){
 for(const schema of [compact,published,inline]){
  schema.properties.target.properties.type.enum.push(type);
  schema.properties.mode.enum.push(definition.mode);
 }
 for(const schema of [published,inline])Object.assign(schema.properties.parameters.properties,definition.parameter_schema.properties);
}
const cards={};
for(const [type,definition] of Object.entries(proposal)){
 const fromTable=type==='trees.from_table',revision='trees-v040-stage1';
 const template=fromTable?'trees.from_json':'trees.to_table';
 const [card]=describeNodeTypes([template],{},new Map(),new Map([[template,{
  revision,modes:[definition.mode],parameter_schema:definition.parameter_schema}]]));
 Object.assign(card,{type,title:fromTable?'Таблица в дерево':'Дерево в JSON',
  icon_class:'bg-vendor-icon-'+(fromTable?'datatotree':'treetojson'),modes:[definition.mode],
  semantics:definition.semantics});
 card.sources.help_path=fromTable?'data/processors/trees/table-to-tree.md':'data/processors/trees/tree-to-json.md';
 // Placeholder cache digest length equals the eventual real SHA-256.
 card.cache_key='0'.repeat(64);
 cards[type]=bytes(card);
}
const fileBytes=async name=>(await readFile(new URL(name,import.meta.url))).length;
const routing=(await readFile(new URL('./skill-routing-proposal.md',import.meta.url),'utf8')).trimEnd().split('\n');
const skillCurrent=(await readFile(new URL('../../../../../packages/product/skills/loginom-automation/SKILL.md',import.meta.url))).length;
console.log(JSON.stringify({method:'UTF-8 bytes of minified inputSchema/card; skill files measured as stored. Candidate cards estimated from existing describeNodeTypes envelope, empty pins; no registration.',
 dock_node_apply:{compact_before:bytes(userNodeTool(tool).inputSchema),compact_proposal:bytes(compact),budget:20000,
  published_before:bytes(tool.inputSchema),published_proposal:bytes(published),inline_before:bytes(nodeApplyInputSchema),inline_proposal:bytes(inline)},
 type_cards_proposal:cards,type_card_budget:12000,
 skill:{current:skillCurrent,budget:40000,routing_lines:routing.map(x=>Buffer.byteLength(x,'utf8')),routing_budget_about:200,
  with_routing:skillCurrent+await fileBytes('./skill-routing-proposal.md'),
  node_files:{'trees-from-table.md':await fileBytes('./skill-trees-from-table.md'),'trees-to-json.md':await fileBytes('./skill-trees-to-json.md')},node_file_budget:6000}},null,2));
