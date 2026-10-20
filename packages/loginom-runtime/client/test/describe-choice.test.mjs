import test from 'node:test';
import assert from 'node:assert/strict';
import {actionDescribeTool,validateActionParameters} from '../lib/action-catalog.mjs';
import {userActionTool} from '../lib/user-workflow.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {Page,runtime} from './support/executor-fixture.mjs';
import {createSkillLoader} from '../lib/skill.mjs';
import {createBundledSkillFixture} from './support/bundled-skill-fixture.mjs';

for(const tool of [actionDescribeTool,userActionTool(actionDescribeTool)])test('description choice is delivered and enforced before the first call: '+tool.description.slice(0,25),()=>{
 const validate=new AjvJsonSchemaValidator().getValidator(tool.inputSchema);
 const page=new Page(),engine=runtime(page);
 for(const query of [{},{action_key:'package.save_checkpoint'},{node_types:['imports.text']},
  {action_keys:['package.save_checkpoint']},{action_keys:['package.save_checkpoint'],node_types:['imports.text']}]){
  assert.equal(validate(query).valid,true,JSON.stringify(query));assert.doesNotThrow(()=>engine.describe(query));
 }
 for(const batch of [{node_types:['imports.text']},{action_keys:['package.save_checkpoint']},
  {action_keys:['package.save_checkpoint'],node_types:['imports.text']}]){
  const mixed={action_key:'package.save_checkpoint',...batch};
  assert.equal(validate(mixed).valid,false);assert.throws(()=>engine.describe(mixed),/Choose a single/);
 }
 for(const query of [{action_key:'canvas.add_node'},{action_keys:['canvas.add_node']},{node_types:['unknown.type']}]){
  assert.equal(validate(query).valid,false);assert.throws(()=>validateActionParameters(tool.inputSchema,query),/allowed enum/);
 }
 const example=JSON.parse(/For example: (\{.*\})\./.exec(tool.description)[1]);
 assert.equal(validate(example).valid,true);assert.equal(engine.describe(example).node_types[0].type,'imports.text');
 for(const key of ['action_key','action_keys','node_types'])assert.match(tool.inputSchema.properties[key].description,/action_key/);
 assert.ok(tool.description.length<500);assert.ok(Buffer.byteLength(JSON.stringify(tool))<46000);
 assert.deepEqual(page.events,[]);
});

test('verified bundled main skill delivers the single/batch rule without opening references',async t=>{
 const source=await createBundledSkillFixture(t),loaded=await createSkillLoader({resources:source.resources}).prepare();
 assert.match(loaded.detail.content,/одиночный `action_key` нельзя сочетать с `action_keys` или\s+`node_types`/);
 const example=JSON.parse(/`(\{"action_keys":\["package.save_checkpoint"\],"node_types":\["imports.text"\]\})`/.exec(loaded.detail.content)[1]);
 assert.doesNotThrow(()=>runtime(new Page()).describe(example));
});
