import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../lib/action-catalog.mjs';
import {userActionInventory} from '../lib/user-workflow.mjs';
import {boundedUserToolReply} from '../lib/user-response-budget.mjs';
import {createSkillLoader} from '../lib/skill.mjs';
import {createBundledSkillFixture} from './support/bundled-skill-fixture.mjs';

const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const TYPE='transform.ungroup_data';

test('ungroup card with registered shares/computed/seasonal fits 12000 bytes and its file 6000 bytes',async t=>{
 const release=JSON.parse(await readFile(new URL('../../../product/loginom-release.json',import.meta.url),'utf8'));
 const pinned=await pinActionCatalog({callTool:()=>assert.fail('unexpected remote catalog read')},{
  manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
  allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES});
 const source=await createBundledSkillFixture(t);
 const loader=createSkillLoader({resources:source.resources}),skill=await loader.prepare();
 const runtime=createActionRuntime({pinned,...createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build}),
  allowCandidate:true,getNodeContractPins:()=>({...pinned.pins,skillRevision:skill.detail.revision,loginomProfile:pinned.compatibility}),
  execute:()=>assert.fail('describe must not access the browser')});
 const description=userActionInventory(runtime.describe({node_types:[TYPE]})),current=description.node_types[0];
 assert.deepEqual(current.modes,['shares','computed','seasonal']);
 description.node_types=await loader.describeNodes([current],current.modes);
 const card=description.node_types[0],reply={content:[{type:'text',text:JSON.stringify(description)}]};
 const file=await readFile(new URL('../../../product/skills/loginom-automation/references/nodes/'+TYPE+'.md',import.meta.url));
 t.diagnostic(JSON.stringify({card_bytes:bytes(card),wire_bytes:bytes(reply),file_bytes:file.length}));
 assert.ok(card.guidance.includes('mode:"seasonal"'));
 assert.ok(card.parameter_schema.properties.seasonality);
 assert.doesNotMatch(card.semantics+card.guidance,/seasonality (?:and variables )?(?:is|are) unsupported/i);
 assert.equal(boundedUserToolReply(reply,{tool:'dock_action_describe'}),reply);
 assert.ok(bytes(card)<=12000,`card ${bytes(card)} > 12000`);
 assert.ok(file.length<=6000,`file ${file.length} > 6000`);
});
