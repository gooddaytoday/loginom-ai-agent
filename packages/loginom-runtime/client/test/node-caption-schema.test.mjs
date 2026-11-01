import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {nodeApiTools,nodeApplyInputSchema,dispatchNodeApi} from '../lib/node-api.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {validateNodeTargetRequest} from '../lib/node-contracts.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {createSkillLoader} from '../lib/skill.mjs';
import {createBundledSkillFixture} from './support/bundled-skill-fixture.mjs';

const full=nodeApiTools.find(tool=>tool.name==='dock_node_apply');
test('full apply schema reserves v0.3.9 growth with at least 1500 bytes below 46000',t=>{
 const bytes=value=>Buffer.byteLength(JSON.stringify(value));
 const expanded=structuredClone(full.inputSchema),before=bytes(expanded),costs={};
 // All accepted v0.3.9 nodes are registered. Only stepwise logistic
 // regression remains reserved; its contract is still being developed.
 for(const [key,reserve,modes] of [['logistic_stepwise',512,['forward','backward']]]){
  const start=bytes(expanded),schema={type:'object',properties:{},additionalProperties:false,description:''};
  schema.description='x'.repeat(reserve-bytes(schema));
  assert.equal(bytes(schema),reserve,key);
  expanded.properties.parameters.properties['reserve_'+key]=schema;
  for(const mode of modes)if(!expanded.properties.mode.enum.includes(mode))expanded.properties.mode.enum.push(mode);
  costs[key]=bytes(expanded)-start;
 }
 t.diagnostic(JSON.stringify({full_bytes:before,compact_bytes:bytes(userNodeTool(full).inputSchema),
  growth:costs,expanded_bytes:bytes(expanded),headroom_bytes:46000-bytes(expanded)}));
 assert.ok(bytes(expanded)<=44500,`full=${before}; expanded=${bytes(expanded)}; need >=1500 bytes below 46000`);
});
test('published apply references retain every canonical constraint and description',async()=>{
 const expand=value=>{
  if(Array.isArray(value))return value.map(expand);
  if(!value||typeof value!=='object')return value;
  if(value.$ref){
   assert.match(value.$ref,/^#\/\$defs\/[^/]+$/);
   return expand(full.inputSchema.$defs[value.$ref.split('/').at(-1)]);
  }
  return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='$defs').map(([key,item])=>[key,expand(item)]));
 };
 assert.deepEqual(expand(full.inputSchema),nodeApplyInputSchema);
 const validate=new AjvJsonSchemaValidator().getValidator(full.inputSchema);
 const canonical=new AjvJsonSchemaValidator().getValidator(nodeApplyInputSchema);
 // All referenced shapes are exercised through complete requests below; the
 // exact expansion comparison also covers required, enum and numeric bounds.
 const request={operation_id:'op',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'wf',tab_tid:'tab',prefix:'prefix',navigation_path:[{tid:'scenario',label:'Scenario'}]},
  target:{kind:'new',type:'programming.javascript'},inputs:[],mode:'script',parameters:{columns:[{
   name:'value',label:'Value',type:'integer',data_kind:'Непрерывный',usage:'Не задано'}]},
  mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},
  budgets:{configure_ms:1000,execute_ms:1000,total_ms:1000}};
 assert.equal(validate(request).valid,true);
 for(const change of [r=>r.parameters.columns[0].name='bad name',r=>r.parameters.columns[0].data_kind='Дискретный',
  r=>r.parameters.columns[0].extra=true,r=>delete r.parameters.columns[0].usage,
  r=>r.document_id='invalid id',r=>r.inputs=[{source:{document_id:'doc',workflow_id:'wf',node_id:''},input:0,output:0}]]){
  const changed=structuredClone(request);change(changed);
  assert.equal(validate(changed).valid,false);
  assert.equal(validate(changed).valid,canonical(changed).valid);
  await assert.rejects(dispatchNodeApi({tools:nodeApiTools,startNodeApply:()=>assert.fail('invalid request reached runtime')},'dock_node_apply',changed),/Invalid/);
 }
});
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
 assert.ok(Buffer.byteLength(JSON.stringify(tool.inputSchema))<46000);
 assert.deepEqual(label,full.inputSchema.properties.target.properties.label);
});

test('bundled main skill delivers caption restrictions without reading canvas.md',async t=>{
 const source=await createBundledSkillFixture(t),loaded=await createSkillLoader({resources:source.resources}).prepare();
 assert.match(loaded.detail.content,/`target.label` необязателен:.*без `; \| < >`.*сравнения и формулы.*`parameters`/);
});
