import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../lib/action-catalog.mjs';
import {userActionInventory} from '../lib/user-workflow.mjs';
import {boundedUserToolReply} from '../lib/user-response-budget.mjs';
import {createSkillLoader} from '../lib/skill.mjs';
import {createBundledSkillFixture,refreshSkillFixtureManifest} from './support/bundled-skill-fixture.mjs';

// Room for the next seasonal cycle: the current shares/computed card plus the
// kit's seasonal guidance block, seasonality schema and seasonal semantics.
const kit=new URL('../../../../docs/node-development/nodes/transform-ungroupdata/model-contract/',import.meta.url);
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const TYPE='transform.ungroup_data';

test('ungroup card with projected seasonal mode fits 12000 bytes and its file 6000 bytes',async t=>{
 const release=JSON.parse(await readFile(new URL('../../../product/loginom-release.json',import.meta.url),'utf8'));
 const pinned=await pinActionCatalog({callTool:()=>assert.fail('unexpected remote catalog read')},{
  manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
  allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES});
 const proposalNode=await readFile(new URL('seasonal-skill-node.proposal.md',kit),'utf8');
 const seasonal=proposalNode.match(/^<!-- mode: seasonal -->\r?\n[\s\S]*?^<!-- \/mode -->\r?$/m)[0];
 const proposal=JSON.parse(await readFile(new URL('seasonal-type-card.proposal.json',kit),'utf8'));
 const source=await createBundledSkillFixture(t),file=join(source.directory,'references/nodes',TYPE+'.md');
 const projectedFile=(await readFile(file,'utf8')).trimEnd()+'\n\n'+seasonal+'\n';
 await writeFile(file,projectedFile);await refreshSkillFixtureManifest(source.resources);
 const loader=createSkillLoader({resources:source.resources}),skill=await loader.prepare();
 const runtime=createActionRuntime({pinned,...createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build}),
  allowCandidate:true,getNodeContractPins:()=>({...pinned.pins,skillRevision:skill.detail.revision,loginomProfile:pinned.compatibility}),
  execute:()=>assert.fail('describe must not access the browser')});
 const description=userActionInventory(runtime.describe({node_types:[TYPE]})),current=description.node_types[0];
 assert.ok(!current.modes.includes('seasonal'),'seasonal is projected, not registered');
 const modes=[...current.modes,'seasonal'];
 const projected={...current,modes,candidate_modes:[...current.candidate_modes,'seasonal'],
  semantics:current.semantics+' '+proposal.semantics.slice(proposal.semantics.indexOf('Mode seasonal:')),
  parameter_schema:{...current.parameter_schema,properties:{...current.parameter_schema.properties,
   seasonality:proposal.parameter_schema.properties.seasonality}}};
 description.node_types=await loader.describeNodes([projected],modes);
 const card=description.node_types[0],reply={content:[{type:'text',text:JSON.stringify(description)}]};
 const fileBytes=Buffer.byteLength(projectedFile);
 t.diagnostic(JSON.stringify({projected_card_bytes:bytes(card),projected_wire_bytes:bytes(reply),
  projected_file_bytes:fileBytes,seasonal_block_bytes:Buffer.byteLength(seasonal)}));
 assert.ok(card.guidance.includes('mode:"seasonal"'));
 assert.equal(boundedUserToolReply(reply,{tool:'dock_action_describe'}),reply);
 assert.ok(bytes(card)<=12000,`projected card ${bytes(card)} > 12000`);
 assert.ok(fileBytes<=6000,`projected file ${fileBytes} > 6000`);
});
