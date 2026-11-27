import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeBuildFacts, saveBuildFacts} from '../lib/build-facts.mjs';
import {nodeResultReply} from '../lib/node-result-reply.mjs';
import {linkPage, runtime} from './support/executor-fixture.mjs';

const path = '/user/data/packages/ABC.lgp';
const scope = {document_id: 'document', workflow_id: 'workflow'};
const navigation = ['ABC', 'Module', 'Scenario'];
const node = {...scope, node_id: 'result'};
const port = {port: 0, port_guid: 'out', execution_id: 'exec', fresh: true,
  freshness_basis: 'completed_execution_port_source', row_count: 0, sample: [], schema: []};
const job = ports => ({operation_id: 'calculate', state: 'settled', outcome: {
  operation_id: 'calculate', action_key: 'node.apply', status: 'SUCCEEDED', cleanup_complete: true,
  output: {node, execution: {status: 'completed', execution_id: 'exec'}, output: {status: 'complete', execution_id: 'exec', ports}},
}});

test('settled wait proves execution and exact rows even though the structured model reply omits the ports', () => {
  const result = job([port]);
  const reply = nodeResultReply(result, {userProfile: true, tool: 'dock_node_wait'});
  assert.equal(reply.structuredContent.output.ports, undefined);
  assert.deepEqual(nodeBuildFacts(result), {kind: 'node', ...scope, operation_id: 'calculate',
    execution: {source: 'node.execution', execution_id: 'exec', node_id: 'result'},
    final_port_rows: {source: 'node.output.port', execution_id: 'exec', port: 0, port_guid: 'out', count: 0}});
  for (const ports of [[], [port, {...port, port: 1}], [{...port, execution_id: 'older'}],
    [{...port, fresh: false}], [{...port, row_count: undefined}]]) {
    assert.equal(nodeBuildFacts(job(ports)).final_port_rows, undefined);
  }
  const running = {...result, state: 'running'};
  assert.equal(nodeBuildFacts(running), undefined);
});

for (const [action, reopen] of [['package.save_as', true], ['package.save_checkpoint', false]]) {
  test(action + ' keeps Save, graph comparison and reopen proofs separate', async () => {
    const page = linkPage();
    const outcome = await runtime(page).run(action, {path, conflict_policy: 'fail'}, {operationId: 'save'});
    const facts = saveBuildFacts(outcome, {...scope, path, action_key: action, navigation});
    assert.deepEqual(facts, {kind: 'save', ...scope, operation_id: 'save',
      save_completed: {source: reopen ? 'executor.save_flow_completed' : 'save_completed'},
      node_count: {source: 'executor.save_graph', navigation, count: 2},
      ...(reopen ? {reopened: {source: 'reopened'}, package_path: {source: 'executor.reopened_package_observed', path}} : {})});
    assert.equal(saveBuildFacts(outcome, {...scope, path: '/user/other/ABC.lgp', action_key: action, navigation}), undefined);
    assert.equal(facts.persisted_content_verified, undefined);
  });
}

test('a mismatched reopened graph yields no package facts', async () => {
  const page = linkPage();
  page.onReopen = () => page.nodes.pop();
  const action = 'package.save_as';
  const outcome = await runtime(page).run(action, {path, conflict_policy: 'fail'}, {operationId: 'save'});
  assert.equal(outcome.status, 'AMBIGUOUS');
  assert.equal(saveBuildFacts(outcome, {...scope, action_key: action, path, navigation}), undefined);
});
