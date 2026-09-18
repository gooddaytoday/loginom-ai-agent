import test from 'node:test';
import assert from 'node:assert/strict';
import { storagePath, storageDirectories, requireStorageDestination, storageTidSuffix, createStorageBinding, withStorageIdentity } from '../lib/storage-policy.mjs';
import vm from 'node:vm';

const directories = { packages: '/operator/Мои пакеты', inputs: '/operator/Данные', exports: '/operator/Результаты' };
test('explicit storage directories preserve user names and restrict each purpose', () => {
  assert.equal(requireStorageDestination('/operator/Результаты/Сводка, 1.csv', directories, 'exports'), '/operator/Результаты/Сводка, 1.csv');
  assert.equal(requireStorageDestination('/operator/Данные', directories, 'inputs', { directory: true }), directories.inputs);
  for (const path of ['/test-2/x.csv', '/operator/Результаты-extra/x.csv', '/operator/Данные/x.csv', '/operator/Результаты']) {
    assert.throws(() => requireStorageDestination(path, directories, 'exports'));
  }
  assert.throws(() => requireStorageDestination('/operator/Мои пакеты/result.csv', directories, 'packages'));
  assert.throws(() => requireStorageDestination('/operator/Результаты/result.lgp', directories, 'exports'));
});

test('native account/document changes stop browser work before its effect', async () => {
  const binding=createStorageBinding({sessionId:'session',origin:'http://loginom.local',build:'7.4.2',documentId:'doc',account:'operator',directories});
  const connection={Connected:true,UserName:'operator'}, globals={location:{origin:'http://loginom.local'},bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:connection}}}}}},__loginomDockPreparationV1:{id:'doc'}};
  let effects=0;
  const page={evaluate:async(fn,arg)=>vm.runInNewContext('('+fn.toString()+')(input)',{...globals,input:arg}),effect:()=>++effects};
  const run=vm.runInNewContext('('+withStorageIdentity('async page=>page.effect()',binding)+')');
  assert.equal(await run(page),1);
  connection.Connected=false;await assert.rejects(run(page),/connection is disconnected/);
  connection.Connected=true;
  connection.UserName='someone-else';await assert.rejects(run(page),/account or document changed/);
  connection.UserName='operator';globals.__loginomDockPreparationV1.id='new-doc';await assert.rejects(run(page),/account or document changed/);
  assert.equal(effects,1);
});
test('storage paths reject traversal, ambiguous escaping and broad root grants', () => {
  for (const path of ['/', 'relative', '/a/', '/a//b', '/a/../b', '/a/./b', '/a/%2e%2e/b', '/a\\b', '/a/?x', '/a/#x', '/ a/b', '/a /b', '/a/\nname']) {
    assert.throws(() => storagePath(path), path);
  }
  assert.throws(() => storageDirectories({ ...directories, arbitrary: '/' }));
  assert.throws(() => storageDirectories({ packages: '/operator' }));
});
test('native storage selectors require exact labels in addition to converted suffixes', () => {
  assert.equal(storageTidSuffix('Мои данные, 1.csv'), 'Мои_данные_1.csv');
  assert.equal(storageTidSuffix('a b'), storageTidSuffix('a_b'));
  assert.throws(() => storageTidSuffix('a/b'));
});
test('storage binding records observed account independently of the selected directory', () => {
  const binding = createStorageBinding({ sessionId: 'dock-session', origin: 'http://loginom.local', build: '7.4.2',
    documentId: 'document', account: 'different-account-name', directories });
  assert.equal(binding.loginom_account, 'different-account-name');
  assert.deepEqual(binding.directories, directories);
  assert.ok(Object.isFrozen(binding) && Object.isFrozen(binding.directories));
  assert.throws(() => createStorageBinding({ sessionId: 's', origin: 'http://loginom.local/path', build: '7.4.2', documentId: 'd', account: 'a', directories }));
});
