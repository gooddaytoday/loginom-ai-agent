import assert from 'node:assert/strict';
import test from 'node:test';
import {nodeResultReply} from '../lib/node-result-reply.mjs';
import {loginomFeedMetadata, loginomSaveMetadata} from '../lib/user-results.mjs';
import {withLoginomMetadata} from '../lib/loginom-feed-metadata.mjs';

const node = {document_id:'document', workflow_id:'workflow', node_id:'node-guid'};
const facts = {kind:'execute', node:{ref:node, label:'Фильтр', type:'transform.filter_data'}};
const column = {index:0, name:'Value', label:'Значение', type:'string'};
const cell = value => ({type:'string', is_null:false, value});
const port = (sample, index=0) => ({port:index, port_guid:'port-'+index, fresh:true, execution_id:'exec',
  schema:[column], row_count:sample.length, sample, sample_complete:true});
const receipt = ({ports, artifacts, failure, warnings=['Read limitation'], status='SUCCEEDED', execution={status:'completed', execution_id:'exec'}} = {}) => ({
  operation_id:'operation', attempt:1, state:'settled', outcome:{status, action_key:'node.apply', phase:'node_ready',
    effect_possible:true, cleanup_complete:true, error:failure, output:{node, execution, configuration:{status:'applied'},
      output:{...(ports && {ports}), ...(artifacts && {file_artifacts:artifacts})}, warnings}},
});

test('reading existing output proves sample coverage, not a new execution', () => {
  const tool = 'dock_node_read';
  const sample = {...port([[cell('first')], [cell('second')]]), row_count:12, sample_complete:false};
  const reply = nodeResultReply(receipt({ports:[sample]}), {userProfile:true, tool});
  assert.deepEqual(loginomFeedMetadata(reply, {tool, facts:{...facts, kind:'read'}}).evidence, [
    {kind:'tableRead', port:0, portGuid:'port-0', rowsRead:2, rowCount:12, executionId:'exec'},
  ]);
});

test('read evidence counts only delivered rows after the model budget, not the native or feed sample', () => {
  const tool = 'dock_node_wait';
  const sample = {...port(Array.from({length:50}, (_, index) => [cell(index+'Ж'.repeat(1100))])),
    row_count:500, sample_complete:false};
  const reply = nodeResultReply(receipt({ports:[sample]}), {userProfile:true, tool});
  const deliveredRows = JSON.parse(reply.content[0].text).output.ports[0].sample.length;
  assert.ok(deliveredRows > 10 && deliveredRows < 50);
  const metadata = loginomFeedMetadata(reply, {tool, facts:{...facts, readPorts:[sample]}});
  assert.ok(metadata.ports[0].preview.sample.length < deliveredRows);
  assert.deepEqual(metadata.evidence, [
    {kind:'tableRead', port:0, portGuid:'port-0', rowsRead:deliveredRows, rowCount:500, executionId:'exec'},
  ]);
});

test('completed launch proves execution even when no output was requested', () => {
  const tool = 'dock_node_wait';
  const reply = nodeResultReply(receipt(), {userProfile:true, tool});
  assert.deepEqual(loginomFeedMetadata(reply, {tool, facts:{...facts, launchedExecutionId:'exec'}}).evidence, [
    {kind:'executed', executionId:'exec', scope:'activeWorkflow'},
  ]);
  assert.equal(loginomFeedMetadata(reply, {tool, facts:{...facts, launchedExecutionId:'another-exec'}}).evidence, undefined);
});

test('save proves only the path unless the reopened workflow graph was checked', () => {
  const path = '/analyst/result.lgp';
  const save = {operation_id:'save', status:'SUCCEEDED', action_key:'package.save_checkpoint',
    output:{package_ref:{path, active_identity:path}, reopened:false}};
  assert.deepEqual(loginomSaveMetadata(save).evidence, [{kind:'saved', path}]);
  assert.deepEqual(loginomSaveMetadata({...save, output:{...save.output, reopened:true}, trace:[
    {event:'reopened_package_observed', actual_path:path, path_matches:true, graph_matches:true, graph:{nodes:['first','second']}},
  ]}).evidence, [{kind:'saved', path}, {kind:'reopenedGraphRead', nodeCount:2, scope:'activeWorkflow'}]);
  assert.equal(loginomSaveMetadata({...save, status:'AMBIGUOUS'}), undefined);
});

test('a 200-port result over the wire limit keeps its settled receipt and execution proof', () => {
  const tool = 'dock_node_wait';
  const ports = Array.from({length:200}, (_, index) => ({...port([[cell('value')]], index),
    port_guid:'port-'+index+'Ж'.repeat(100)}));
  const reply = {content:[{type:'text',text:'Result'}], structuredContent:{result_version:'user-v1',
    operation_id:'operation', state:'settled', status:'SUCCEEDED', node,
    execution:{status:'completed',execution_id:'exec'},output:{ports}}};
  const receipt = loginomFeedMetadata(reply, {tool, facts:{...facts,launchedExecutionId:'exec'}});
  const delivered = withLoginomMetadata(reply, {receipt})._meta.loginom;
  assert.equal(delivered.state,'settled');
  assert.equal(delivered.operationId,'operation');
  assert.equal(delivered.status,'SUCCEEDED');
  assert.deepEqual(delivered.evidence[0],{kind:'executed',executionId:'exec',scope:'activeWorkflow'});
  assert.ok(delivered.omitted.evidence > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(delivered)) <= 16 * 1024);
});

test('feed producers compose one operation block without replacing the reply or other fields', () => {
  const tool = 'dock_node_wait';
  const reply = {...nodeResultReply(receipt(), {userProfile:true, tool}), _meta: {outputFiles: []}};
  const busy = {version:1, windowId:'32ef40ff-08d2-476a-ad73-1ef3feb17ce8', operationId:'operation', active:false};
  const withBusy = withLoginomMetadata(reply, {operationId:'operation', state:'running', busy});
  const projection = loginomFeedMetadata(reply, {tool, facts});
  const withReceipt = withLoginomMetadata(withBusy, {receipt:projection});
  const combined = withLoginomMetadata(withReceipt, {verificationStale:false});
  assert.deepEqual(combined, {...reply, _meta:{...reply._meta, loginom:{...projection, busy, verificationStale:false}}});
  assert.equal(withLoginomMetadata(combined, {operationId:'another', verificationStale:true}), combined);
  assert.deepEqual(withBusy._meta.loginom, {v:1, operationId:'operation', state:'running', busy});
});

test('feed drops over-limit fields individually and preserves the other fields', () => {
  const reply = {content:[{type:'text', text:'original'}]};
  const identity = {operationId:'operation', state:'settled'};
  const busy = {version:1, windowId:'32ef40ff-08d2-476a-ad73-1ef3feb17ce8', operationId:'operation', active:true};
  const step = {outcome:'completed', retryAvailable:false, persistence:'saved_through',
    save:{operationId:'save', path:'Ж'.repeat(1024), throughStep:{operationId:'operation', label:'Фильтр'}}};
  const manualEdits = [{kind:'node_renamed', guid:'node', from:'Фильтр', to:'Ж'.repeat(2048)}];
  const savedPackageGraph = {saveOperationId:'save', packagePath:'Ж'.repeat(4096), status:'unavailable'};
  const result = withLoginomMetadata(reply, {...identity, busy, step, manualEdits, savedPackageGraph, verificationStale:true});
  assert.deepEqual(result._meta.loginom, {v:1, ...identity, busy, verificationStale:true, manualEdits:[],
    omitted:{manualEdits:1}, dropped:['step', 'savedPackageGraph']});
  const updated = withLoginomMetadata(result, {busy:{...busy, operationId:'a'.repeat(256)}, verificationStale:'invalid'});
  assert.deepEqual(updated._meta.loginom, {...result._meta.loginom,
    dropped:['step', 'savedPackageGraph', 'busy', 'verificationStale']});
});

test('feed reduces previews and limitations before dropping scenario facts', () => {
  const tool = 'dock_node_wait';
  const warnings = Array.from({length:6}, (_, index) => index+'Ж'.repeat(999));
  const sample = port(Array.from({length:10}, (_, index) => [cell(index+'Ю'.repeat(499))]));
  const reply = nodeResultReply(receipt({ports:[sample], warnings}), {userProfile:true, tool});
  const projection = loginomFeedMetadata(reply, {tool, facts});
  const base = withLoginomMetadata(reply, {receipt:projection});
  const manualEdits = [{kind:'node_renamed', guid:'node', from:'Фильтр', to:'Ж'.repeat(1000)}];
  assert.ok(Buffer.byteLength(JSON.stringify({...projection, manualEdits})) > 16 * 1024);
  const result = withLoginomMetadata(base, {manualEdits});
  const metadata = result._meta.loginom;
  const {preview} = metadata.ports[0];
  assert.ok(preview.sample.length > 0 && preview.sample.length < projection.ports[0].preview.sample.length);
  assert.deepEqual(preview.sample, projection.ports[0].preview.sample.slice(0, preview.sample.length));
  assert.equal(preview.sampleComplete, false);
  assert.deepEqual(metadata.manualEdits, manualEdits);
  assert.deepEqual(metadata.limitations, warnings);
  assert.ok(Buffer.byteLength(JSON.stringify(metadata)) <= 16 * 1024);
  const savedPackageGraph = {saveOperationId:'save', packagePath:'Ж'.repeat(1500), status:'unavailable'};
  const extended = withLoginomMetadata(result, {savedPackageGraph})._meta.loginom;
  assert.deepEqual(extended.savedPackageGraph, savedPackageGraph);
  assert.deepEqual(extended.manualEdits, manualEdits);
  assert.equal(extended.omitted.previewRows, projection.ports[0].preview.sample.length);
  assert.deepEqual(extended.limitations, warnings.slice(0, -extended.omitted.limitations));
  assert.ok(Buffer.byteLength(JSON.stringify(extended)) <= 16 * 1024);
  assert.deepEqual(base._meta.loginom, projection);
});

test('a nearly full receipt keeps a prefix of manual edits and counts all omitted entries', () => {
  const limitations = Array.from({length:8}, (_, index) => index+'Ж'.repeat(910));
  const receipt = {operationId:'operation', state:'settled', limitations};
  const reply = withLoginomMetadata({content:[]}, {receipt});
  const manualEdits = Array.from({length:12}, (_, index) => ({
    kind:'node_renamed', guid:'node-'+index, from:'Фильтр', to:'Ж'.repeat(220),
  }));
  const result = withLoginomMetadata(reply, {manualEdits, verificationStale:true})._meta.loginom;
  assert.equal(result.verificationStale, true);
  assert.ok(result.manualEdits.length > 0 && result.manualEdits.length < manualEdits.length);
  assert.deepEqual(result.manualEdits, manualEdits.slice(0, result.manualEdits.length));
  assert.equal(result.omitted.manualEdits, manualEdits.length - result.manualEdits.length);
  assert.ok(result.omitted.limitations > 0);
  assert.equal(result.omitted.limitations, limitations.length - result.limitations.length);
  assert.equal(result.dropped, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 16 * 1024);
});

test('configuration keeps the model text and exposes only the observed node and signals', () => {
  const tool = 'dock_node_apply';
  const reply = nodeResultReply(receipt({execution:{status:'not_requested', execution_id:null}}), {userProfile:true, tool});
  const snapshot = '{"result_version":"user-v1","operation_id":"operation","attempt":1,"state":"settled","status":"SUCCEEDED","action_key":"node.apply","phase":"node_ready","effect_possible":true,"cleanup_complete":true,"node":{"document_id":"document","workflow_id":"workflow","node_id":"node-guid"},"execution":{"status":"not_requested","execution_id":null},"configuration":{"status":"applied"},"output":{},"error":null,"limitations":["Read limitation"]}';
  assert.equal(reply.content[0].text, snapshot);
  const metadata = loginomFeedMetadata(reply, {tool, facts:{...facts, kind:'configure'}});
  assert.equal(metadata.kind, 'configure');
  assert.deepEqual(metadata.node, {guid:'node-guid', label:'Фильтр', type:'transform.filter_data'});
  assert.deepEqual(metadata.limitations, ['Read limitation']);
  assert.equal(metadata.ports, undefined);
  assert.equal(reply.content[0].text, snapshot);
});

test('wait previews are limited by rows and total UTF-8 bytes and come only from delivered rows', () => {
  const tool = 'dock_node_wait';
  const small = port(Array.from({length:13}, (_, index) => [cell('row '+index)]));
  const large = port(Array.from({length:40}, (_, index) => [cell(index+'Ж'.repeat(1050))]), 1);
  const wide = port([[cell('Ю'.repeat(6400))]], 2);
  const reply = nodeResultReply(receipt({ports:[small, large, wide]}), {userProfile:true, tool});
  assert.equal(reply.isError, undefined);
  const before = structuredClone(reply);
  assert.equal(reply.structuredContent.output.ports, undefined);
  const delivered = JSON.parse(reply.content[0].text).output.ports;
  assert.ok(delivered[1].sample.length < large.sample.length);
  const {ports} = loginomFeedMetadata(reply, {tool, facts});
  assert.equal(ports[0].rowCount, 13);
  assert.equal(ports[0].preview.sample.length, 10);
  assert.equal(ports[0].preview.sampleComplete, false);
  assert.ok(ports[1].preview.sample.length > 0 && ports[1].preview.sample.length < 10);
  for (const table of ports.filter(table => table.preview)) {
    assert.deepEqual(table.preview.sample, delivered[table.index].sample.slice(0, table.preview.sample.length));
  }
  assert.equal(ports[2].preview, undefined);
  assert.ok(ports.reduce((size, table) => size+(table.preview ? Buffer.byteLength(JSON.stringify(table.preview)) : 0), 0) <= 12288);
  assert.deepEqual(reply, before);
});

test('runtime-omitted rows and tree ports never become previews', () => {
  const tool = 'dock_node_wait';
  const empty = port([], 0);
  const omitted = {...port([], 1), row_count:8, sample_complete:false};
  const tree = {...port([], 2), port_kind:'tree'};
  const reply = nodeResultReply(receipt({ports:[empty, omitted, tree]}), {userProfile:true, tool});
  const {ports} = loginomFeedMetadata(reply, {tool, facts});
  assert.equal(ports.length, 2);
  assert.deepEqual(ports[0].preview.sample, []);
  assert.equal(ports[0].preview.sampleComplete, true);
  assert.equal(ports[1].preview, undefined);
});

test('exports use only verified runtime files, never local paths or server destinations', () => {
  const tool = 'dock_node_wait';
  const reply = nodeResultReply(receipt({artifacts:[{artifact_id:'file-1', bytes:42, destination:'server/path'},
    {artifact_id:'unverified', bytes:2}]}), {userProfile:true, tool});
  const metadata = loginomFeedMetadata(reply, {tool, outputFiles:[{artifact_id:'file-1', name:'report.csv', path:'local/path'}]});
  assert.equal(metadata.kind, 'export');
  assert.deepEqual(metadata.files, [{artifactId:'file-1', name:'report.csv', bytes:42}]);
});

test('node errors retain native attribution and mask credentials without changing model text', () => {
  const tool = 'dock_node_wait';
  const failure = {code:'NODE_EXECUTION_FAILED', message:'Ошибка: credential-example', native:{source:'loginom_error_toast'}};
  const reply = nodeResultReply(receipt({status:'FAILED', failure, ports:[port([[cell('irrelevant')]])]}), {userProfile:true, tool});
  const before = reply.content[0].text;
  const metadata = loginomFeedMetadata(reply, {tool, facts, knownSecrets:['credential-example']});
  assert.deepEqual(metadata.error, {code:'NODE_EXECUTION_FAILED', message:'Ошибка: [redacted]', source:'loginom', attribution:'verified_node'});
  assert.equal(metadata.ports, undefined);
  assert.ok(before.includes('credential-example'));
  assert.equal(reply.content[0].text, before);
});

test('projection masks credential columns and recognizable tokens but preserves nulls', () => {
  const tool = 'dock_node_wait';
  const sensitive = {...port([[cell('abc')], [{type:'string', is_null:true, value:null}]]), schema:[{...column, name:'Password'}]};
  const ordinary = port([[cell('Bearer abc.def')], [cell('known-example')]], 1);
  const reply = nodeResultReply(receipt({ports:[sensitive, ordinary]}), {userProfile:true, tool});
  const {ports} = loginomFeedMetadata(reply, {tool, knownSecrets:['known-example']});
  assert.deepEqual(ports.map(table => table.preview.sample.map(row => row[0].value)), [['[redacted]', null], ['[redacted]', '[redacted]']]);
});

test('projection masks explicit secret names and keeps analytics keys visible', () => {
  const tool = 'dock_node_wait';
  const secretNames = ['db_pwd', 'dbPass', 'Ключ доступа', 'credential', 'api_key', 'apikey', 'apiKey',
    'secret', 'access_token', 'password', 'Пароль'];
  const visibleNames = ['compass', 'Ключ клиента', 'Ключ заказа', 'tokenizer', 'Ключ'];
  const schema = [...secretNames, 'service_auth', ...visibleNames].map((name, index) => ({
    ...column, name, index, label: name === 'service_auth' ? 'Ключ API' : column.label,
  }));
  const sample = {...port([schema.map(() => cell('visible'))]), schema};
  const reply = nodeResultReply(receipt({ports:[sample]}), {userProfile:true, tool});
  const {ports} = loginomFeedMetadata(reply, {tool});
  assert.deepEqual(ports[0].preview.sample[0].map(cell => cell.value),
    [...secretNames.map(() => '[redacted]'), '[redacted]', ...visibleNames.map(() => 'visible')]);
});

test('projection preserves identifiers that contain a known secret', () => {
  const tool = 'dock_node_wait';
  const sample = {...port([[cell('secret-example')]]), port_guid:'secret-example-port', execution_id:'secret-example-exec'};
  const artifact = {artifact_id:'secret-example-file', bytes:42};
  const outcome = receipt({ports:[sample], artifacts:[artifact], execution:{status:'completed', execution_id:sample.execution_id}});
  outcome.operation_id = 'secret-example-op';
  outcome.outcome.output.node = {...node, node_id:'secret-example-node'};
  const reply = nodeResultReply(outcome, {userProfile:true, tool});
  const metadata = loginomFeedMetadata(reply, {tool, knownSecrets:['secret-example'],
    facts:{...facts, node:{...facts.node, ref:outcome.outcome.output.node}},
    outputFiles:[{artifact_id:artifact.artifact_id, name:'report.csv'}]});
  assert.equal(metadata.operationId, outcome.operation_id);
  assert.equal(metadata.node.guid, outcome.outcome.output.node.node_id);
  assert.equal(metadata.executionId, sample.execution_id);
  assert.equal(metadata.ports[0].guid, sample.port_guid);
  assert.equal(metadata.files[0].artifactId, artifact.artifact_id);
  assert.equal(metadata.ports[0].preview.sample[0][0].value, '[redacted]');
});

test('projected text truncates at a Unicode code point boundary', () => {
  const tool = 'dock_node_wait';
  const label = 'a'.repeat(999) + '😀';
  const reply = nodeResultReply(receipt(), {userProfile:true, tool});
  const metadata = loginomFeedMetadata(reply, {tool, facts:{...facts, node:{...facts.node, label:label+'z'}}});
  assert.equal(metadata.node.label.isWellFormed(), true);
  assert.equal(metadata.node.label, label);
});

test('the block budget reduces preview rows before dropping limitations', () => {
  const tool = 'dock_node_wait';
  const warnings = Array.from({length:6}, (_, index) => index+'Ж'.repeat(999));
  const sample = port(Array.from({length:10}, (_, index) => [cell(index+'Ю'.repeat(499))]));
  const reply = nodeResultReply(receipt({ports:[sample], warnings}), {userProfile:true, tool});
  const {ports, limitations, ...rest} = loginomFeedMetadata(reply, {tool, facts});
  assert.deepEqual(limitations.slice(0, warnings.length), warnings);
  assert.equal(ports[0].rowCount, 10);
  assert.ok(ports[0].preview.sample.length > 0 && ports[0].preview.sample.length < 10);
  assert.deepEqual(ports[0].preview.sample, sample.sample.slice(0, ports[0].preview.sample.length));
  assert.equal(ports[0].preview.sampleComplete, false);
  assert.ok(Buffer.byteLength(JSON.stringify({...rest, ports, limitations})) <= 16 * 1024);
});

test('the block budget retains the matching busy snapshot even without previews', () => {
  const tool = 'dock_node_apply';
  const warnings = Array.from({length:8}, (_, index) => index+'Ж'.repeat(800)+'😀'.repeat(199));
  const reply = nodeResultReply(receipt({warnings}), {userProfile:true, tool});
  const busy = {version:1, windowId:'09a4db75-00cf-4ee0-912d-c252afbaba0f', operationId:'operation', active:false};
  const metadata = loginomFeedMetadata(reply, {tool, facts, busy});
  assert.equal(metadata.operationId, 'operation');
  assert.equal(metadata.status, 'SUCCEEDED');
  assert.deepEqual(metadata.busy, busy);
  assert.equal(loginomFeedMetadata(reply, {tool, facts, busy:{...busy, operationId:'other'}}).busy, undefined);
  assert.deepEqual(metadata.limitations, warnings.slice(0, metadata.limitations.length));
  assert.ok(metadata.limitations.length > 0 && metadata.limitations.length < warnings.length);
  assert.ok(Buffer.byteLength(JSON.stringify(metadata)) <= 16 * 1024);
});

test('Save publishes only the matching bounded busy snapshot, without changing its reply', () => {
  const reply={content:[{type:'text',text:'original Save receipt'}]};
  const save={action_key:'package.save_checkpoint',operation_id:'save-id',status:'AMBIGUOUS'};
  const busy={version:1,windowId:'09a4db75-00cf-4ee0-912d-c252afbaba0f',operationId:'save-id',active:true};
  assert.deepEqual(loginomSaveMetadata(save,{busy:{...busy,internalData:'not for the feed'}}),
    {v:1,operationId:'save-id',state:'settled',status:'AMBIGUOUS',busy});
  assert.equal(loginomSaveMetadata(save,{busy:{...busy,operationId:'old-save'}}),undefined);
  assert.deepEqual(reply.content,[{type:'text',text:'original Save receipt'}]);
});

test('the Save projector distinguishes confirmed absence from unknown presence without changing the receipt', () => {
  const reply={content:[{type:'text',text:'Save succeeded'}]};
  const path='/account/result.lgp', operationId='save-id';
  const save={action_key:'package.save_checkpoint',operation_id:operationId,status:'SUCCEEDED',
    output:{package_ref:{path,active_identity:path}}};
  const savedPackageGraph={status:'unavailable',package_path:path,save_operation_id:operationId};
  for (const fileExists of [false,null,true]) {
    const receipt=loginomSaveMetadata(save,{savedPackageGraph,savedFile:{fileExists}});
    const projected=withLoginomMetadata(reply,{receipt});
    assert.deepEqual(projected.content,reply.content);
    assert.equal(projected._meta.loginom.status,'SUCCEEDED');
    assert.deepEqual(projected._meta.loginom.evidence,[{kind:'saved',path},{kind:'savedFilePresence',fileExists}]);
  }
  assert.deepEqual(loginomSaveMetadata(save,{savedPackageGraph}).evidence,[{kind:'saved',path}]);
});

test('one Save projection keeps both graph evidence kinds, masks labels and fits the v1 budget', () => {
  const reply={content:[{type:'text',text:'Save succeeded'}]};
  const packagePath='/account/result.lgp', operationId='save-id';
  const save={action_key:'package.save_as',operation_id:operationId,status:'SUCCEEDED',
    output:{package_ref:{path:packagePath,active_identity:packagePath},reopened:true},trace:[{
      event:'reopened_package_observed',actual_path:packagePath,path_matches:true,graph_matches:true,graph:{nodes:['node-199']},
    }]};
  const busy={version:1,windowId:'09a4db75-00cf-4ee0-912d-c252afbaba0f',operationId,active:false};
  const receiptWindow={runtimeId:busy.windowId,documentId:'document',startSequence:1,confirmedSequence:2};
  const savedFileRead={kind:'savedFileRead',scope:'package',nodeCount:200,workflowGuidMatch:true,
    file:{mtime:'2026-11-27T15:00:00.000Z',size:10157,hash:'a'.repeat(64)}};
  const saved_labels=Array.from({length:200},(_,index)=>({node_id:'node-'+index,label:index===199?'Левое':'credential-example'+'Ж'.repeat(200)}));
  const savedPackageGraph={status:'compared',package_path:packagePath,save_operation_id:operationId,
    unchecked_sorting:[],saved_labels,changes:[{kind:'node_renamed',node_id:'node-199',before:'Слияние',saved:'Левое',
      observed_before_save:'Слияние',repair:{label:'Попросить исправить',prompt:'Проверить узел node-199'}}]};
  const savedFile={fileExists:true,evidence:savedFileRead};
  const receipt=loginomSaveMetadata(save,{busy,savedPackageGraph,savedFile,receiptWindow,knownSecrets:['credential-example']});
  const metadata=withLoginomMetadata(reply,{receipt})._meta.loginom;
  assert.equal(metadata.v,1);
  assert.deepEqual(metadata.busy,busy);
  assert.deepEqual(metadata.receiptWindow,receiptWindow);
  assert.deepEqual(metadata.evidence,[{kind:'saved',path:packagePath},
    {kind:'reopenedGraphRead',nodeCount:1,scope:'activeWorkflow'},{kind:'savedFilePresence',fileExists:true},savedFileRead]);
  const graph=metadata.savedPackageGraph;
  assert.equal(graph.truncated,true);
  assert.ok(graph.savedLabels.length<=32);
  assert.deepEqual(graph.savedLabels[0],{nodeId:'node-199',label:'Левое'});
  assert.equal(graph.changes[0].repair.label,'Попросить исправить');
  assert.doesNotMatch(JSON.stringify(graph),/credential-example/);
  assert.ok(Buffer.byteLength(JSON.stringify(graph))<=8*1024);
  assert.ok(Buffer.byteLength(JSON.stringify(metadata))<=16*1024);
  const mismatched=loginomSaveMetadata(save,{savedFile,savedPackageGraph:{...savedPackageGraph,save_operation_id:'other'}});
  assert.equal(mismatched.savedPackageGraph,undefined);
  assert.deepEqual(mismatched.evidence,[{kind:'saved',path:packagePath},{kind:'reopenedGraphRead',nodeCount:1,scope:'activeWorkflow'}]);
});
