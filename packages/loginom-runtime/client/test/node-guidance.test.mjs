import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createSkillLoader} from '../lib/skill.mjs';
import {createUserWorkflowBindings,userNodeTool} from '../lib/user-workflow.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {createBundledSkillFixture,refreshSkillFixtureManifest} from './support/bundled-skill-fixture.mjs';

test('outlier edit guidance delivers native limit behavior for SD and IQR',async t=>{
 const source=await createBundledSkillFixture(t);
 const loader=createSkillLoader({resources:source.resources});
 const [description]=await loader.describeNodes([{type:'preprocessing.elim_outlier',modes:['detect','edit']}],['edit']);
 assert.match(description.guidance,/`limit` заменяет выброс ближайшей границей нормального класса/);
 assert.match(description.guidance,/SD и IQR/);
 assert.match(description.guidance,/outlier_constant:0, extreme_constant:100/);
 assert.doesNotMatch(description.guidance,/подтверждён только|не обещается/);
 assert.doesNotMatch(NODE_TYPES['preprocessing.elim_outlier'].semantics,/established only|no broader guarantee/);
 assert.ok(Buffer.byteLength(await readFile(join(source.directory,'references/nodes/preprocessing.elim_outlier.md')))<=6000);
});

test('each supported regression selection mode delivers complete import and output rules',async t=>{
 const source=await createBundledSkillFixture(t);
 const loader=createSkillLoader({resources:source.resources});
 const card={type:'datamining.lin_regression',modes:NODE_TYPES['datamining.lin_regression'].modes};
 for(const mode of ['forward','backward','stepwise'].filter(mode=>card.modes.includes(mode))){
  const [description]=await loader.describeNodes([card],[mode]);
  assert.match(description.guidance,/type:"integer", data_kind:"Непрерывный"/,mode);
  assert.match(description.guidance,/read\.ports:\[0,1\]/,mode);
  assert.match(description.guidance,/exports\.text/,mode);
  assert.match(description.guidance,/сохрани пакет/,mode);
  assert.doesNotMatch(description.guidance,/как в forward выше/,mode);
  assert.match(description.guidance,new RegExp('mode:"'+mode+'"'),mode);
 }
 const [enter]=await loader.describeNodes([card],['enter']);
 assert.match(enter.guidance,/`mode:"enter"`, `linear_regression:\{statistics:"full"\}`/);
 assert.match(enter.guidance,/read\.ports:\[0,1\]/);
 assert.match(enter.guidance,/CSV прогнозов — `exports\.text` от порта 0/);
 assert.ok(Buffer.byteLength(await readFile(join(source.directory,'references/nodes/datamining.lin_regression.md')))<=6000);
});

test('text Import delimited guidance keeps every rule in compact English',async t=>{
 const source=await createBundledSkillFixture(t);
 const loader=createSkillLoader({resources:source.resources});
 const [description]=await loader.describeNodes([{type:'imports.text',modes:NODE_TYPES['imports.text'].modes}],['delimited']);
 const text=description.guidance.replace(/\s+/g,' ');
 for(const rule of [/confirmed source CSV/,/visualizer table/,/effect_possible=false/,/preview_only:true/,/server_profile/,
  /CP1251/,/mojibake/,/rare types/,/download\/sampling/,/full sample Import settings/,/settings\.columns`; add no Reform/,/order/,/overwrite=reject/,
  /server bytes/,/UPLOAD_PATH_CONFLICT/,/saved node/,/upload_operation_id/,/double quote/,/large-files\.md/,/separate Import Execute/,
  /auto_detect_columns/,/only after Execute/,/output `mappings`/,/refresh/,/erases manual types/,/binding_schema/,/variables\.to_table/,/Cancel deactivates/,
  /Calculator\/JS/,/EACH Execute/,/verified `parameters\.source`/,/CsvPath/,/configuration\.bindings/])assert.match(text,rule);
 assert.doesNotMatch(description.guidance.replace(/^# .*\n/,'').replace(/\(\.\.\/large-files\.md#[^)]*\)/,''),/[А-Яа-яЁё]/);
 assert.ok(Buffer.byteLength(await readFile(join(source.directory,'references/nodes/imports.text.md')))<=6000);
});

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
 assert.equal(outer.cache_key,createHash('sha256').update(JSON.stringify([card.cache_key,prepared.detail.revision,outer.guidance])).digest('hex'));
 assert.notEqual(outer.cache_key,inner.cache_key);
 await assert.rejects(loader.describeNodes([card],['invented']),/mode/i);
 await writeFile(file,'tampered');
 await assert.rejects(loader.describeNodes([card],['inner']),/LOGINOM_SKILL_HASH_MISMATCH/);
});

test('new and existing apply require a delivered card since the latest preparation',()=>{
 const bindings=createUserWorkflowBindings();
 for(const kind of ['new','existing']){
  const request={mode:'keys',target:{kind,type:'transform.sorting'}};
  const refused=bindings.checkNodeDescription(request);
  assert.equal(refused.error.code,'NODE_TYPE_NOT_DESCRIBED');
  assert.equal(refused.effect_possible,false);assert.equal(refused.status,'NOT_APPLIED');
  assert.deepEqual(refused.next_step.arguments,{node_types:['transform.sorting'],modes:['keys']});
 }
 bindings.rememberDescriptions({node_types:[{type:'transform.sorting',modes:['keys']}]},['keys']);
 assert.equal(bindings.checkNodeDescription({mode:'keys',target:{type:'transform.sorting'}}),null);
 assert.equal(bindings.checkNodeDescription({mode:'keys',target:{type:'imports.text'}}).error.code,'NODE_TYPE_NOT_DESCRIBED');
 bindings.resetDescriptions();
 assert.equal(bindings.checkNodeDescription({mode:'keys',target:{type:'transform.sorting'}}).error.code,'NODE_TYPE_NOT_DESCRIBED');
 bindings.remember({document_id:'one',workflow_ref:{workflow_id:'workflow',navigation_path:[]}});
 bindings.rememberDescriptions({node_types:[{type:'transform.sorting',modes:['keys']}]},['keys']);
 assert.equal(bindings.checkNodeDescription({document_id:'one',mode:'keys',target:{type:'transform.sorting'}}),null);
 bindings.remember({document_id:'two',workflow_ref:{workflow_id:'workflow',navigation_path:[]}});
 assert.equal(bindings.checkNodeDescription({document_id:'two',mode:'keys',target:{type:'transform.sorting'}}).error.code,'NODE_TYPE_NOT_DESCRIBED');
});

test('compact apply omits type branches and modes while retaining resolvable shared definitions',()=>{
 const tool=userNodeTool(nodeApiTools.find(tool=>tool.name==='dock_node_apply'));
 assert.match(tool.inputSchema.properties.parameters.description,/modes:\[mode\]/);
 assert.equal(tool.inputSchema.properties.mode.enum,undefined);
 assert.equal(tool.inputSchema.allOf,undefined);
 const refs=JSON.stringify(tool.inputSchema).matchAll(/"\$ref":"#\/\$defs\/([^"]+)"/g);
 for(const [,key] of refs)assert.ok(tool.inputSchema.$defs[key],key);
});

test('admission requires the selected mode, never an index or another type mode',()=>{
 const b=createUserWorkflowBindings();
 const cards={node_types:[{type:'transform.sorting',modes:['keys']},{type:'transform.filter_data',modes:['conditions']}]};
 const sorting={mode:'keys',target:{type:'transform.sorting'}};
 const filter={mode:'conditions',target:{type:'transform.filter_data'}};
 b.rememberDescriptions(cards);
 assert.equal(b.checkNodeDescription(sorting).error.code,'NODE_TYPE_NOT_DESCRIBED');
 b.rememberDescriptions(cards,['keys']);
 assert.equal(b.checkNodeDescription(sorting),null);
 assert.equal(b.checkNodeDescription(filter).error.code,'NODE_TYPE_NOT_DESCRIBED');
 assert.deepEqual(b.checkNodeDescription(filter).next_step.arguments,{node_types:['transform.filter_data'],modes:['conditions']});
 b.rememberDescriptions(cards,['conditions']);
 assert.equal(b.checkNodeDescription(filter),null);
});

test('stale document identity defers to the authoritative document guard after Save As',()=>{
 const b=createUserWorkflowBindings();
 b.remember({document_id:'new-document',workflow_ref:{workflow_id:'w',navigation_path:[]}});
 const request={document_id:'old-document',target:{type:'transform.sorting'},mode:'keys'};
 assert.equal(b.checkNodeDescription(request),null);
 assert.equal(b.checkNodeDescription({...request,document_id:'new-document'}).error.code,'NODE_TYPE_NOT_DESCRIBED');
});

test('acceptance review rules reach the model: describe after reopen, import all without mappings, replace rules without table inputs',async t=>{
 const main=await readFile(new URL('../../../product/skills/loginom-automation/SKILL.md',import.meta.url),'utf8');
 const reopen=main.split('\n').find(line=>line.includes('open_package')&&line.includes('dock_action_describe'));
 assert.ok(reopen&&Buffer.byteLength(reopen)<=200,reopen);
 const source=await createBundledSkillFixture(t);
 const loader=createSkillLoader({resources:source.resources});
 const [text]=await loader.describeNodes([{type:'imports.text',modes:NODE_TYPES['imports.text'].modes}],['delimited']);
 assert.match(text.guidance,/`all`: fields appear only after Execute[^.]*pass no `columns` or\s+output `mappings`/);
 assert.match(text.guidance,/to control fields use `new`\/`none`/);
 const [rules]=await loader.describeNodes([{type:'variables.replace',modes:NODE_TYPES['variables.replace'].modes}],['rules']);
 assert.match(rules.guidance,/без табличных `inputs` и `mappings`/);
 assert.match(rules.guidance,/только через `variable_inputs`/);
 for(const file of ['imports.text','variables.replace'])
  assert.ok(Buffer.byteLength(await readFile(join(source.directory,'references/nodes/'+file+'.md')))<=6000,file);
});

test('merged sorting guidance fits the per-file budget and reaches the keys card',async t=>{
 const source=await createBundledSkillFixture(t);
 const guide=await readFile(join(source.directory,'references/nodes/transform.sorting.md'),'utf8');
 assert.ok(Buffer.byteLength(guide)<=6000,`sorting guidance: ${Buffer.byteLength(guide)} > 6000`);
 const loader=createSkillLoader({resources:source.resources});
 const [card]=await loader.describeNodes([{type:'transform.sorting',modes:NODE_TYPES['transform.sorting'].modes}],['keys']);
 for(const rule of ['max_threads','case_sensitive','variable_inputs','BINDING_TYPE_MISMATCH','BINDING_NULL_UNSUPPORTED','BINDING_CONFLICT'])
  assert.ok(card.guidance.includes(rule),rule);
});

test('LAB-1162 skill text covers repeated model refusals from live runs',async t=>{
 const source=await createBundledSkillFixture(t);
 const loader=createSkillLoader({resources:source.resources});
 const skill=await readFile(source.main,'utf8');
 assert.match(skill,/[Пп]осле каждого `loginom_dock_prepare`[^\n]*(open_package|повторн)[^\n]*\n?[^\n]*describe/);
 const workflow=await readFile(join(source.directory,'references/workflow.md'),'utf8');
 assert.match(workflow,/source_operation_id[\s\S]{0,80}finish:"execute"/);
 assert.match(workflow,/табличного узла[\s\S]{0,60}finish:"execute"[\s\S]{0,20}`finish:"done"` и экспорт не подходят[\s\S]{0,20}снимок\s+`variables\.user` — по его карточке/);
 assert.doesNotMatch(workflow,/операция с `finish:"done"`[^\n]*не подходит/);
 const card={type:'transform.group_data',modes:NODE_TYPES['transform.group_data'].modes};
 const [aggregate]=await loader.describeNodes([card],['aggregate']);
 assert.match(aggregate.guidance,/configured_field\.name[\s\S]{0,40}текущее выходное имя: после apply с `measures`[\s\S]{0,20}`name` меры/);
 assert.match(aggregate.guidance,/не составляй имя из поля и функции \(`Amount_Median`\), если узел его не выдал/);
 assert.doesNotMatch(aggregate.guidance,/native-имена[^\n]*не подходят/);
});
