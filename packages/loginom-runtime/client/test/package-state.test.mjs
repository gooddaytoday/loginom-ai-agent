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
      assert.equal(proxy, packages[0].Package);
      await data.onRead();
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
  const stepRefresh = (tabTid = 'owned', packageNode = owned) => {
    const { phase, request, stepSession } = receipt;
    globals.__loginomDockPreparationV1.receipts.set('refresh', { phase, request, packageNode, stepSession, stepRefresh: true });
    metadata.workspacePreparation = {
      operation_id: 'refresh',
      state: { ...metadata.workspacePreparation.state, workflow_ref: { tab_tid: tabTid } },
    };
  };
  return { snapshot, data, owned, packages, connection, page, stepRefresh, metadata };
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
  const unknown = {
    open: null, path: null, modified: null, modifiedDetectedAt: null, lastSave: null, staleForSeconds: null,
  };
  assert.deepEqual(await snapshot(), unknown);
  assert.deepEqual(await snapshot(undefined, true), unknown);
});

test('keeps the dirty timestamp when existing_workflow refreshes the receipt for another workflow tab', async () => {
  const { snapshot, data, owned, stepRefresh } = fixture();
  owned.PackageFileName = 'user/result.lgp';
  data.modified = true;
  const before = await snapshot();
  assert.equal(before.open, true);
  stepRefresh('another-workflow');
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

test('a busy snapshot is unknown until the current preparation has been observed', async () => {
  const { snapshot, data, owned, packages, metadata, page, stepRefresh } = fixture();
  owned.PackageFileName = 'user/result.lgp';
  data.modified = true;
  const confirmed = await snapshot();
  const lastSave = { path: confirmed.path, confirmedAt: 150 };
  const unknown = {
    open: null, path: null, modified: null, modifiedDetectedAt: null, lastSave, staleForSeconds: null,
  };
  const evaluate = page.evaluate;
  page.evaluate = () => assert.fail('busy snapshot must not read the page');
  metadata.workspaceReady = false;
  assert.deepEqual(await snapshot(lastSave, true), unknown);
  metadata.workspaceReady = true;
  packages[0] = { PackageFileName: 'user/new.lgp', Package: {} };
  stepRefresh('another-workflow', packages[0]);
  assert.deepEqual(await snapshot(lastSave, true), unknown);

  page.evaluate = evaluate;
  data.modified = false;
  const fresh = { ...unknown, open: true, path: '/user/new.lgp', modified: false };
  assert.deepEqual(await snapshot(lastSave), fresh);
  data.time = 2300;
  assert.deepEqual(await snapshot(lastSave, true), { ...fresh, staleForSeconds: 2 });
});

test('an incomplete read preserves the last confirmed dirty state and its age', async () => {
  const { snapshot, data, owned } = fixture();
  owned.PackageFileName = 'user/result.lgp';
  data.modified = true;
  const confirmed = await snapshot();
  const lastSave = { path: '/user/result.lgp', confirmedAt: 1500 };
  data.time = 1600;
  data.modified = undefined;
  assert.deepEqual(await snapshot(lastSave), { ...confirmed, lastSave, staleForSeconds: 1 });
  data.time = 2650;
  assert.deepEqual(await snapshot(), { ...confirmed, staleForSeconds: 2 });
  assert.deepEqual(await snapshot(undefined, true), { ...confirmed, staleForSeconds: 2 });
  data.modified = false;
  const clean = await snapshot();
  assert.equal(clean.modified, false);
  assert.equal(clean.modifiedDetectedAt, null);
  assert.equal(clean.staleForSeconds, null);
  data.time = 4000;
  data.modified = undefined;
  assert.deepEqual(await snapshot(), { ...clean, staleForSeconds: 1 });
  owned.PackageFileName = 'user/another.lgp';
  assert.deepEqual(await snapshot(), { ...clean, path: '/user/another.lgp', modified: null });
});

test('does not attach an old dirty confirmation to a different pathless draft', async () => {
  const { snapshot, data, owned, packages, stepRefresh } = fixture();
  data.modified = true;
  assert.equal((await snapshot()).modified, true);
  packages[0] = { ...owned, Package: {} };
  stepRefresh('another-workflow', packages[0]);
  data.modified = undefined;
  assert.deepEqual(await snapshot(), {
    open: true, path: null, modified: null, modifiedDetectedAt: null, lastSave: null, staleForSeconds: null,
  });
});

test('times out a native read without starting another until the native reply settles', async t => {
  const { snapshot, data, stepRefresh } = fixture();
  data.modified = true;
  const confirmed = await snapshot();
  const blocked = Promise.withResolvers();
  let reads = 0;
  data.onRead = () => {
    reads++;
    return blocked.promise;
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  data.time = 3200;
  const first = snapshot();
  t.mock.timers.tick(3000);
  const timedOut = await first;
  stepRefresh('another-workflow');
  data.time = 4500;
  const retry = snapshot();
  t.mock.timers.tick(3000);
  const whilePending = await retry;
  assert.equal(reads, 1);
  assert.deepEqual(timedOut, { ...confirmed, staleForSeconds: 3 });
  assert.deepEqual(whilePending, { ...confirmed, staleForSeconds: 4 });
  assert.deepEqual(await snapshot(undefined, true), whilePending);

  blocked.reject(new Error('Native read failed'));
  await new Promise(resolve => setImmediate(resolve));
  data.onRead = () => { reads++; };
  data.modified = false;
  assert.deepEqual(await snapshot(), { ...confirmed, modified: false, modifiedDetectedAt: null });
  assert.equal(reads, 2);
});

test('times out a stalled evaluation and does not poll again until it settles', async t => {
  const { snapshot, page } = fixture();
  const evaluate = page.evaluate;
  const blocked = Promise.withResolvers();
  let evaluations = 0;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  page.evaluate = () => {
    evaluations++;
    return blocked.promise;
  };
  const unknown = {
    open: null, path: null, modified: null, modifiedDetectedAt: null, lastSave: null, staleForSeconds: null,
  };
  const pending = snapshot();
  t.mock.timers.tick(4000);
  assert.deepEqual(await pending, unknown);
  const retry = snapshot();
  t.mock.timers.tick(4000);
  assert.deepEqual(await retry, unknown);
  assert.equal(evaluations, 1);
  blocked.resolve(null);
  await blocked.promise;
  page.evaluate = evaluate;
  assert.equal((await snapshot()).open, true);
});

test('an outer evaluation timeout retains confirmation only for the same preparation', async t => {
  const { snapshot, data, owned, packages, page, stepRefresh } = fixture();
  owned.PackageFileName = 'user/result.lgp';
  data.modified = true;
  const confirmed = await snapshot();
  const lastSave = { path: confirmed.path, confirmedAt: 150 };
  const evaluate = page.evaluate;
  let blocked = Promise.withResolvers();
  let evaluations = 0;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  page.evaluate = () => {
    evaluations++;
    return blocked.promise;
  };
  data.time = 4300;
  const stalled = snapshot(lastSave);
  t.mock.timers.tick(4000);
  assert.deepEqual(await stalled, { ...confirmed, lastSave, staleForSeconds: 4 });
  data.time = 5300;
  assert.deepEqual(await snapshot(lastSave), { ...confirmed, lastSave, staleForSeconds: 5 });
  assert.equal(evaluations, 1);
  blocked.resolve(null);
  await blocked.promise;

  blocked = Promise.withResolvers();
  const replaced = snapshot(lastSave);
  packages[0] = { PackageFileName: 'user/new.lgp', Package: {} };
  stepRefresh('another-workflow', packages[0]);
  t.mock.timers.tick(4000);
  const unknown = {
    open: null, path: null, modified: null, modifiedDetectedAt: null, lastSave, staleForSeconds: null,
  };
  assert.deepEqual(await replaced, unknown);
  assert.deepEqual(await snapshot(lastSave), unknown);
  assert.equal(evaluations, 2);
  blocked.resolve(null);
  await blocked.promise;
  page.evaluate = evaluate;
  data.modified = false;
  assert.deepEqual(await snapshot(lastSave), { ...unknown, open: true, path: '/user/new.lgp', modified: false });
});
