import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeApiTools} from '../lib/node-api.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {validateNodeTargetRequest} from '../lib/node-contracts.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {createSkillLoader} from '../lib/skill.mjs';
import {createBundledSkillFixture} from './support/bundled-skill-fixture.mjs';

const full=nodeApiTools.find(tool=>tool.name==='dock_node_apply');
for(const tool of [full,userNodeTool(full)])test('node caption rule reaches '+(tool===full?'full':'compact')+' schema without restricting predicates',()=>{
 const target=tool.inputSchema.properties.target,label=target.properties.label;
 const validate=new AjvJsonSchemaValidator().getValidator(label);
 const request=value=>({document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'scenario',label:'Scenario'}]},
  target:{kind:'new',type:'transform.filter_data',...(value===undefined?{}:{label:value})},inputs:[]});
 assert.equal(target.required.includes('label'),false);
 for(const value of ['Debt > 0','a<b','a;b','a|b','a"b',"a'b",'a\\b','a\nb','a\tb','\0',' ',201,'x'.repeat(201)]){
  assert.equal(validate(value).valid,false,JSON.stringify(value));
  assert.throws(()=>validateNodeTargetRequest(request(value)),/target.label/);
 }
 for(const value of ['Положительные долги','Debt above zero','x'.repeat(200),'😀'.repeat(100)]){
  assert.equal(validate(value).valid,true,value);assert.doesNotThrow(()=>validateNodeTargetRequest(request(value)));
 }
 assert.doesNotThrow(()=>validateNodeTargetRequest(request()));
 for(const word of ['Optional','< >','parameters','target.label'])assert.ok(label.description.includes(word));
 const groups=full.inputSchema.properties.parameters.properties.groups;
 assert.ok(JSON.stringify(groups).includes('>'));assert.ok(JSON.stringify(groups).includes('>='));
 assert.ok(label.description.length<500);assert.ok(Buffer.byteLength(JSON.stringify(label))<2000);
 assert.deepEqual(label,full.inputSchema.properties.target.properties.label);
});

test('bundled main skill delivers caption restrictions without reading canvas.md',async t=>{
 const source=await createBundledSkillFixture(t),loaded=await createSkillLoader({resources:source.resources}).prepare();
 assert.match(loaded.detail.content,/`target.label` необязателен:.*без `; \| < >`.*сравнения и формулы.*`parameters`/);
});
