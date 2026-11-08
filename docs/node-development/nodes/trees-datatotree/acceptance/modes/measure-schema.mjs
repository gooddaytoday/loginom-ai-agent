// Documentation estimates only. No production registration or schema is changed.
import {readFile,writeFile} from 'node:fs/promises';
import {nodeApiTools} from '../../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createCandidateNodeSupport} from '../../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {describeNodeTypes} from '../../../../../../packages/loginom-runtime/client/lib/node-contracts.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userNodeTool} from '../../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';

const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const release=JSON.parse(await readFile(new URL('../../../../../../packages/product/loginom-release.json',import.meta.url)));
const pinned=await pinActionCatalog({callTool:()=>{throw Error('Unexpected network');}},{
 manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
 allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES});
const handlers=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build}).nodeApplyHandlers;
const pins={...pinned.pins,skillRevision:'0'.repeat(64),loginomProfile:pinned.compatibility};
const types=['trees.from_table','trees.to_json','trees.from_json','trees.to_table'];
const current=describeNodeTypes(types,pins,new Map(),handlers);
const proposed=structuredClone(current);
const bool=description=>({type:'boolean',description});
const text=description=>({type:'string',minLength:1,maxLength:128,description});
const enumField=(values,description)=>({type:'string',enum:values,description});
const [table,json,parse,flatten]=proposed;
const nodes=table.parameter_schema.properties.nodes;
nodes.maxItems=256;
nodes.description='Complete depth-first structure, maximum depth 16; scalar arrays, nested containers and sibling arrays proposed. Whole-list replacement.';
nodes.items.properties.type.enum.push('datetime','variant');
nodes.items.properties.label.description='Native display label, independent of name.';
nodes.items.properties.is_array.description='Native array flag; repeated boundaries are explicit.';
table.parameter_schema.properties.grouping={type:'object',description:'Grouping proposal; native rule must be confirmed. Omission preserves saved mode.',properties:{
 enabled:bool('Explicitly group equal keys; false keeps each source row.'),
 keys:{type:'array',items:text('Exact technical source field.'),minItems:1,maxItems:64}},required:['enabled'],additionalProperties:false};
table.semantics='Proposed extension: declared arrays and nested containers, explicit grouping, civil millisecond dates, per-cell Variant subtypes, empty input and structure editing. Preserve exact Int64, NULL, order and complete tree output 0. Native grouping rule pending. No XSD or variables. Bounds 256 nodes, depth 16, 1 MiB remain.';
for(const key of ['exclude_root','pretty','multi_row'])delete json.parameter_schema.properties[key].const;
json.parameter_schema.properties.keys=enumField(['names','labels'],'Use actual native names or labels; reject key collisions.');
json.parameter_schema.properties.datetime=enumField(['iso8601','custom'],'Civil datetime without timezone conversion.');
json.parameter_schema.properties.date_format=text('Native date format when datetime=custom.');
json.parameter_schema.properties.time_format=text('Native time format when datetime=custom.');
json.semantics='Proposed extension: root arrays, one document or one row per root element, formatting, actual labels as keys, ISO/custom dates and independent sibling arrays. Empty-root behavior needs native confirmation. Full typed source and complete JSON rows required; exact Int64/NULL/order retained. No XSD or variables.';
parse.modes.push('manual_structure');parse.candidate_modes.push('manual_structure');
parse.parameter_schema.properties.root_mode=enumField(['auto','always_array','always_not_array'],'Native forced root selector under automatic structure.');
parse.parameter_schema.properties.nodes=structuredClone(nodes);
parse.parameter_schema.properties.strict=bool('Native strict schema correspondence; preserve omitted saved settings.');
parse.parameter_schema.properties.date_format=text('Explicit native parser format with civil milliseconds.');
parse.semantics='Proposed extension: nested containers in repeated records, multiple sibling arrays, explicit manual schema/strict and forced root, civil dates. JSON file delivery remains a separate admitted source step; no invented file input parameter. Exact Int64/NULL/order and full typed output 0. Bounds 256 nodes, depth 16, 1 MiB unchanged; no XSD or variables.';
flatten.parameter_schema.properties.selected_paths.maxItems=256;
for(const key of ['composite_names','composite_labels'])delete flatten.parameter_schema.properties[key].const;
flatten.parameter_schema.properties.label_separator=enumField(['.','|',' ','-','_'],'Only a native observed separator.');
flatten.parameter_schema.properties.index_paths={type:'array',items:text('Array schema path for an index column.'),maxItems:256};
flatten.parameter_schema.properties.global_index_paths={type:'array',items:text('Array schema path for a global index across parents.'),maxItems:256};
flatten.semantics='Proposed extension: selected index/global index columns, composite names/labels and more than 64 fields within unchanged 256/16/1 MiB tree bounds. Native index base, generated names and sibling multiplication require native data probes. Exact type/NULL/order, repeat_parents and complete table output 0; no XSD or variables.';
// Replace all hash fields before writing the candidate cards. Conservative
// 64-zero placeholders can be longer than a short commit pin, never shorter.
const sanitize=value=>Array.isArray(value)?value.map(sanitize):value&&typeof value==='object'
 ?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/cache_key|digest|sha256|commit/i.test(k)?(v===null?null:'0'.repeat(64)):sanitize(v)])):value;
const safe=proposed.map(sanitize);
if(process.argv.includes('--write'))await writeFile(new URL('./type-card-proposals.json',import.meta.url),JSON.stringify(safe,null,2)+'\n');
else if(JSON.stringify(JSON.parse(await readFile(new URL('./type-card-proposals.json',import.meta.url))))!==JSON.stringify(safe))throw Error('Proposal cards differ; regenerate with --write');
const full=nodeApiTools.find(t=>t.name==='dock_node_apply'),{name,description,inputSchema}=userNodeTool(full);
const candidateFull=structuredClone(full.inputSchema);
for(const card of proposed)Object.assign(candidateFull.properties.parameters.properties,card.parameter_schema.properties);
const product=new URL('../../../../../../packages/product/skills/loginom-automation/',import.meta.url);
const originalSkill=await readFile(new URL('SKILL.md',product),'utf8');
const routing=(await readFile(new URL('./skill-routing-proposal.md',import.meta.url),'utf8')).trimEnd().split('\n');
const nodeFiles=[];
for(const type of types){
 const before=await readFile(new URL('references/nodes/'+type+'.md',product));
 const after=await readFile(new URL('./skill-'+type+'.md',import.meta.url));
 nodeFiles.push({type,current_bytes:before.length,proposed_bytes:after.length,budget:6000});
}
const skillAfter=originalSkill.split('\n').map(line=>{
 const index=types.findIndex(type=>line.startsWith('|')&&line.includes('`'+type+'`'));
 return index<0?line:routing[index];
}).join('\n');
console.log(JSON.stringify({method:'Minified UTF-8 cards. Pinned describeNodeTypes envelope; all written hashes are 64-zero placeholders. Proposed node guidance replaces each full file; no runtime/skill edit.',
 apply:{model_tool_bytes:bytes({name,description,inputSchema}),proposed_model_tool_bytes:bytes({name,description,inputSchema}),budget:20000,
 full_input_schema_bytes:bytes(full.inputSchema),proposed_full_input_schema_bytes:bytes(candidateFull)},
 cards:types.map((type,i)=>({type,current_bytes:bytes(current[i]),proposed_bytes:bytes(safe[i]),budget:12000})),
 skill:{current_bytes:Buffer.byteLength(originalSkill),proposed_bytes:Buffer.byteLength(skillAfter),budget:40000,
 routing_line_bytes:routing.map(line=>Buffer.byteLength(line)),routing_budget_about:200,node_files:nodeFiles},
 note:'No new global mode enum: manual_structure already exists. Full schema is an estimate; full parameter union requires owner design. PR #803 remains open at discovery; mode sections need rebase if merged.'},null,2));
