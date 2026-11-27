import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createPackageCopy } from '../client/lib/package-copy.mjs';
import { packageCopyStorage } from '../src/package-copy-storage.mjs';

const original = '/user/Продажи.lgp';
const backupPath = '/user/Продажи — до правки.lgp';
const firstVersion = '/user/Продажи — v2.lgp';
const edited = 'edited binary package';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'package-copy-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  const files = new Map([[original, 'original package']]);
  const folders = new Set(['/user']);
  const events = [];
  const native = {
    DirectoryExists: path => folders.has(path),
    CreateDirectory: path => Boolean(folders.add(path)),
    FileInfoList: {
      GetFileInfoItemsEx: path => [...files.keys()].filter(file => file.startsWith(path))
        .map(file => file.slice(path.length)).filter(name => !name.includes('/') && name.endsWith('.lgp'))
        .map(FileName => ({FileName})),
    },
    FileExists: path => files.has(path),
    GetFileInfo: path => files.has(path) ? {Size:Buffer.byteLength(files.get(path))} : null,
    OpenFile(path) {
      const stored = Buffer.from(files.get(path));
      let cursor = 0;
      return {ReadBuffer(buffer) {
        buffer.set(stored.subarray(cursor, cursor + buffer.length));
        cursor += buffer.length;
      }};
    },
    CopyFile(source, target, overwrite, recursive) {
      assert.equal(overwrite, false);
      assert.equal(recursive, false);
      if (files.has(target)) return false;
      files.set(target, files.get(source));
      return true;
    },
    MoveFile(part, target, overwrite) {
      assert.equal(overwrite, false);
      if (files.has(target)) throw Error('System error, (OS Code 17): File exists');
      files.set(target, files.get(part));
      return files.delete(part);
    },
    DeleteFile: path => files.delete(path),
  };
  const form = {FReconnecting:false, FMapTree:{
    FServerConnection:{Connected:true, UserName:'user', Session:{get_FileStorage:() => native}},
    PackageNodes:{Count:0},
  }};
  const browser = {
    origin:'http://localhost', pathname:'/',
  };
  function evaluate(callback, argument, extra) {
    const body = extra === undefined ? '(callback)(argument)' : '(callback)(argument, extra)';
    return runInNewContext(body.replace('(callback)', '(' + callback.toString() + ')'), {
      argument, extra, location:browser,
      ReleaseObject: () => {},
      bg:{
        app:{Version:'7.4.2', Application:{FInstance:{FMainForm:form}}},
        TBGFileInfoAttributes:{fiaNormalFilesOnly:1},
        TBGFileOpenMode:{fomRead:0},
        selectAllAsync: items => cb => cb(items),
        forEach: (items, cb) => items.forEach(cb),
      },
    });
  }
  const storage = packageCopyStorage({pages:() => [{
    evaluate,
    async evaluateHandle(callback, argument) {
      const value = await evaluate(callback, argument);
      return {evaluate:(fn, extra) => evaluate(fn, value, extra), dispose:async () => {}};
    },
  }]}, {url:'http://localhost/', account:'user'});
  const runtime = () => createPackageCopy({
    file:join(directory, 'receipts.json'), root:'/user', storage,
    record: async event => events.push(event),
    flush:async () => {},
    async saveFrom(source, sourceHash, path, previous) {
      assert.equal(await storage.digest(source), sourceHash);
      assert.equal(await storage.digest(path), previous);
      assert.ok(files.has(backupPath));
      files.set(path, files.get(source));
      return storage.digest(path);
    },
  });
  const server = runtime();
  const {path:copy} = await server.execute('begin', {originalPath:original});
  assert.equal(copy, '/user/Копии агента/Продажи — правка агента.lgp');
  assert.equal(files.get(copy), files.get(original));
  files.set(copy, edited);
  return {files, native, events, runtime, server, copy};
}

test('save-version chooses v3, deduplicates calls and can undo only the owned version', async t => {
  const {files, server, runtime, copy} = await fixture(t);
  files.set('/user/Продажи — v1.lgp', 'v1');
  files.set(firstVersion, 'previous v2');
  const result = {path:'/user/Продажи — v3.lgp', name:'Продажи — v3.lgp'};
  assert.deepEqual(await Promise.all([server.execute('save-version'), server.execute('save-version')]), [result, result]);
  assert.deepEqual(await runtime().execute('save-version'), result);
  assert.equal(files.get(result.path), edited);
  assert.equal(files.get(firstVersion), 'previous v2');
  assert.equal(files.get(original), 'original package');
  assert.equal(files.size, 5);
  await assert.rejects(server.execute('undo-save', {path:firstVersion}), {code:'copy_missing'});
  assert.deepEqual(await server.execute('undo-save', result), {});
  assert.deepEqual(await runtime().execute('undo-save', result), {});
  assert.equal(files.has(result.path), false);
  assert.equal(files.get(copy), edited);
});

test('replace requires confirmation and a separate backup, then restores its exact revision', async t => {
  const {files, runtime, server} = await fixture(t);
  await assert.rejects(server.execute('replace-original', {confirmed:false}), {code:'access_denied'});
  assert.equal(files.has(backupPath), false);
  const result = {path:original, backupPath};
  assert.deepEqual(await server.execute('replace-original', {confirmed:true}), result);
  assert.deepEqual(await runtime().execute('replace-original', {confirmed:true}), result);
  assert.equal(files.get(original), edited);
  assert.equal(files.get(backupPath), 'original package');
  await assert.rejects(server.execute('restore-previous', {backupPath:original}), {code:'copy_missing'});
  assert.deepEqual(await runtime().execute('restore-previous', {backupPath}), {path:original});
  assert.equal(files.get(original), 'original package');
});

test('discard removes only the copy and repeated discard stays settled', async t => {
  const {files, copy, server, runtime} = await fixture(t);
  const sidecar = copy.slice(0,-4) + '.~lgp';
  files.set(sidecar, 'previous copy');
  assert.deepEqual(await server.execute('discard'), {});
  assert.deepEqual(await runtime().execute('discard'), {});
  assert.equal(files.has(sidecar), false);
  assert.equal(files.has(copy), false);
  assert.equal(files.get(original), 'original package');
  await assert.rejects(server.execute('save-version'), {code:'copy_missing'});
});

test('a busy original reports the lock and still permits an independent version', async t => {
  const {files, server} = await fixture(t);
  files.set('/user/.Продажи.lgp.lck', 'existing lock');
  await assert.rejects(server.execute('replace-original', {confirmed:true}), {
    code:'package_busy', data:{packagePath:original, kind:'other_loginom_session'},
  });
  assert.equal(files.get(original), 'original package');
  assert.equal(files.has(backupPath), false);
  assert.equal((await server.execute('save-version')).path, firstVersion);
});

test('collision during publish preserves the competitor and allows another free name', async t => {
  const {native, files, server} = await fixture(t);
  const move = native.MoveFile.bind(native);
  native.MoveFile = (from, to, overwrite) => {
    if (to === firstVersion) files.set(to, 'competitor');
    return move(from, to, overwrite);
  };
  await assert.rejects(server.execute('save-version'), {code:'path_exists', data:{path:firstVersion}});
  assert.equal([...files.keys()].some(path => path.endsWith('.part')), false);
  assert.equal(files.get(firstVersion), 'competitor');
  assert.equal((await server.execute('save-version')).path, '/user/Продажи — v3.lgp');
});

test('lost storage response is retained across runtime restart and never dispatches twice', async t => {
  const {files, native, runtime, server, events} = await fixture(t);
  const move = native.MoveFile.bind(native);
  native.MoveFile = (...args) => {
    move(...args);
    throw Error('lost reply');
  };
  await assert.rejects(server.execute('save-version'), {code:'state_check_required'});
  assert.equal(files.get(firstVersion), edited);
  await assert.rejects(runtime().execute('save-version'), {code:'state_check_required'});
  assert.equal(files.size, 3);
  assert.equal(events.filter(event => event.action === 'save-version').length, 1);
});

test('a known storage denial has no effect and a later authorized save can proceed', async t => {
  const {files, native, runtime, server} = await fixture(t);
  const copy = native.CopyFile.bind(native);
  native.CopyFile = () => { throw Error('System error, (OS Code 13): Permission denied'); };
  await assert.rejects(server.execute('save-version'), {code:'access_denied'});
  assert.equal(files.has(firstVersion), false);
  native.CopyFile = copy;
  assert.equal((await runtime().execute('save-version')).path, firstVersion);
});

test('restore refuses to overwrite a later external save', async t => {
  const {files, server} = await fixture(t);
  await server.execute('replace-original', {confirmed:true});
  files.set(original, 'later manual changes');
  await assert.rejects(server.execute('restore-previous', {backupPath}), {code:'state_check_required'});
  assert.equal(files.get(original), 'later manual changes');
  assert.equal(files.get(backupPath), 'original package');
});
