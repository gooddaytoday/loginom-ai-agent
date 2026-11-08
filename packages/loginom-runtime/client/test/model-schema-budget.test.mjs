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
 const source=await createBundledSkillFixture(t),loader=createSkillLoader({resources:source.resources}),skill=await loader.prepare();
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:pinned.compatibility.loginom_build});
 const runtime=createActionRuntime({pinned,...support,allowCandidate:true,
  getNodeContractPins:()=>({...pinned.pins,skillRevision:skill.detail.revision,loginomProfile:pinned.compatibility}),
  execute:()=>assert.fail('describe must not access the browser')});
 const types=runtime.describe().available_node_types;
 assert.ok(types.length>0);
 const cards=[];
 for(const type of types){
  const description=userActionInventory(runtime.describe({node_types:[type]}));
  const original=description.node_types[0];
  for(const modes of [undefined,...original.modes.map(mode=>[mode]),original.modes]){
   description.node_types=await loader.describeNodes([original],modes);
   const reply={content:[{type:'text',text:JSON.stringify(description)}]};
   if(['programming.javascript','imports.text','transform.filter_data'].includes(type))t.diagnostic(JSON.stringify({type,modes,card_bytes:bytes(description.node_types[0]),wire_bytes:bytes(reply)}));
   assert.equal(boundedUserToolReply(reply,{tool:'dock_action_describe'}),reply,type+': '+modes);
   const card=description.node_types[0];
   assert.equal(typeof card.guidance,'string');
   assert.deepEqual(card.guidance_modes,original.modes);
   const budget=NODE_CARD_BUDGET_EXCEPTIONS[type]??12000;
   assert.ok(bytes(card)<=budget,`${type} modes=${modes}: ${bytes(card)} > ${budget}`);
   cards.push(card);
  }
 }
 const sizes=cards.map(card=>({type:card.type,bytes:bytes(card)})).sort((a,b)=>b.bytes-a.bytes);
 t.diagnostic(JSON.stringify({rest_request_card_bytes:sizes.find(card=>card.type==='integration.rest_request')?.bytes}));
 t.diagnostic(JSON.stringify({registered_types:types.length,largest_five:sizes.slice(0,5)}));
 for(const card of cards)await t.test(card.type,()=>{
  assert.equal(card.candidate_node_apply_available,true,card.type);
  assert.ok(card.parameter_schema,`${card.type}: missing parameter_schema`);
  const size=bytes(card),budget=NODE_CARD_BUDGET_EXCEPTIONS[card.type]??12000;
  if(card.type==='transform.group_data')t.diagnostic(JSON.stringify({grouping_card_bytes:size}));
  if(card.type==='datamining.lin_regression')t.diagnostic(JSON.stringify({lin_regression_card_bytes:size}));
  if(card.type==='datamining.clustering')t.diagnostic(JSON.stringify({clustering_card_bytes:size}));
  if(['datamining.log_regression','exports.text'].includes(card.type))t.diagnostic(JSON.stringify({type:card.type,card_bytes:size}));
  if(card.type==='transform.union_data')t.diagnostic(JSON.stringify({union_card_bytes:size}));
  assert.ok(size<=budget,`${card.type}: ${size} bytes; budget ${budget} bytes; headroom ${budget-size} bytes`);
 });
});
