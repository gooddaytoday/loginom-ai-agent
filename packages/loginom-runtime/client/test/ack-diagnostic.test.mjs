import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {inspectNodeTarget, prepareNodeTarget} from '../lib/node-target.mjs';
import {createExecutionJournal} from '../lib/execution-journal.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {applyNode, reconcileNodeWorkflow, releaseNodeApply} from '../lib/node-apply.mjs';

const ackLabel = 'Итог https://example.org/путь_Кириллица';
const ackNode = {document_id:'doc', workflow_id:'wf', node_id:'target'};
const ackWorkflow = {workflow_id:'wf', tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix:'MF;TF-1', navigation_path:[{tid:'path',label:'Сценарий'}]};
const ackRequest = () => ({operation_id:'ack', contract_revision:'1.0.0', document_id:'doc', workflow_ref:ackWorkflow,
  target:{kind:'new',type:'imports.text',label:ackLabel,position:{x:96,y:80}},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'done',
  read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});

for (const site of ['workflow','release-before-target','release-known-node','apply-checkpoint'])
for (const corruptAck of [false,true])
test(`node.apply real journal ACK: ${site}, corrupt=${corruptAck}`, async t => {
  const directory = await mkdtemp(join(tmpdir(),'lab1041-ack-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const journal = createExecutionJournal({directory,metadata:{sessionId:'offline-lab1041'}});
  const events = [];
  const record = async event => {
    events.push(structuredClone(event));
    const saved = await journal(event);
    if(corruptAck && (site==='workflow' ? event.phase==='node_phase_completed' : site==='apply-checkpoint' ? event.phase==='node_checkpoint' : event.phase==='node_operation_released'))
      saved.signature='corrupt-signature';
    return saved;
  };
  const request = ackRequest();
  const handlers = new Map([['imports.text',{revision:'1',modes:['delimited'],validate:()=>{},configure:async()=>({verified:true,cleanup_complete:true})}]]);
  const operation = {id:'ack',nodeApply:{request,signature:'signature',phases:[{phase:'source'}],pending:{phase:site==='workflow'?'workflow':site==='release-before-target'?'target':'open',receipt_id:'ack:workflow'},
    node:site==='release-known-node'?ackNode:null,execution:{status:'not_requested',execution_id:null},output:{},effect_possible:true}};
  const graph = {complete:true,document_id:'doc',workflow_ref:ackWorkflow,nodes:[{ref:ackNode,type:'imports.text',label:ackLabel,position:{x:96,y:80},inputs:[],outputs:[0]}],links:[],foreign_links:[]};
  const proof = {verified:true,cleanup_complete:true,node:ackNode,node_context:ackNode,graph,target_state:'found',cleanup:{wizard_closed:true}};
  const run = async () => {
    if(site==='workflow') {
      const receipt = {status:'SUCCEEDED',verified:true,cleanup_complete:true,document_id:'doc',workflow_ref:ackWorkflow};
      return reconcileNodeWorkflow({operation,record,adapter:{readWorkflowReceipt:async()=>({output:{state:'completed',receipt}}),verifyWorkflow:async()=>({...receipt,effect_possible:false})}});
    }
    if(site!=='apply-checkpoint')return releaseNodeApply({operation,handlers,record,releaseBeforeTarget:async()=>proof,drivers:{releasePending:async()=>proof}});
    delete operation.nodeApply;
    delete request.target.label;
    const ok = async()=>({verified:true,cleanup_complete:true,effect_possible:false});
    return applyNode({request,operation,handlers,record,drivers:{verifySource:ok,prepareTarget:async()=>({...await ok(),node:ackNode,target:{node:graph.nodes[0]}}),mapPorts:ok,openWizard:ok,
      finish:async mode=>({...await ok(),mode,execution_started:false,execution_id:null}),waitExecution:ok,readOutput:ok}});
  };
  if(corruptAck && site!=='apply-checkpoint') {
    await assert.rejects(run,/journal acknowledgement differs/);
    assert.ok(operation.nodeApply.pending);
  } else {
    const result = await run();
    assert.equal(site==='workflow'?result:result.status,site==='workflow'?true:corruptAck?'AMBIGUOUS':site==='apply-checkpoint'?'SUCCEEDED':'FAILED',JSON.stringify(result));
    if(!corruptAck)assert.equal(operation.nodeApply.pending,null);
  }
  assert.ok(events.some(event=>site==='workflow'?event.phase==='node_phase_completed':site==='apply-checkpoint'?event.phase==='node_checkpoint':event.phase==='node_operation_released'));
  assert.equal(graph.nodes[0].label,ackLabel);
});

for (const url of ['https://creativecommons.org/licenses/by/4.0/', 'https://person:private-userinfo@example.org/path?access_token=private-query#token=private-fragment'])
for (const corruptAck of [false, true])
test(`Export link receipt through the real journal: ${url.includes('person:') ? 'secret' : 'public'} URL, corrupt ACK=${corruptAck}`, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lab1017-ack-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  const ref = node_id => ({document_id:'doc', workflow_id:'wf', node_id});
  const workflow = {workflow_id:'wf', tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix:'MF;TF-1', navigation_path:[{tid:'path', label:'Сценарий'}]};
  // These labels come from LAB-997 wholesale events.jsonl:55 and :75.
  const sourceLabel = 'C001…C440 номер исходной data-строки технический ключ не идентичность. DOI 10.24432/C5030X. ' + url;
  const targetLabel = 'Итог 440 клиентов концентрация без смешения с размером';
  const graph = {complete:true, document_id:'doc', workflow_ref:workflow, dom_epoch:1,
    nodes:[{ref:ref('source'), type:'transform.sorting', label:sourceLabel, position:{x:80,y:80}, inputs:[0], outputs:[0]}], links:[], foreign_links:[]};
  const request = {document_id:'doc', workflow_ref:workflow,
    target:{kind:'new', type:'exports.text', label:targetLabel, position:{x:400,y:80}},
    inputs:[{source:ref('source'), output:0, input:0}]};
  const calls = [];
  const adapter = {
    observe:async () => structuredClone(graph),
    preflight:async () => {},
    positionMatches:(node, position) => node.position.x === position.x && node.position.y === position.y,
    mutate:async effect => {
      calls.push(effect.kind);
      if (effect.kind === 'create') graph.nodes.push({ref:ref('target'), type:'exports.text', label:targetLabel, position:effect.parameters.position, inputs:[0], outputs:[]});
      if (effect.kind === 'connect') {
        graph.links.push(effect.parameters.edge);
        return {status:'SUCCEEDED', cleanup_complete:true, effect_possible:true,
          output:{link_ref:{kind:'link', tid:'MF;TF-1;Graph;' + sourceLabel.replaceAll(' ', '_') + '|Output_Data-0|' + targetLabel.replaceAll(' ', '_') + '|Input_Data-0'}}};
      }
      return {status:'SUCCEEDED', cleanup_complete:true, effect_possible:true};
    },
  };
  const operation = {id:'export', deadline:Date.now()+60000};
  const record = createExecutionJournal({directory, metadata:{sessionId:'offline-lab1017'}});
  const result = await prepareNodeTarget({request, operation, adapter, record:async event => {
    const ack = await record(event);
    if (corruptAck && ack.target_state?.pending?.receipt?.output?.link_ref)
      ack.target_state.pending.receipt.output.link_ref.tid = 'different-link';
    return ack;
  }});
  assert.deepEqual(calls, ['create', 'connect']);
  assert.equal(graph.nodes.filter(node => node.type === 'exports.text').length, 1);
  assert.equal(result.status, corruptAck ? 'AMBIGUOUS' : 'SUCCEEDED', result.error);
  assert.equal(graph.nodes[0].label, sourceLabel);
  if (corruptAck) {
    assert.match(result.error, /journal acknowledgement differs/);
    assert.equal(result.cleanup_complete, false);
    assert.ok(operation.targetPhase.pending);
  } else {
    assert.equal(operation.targetPhase.pending, null);
    assert.deepEqual(result.effects.map(effect => [effect.kind, effect.verified]), [['create', true], ['connect', true]]);
    assert.ok(operation.targetPhase.receipts[1].receipt.output.link_ref.tid.includes(targetLabel.replaceAll(' ', '_')));
  }
  const journal = await readFile(join(directory, 'execution-events.jsonl'), 'utf8');
  assert.doesNotMatch(journal, /private-userinfo|private-query|private-fragment/);
  if (!url.includes('person:')) assert.match(journal, /%D0%98%D1%82%D0%BE%D0%B3/);
});

function exportFixture(sourceLabel, targetLabel, directory) {
  const ref = node_id => ({document_id:'doc', workflow_id:'wf', node_id});
  const workflow = {workflow_id:'wf', tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix:'MF;TF-1', navigation_path:[{tid:'path', label:'Сценарий'}]};
  const graph = {complete:true, document_id:'doc', workflow_ref:workflow, dom_epoch:1,
    nodes:[{ref:ref('source'), type:'transform.sorting', label:sourceLabel, position:{x:80,y:80}, inputs:[0], outputs:[0]}], links:[], foreign_links:[]};
  const tid = 'MF;TF-1;Graph;' + sourceLabel.replaceAll(' ', '_') + '|Output_Data-0|' + targetLabel.replaceAll(' ', '_') + '|Input_Data-0';
  const f = {graph, tid, calls:[], lostConnect:false,
    request:{document_id:'doc', workflow_ref:workflow, target:{kind:'new', type:'exports.text', label:targetLabel, position:{x:400,y:80}},
      inputs:[{source:ref('source'), output:0, input:0}]},
    operation:{id:'export', deadline:Date.now()+60000},
    record:createExecutionJournal({directory, metadata:{sessionId:'offline-lab1017'}})};
  f.adapter = {
    observe:async () => structuredClone(graph),
    preflight:async () => {},
    positionMatches:(node, position) => node.position.x === position.x && node.position.y === position.y,
    mutate:async effect => {
      f.calls.push(effect.kind);
      if (effect.kind === 'create') graph.nodes.push({ref:ref('target'), type:'exports.text', label:targetLabel, position:effect.parameters.position, inputs:[0], outputs:[]});
      if (effect.kind !== 'connect') return {status:'SUCCEEDED', cleanup_complete:true, effect_possible:true};
      graph.links.push(effect.parameters.edge);
      if (f.lostConnect) throw Error('lost connect reply');
      return {status:'SUCCEEDED', cleanup_complete:true, effect_possible:true, output:{link_ref:{kind:'link', tid}}};
    },
  };
  return f;
}

test('JSON-shaped target label keeps the journal ACK exact', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lab1017-ack-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  for (const label of ['[1, 2]', '[1, 2, 3]']) {
    const f = exportFixture('Источник', label, directory);
    const result = await prepareNodeTarget({request:f.request, operation:f.operation, adapter:f.adapter, record:f.record});
    assert.equal(result.status, 'SUCCEEDED', result.error);
    assert.deepEqual(f.calls, ['create', 'connect']);
  }
});

test('lost connect reply: inspection accepts the canonicalized journal ACK of a Cyrillic link after a URL', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lab1017-ack-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  const f = exportFixture('DOI 10.24432/C5030X. https://creativecommons.org/licenses/by/4.0/', 'Итог 440 клиентов', directory);
  f.lostConnect = true;
  assert.equal((await prepareNodeTarget({request:f.request, operation:f.operation, adapter:f.adapter, record:f.record})).status, 'AMBIGUOUS');
  f.adapter.reconcile = async () => ({completed:true, verified:true, cleanup_complete:true,
    receipt:{status:'SUCCEEDED', cleanup_complete:true, effect_possible:true, output:{link_ref:{kind:'link', tid:f.tid}}}});
  const result = await inspectNodeTarget({request:f.request, operation:f.operation, adapter:f.adapter, record:f.record, deadline:Date.now()+60000});
  assert.equal(result.phase, 'target_partial', result.error);
  assert.equal(f.operation.targetPhase.pending, null);
  const resumed = await prepareNodeTarget({request:f.request, operation:f.operation, adapter:f.adapter, record:f.record});
  assert.equal(resumed.status, 'SUCCEEDED', resumed.error);
  assert.deepEqual(f.calls, ['create', 'connect']);
});

test('secret URL data remains redacted', () => {
  const redactor = createRedactor(['known-secret-value']);
  for (const value of [
    'https://person:private-userinfo@example.org/path',
    'https://example.org/path?access_token=private-query',
    'https://example.org/path#token=private-fragment',
    'https://example.org/known-secret-value',
  ]) assert.doesNotMatch(redactor.text(value), /private-userinfo|private-query|private-fragment|known-secret-value/);
});
