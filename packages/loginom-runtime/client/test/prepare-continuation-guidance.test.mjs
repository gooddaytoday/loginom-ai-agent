import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTool,createSkillLoader} from '../lib/skill.mjs';
import {createUserWorkflowBindings} from '../lib/user-workflow.mjs';
import {makeWorkspacePrepareCode} from '../lib/workspace.mjs';
import {createBundledSkillFixture} from './support/bundled-skill-fixture.mjs';

test('prepare schema explains continuation before admission and keeps the same-runtime identity guard',()=>{
 const properties=prepareTool.inputSchema.properties;
 for(const text of [properties.intent.description,properties.workflow_ref.description]){
  assert.match(text,/THIS runtime/);assert.match(text,/open_package/);assert.match(text,/confirmed Save path/);
  assert.match(text,/history|Chat history/);
 }
 assert.match(properties.package_path.description,/Never guess/);assert.match(properties.intent.description,/pending.*recovery/);
 assert.ok(Buffer.byteLength(JSON.stringify(prepareTool))<46000);
 const prior={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'scenario',label:'Scenario'}]}};
 const args={intent:'existing_workflow',workflow_ref:{document_id:prior.document_id,...prior.workflow_ref}};
 const fresh=createUserWorkflowBindings();assert.throws(()=>fresh.normalizePreparation(args),/UNKNOWN_PREPARED_WORKFLOW/);
 const open={intent:'open_package',package_path:'/fixture/confirmed-save.lgp'};
 assert.deepEqual(fresh.normalizePreparation(open),open);
 assert.doesNotThrow(()=>makeWorkspacePrepareCode({loginomUrl:'http://loginom.test/app/',
  compatibility:{loginom_build:'7.4.2',profile_id:'fixture',platform:'linux',browser:'chromium'},intent:open.intent,packagePath:open.package_path}));
 assert.throws(()=>fresh.normalizePreparation(args),/UNKNOWN_PREPARED_WORKFLOW/);
 fresh.remember(prior);assert.deepEqual(fresh.normalizePreparation(args),args);
 const damaged=structuredClone(args);damaged.workflow_ref.prefix='foreign';
 assert.throws(()=>fresh.normalizePreparation(damaged),/WORKFLOW_REFERENCE_MISMATCH/);
});

test('verified main skill delivers saved-package preparation rule without reading browser.md',async t=>{
 const source=await createBundledSkillFixture(t),loaded=await createSkillLoader({resources:source.resources}).prepare();
 assert.match(loaded.detail.content,/без успешной подготовки в текущем runtime начинай\s+с `open_package`/);
 assert.match(loaded.detail.content,/точного пути из просьбы или подтверждённого Save/);
 assert.match(loaded.detail.content,/при pending сначала следуй recovery/);
});
