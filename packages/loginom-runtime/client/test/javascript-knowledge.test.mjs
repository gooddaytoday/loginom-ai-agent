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
  assert.equal(JAVASCRIPT_CARD_LIMITATIONS.length,7);
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
