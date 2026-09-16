import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';

const actor = { agent: 'codex', adapterRevision: 'test-1' };
const valid = { endpoint: 'https://dock.example/mcp', api_key: 'test-only', account: 'loginom-dock', user: 'loginom-dock' };

test('ordinary workflow profile enables both agents with explicit directories and manual login', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-workflow-profile-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.json');
  const profile = { version: 1, mode: 'executor-replay', result_profile: 'user-v1',
    action_manifest_uri: 'viking://resources/loginom-dock/catalogs/executor-preview/releases/rc6/manifest.json',
    action_manifest_sha256: 'a'.repeat(64),
    storage_directories: { packages: '/Автор/Пакеты', inputs: '/Автор/Данные 1', exports: '/Автор/Результаты' } };
  await writeFile(path, JSON.stringify({ ...valid, workflow_profile: profile }), { mode: 0o600 });
  for (const agent of ['codex', 'hermes']) {
    const config = await loadConfig({ configPath: path, stateDir: directory, agent, adapterRevision: 'test' });
    assert.equal(config.mode, 'executor-replay'); assert.equal(config.resultProfile, 'user-v1');
    assert.equal(config.replayBootstrap, false); assert.equal(config.replayLoginUser, null);
    assert.deepEqual(config.storageDirectories, profile.storage_directories);
    assert.ok(Object.isFrozen(config.storageDirectories));
  }
  await writeFile(path, JSON.stringify({ ...valid, workflow_profile: { ...profile, storage_directories: { packages: '/' } } }));
  await assert.rejects(loadConfig({ configPath: path, ...actor }), /storage directories/);
});

test('installed Hermes profile supplies pins without changing the Codex profile', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-hermes-profile-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'profile.json');
  const profile = { version: 1, mode: 'executor-replay', result_profile: 'user-v1',
    action_manifest_uri: 'viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.04-mvp.1-candidate/manifest.json',
    action_manifest_sha256: 'a'.repeat(64) };
  await writeFile(path, JSON.stringify({ ...valid, hermes_profile: profile }), { mode: 0o600 });
  const options = { configPath: path, stateDir: directory, adapterRevision: 'test' };
  const hermes = await loadConfig({ ...options, agent: 'hermes' });
  assert.equal(hermes.mode, 'executor-replay');assert.equal(hermes.resultProfile, 'user-v1');
  assert.equal(hermes.actionManifestSha256, profile.action_manifest_sha256);
  const codex = await loadConfig({ ...options, agent: 'codex' });
  assert.equal(codex.mode, 'classic');assert.equal(codex.resultProfile, 'diagnostic');
  assert.equal(codex.actionManifestSha256, null);
});

test('requires Dock config even when personal OpenViking config is set', async () => {
  process.env.OPENVIKING_CLI_CONFIG_FILE = '/personal/ovcli.conf';
  await assert.rejects(loadConfig(actor), /explicit Dock config/);
  delete process.env.OPENVIKING_CLI_CONFIG_FILE;
});

test('restricts credential files, endpoint and identity before connecting', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-config-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'client.json');
  const options = { ...actor, configPath: path, stateDir: join(directory, 'state') };
  await writeFile(path, JSON.stringify(valid), { mode: 0o600 });
  assert.equal((await loadConfig(options)).apiKey, 'test-only');
  assert.equal((await loadConfig(options)).mode, 'classic');
  assert.equal((await loadConfig({ ...options, mode: 'executor-preview' })).mode, 'executor-preview');
  await assert.rejects(loadConfig({ ...options, mode: 'executor-replay' }), /exact Dock catalog manifest/);
  const replay = await loadConfig({ ...options, mode: 'executor-replay',
    actionManifestUri: 'viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.04-mvp.1-candidate/manifest.json',
    actionManifestSha256: 'a'.repeat(64), replayBootstrap: true, replayLoginUser: 'test-account' });
  assert.equal(replay.mode, 'executor-replay');
  assert.equal(replay.replayBootstrap, true);
  assert.equal(replay.replayLoginUser,'test-account');
  const cleanupOptions={...options,mode:'executor-replay',actionManifestUri:replay.actionManifestUri,
    actionManifestSha256:replay.actionManifestSha256,replayBootstrap:true,replayLoginUser:'test-account'};
  assert.equal((await loadConfig({...cleanupOptions,acceptanceCleanupPackage:'/test-account/result.lgp'})).acceptanceCleanupPackage,'/test-account/result.lgp');
  for(const acceptanceCleanupPackage of ['relative.lgp','/test-account/../other.lgp','/test-account/result.csv'])
    await assert.rejects(loadConfig({...cleanupOptions,acceptanceCleanupPackage}),/Acceptance cleanup/);
  await assert.rejects(loadConfig({...options,acceptanceCleanupPackage:'/test-account/result.lgp'}),/Acceptance cleanup/);
  await assert.rejects(loadConfig({...options,mode:'executor-replay',actionManifestUri:replay.actionManifestUri,
    actionManifestSha256:replay.actionManifestSha256,replayBootstrap:true}),/explicit Loginom account/);
  await assert.rejects(loadConfig({ ...options, mode: 'classic', actionManifestUri: replay.actionManifestUri,
    actionManifestSha256: replay.actionManifestSha256 }), /only allowed/);
  await assert.rejects(loadConfig({ ...options, replayBootstrap: true }), /only allowed/);
  await assert.rejects(loadConfig({ ...options, mode: 'production' }), /mode must be/);
  if (process.platform !== 'win32') {
    await chmod(path, 0o644);
    await assert.rejects(loadConfig(options), /private/);
    await chmod(path, 0o600);
  }
  await symlink(path, join(directory, 'link.json'));
  await assert.rejects(loadConfig({ ...options, configPath: join(directory, 'link.json') }), /regular file/);
  for (const endpoint of ['http://dock.example/mcp', 'https://user:secret@dock.example/mcp', 'https://dock.example/mcp?key=x']) {
    await writeFile(path, JSON.stringify({ ...valid, endpoint }));
    await assert.rejects(loadConfig(options), /HTTPS/);
  }
  await writeFile(path, JSON.stringify({ ...valid, user: 'dock-admin' }));
  await assert.rejects(loadConfig(options), /ordinary loginom-dock/);
  await writeFile(path, JSON.stringify({ ...valid, loginom_url: 'https://loginom.example/app?testable=true' }));
  assert.equal((await loadConfig(options)).loginomUrl, 'https://loginom.example/app?testable=true');
  await writeFile(path, JSON.stringify({ ...valid, loginom_url: 'https://loginom.example/app?token=private' }));
  await assert.rejects(loadConfig(options), /contain credentials/);
});

test('replay target override keeps Dock connection and disk config intact',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'dock-replay-target-'));t.after(()=>rm(directory,{recursive:true,force:true}));const path=join(directory,'client.json');
 const original=JSON.stringify({...valid,loginom_url:'https://original.example/app'});await writeFile(path,original,{mode:0o600});
 const options={...actor,configPath:path,mode:'executor-replay',actionManifestUri:'viking://resources/loginom-dock/catalogs/executor-preview/releases/test/manifest.json',actionManifestSha256:'a'.repeat(64)};
 const changed=await loadConfig({...options,replayLoginomUrl:'http://target.example/app?testable=true'});
 assert.equal(changed.loginomUrl,'http://target.example/app?testable=true');assert.equal(changed.apiKey,valid.api_key);assert.equal(changed.endpoint,valid.endpoint);
 assert.equal((await loadConfig(options)).loginomUrl,'https://original.example/app');
 const {readFile}=await import('node:fs/promises');assert.equal(await readFile(path,'utf8'),original);
 for(const replayLoginomUrl of ['http://user:secret@target.example/app','http://target.example/app?api_key=x','file:///tmp/app',''])await assert.rejects(loadConfig({...options,replayLoginomUrl}));
 await assert.rejects(loadConfig({...actor,configPath:path,replayLoginomUrl:changed.loginomUrl}),/only allowed/);
});
