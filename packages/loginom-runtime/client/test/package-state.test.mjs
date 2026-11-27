import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createPackageStateReader, packageTarget, readPackageState } from '../lib/package-state.mjs';

function fixture() {
  const origin = 'https://loginom.test';
  const owned = { PackageFileName: '', Package: {}, ReadOnly: false, HasRunningNodes: () => false };
  const other = { PackageFileName: 'user/other.lgp', Package: {} };
  const packages = [owned, other];
  const data = { time: 100, modified: false, active: other, onRead: () => {}, onSave: () => {}, clicks: 0 };
  let menuOpen = false;
  const button = click => ({ getClientRects: () => [1], closest: () => null, click });
  const document = { querySelectorAll(selector) {
    if (selector.includes('btnPackagesMenu')) return [button(() => { menuOpen = true; })];
    if (/btnSave(?:As)?Package/.test(selector) && menuOpen)
      return [button(() => { menuOpen = false; data.clicks++; data.onSave(selector); })];
    return [];
  } };
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
    Items: { Workspace: { getActiveTab: () => ({ Controller: { Node: { data: { node: data.active } } } }) } },
  };
  const receipt = {
    phase: 'verified', request: JSON.stringify({ session: 'chat' }), packageNode: owned,
    openConnection: connection, openServerSession: session,
  };
  const globals = {
    document, location: { origin }, getComputedStyle: () => ({ visibility: 'visible' }),
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
  const context = { pages: () => [page] };
  const snapshot = (save) => read(context, save);
  const save = (path) => page.evaluate(readPackageState, { ...packageTarget(metadata, context, origin).owner, save: { path } });
  return { snapshot, save, data, owned, packages, connection };
}

test('native Save only targets the active owned path and receipts confirmed clean readback', async () => {
  const { save, data, owned, snapshot, connection } = fixture();
  const path = '/user/package.lgp';
  owned.PackageFileName = path;
  data.modified = true;
  assert.equal(await save(path), null);
  data.active = owned;
  assert.equal(await save('/user/other.lgp'), null);
  assert.equal(data.clicks, 0);
  data.onSave = () => { data.modified = false; };
  const result = await save(path);
  assert.equal(data.clicks, 1);
  assert.equal(result.status, 'saved');
  assert.equal(result.lastSave.path, path);
  assert.ok(Number.isSafeInteger(result.lastSave.confirmedAt));
  assert.equal((await snapshot()).modified, false);
  data.modified = true;
  data.onSave = () => { connection.Session = {}; };
  assert.equal(await save(path), null);
});

test('a new package uses the native Save As and receipts the path chosen in Loginom', async () => {
  const { save, data, owned } = fixture();
  data.modified = true;
  data.active = owned;
  data.onSave = (control) => {
    assert.match(control, /btnSaveAsPackage/);
    owned.PackageFileName = 'user/chosen.lgp';
    data.modified = false;
  };
  const result = await save(null);
  assert.equal(result.status, 'saved');
  assert.equal(result.lastSave.path, '/user/chosen.lgp');
});

test('reads the conversation draft even when another package is active', async () => {
  const { snapshot, data } = fixture();
  assert.deepEqual(await snapshot(), {
    open: true, path: null, modified: false, modifiedDetectedAt: null, lastSave: null,
  });
  data.time = 200;
  data.modified = true;
  assert.deepEqual(await snapshot(), {
    open: true, path: null, modified: true, modifiedDetectedAt: 200, lastSave: null,
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
    open: true, path: '/user/result.lgp', modified: false, modifiedDetectedAt: null, lastSave,
  });
  data.modified = true;
  assert.deepEqual(await snapshot(lastSave), {
    open: true, path: '/user/result.lgp', modified: true, modifiedDetectedAt: 100, lastSave,
  });
  packages.shift();
  assert.deepEqual(await snapshot(lastSave), {
    open: false, path: null, modified: null, modifiedDetectedAt: null, lastSave,
  });
});

test('keeps open state when dirty status is unavailable and rejects a changed native session', async () => {
  const { snapshot, data, connection } = fixture();
  data.modified = 'false';
  assert.deepEqual(await snapshot(), {
    open: true, path: null, modified: null, modifiedDetectedAt: null, lastSave: null,
  });
  data.modified = false;
  data.onRead = () => { connection.Session = {}; };
  assert.deepEqual(await snapshot(), {
    open: null, path: null, modified: null, modifiedDetectedAt: null, lastSave: null,
  });
});
