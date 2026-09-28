import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {bindJavascriptPackage, javascriptPackageBindingRequest, observeJavascriptPackageBinding} from './javascript-package-binding.mjs';

const path = '/jsteach/js-g2-9150c962-ad60-4cd4-a13e-bcba89b982d8/JavaScript-9150c962-ad60-4cd4-a13e-bcba89b982d8.lgp';
function fixture(saved = true) {
  const document = {};
  const prepared = {status: 'READY', document_id: 'doc', workflow_ref: {workflow_id: 'workflow', prefix: 'MF;TF-1', tab_tid: 'tab'},
    package_ref: {persisted: saved, path: saved ? path : null}};
  const element = tid => ({isConnected: true, getAttribute: name => name === 'data-tid' ? tid : null,
    classList: {contains: name => name === 'x-tab-active'}});
  const packageNode = {PackageFileName: saved ? path : ''}, workflow = {ParentNode: packageNode};
  const tab = element('tab'), container = element('MF;TF-1;ModelForm;cmpDiagram');
  const card = {Controller: {Node: {data: {node: workflow}}, FController: {FDiagram: {FmxGraph: {container}}}}};
  const receipt = {phase: 'verified', workflowId: 'workflow', packageNode, tab, nodeTargetWorkflowNode: workflow};
  const preparation = {document, id: 'doc', receipts: new Map([['r', receipt]])};
  const map = {FServerConnection: {UserName: 'jsteach', Connected: true}, PackageNodes: {Count: 1, Items: () => packageNode}};
  const app = {Version: '7.4.2', Application: {FInstance: {FMainForm: {FMapTree: map, Items: {Workspace: {getActiveTab: () => card}}}}}};
  const location = {origin: 'http://logi-test-plan.bg.local'};
  const context = vm.createContext({document, location, Map, bg: {app}, __loginomDockPreparationV1: preparation});
  const evaluate = (fn, args) => vm.runInContext('(' + fn.toString() + ')', context)(args);
  const page = {evaluateHandle: async (fn, args) => evaluate(fn, args)};
  const request = () => javascriptPackageBindingRequest({prepared, account: 'jsteach', ...(saved ? {savedPath: path} : {})});
  return {page, prepared, packageNode, workflow, tab, container, card, receipt, preparation, map, app, location,
    request, observe: extra => evaluate(observeJavascriptPackageBinding, {...request(), ...extra})};
}

for (const saved of [false, true]) test('serialized native binding admits ' + (saved ? 'exact saved package' : 'owned draft'), async () => {
  const f = fixture(saved);
  const owner = await bindJavascriptPackage({page: f.page, prepared: f.prepared, account: 'jsteach', ...(saved ? {savedPath: path} : {})});
  assert.equal(owner.packageNode, f.packageNode);
  const proof = f.observe({previous: owner, checkOnly: true});
  assert.equal(proof.verified, true);
  assert.equal(proof.package_path, saved ? path : null);
  assert.equal('packageNode' in proof, false);
});

test('saved request is never admitted through draft mode', async () => {
  const f = fixture();
  await assert.rejects(bindJavascriptPackage({page: f.page, prepared: f.prepared, account: 'jsteach'}), /draft required/);
  const draft = fixture(false);
  await assert.rejects(bindJavascriptPackage({page: draft.page, prepared: draft.prepared, account: 'jsteach', savedPath: path}), /saved JavaScript package/);
});

test('request identity is copied before asynchronous browser observation', () => {
  const f = fixture(), admitted = f.request();
  f.prepared.workflow_ref.prefix = 'foreign';
  f.prepared.package_ref.path = '/foreign.lgp';
  assert.equal(admitted.prepared.workflow_ref.prefix, 'MF;TF-1');
  assert.equal(admitted.prepared.package_ref.path, path);
});

for (const savedPath of [null, '', '/jsteach/package.lgp', path.replace('/jsteach/', '/other/'), path + '/..'])
  test('saved path scope refuses ' + JSON.stringify(savedPath), () => {
    const f = fixture();f.prepared.package_ref.path = savedPath;
    assert.throws(() => javascriptPackageBindingRequest({prepared: f.prepared, account: 'jsteach', savedPath}));
  });

const faults = {
  origin: f => { f.location.origin = 'http://foreign'; },
  build: f => { f.app.Version = '7.4.3'; },
  account: f => { f.map.FServerConnection.UserName = 'other'; },
  disconnected: f => { f.map.FServerConnection.Connected = false; },
  document: f => { f.preparation.document = {}; },
  documentId: f => { f.preparation.id = 'other'; },
  packages: f => { f.map.PackageNodes.Count = 2; },
  path: f => { f.packageNode.PackageFileName = path.replace('JavaScript-', 'Other-'); },
  unpersisted: f => { f.packageNode.PackageFileName = ''; },
  receipt: f => { f.receipt.phase = 'prepared'; },
  duplicate: f => { f.preparation.receipts.set('duplicate', {...f.receipt}); },
  packageObject: f => { f.map.PackageNodes.Items = () => ({...f.packageNode}); },
  workflowObject: f => { f.receipt.nodeTargetWorkflowNode = {...f.workflow}; },
  detachedTab: f => { f.tab.isConnected = false; },
  inactiveTab: f => { f.tab.classList.contains = () => false; },
  tabId: f => { f.tab.getAttribute = () => 'other'; },
  detachedGraph: f => { f.container.isConnected = false; },
  prefix: f => { f.container.getAttribute = () => 'MF;TF-2;ModelForm;cmpDiagram'; },
  ancestry: f => { f.workflow.ParentNode = {}; },
  cycle: f => { f.workflow.ParentNode = f.workflow; },
};
for (const [name, change] of Object.entries(faults)) test('native package binding refuses ' + name, () => {
  const f = fixture();change(f);
  assert.throws(() => f.observe(), /JavaScript package/);
});

test('matching identifiers do not allow replacement of a retained native owner', () => {
  const f = fixture(), owner = f.observe();
  f.card.Controller = {...f.card.Controller};
  assert.throws(() => f.observe({previous: owner, checkOnly: true}), /native owner replaced/);
});

test('server Windows path separator is normalized without changing case or resolving dot segments', () => {
  const f = fixture();
  f.packageNode.PackageFileName = path.slice(1).replaceAll('/', '\\');
  assert.equal(f.observe({checkOnly: true}).package_path, path);
  f.packageNode.PackageFileName = path.replace('/JavaScript-', '/./JavaScript-');
  assert.throws(() => f.observe());
});
