// Offline document estimate. No registration, browser access or runtime edits.
import {readFile,writeFile} from 'node:fs/promises';
import {nodeApiTools} from '../../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createCandidateNodeSupport} from '../../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {createActionRuntime} from '../../../../../../packages/loginom-runtime/client/lib/executor.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userNodeTool,userActionInventory} from '../../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';

const bytes=v=>Buffer.byteLength(JSON.stringify(v));
const load=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const release=await load('../../../../../../packages/product/loginom-release.json');
const pinned=await pinActionCatalog({callTool(){throw Error('No remote reads');}},{manifestUri:release.actionManifestUri,
 manifestSha256:release.actionManifestSha256,allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES});
const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build});
const runtime=createActionRuntime({pinned,...support,allowCandidate:true,
 getNodeContractPins:()=>({...pinned.pins,skillRevision:'0'.repeat(64),loginomProfile:pinned.compatibility}),
 execute(){throw Error('No browser access');}});
const base=userActionInventory(runtime.describe({node_types:['datamining.lin_regression']})).node_types[0];
const proposed=structuredClone(base);
proposed.parameter_schema=await load('parameter-proposal.json');
proposed.modes=['enter','apply','forward','backward','stepwise','ridge','lasso','elastic_net','auto'];
proposed.candidate_modes=[...proposed.modes];
proposed.variable_outputs=1;
proposed.variable_inputs=1;
proposed.configuration_status='proposal_requires_owner_approval';
proposed.semantics='Train/retrain explicitly; apply preserves saved roles, settings and model. Outputs: predictions 0, coefficients 1, summary variables 2. Mode availability and numerical contracts require owner approval; see node reference. Automatic-search quality and control bindings remain blocked proposals.';
// Example hashes MUST be placeholders, including hashes nested in pins.
const safe=JSON.parse(JSON.stringify(proposed,(_key,value)=>typeof value==='string'&&/^[a-f0-9]{40,64}$/.test(value)?'0'.repeat(64):value));
await writeFile(new URL('proposed-card.json',import.meta.url),JSON.stringify(safe,null,2)+'\n');
const full=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply'));
const before=bytes(full.inputSchema);
if(Object.hasOwn(full.inputSchema.properties.parameters.properties,'linear_regression'))throw Error('Proposal namespace already exists');
full.inputSchema.properties.parameters.properties.linear_regression=proposed.parameter_schema.properties.linear_regression;
for(const mode of proposed.modes)if(!full.inputSchema.properties.mode.enum.includes(mode))full.inputSchema.properties.mode.enum.push(mode);
const model=userNodeTool(full);
const current=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
const skill=new URL('../../../../../../packages/product/skills/loginom-automation/SKILL.md',import.meta.url);
const routing='| Линейная регрессия | `datamining.lin_regression` | [читать](references/nodes/datamining.lin_regression.md) |';
const result={base_sha:'4b202757f6d0021160dd4dfc104ee788ae33cbec',base_card_bytes:bytes(base),proposed_card_bytes:bytes(safe),card_limit:12000,
 full_input_schema_bytes:before,proposed_full_input_schema_bytes:bytes(full.inputSchema),
 model_tool_bytes:bytes({name:current.name,description:current.description,inputSchema:current.inputSchema}),
 proposed_model_tool_bytes:bytes({name:model.name,description:model.description,inputSchema:model.inputSchema}),apply_limit:20000,
 skill_bytes:Buffer.byteLength(await readFile(skill)),skill_limit:40000,routing_proposal_bytes:Buffer.byteLength(routing),
 node_reference_proposal_bytes:Buffer.byteLength(await readFile(new URL('node-reference-proposal.md',import.meta.url))),node_reference_limit:6000};
await writeFile(new URL('sizes.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
