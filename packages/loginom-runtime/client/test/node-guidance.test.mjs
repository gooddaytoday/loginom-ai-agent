import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createSkillLoader} from '../lib/skill.mjs';
import {createUserWorkflowBindings,userNodeTool} from '../lib/user-workflow.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
import {createBundledSkillFixture,refreshSkillFixtureManifest} from './support/bundled-skill-fixture.mjs';

test('node guidance uses the prepared bundle and selects common plus requested modes',async t=>{
 const source=await createBundledSkillFixture(t);
 const file=join(source.directory,'references/nodes/transform.join_data.md');
 await writeFile(file,'# Join\nCommon rule.\n<!-- mode: inner -->\nInner rule.\n<!-- /mode -->\n<!-- mode: left full -->\nOuter rule.\n<!-- /mode -->\n');
 await refreshSkillFixtureManifest(source.resources);
 const loader=createSkillLoader({resources:source.resources});
 const prepared=await loader.prepare();
 const card={type:'transform.join_data',modes:['inner','left','full']};
 const [index]=await loader.describeNodes([card]);
 assert.equal(index.guidance,'# Join\nCommon rule.');
 assert.deepEqual(index.guidance_modes,['inner','left','full']);
 const [inner]=await loader.describeNodes([card],['inner']);
 assert.match(inner.guidance,/Common rule/);assert.match(inner.guidance,/Inner rule/);
 assert.doesNotMatch(inner.guidance,/Outer rule/);
 const [outer]=await loader.describeNodes([card],['left','full']);
 assert.equal(outer.guidance.match(/Outer rule/g).length,1);
 assert.equal(outer.session_manifest?.skillRevision??prepared.detail.revision,prepared.detail.revision);
 await assert.rejects(loader.describeNodes([card],['invented']),/mode/i);
 await writeFile(file,'tampered');
 await assert.rejects(loader.describeNodes([card],['inner']),/LOGINOM_SKILL_HASH_MISMATCH/);
});

test('new and existing apply require a delivered card since the latest preparation',()=>{
 const bindings=createUserWorkflowBindings();
 for(const kind of ['new','existing']){
  const request={target:{kind,type:'transform.sorting'}};
  const refused=bindings.checkNodeDescription(request);
  assert.equal(refused.error.code,'NODE_TYPE_NOT_DESCRIBED');
  assert.equal(refused.effect_possible,false);assert.equal(refused.status,'NOT_APPLIED');
  assert.deepEqual(refused.next_step.arguments,{node_types:['transform.sorting']});
 }
 bindings.rememberDescriptions({node_types:[{type:'transform.sorting'}]});
 assert.equal(bindings.checkNodeDescription({target:{type:'transform.sorting'}}),null);
 assert.equal(bindings.checkNodeDescription({target:{type:'imports.text'}}).error.code,'NODE_TYPE_NOT_DESCRIBED');
 bindings.resetDescriptions();
 assert.equal(bindings.checkNodeDescription({target:{type:'transform.sorting'}}).error.code,'NODE_TYPE_NOT_DESCRIBED');
 bindings.remember({document_id:'one',workflow_ref:{workflow_id:'workflow',navigation_path:[]}});
 bindings.rememberDescriptions({node_types:[{type:'transform.sorting'}]});
 assert.equal(bindings.checkNodeDescription({document_id:'one',target:{type:'transform.sorting'}}),null);
 bindings.remember({document_id:'two',workflow_ref:{workflow_id:'workflow',navigation_path:[]}});
 assert.equal(bindings.checkNodeDescription({document_id:'two',target:{type:'transform.sorting'}}).error.code,'NODE_TYPE_NOT_DESCRIBED');
});

test('compact apply omits type branches and modes while retaining resolvable shared definitions',()=>{
 const tool=userNodeTool(nodeApiTools.find(tool=>tool.name==='dock_node_apply'));
 assert.equal(tool.inputSchema.properties.mode.enum,undefined);
 assert.equal(tool.inputSchema.allOf,undefined);
 const refs=JSON.stringify(tool.inputSchema).matchAll(/"\$ref":"#\/\$defs\/([^"]+)"/g);
 for(const [,key] of refs)assert.ok(tool.inputSchema.$defs[key],key);
});
