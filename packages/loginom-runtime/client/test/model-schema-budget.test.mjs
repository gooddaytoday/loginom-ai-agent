import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nodeApiTools} from '../lib/node-api.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../lib/action-catalog.mjs';
import {userNodeTool,userActionInventory} from '../lib/user-workflow.mjs';
import {boundedUserToolReply,JAVASCRIPT_DESCRIBE_WIRE_BUDGET} from '../lib/user-response-budget.mjs';
import {createSkillLoader} from '../lib/skill.mjs';
import {createBundledSkillFixture} from './support/bundled-skill-fixture.mjs';

const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
// Existing JS describe exception: [JS plan, J21](../../../../docs/node-development/nodes/programming-javascript/plan.md).
// boundedUserToolReply below also enforces this limit on the complete JS wire reply.
const NODE_CARD_BUDGET_EXCEPTIONS=Object.freeze({'programming.javascript':JAVASCRIPT_DESCRIBE_WIRE_BUDGET});

test('user-v1 model receives dock_node_apply within 20000 bytes',t=>{
 const full=nodeApiTools.find(tool=>tool.name==='dock_node_apply');
 // The model catalog consumes these three fields; outputSchema is not sent.
 const {name,description,inputSchema}=userNodeTool(full);
 const size=bytes({name,description,inputSchema});
 t.diagnostic(JSON.stringify({full_input_schema_bytes:bytes(full.inputSchema),
  model_tool_bytes:size,headroom_bytes:20000-size}));
 assert.ok(size<=20000,`${name}: ${size} bytes; headroom ${20000-size} bytes`);
});

test('every registered user-v1 node card fits its type budget',async t=>{
 const release=JSON.parse(await readFile(new URL('../../../product/loginom-release.json',import.meta.url),'utf8'));
 const pinned=await pinActionCatalog({callTool:()=>assert.fail('unexpected remote catalog read')},{
  manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
  allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES});
 const source=await createBundledSkillFixture(t),skill=await createSkillLoader({resources:source.resources}).prepare();
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build});
 const runtime=createActionRuntime({pinned,...support,allowCandidate:true,
  getNodeContractPins:()=>({...pinned.pins,skillRevision:skill.detail.revision,loginomProfile:pinned.compatibility}),
  execute:()=>assert.fail('describe must not access the browser')});
 const types=runtime.describe().available_node_types;
 assert.ok(types.length>0);
 const cards=types.map(type=>{
  const description=userActionInventory(runtime.describe({node_types:[type]}));
  const reply={content:[{type:'text',text:JSON.stringify(description)}]};
  assert.equal(boundedUserToolReply(reply,{tool:'dock_action_describe'}),reply,type);
  return description.node_types[0];
 });
 const sizes=cards.map(card=>({type:card.type,bytes:bytes(card)})).sort((a,b)=>b.bytes-a.bytes);
 t.diagnostic(JSON.stringify({registered_types:types.length,largest_five:sizes.slice(0,5)}));
 for(const card of cards)await t.test(card.type,()=>{
  assert.equal(card.candidate_node_apply_available,true,card.type);
  assert.ok(card.parameter_schema,`${card.type}: missing parameter_schema`);
  const size=bytes(card),budget=NODE_CARD_BUDGET_EXCEPTIONS[card.type]??12000;
  assert.ok(size<=budget,`${card.type}: ${size} bytes; budget ${budget} bytes; headroom ${budget-size} bytes`);
 });
});
