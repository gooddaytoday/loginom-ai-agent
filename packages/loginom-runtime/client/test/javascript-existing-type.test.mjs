import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {makeJavascriptExistingGraphTypeCode, readJavascriptExistingGraphType} from '../lib/javascript-existing-type.mjs';

const prepared = {document_id: 'document',
  workflow_ref: {workflow_id: 'workflow', tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
    prefix: 'MF;TF-1', navigation_path: [{tid: 'MF;TF-1;path', label: 'Scenario'}]},
  node: {document_id: 'document', workflow_id: 'workflow', node_id: 'node'}};

test('existing type read brackets exact graph owner and refuses another icon', async () => {
  const root = {contains: shape => shape === element};
  const element = {isConnected: true, getAttribute: () => 'MF;TF-1;Graph;node'};
  const native = {FGuid: 'node', FIconCls: 'bg-vendor-icon-javascript', FCell: {}};
  const diagram = {FNodes: {FCollection: [native]}, FmxGraph: {container: root,
    view: {getState: () => ({shape: {node: element}})}}};
  const bg = {app: {Application: {FInstance: {FMainForm: {Items: {Workspace: {
    getActiveTab: () => ({Controller: {FController: {FDiagram: diagram}}})}}}}}}};
  const page = {evaluate: async (fn, binding) => vm.runInNewContext('(' + fn.toString() + ')(binding)',
    {binding, bg})};
  const nodeContext = async () => ({verified: true, surface: 'graph', node_id: 'node',
    document_id: 'document', workflow_id: 'workflow', tid: 'MF;TF-1;Graph;node'});
  const observed = await readJavascriptExistingGraphType(page, prepared, nodeContext);
  assert.equal(observed.verified, true);
  assert.equal(observed.icon_class, 'bg-vendor-icon-javascript');
  native.FIconCls = 'bg-vendor-icon-calculator';
  await assert.rejects(() => readJavascriptExistingGraphType(page, prepared, nodeContext), /not the owned JavaScript type/);
  assert.equal(typeof vm.runInNewContext('(' + makeJavascriptExistingGraphTypeCode(prepared) + ')'), 'function');
});
