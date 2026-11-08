// Offline proposal only. No runtime registration, browser or remote requests.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {nodeApiTools} from '../../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createCandidateNodeSupport} from '../../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {createActionRuntime} from '../../../../../../packages/loginom-runtime/client/lib/executor.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userNodeTool,userActionInventory} from '../../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';
import {createSkillLoader} from '../../../../../../packages/loginom-runtime/client/lib/skill.mjs';
import {createBundledSkillFixture,refreshSkillFixtureManifest} from '../../../../../../packages/loginom-runtime/client/test/support/bundled-skill-fixture.mjs';

const bytes=v=>Buffer.byteLength(JSON.stringify(v));
const release=JSON.parse(await readFile(new URL('../../../../../../packages/product/loginom-release.json',import.meta.url),'utf8'));
const pinned=await pinActionCatalog({callTool(){throw Error('No network');}},{manifestUri:release.actionManifestUri,
 manifestSha256:release.actionManifestSha256,allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES});
const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build});
const runtime=createActionRuntime({pinned,...support,allowCandidate:true,
 getNodeContractPins:()=>({...pinned.pins,skillRevision:'0'.repeat(64),loginomProfile:pinned.compatibility}),
 execute(){throw Error('No browser');}});
const base=userActionInventory(runtime.describe({node_types:['datamining.lin_regression']})).node_types[0];
const proposed=structuredClone(base);
proposed.modes.push('lasso','elastic_net','auto_lambda');
proposed.candidate_modes=[...proposed.modes];
proposed.configuration_status='proposal_requires_owner_approval';
proposed.semantics='Stage-0 proposal. Existing Enter/apply/Forward/Backward/Stepwise/Ridge behavior is preserved; R2 remains unavailable. Proposed manual lasso uses lambda_l1; elastic_net uses lambda_l1 and lambda_l2. All rows train with an intercept, no normalization or validation, native epsilon 1e-10. Train/retrain explicitly, then execute; read predictions at port 0 and coefficient names/values at port 1. Apply preserves saved roles, settings and model. auto_lambda is an unapproved automatic-L1 research proposal: search loss/grid/final refit are unknown, not an accepted quality contract. Control-variable bindings remain unavailable.';
const settings=proposed.parameter_schema.properties.linear_regression.properties;
settings.lambda_l2.description='Manual Ridge L2 or proposed Elastic Net second UI coefficient, finite >=0. The Elastic Net mapping is documented in the research; do not assume textbook penalty weights.';
settings.lambda_l1={type:'number',minimum:0,description:'Proposed manual L1 setting; no variable binding.'};
settings.lambda_setup={type:'string',enum:['manual','auto'],description:'Auto is a research proposal; no approved search-quality criterion.'};
const disposals=[];
const fixture=await createBundledSkillFixture({after(fn){disposals.push(fn);}});
try{
 const loader=createSkillLoader({resources:fixture.resources});
 const current=(await loader.describeNodes([base],base.modes))[0];
 const fragments=await readFile(new URL('node-reference-proposal.md',import.meta.url),'utf8');
 const combined=await readFile(join(fixture.directory,'references/nodes/datamining.lin_regression.md'),'utf8')+'\n'+fragments;
 await writeFile(join(fixture.directory,'references/nodes/datamining.lin_regression.md'),combined);
 await refreshSkillFixtureManifest(fixture.resources);
 const next=(await createSkillLoader({resources:fixture.resources}).describeNodes([proposed],proposed.modes))[0];
 const safe=JSON.parse(JSON.stringify(next,(_k,v)=>typeof v==='string'&&/^[a-f0-9]{40,64}$/.test(v)?'0'.repeat(64):v));
 await writeFile(new URL('proposed-card.json',import.meta.url),JSON.stringify(safe,null,2)+'\n');
 const full=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 for(const mode of ['lasso','elastic_net','auto_lambda'])if(!full.inputSchema.properties.mode.enum.includes(mode))full.inputSchema.properties.mode.enum.push(mode);
 const currentFull=nodeApiTools.find(t=>t.name==='dock_node_apply');
 const currentTool=userNodeTool(currentFull);
 const before=bytes(currentFull.inputSchema);
 full.inputSchema.properties.parameters.properties.linear_regression=proposed.parameter_schema.properties.linear_regression;
 const {name,description,inputSchema}=userNodeTool(full);
 const skill=await readFile(new URL('../../../../../../packages/product/skills/loginom-automation/SKILL.md',import.meta.url),'utf8');
 const currentRouting=skill.split('\n').find(line=>line.startsWith('|')&&line.includes('datamining.lin_regression'));
 const routing='| Линейная регрессия | `datamining.lin_regression` | [читать](references/nodes/datamining.lin_regression.md) |';
 const result={base_sha:'ecb11c0e2dce6972aaa00978050680145fd12b04',current_max_guided_card_bytes:bytes(current),
 proposed_all_modes_guided_card_bytes:bytes(safe),card_limit:12000,
 current_model_tool_bytes:bytes({name:currentTool.name,description:currentTool.description,inputSchema:currentTool.inputSchema}),proposed_model_tool_bytes:bytes({name,description,inputSchema}),apply_limit:20000,
 proposed_full_input_schema_bytes:bytes(full.inputSchema),full_schema_diagnostic_before_proposal:before,
 skill_bytes:Buffer.byteLength(skill),proposed_skill_bytes:Buffer.byteLength(skill)-Buffer.byteLength(currentRouting)+Buffer.byteLength(routing),skill_limit:40000,
 current_routing_bytes:Buffer.byteLength(currentRouting),routing_bytes:Buffer.byteLength(routing),
 current_node_reference_bytes:Buffer.byteLength(await readFile(new URL('../../../../../../packages/product/skills/loginom-automation/references/nodes/datamining.lin_regression.md',import.meta.url))),proposal_fragment_bytes:Buffer.byteLength(fragments),proposed_node_reference_bytes:Buffer.byteLength(combined),node_reference_limit:6000};
 await writeFile(new URL('sizes.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}finally{for(const dispose of disposals)await dispose();}
