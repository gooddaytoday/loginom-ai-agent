// Documentation estimate only; production cards and product skill stay unchanged.
import {readFile,writeFile} from 'node:fs/promises';
import {nodeApiTools} from '../../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createCandidateNodeSupport} from '../../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {describeNodeTypes} from '../../../../../../packages/loginom-runtime/client/lib/node-contracts.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userNodeTool} from '../../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';
import {createSkillLoader} from '../../../../../../packages/loginom-runtime/client/lib/skill.mjs';
import {createBundledSkillFixture} from '../../../../../../packages/loginom-runtime/client/test/support/bundled-skill-fixture.mjs';

const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const cleanup=[];
try {
 const release=JSON.parse(await readFile(new URL('../../../../../../packages/product/loginom-release.json',import.meta.url)));
 const pinned=await pinActionCatalog({callTool:()=>{throw Error('Unexpected network');}},{
  manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
  allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES});
 const source=await createBundledSkillFixture({after:fn=>cleanup.push(fn)});
 const loader=createSkillLoader({resources:source.resources}),skill=await loader.prepare();
 const handlers=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build}).nodeApplyHandlers;
 const pins={...pinned.pins,skillRevision:skill.detail.revision,loginomProfile:pinned.compatibility};
 const [base]=await loader.describeNodes(describeNodeTypes(['trees.from_json'],pins,new Map(),handlers),['auto_structure']);
 const proposal=structuredClone(base);
 proposal.semantics='One JSON object in one table row, auto structure/root. Nested objects and object arrays in repeated records, empty containers and typed NULL. Mixed/NULL-only leaves require exact Variant readback. Preserve schema order, array boundaries and exact Int64. No manual schema, dates, forced root, sibling/nonempty scalar arrays or multiple root rows. Bounds 256 instances/depth 16/1 MiB unchanged.';
 proposal.parameter_schema.properties.json_field.description='Exact input string column containing one JSON object, including nested object records.';
 proposal.parameter_schema.properties.root_mode.description='Automatic root; nested object arrays allowed. One root row only.';
 const reference=await readFile(new URL('./skill-proposal.md',import.meta.url),'utf8');
 const section=/^<!-- mode: auto_structure -->\r?\n([\s\S]*?)^<!-- \/mode -->\r?$/m;
 proposal.guidance=[reference.replace(section,'').trim(),reference.match(section)[1].trim()].join('\n\n');
 const sanitize=value=>Array.isArray(value)?value.map(sanitize):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,/cache_key|digest|sha256|commit|skillRevision/i.test(key)?(v===null?null:'0'.repeat(64)):sanitize(v)])):value;
 const card=sanitize(proposal),destination=new URL('./type-card-proposal.json',import.meta.url);
 if(process.argv.includes('--write'))await writeFile(destination,JSON.stringify(card,null,2)+'\n');
 else if(JSON.stringify(JSON.parse(await readFile(destination)))!==JSON.stringify(card))throw Error('Proposal card differs; regenerate with --write');
 const product=new URL('../../../../../../packages/product/skills/loginom-automation/',import.meta.url);
 const main=await readFile(new URL('SKILL.md',product),'utf8');
 const oldLine=main.split('\n').find(line=>line.startsWith('|')&&line.includes('`trees.from_json`'));
 // Routing is unchanged: this extends the existing auto_structure mode.
 const full=nodeApiTools.find(t=>t.name==='dock_node_apply');
 const {name,description,inputSchema}=userNodeTool(full);
 console.log(JSON.stringify({apply:{model_tool_bytes:bytes({name,description,inputSchema}),
  proposed_model_tool_bytes:bytes({name,description,inputSchema}),full_input_schema_bytes:bytes(full.inputSchema)},
  card:{current_bytes:bytes(base),proposed_bytes:bytes(card),budget:12000,guidance_included:true},
  skill:{current_bytes:Buffer.byteLength(main),proposed_bytes:Buffer.byteLength(main),budget:40000,
   routing_line_bytes:Buffer.byteLength(oldLine),proposed_routing_line_bytes:Buffer.byteLength(oldLine),
   current_reference_bytes:(await readFile(new URL('references/nodes/trees.from_json.md',product))).length,
   proposed_reference_bytes:Buffer.byteLength(reference),reference_budget:6000},
  note:'Estimate after proposed text replacement, no new public parameter or mode. Full schema unchanged; hashes in written card are 64 zeros.'},null,2));
} finally {for(const close of cleanup)await close();}
