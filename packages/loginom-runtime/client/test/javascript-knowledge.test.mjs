import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {JAVASCRIPT_CARD_LIMITATIONS,JAVASCRIPT_KNOWLEDGE_SHA256,describeJavascriptKnowledge} from '../lib/javascript-knowledge.mjs';
import {createRuntimeSourcePin} from '../lib/runtime-pin.mjs';
import {javascriptExecutionProbes} from '../../tools/loginom-acceptance/javascript-execution-probes.mjs';
import {describeNodeTypes,NODE_TYPES} from '../lib/node-contracts.mjs';
import {javascriptParametersSchema,nodeApplyInputSchema,validateNodeApplyEnvelope} from '../lib/node-api.mjs';
import {compactKnowledgeBundle} from '../lib/user-results.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {previewWireSize} from '../lib/user-preview-budget.mjs';

test('7.4.2 knowledge contains only exact headed probes and rejects another observed build',async()=>{
  const knowledge=describeJavascriptKnowledge('7.4.2');
  assert.equal(knowledge.knowledge_sha256,JAVASCRIPT_KNOWLEDGE_SHA256);
  assert.equal(JAVASCRIPT_CARD_LIMITATIONS.length,9);
  assert.deepEqual(knowledge.limitations,JAVASCRIPT_CARD_LIMITATIONS);
  assert.equal(knowledge.validated_for.server_os,'Linux');
  assert.equal(knowledge.validated_for.source_prompt_sha256,
    createHash('sha256').update(await readFile(new URL('../../../../docs/node-development/nodes/programming-javascript/references/js_node_loginom_system_prompt.md',import.meta.url))).digest('hex'));
  for(const example of knowledge.examples){
    const probe=javascriptExecutionProbes('RowID').find(item=>item.id===example.id);
    assert.ok(probe,example.id);
    assert.equal(example.source,probe.source,example.id);
    assert.equal(example.source_sha256,probe.source_sha256,example.id);
    assert.equal(createHash('sha256').update(example.source).digest('hex'),example.source_sha256,example.id);
  }
  assert.throws(()=>describeJavascriptKnowledge('7.4.3'),/not validated/);
  assert.throws(()=>describeJavascriptKnowledge(undefined),/not validated/);
  knowledge.examples[0].source='changed';
  assert.equal(describeJavascriptKnowledge('7.4.2').examples[0].source,javascriptExecutionProbes('RowID').find(item=>item.id==='declared-table-v1').source);
});

test('knowledge1.1 keeps historical1.0 identity and delivers only observed Name guidance',()=>{
  const current=describeJavascriptKnowledge('7.4.2','1.1.0'),legacy=describeJavascriptKnowledge('7.4.2','1.0.0');
  assert.equal(current.version,'1.1.0');assert.equal(legacy.version,'1.0.0');
  assert.equal(legacy.knowledge_sha256,'4a8a2d6e712fc56d039d1e595361dde9afb7e16eb7f3b8fd1959d5f5908bc2ef');
  assert.notEqual(current.knowledge_sha256,legacy.knowledge_sha256);
  assert.deepEqual(current.examples,legacy.examples);
  assert.deepEqual(current.limitations.slice(0,7),legacy.limitations);
  assert.match(current.limitations[7],/ASCII Name.*DisplayName.*schema\/readback/);
  assert.equal(current.column_names.method,'AssignColumns');
  assert.equal(current.column_names.normalization_algorithm_verified,false);
  assert.equal(current.column_names.add_column_verified,false);
  assert.deepEqual(current.column_names.observed_pairs.map(pair=>[pair.requested_name,pair.actual_name,pair.display_name]),
    [['Value','Value','Value'],['Сумма','Summa','Value'],['Value Total','Value_Total','Value'],['1Value','_1Value','Value'],['Value','Value','Сумма ё']]);
  assert.equal(legacy.column_names,undefined);
  current.column_names.observed_pairs[1].actual_name='changed';
  assert.equal(describeJavascriptKnowledge('7.4.2').column_names.observed_pairs[1].actual_name,'Summa');
  assert.throws(()=>describeJavascriptKnowledge('7.4.2','9.9.9'),/Unsupported/);
});

test('knowledge1.2 delivers the exact declared writer contract without rewriting1.1',()=>{
  const current=describeJavascriptKnowledge('7.4.2'),previous=describeJavascriptKnowledge('7.4.2','1.1.0');
  assert.equal(current.version,'1.2.0');
  assert.equal(previous.knowledge_sha256,'9a4b79833948e2441a0594131708c530fb5da739cd2eea1ebb8787221dfb122d');
  assert.equal(previous.declared_columns,undefined);
  assert.deepEqual(current.limitations.slice(0,8),previous.limitations);
  assert.match(current.limitations.at(-1),/integer\/real\/datetime data_kind=Непрерывный/);
  assert.equal(current.declared_columns.max_columns,64);
  assert.deepEqual(current.declared_columns.default_data_kind,
    {boolean:'Дискретный',datetime:'Непрерывный',real:'Непрерывный',integer:'Непрерывный',string:'Дискретный'});
  current.declared_columns.default_data_kind.integer='changed';
  assert.equal(describeJavascriptKnowledge('7.4.2').declared_columns.default_data_kind.integer,'Непрерывный');
});

test('knowledge module is included in the client revision and mutation changes its pin',async()=>{
  const live=await createRuntimeSourcePin(new URL('../lib/session.mjs',import.meta.url));
  const moduleEntry=live.manifest.find(item=>item.path==='./javascript-knowledge.mjs');
  assert.ok(moduleEntry);
  assert.equal(moduleEntry.sha256,createHash('sha256').update(await readFile(new URL('../lib/javascript-knowledge.mjs',import.meta.url))).digest('hex'));
  const directory=await mkdtemp(join(tmpdir(),'javascript-knowledge-pin-'));
  try{
    await mkdir(join(directory,'lib'));
    const target=join(directory,'lib/javascript-knowledge.mjs');
    await writeFile(target,await readFile(new URL('../lib/javascript-knowledge.mjs',import.meta.url)));
    const base=pathToFileURL(join(directory,'lib/session.mjs'));
    const first=await createRuntimeSourcePin(base);
    await writeFile(target,(await readFile(target,'utf8'))+'\n');
    const second=await createRuntimeSourcePin(base);
    assert.notEqual(second.revision,first.revision);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('JavaScript card delivers pinned compact rules and on-demand Data API only for an installed handler',()=>{
  assert.equal(NODE_TYPES['programming.javascript'].palette_group,'Программирование');
  assert.deepEqual(NODE_TYPES['programming.javascript'].modes,['script']);
  const unavailable=describeNodeTypes(['programming.javascript'],{},new Map(),new Map(),'7.4.2')[0];
  assert.equal(unavailable.candidate_node_apply_available,false);
  assert.equal(unavailable.javascript_knowledge,undefined);
  assert.equal(unavailable.limitations,undefined);
  const handlers=new Map([['programming.javascript',{revision:'javascript-v1',modes:['script'],parameter_schema:javascriptParametersSchema}]]);
  const [card]=describeNodeTypes(['programming.javascript'],{client:'pin'},new Map(),handlers,'7.4.2');
  assert.equal(card.candidate_node_apply_available,true);
  assert.equal(card.knowledge_sha256,JAVASCRIPT_KNOWLEDGE_SHA256);
  assert.deepEqual(card.parameter_schema,javascriptParametersSchema);
  assert.deepEqual(card.limitations,JAVASCRIPT_CARD_LIMITATIONS);
  assert.equal(card.javascript_knowledge.scalar_data_api.import,'import {InputTable,OutputTable,DataType} from "builtIn/Data";');
  assert.equal(card.javascript_knowledge.validated_for.loginom_build,'7.4.2');
  assert.equal(card.javascript_knowledge.version,'1.2.0');
  assert.equal(card.javascript_knowledge.column_names.method,'AssignColumns');
  const compact=compactKnowledgeBundle({session_manifest:{},actions:[],node_types:[card]}).node_types[0];
  assert.deepEqual(compact.limitations,JAVASCRIPT_CARD_LIMITATIONS);
  assert.equal(compact.knowledge_sha256,JAVASCRIPT_KNOWLEDGE_SHA256);
  assert.equal(compact.validated_for.loginom_build,'7.4.2');
  assert.equal(compact.javascript_knowledge,undefined);
  assert.equal(compact.parameter_schema,undefined);
  assert.throws(()=>describeNodeTypes(['programming.javascript'],{},new Map(),handlers,'7.4.3'),/not validated/);
  assert.equal(card.cache_key,describeNodeTypes(['programming.javascript'],{client:'pin'},new Map(),handlers,'7.4.2')[0].cache_key);
});

test('full node envelope admits JavaScript fields without changing import source shape',()=>{
  assert.ok(nodeApplyInputSchema.properties.target.properties.type.enum.includes('programming.javascript'));
  assert.ok(nodeApplyInputSchema.properties.mode.enum.includes('script'));
  for(const key of Object.keys(javascriptParametersSchema.properties))
    assert.deepEqual(nodeApplyInputSchema.properties.parameters.properties[key],javascriptParametersSchema.properties[key]);
  assert.deepEqual(nodeApplyInputSchema.properties.parameters.properties.source.required,['artifact_id','upload_operation_id']);
  assert.doesNotThrow(()=>validateActionParameters(nodeApplyInputSchema.properties.parameters,{
    source_text:'import {InputTable} from "builtIn/Data";\n',schema_mode:'code'}));
  assert.throws(()=>validateActionParameters(nodeApplyInputSchema.properties.parameters,{source:'text'}));
  const request={operation_id:'js',contract_revision:'1.0.0',document_id:'d',
    workflow_ref:{workflow_id:'w',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',prefix:'MF;TF',navigation_path:[{tid:'x',label:'x'}]},
    target:{kind:'new',type:'programming.javascript'},inputs:[],mode:'script',
    parameters:{source_text:'import {InputTable} from "builtIn/Data";\n',schema_mode:'code'},mappings:[],
    finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},
    budgets:{configure_ms:1000,execute_ms:1000,total_ms:1000}};
  assert.doesNotThrow(()=>validateActionParameters(nodeApplyInputSchema,request));
  assert.doesNotThrow(()=>validateNodeApplyEnvelope(request));
  assert.throws(()=>validateNodeApplyEnvelope({...request,target:{kind:'new',type:'imports.text'}}));
  assert.throws(()=>validateNodeApplyEnvelope({...request,mode:'delimited'}));
  assert.throws(()=>validateNodeApplyEnvelope({...request,parameters:{source:{artifact_id:'a',upload_operation_id:'u'}}}));
});

test('actual action runtime describes the pinned JavaScript candidate within delivery budgets',()=>{
  const handler={revision:'javascript-v1',modes:['script'],parameter_schema:javascriptParametersSchema};
  const runtime=build=>createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{clientRevision:'pin'},
    compatibility:{loginom_build:build}},execute:async()=>{throw Error('Description must not browse');},
    allowCandidate:true,nodeApplyHandlers:new Map([['programming.javascript',handler]]),nodeApplyDriverFactory:()=>{}});
  const active=runtime('7.4.2');
  assert.deepEqual(active.describe().available_node_types,['programming.javascript']);
  const described=active.describe({node_types:['programming.javascript']});
  assert.equal(described.node_types[0].javascript_knowledge.knowledge_sha256,JAVASCRIPT_KNOWLEDGE_SHA256);
  assert.ok(previewWireSize(described.node_types[0].javascript_knowledge)<20000);
  assert.ok(previewWireSize(described)<46000);
  const prepared=compactKnowledgeBundle(described);
  assert.ok(previewWireSize(prepared)<46000);
  assert.equal(prepared.node_types[0].javascript_knowledge,undefined);
  assert.throws(()=>runtime('7.4.3').describe({node_types:['programming.javascript']}),/not validated/);
});
