import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {javascriptParametersSchema} from '../lib/node-api.mjs';

const config={targetOrigin:'http://example.test',targetBuild:'7.4.2'};
const source={document_id:'doc',workflow_id:'flow',node_id:'input'};
const node={...source,node_id:'js'};
const request={operation_id:'product-js',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',
    navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:'Scenario'}]},
  target:{kind:'new',type:'programming.javascript',position:{x:256,y:256}},
  inputs:[{source,output:0,input:0}],mode:'script',parameters:{schema_mode:'code',source_text:'// own source\n'},
  mappings:[],finish:'execute',read:{ports:[0],sample_rows:10,require_exact_numbers:true},
  budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};

test('product registration describes actual general JavaScript knowledge without an injected trial',()=>{
  const support=createCandidateNodeSupport(config),handler=support.nodeApplyHandlers.get('programming.javascript');
  assert.equal(support.nodeApplyHandlers.size,15);
  assert.equal(handler.revision,'javascript-script-lifecycle-v5');
  assert.deepEqual(handler.parameter_schema,javascriptParametersSchema);
  const card=describeNodeTypes(['programming.javascript'],{},new Map(),support.nodeApplyHandlers,'7.4.2')[0];
  assert.equal(card.javascript_knowledge.validated_for.loginom_build,'7.4.2');
  assert.throws(()=>describeNodeTypes(['programming.javascript'],{},new Map(),support.nodeApplyHandlers),/not validated/);
  assert.throws(()=>describeNodeTypes(['programming.javascript'],{},new Map(),support.nodeApplyHandlers,'7.4.1'),/not validated/);
  assert.equal(card.javascript_knowledge.scalar_data_api.import,'import {InputTable,OutputTable,DataType} from "builtIn/Data";');
  const offline=createCandidateNodeSupport({});
  assert.equal(offline.nodeApplyHandlers.size,14);
  for(const [type,other] of offline.nodeApplyHandlers)
    assert.deepEqual([support.nodeApplyHandlers.get(type).revision,support.nodeApplyHandlers.get(type).parameter_schema],
      [other.revision,other.parameter_schema]);
});

for(const targetBuild of [undefined,'7.4.1','7.4.3'])test('another or unpinned build does not advertise/apply validated JavaScript '+targetBuild,()=>{
  const support=createCandidateNodeSupport({...config,targetBuild});
  assert.equal(support.nodeApplyHandlers.size,14);
  assert.throws(()=>validateNodeApplyRequest(request,support.nodeApplyHandlers));
  assert.throws(()=>support.nodeApplyDriverFactory({operation:{id:request.operation_id,parameters:request}}),/validated 7.4.2/);
});

test('missing target origin and invalid redactor fail before a browser effect',()=>{
  for(const targetOrigin of [undefined,''])
    assert.equal(createCandidateNodeSupport({...config,targetOrigin}).nodeApplyHandlers.has('programming.javascript'),false);
  assert.throws(()=>createCandidateNodeSupport({...config,redactor:{}}),/dependencies unavailable/);
});

for(const schema_mode of ['code','declared'])for(const kind of ['new','existing'])for(const finish of ['done','execute','close'])
test('actual product preflight and driver route '+schema_mode+'/'+kind+'/'+finish,async()=>{
  const support=createCandidateNodeSupport({...config,redactor:createRedactor(['known-secret'])});
  const r={...structuredClone(request),target:kind==='new'?request.target:{kind,type:'programming.javascript',ref:node},
    inputs:kind==='new'?request.inputs:[],finish,
    read:finish==='execute'?request.read:{ports:[],sample_rows:0,require_exact_numbers:true},
    parameters:{schema_mode,source_text:request.parameters.source_text,
      ...(kind==='existing'?{expected_source_sha256:'a'.repeat(64)}:{}),
      ...(kind==='new'&&schema_mode==='declared'?{columns:[{name:'Value',label:'Value',type:'integer',data_kind:'Непрерывный',usage:'Не задано'}]}:{})}};
  if(kind==='new'&&finish==='close'){
    assert.throws(()=>validateNodeApplyRequest(r,support.nodeApplyHandlers));return;
  }
  assert.equal(validateNodeApplyRequest(r,support.nodeApplyHandlers).handler.revision,'javascript-script-lifecycle-v5');
  let calls=0;
  const drivers=support.nodeApplyDriverFactory({operation:{id:r.operation_id,parameters:r},execute:async()=>{calls++;assert.fail('Unexpected browser effect');}});
  assert.equal(typeof drivers.configureJavascript,'function');
  assert.equal((await drivers.verifySource(r.parameters)).verified,true);
  for(const source_text of ['import fs from "fs";','const v = ;'])
    await assert.rejects(()=>drivers.verifySource({...r.parameters,source_text}));
  assert.equal(calls,0);
});
