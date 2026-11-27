import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createPackageStateReader } from '../lib/package-state.mjs';

function fixture() {
  const origin = 'https://loginom.test';
  const document = {};
  const owned = { PackageFileName: '', Package: {} };
  const other = { PackageFileName: 'user/other.lgp', Package: {} };
  const packages = [owned, other];
  const data = { time: 100, modified: false, onRead: () => {} };
  const session = {
    async IsPackageModified(proxy) {
      assert.equal(proxy, owned.Package);
      data.onRead();
      return data.modified;
    },
  };
  const connection = { Connected: true, UserName: 'user', Session: session };
  const map = {
    FServerConnection: connection,
    PackageNodes: { get Count() { return packages.length; }, Items: i => packages[i] },
  };
  const form = {
    FMapTree: map,
    Items: { Workspace: { getActiveTab: () => ({ Controller: { Node: { data: { node: other } } } }) } },
  };
  const receipt = {
    phase: 'verified', request: JSON.stringify({ session: 'chat' }), packageNode: owned,
    openConnection: connection, openServerSession: session,
    stepSession: { connection, nativeSession: session },
  };
  const globals = {
    document, location: { origin },
    bg: { app: { Version: '7.4.2', Application: { FInstance: { FMainForm: form } } } },
    __loginomDockPreparationV1: { document, id: 'doc', receipts: new Map([['prepare', receipt]]) },
  };
  const metadata = {
    sessionId: 'chat', workspaceReady: true, targetIdentity: { loginom_build: '7.4.2' },
    workspacePreparation: {
      operation_id: 'prepare',
      state: { document_id: 'doc', loginom_account: 'user', workflow_ref: { tab_tid: 'owned' } },
    },
  };
  const page = { url: () => origin, evaluate: (read, input) => runInNewContext(`(${read})(input)`, { ...globals, input, setTimeout, clearTimeout }) };
  const read = createPackageStateReader(metadata, origin, () => data.time);
  const snapshot = (save, busy) => read({ pages: () => [page] }, save, busy);
  const stepRefresh = () => {
    const { phase, request, packageNode, stepSession } = receipt;
    globals.__loginomDockPreparationV1.receipts.set('refresh', { phase, request, packageNode, stepSession, stepRefresh: true });
    metadata.workspacePreparation = { ...metadata.workspacePreparation, operation_id: 'refresh' };
  };
  return { snapshot, data, owned, packages, connection, page, stepRefresh };
}

test('reads the conversation draft even when another package is active', async () => {
  const { snapshot, data } = fixture();
  assert.deepEqual(await snapshot(), {
    open: true, path: null, modified: false, modifiedDetectedAt: null, lastSave: null, staleForSeconds: null,
  });
  data.time = 200;
  data.modified = true;
  assert.deepEqual(await snapshot(), {
    open: true, path: null, modified: true, modifiedDetectedAt: 200, lastSave: null, staleForSeconds: null,
  });
  data.time = 300;
  assert.equal((await snapshot()).modifiedDetectedAt, 200);
  data.modified = false;
  assert.equal((await snapshot()).modifiedDetectedAt, null);
  data.modified = true;
  assert.equal((await snapshot()).modifiedDetectedAt, 300);
});

test('reports confirmed Save independently of current dirty state and package closure', async () => {
  const { snapshot, data, owned, packages } = fixture();
  owned.PackageFileName = 'user\\result.lgp';
  const lastSave = { path: '/user/result.lgp', confirmedAt: 90 };
  assert.deepEqual(await snapshot(lastSave), {
    open: true, path: '/user/result.lgp', modified: false, modifiedDetectedAt: null, lastSave, staleForSeconds: null,
  });
  data.modified = true;
  assert.deepEqual(await snapshot(lastSave), {
    open: true, path: '/user/result.lgp', modified: true, modifiedDetectedAt: 100, lastSave, staleForSeconds: null,
  });
  packages.shift();
  assert.deepEqual(await snapshot(lastSave), {
    open: false, path: null, modified: null, modifiedDetectedAt: null, lastSave, staleForSeconds: null,
  });
});

test('keeps open state when dirty status is unavailable and rejects a changed native session', async () => {
  const { snapshot, data, connection } = fixture();
  data.modified = 'false';
  assert.deepEqual(await snapshot(), {
    open: true, path: null, modified: null, modifiedDetectedAt: null, lastSave: null, staleForSeconds: null,
  });
  data.modified = false;
  data.onRead = () => { connection.Session = {}; };
  assert.deepEqual(await snapshot(), {
    open: null, path: null, modified: null, modifiedDetectedAt: null, lastSave: null, staleForSeconds: null,
  });
});

test('reads the same package after existing_workflow replaces the preparation receipt', async () => {
  const { snapshot, data, owned, stepRefresh } = fixture();
  owned.PackageFileName = 'user/result.lgp';
  data.modified = true;
  const before = await snapshot();
  assert.equal(before.open, true);
  stepRefresh();
  data.time = 200;
  assert.deepEqual(await snapshot(), before);
});

test('returns the last confirmed observation with its age while the runtime is busy', async () => {
  const { snapshot, data, owned, page } = fixture();
  owned.PackageFileName = 'user/result.lgp';
  data.modified = true;
  assert.equal((await snapshot(undefined, true)).open, null);
  const confirmed = await snapshot();
  const evaluate = page.evaluate;
  page.evaluate = () => assert.fail('busy snapshot must not read the page');
  const lastSave = { path: '/user/result.lgp', confirmedAt: 150 };
  data.time = 200;
  assert.deepEqual(await snapshot(lastSave, true), { ...confirmed, lastSave, staleForSeconds: 0 });
  data.time = 2650;
  assert.deepEqual(await snapshot(lastSave, true), { ...confirmed, lastSave, staleForSeconds: 2 });
  page.evaluate = evaluate;
  data.modified = false;
  assert.deepEqual(await snapshot(lastSave), {
    ...confirmed, modified: false, modifiedDetectedAt: null, lastSave, staleForSeconds: null,
  });
});

test('bounds a stalled browser evaluation and permits the next read', async t => {
  const { snapshot, page } = fixture();
  const evaluate = page.evaluate;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  page.evaluate = () => new Promise(() => {});
  const pending = snapshot();
  t.mock.timers.tick(4999);
  assert.deepEqual(await pending, {
    open: null, path: null, modified: null, modifiedDetectedAt: null, lastSave: null, staleForSeconds: null,
  });
  page.evaluate = evaluate;
  assert.equal((await snapshot()).open, true);
});
