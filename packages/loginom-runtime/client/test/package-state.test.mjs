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
      state: { status: 'READY', document_id: 'doc', loginom_account: 'user', workflow_ref: { tab_tid: 'owned', workflow_id: 'workflow' } },
    },
  };
  const page = { url: () => origin, evaluate: (read, input) => runInNewContext(`(${read})(input)`, { ...globals, input, setTimeout, clearTimeout }) };
  const read = createPackageStateReader(metadata, origin, () => data.time);
  const snapshot = (save, opened) => read({ pages: () => [page] }, save && { ...save, document_id: 'doc' }, false, opened);
  return { snapshot, data, owned, packages, connection };
}

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
  const copy = { document_id: 'doc', workflow_id: 'workflow', path: lastSave.path, lastSave: false };
  assert.deepEqual(await snapshot(lastSave), {
    open: true, path: '/user/result.lgp', modified: false, modifiedDetectedAt: null, lastSave, copy,
  });
  data.modified = true;
  assert.deepEqual(await snapshot(lastSave), {
    open: true, path: '/user/result.lgp', modified: true, modifiedDetectedAt: 100, lastSave, copy: { ...copy, lastSave: true },
  });
  packages.shift();
  assert.deepEqual(await snapshot(lastSave), {
    open: false, path: null, modified: null, modifiedDetectedAt: null, lastSave, copy: { ...copy, lastSave: true },
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

test('copy uses an opened file or a confirmed Save, ignoring a draft filename', async () => {
  const { snapshot, data, owned } = fixture();
  owned.PackageFileName = 'user/temporary.lgp';
  assert.equal((await snapshot()).copy, undefined);
  const opened = { documentID: 'doc', path: '/user/original.lgp' };
  owned.PackageFileName = 'user/original.lgp';
  assert.deepEqual((await snapshot(undefined, opened)).copy, {
    document_id: 'doc', workflow_id: 'workflow', path: '/user/original.lgp', lastSave: false,
  });
  data.modified = true;
  assert.equal((await snapshot(undefined, opened)).copy.lastSave, true);
  owned.PackageFileName = 'user/revised.lgp';
  data.modified = false;
  assert.deepEqual((await snapshot({ path: '/user/revised.lgp', confirmedAt: 200 })).copy, {
    document_id: 'doc', workflow_id: 'workflow', path: '/user/revised.lgp', lastSave: false,
  });
});
