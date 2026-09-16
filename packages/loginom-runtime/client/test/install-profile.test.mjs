import test from 'node:test';
import assert from 'node:assert/strict';
import { configureWorkflow, restoreWorkflow, workflowRegistration } from '../lib/install-profile.mjs';
const pin = platform => ({manifest_uri:`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.14-${platform}-candidate/manifest.json`,manifest_sha256:'a'.repeat(64)});
const release = {version:1,platforms:Object.fromEntries(['darwin','linux','win32'].map(p=>[p,pin(p)]))};
test('fresh installs select platform pins and an explicit directory without changing connection identity', () => {
  for (const platform of ['darwin','linux','win32']) {
    const data={api_key:'preserved',loginom_url:'https://chosen.example/app',custom:{keep:true}};
    const result=configureWorkflow(data,release,{platform,storageRoot:'/Аналитик/Мои данные'});
    assert.equal(result.api_key,data.api_key);assert.equal(result.loginom_url,data.loginom_url);assert.deepEqual(result.custom,data.custom);
    assert.equal(result.workflow_profile.action_manifest_uri,pin(platform).manifest_uri);
    assert.deepEqual(result.workflow_profile.storage_directories,{packages:'/Аналитик/Мои данные',inputs:'/Аналитик/Мои данные',exports:'/Аналитик/Мои данные'});
    assert.equal(result.workflow_profile.passwordless_login,undefined);
  }
  assert.throws(()=>configureWorkflow({},release,{platform:'unknown',storageRoot:'/operator'}),/catalog/);
  assert.throws(()=>configureWorkflow({},release,{platform:'darwin'}),/storage directories/);
});
test('reinstall updates the rollback expectation while preserving a real earlier target', () => {
  const first={state:'installed',release:'B',previousRelease:'A',configName:'config.json',before:{plugin:'A'},workflowChange:{previous:null,installed:{directory:'/old'}}};
  const next={...first,previousRelease:'B',before:{plugin:'B'},workflowChange:{previous:{directory:'/old'},installed:{directory:'/new'}}};
  const saved=workflowRegistration(first,next);
  assert.equal(saved.previousRelease,'A');assert.equal(saved.before.plugin,'A');assert.equal(saved.workflowChange.previous,null);
  const restored=restoreWorkflow({api_key:'rotated',workflow_profile:{directory:'/new'}},saved.workflowChange.installed,saved.workflowChange.previous);
  assert.equal(restored.api_key,'rotated');assert.equal(restored.workflow_profile,undefined);
  const fresh=workflowRegistration({...first,previousRelease:null},next);
  assert.deepEqual(fresh,next);
  assert.deepEqual(restoreWorkflow({workflow_profile:next.workflowChange.installed},fresh.workflowChange.installed,fresh.workflowChange.previous).workflow_profile,{directory:'/old'});
});
test('upgrade preserves selected directories, legacy connection and rollback preserves later credential changes', () => {
  const old={endpoint:'https://separate.example/mcp',api_key:'before',hermes_profile:{input_upload_directory:'/legacy/input'}};
  const installed=configureWorkflow(old,release,{platform:'darwin',storageRoot:'/selected'});
  const upgraded=configureWorkflow(installed,release,{platform:'linux'});
  assert.deepEqual(upgraded.workflow_profile.storage_directories,installed.workflow_profile.storage_directories);
  assert.deepEqual(upgraded.hermes_profile,old.hermes_profile);
  const current={...upgraded,api_key:'rotated'};
  const restored=restoreWorkflow(current,upgraded.workflow_profile,installed.workflow_profile);
  assert.equal(restored.api_key,'rotated');assert.deepEqual(restored.workflow_profile,installed.workflow_profile);
  assert.throws(()=>restoreWorkflow(current,{unexpected:true},null),/changed after/);
  assert.equal(restoreWorkflow(installed,installed.workflow_profile,null).workflow_profile,undefined);
});
