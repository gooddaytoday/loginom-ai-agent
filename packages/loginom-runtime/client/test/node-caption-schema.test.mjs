import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeApiTools,dateTimeParametersSchema} from '../lib/node-api.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {validateNodeTargetRequest} from '../lib/node-contracts.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {createSkillLoader} from '../lib/skill.mjs';
import {createBundledSkillFixture} from './support/bundled-skill-fixture.mjs';

const full=nodeApiTools.find(tool=>tool.name==='dock_node_apply');
test('full apply schema plus unregistered v0.3.8 types stays below 46000 UTF-8 bytes',t=>{
 for(const [type,mode] of [['research.corr_analysis','pearson'],['transform.sliding_window','lag']]){
  assert.ok(full.inputSchema.properties.target.properties.type.enum.includes(type),type);
  assert.ok(full.inputSchema.properties.mode.enum.includes(mode),mode);
 }
 const bytes=value=>Buffer.byteLength(JSON.stringify(value));
 const expanded=structuredClone(full.inputSchema),before=bytes(expanded);
 // Charge each planned type a complete Date/time-sized parameter object,
 // its type ID and its mode. These are sizing fixtures, not public nodes.
 const types=[['transform.sliding_window','lag'],['research.corr_analysis','pearson'],
  ['preprocessing.elim_outlier','detect'],['preprocessing.sampling','basic'],
  ['preprocessing.data_partition','sequential'],['datamining.log_regression','enter']];
 const costs=types.map(([type,mode])=>{
  if(expanded.properties.target.properties.type.enum.includes(type))return 0;
  const start=bytes(expanded),key=type.split('.').at(-1);
  expanded.properties.target.properties.type.enum.push(type);
  if(!expanded.properties.mode.enum.includes(mode))expanded.properties.mode.enum.push(mode);
  expanded.properties.parameters.properties[key]=structuredClone(dateTimeParametersSchema);
  return bytes(expanded)-start;
 });
 const enumStart=bytes(expanded);
 for(const mode of ['right','full','difference','regex'])
  if(!expanded.properties.mode.enum.includes(mode))expanded.properties.mode.enum.push(mode);
 const enumBytes=bytes(expanded)-enumStart;
 const growth=bytes(expanded)-before;
 t.diagnostic(JSON.stringify({full_bytes:before,type_bytes:costs,enum_bytes:enumBytes,
  growth_bytes:growth,expanded_bytes:bytes(expanded)}));
 assert.ok(bytes(expanded)<46000,`full=${before}; unregistered growth=${growth}`);
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
