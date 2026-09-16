import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ACTION_CATALOG_ROOT, pinActionCatalog as pinRemoteActionCatalog, ACCEPTANCE_CHECKS, EXECUTOR_REVISION,
  validateReplayAcceptance, assertCatalogTarget } from '../lib/action-catalog.mjs';
import { updateForE2E } from '../../deploy/loginom-dock/build-action-catalog.mjs';
import { createActionRuntime, parseCapabilityResult } from '../lib/executor.mjs';

const exec = promisify(execFile);
const root = new URL('../../executor/catalog/', import.meta.url);
const canonical = value => JSON.stringify(value, null, 2) + '\n';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const testRuntime = { clientRevision: 'd'.repeat(64), playwright: 'test-playwright', chromiumRevision: 'test-chromium' };
const pinActionCatalog = (remote, options = {}) => pinRemoteActionCatalog(remote, { runtimeIdentity: testRuntime, ...options });

async function fixture({ mutate } = {}) {
  const values = {};
  for (const name of ['actions.json', 'selectors.json', 'source-index.json']) {
    values[name] = JSON.parse(await readFile(new URL(name, root), 'utf8'));
  }
  mutate?.(values);
  const texts = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, canonical(value)]));
  const catalogVersion = values['actions.json'].catalog_version;
  const manifest = {
    schema_version: 1, catalog_version: catalogVersion, status: 'candidate', capability_abi: 1,
    min_executor_revision: '1.0.0', e2e_commit: values['actions.json'].e2e_commit,
    compatibility: JSON.parse(await readFile(new URL('compatibility.json', root), 'utf8')),
    created_at: '2026-09-04T00:00:00Z', files: Object.fromEntries(Object.entries(texts).map(([name, text]) => [name, sha256(text)])),
  };
  const manifestText = canonical(manifest);
  const releaseRoot = `${ACTION_CATALOG_ROOT}/releases/${catalogVersion}`;
  // Deliberately synthetic unit-test evidence; never a publishable live report.
  const acceptance = { schema_version: 1, status: 'PASSED', manifest_sha256: sha256(manifestText),
    runtime: { ...testRuntime, capabilityAbi: 1, executorRevision: EXECUTOR_REVISION }, target: manifest.compatibility,
    agent: { name: 'hermes', provider: 'openai-codex', model: 'gpt-5.6-sol', reasoning_effort: 'low' },
    checks: Object.fromEntries(ACCEPTANCE_CHECKS.map(key => [key, true])), evidence_uri: 'unit-test:synthetic',
    evidence_sha256: 'e'.repeat(64), recorded_at: '2026-09-04T00:00:00Z' };
  const acceptanceText = canonical(acceptance), acceptanceSha = sha256(acceptanceText);
  const current = { schema_version: 1, status: 'production', catalog_version: catalogVersion,
    manifest_uri: `${releaseRoot}/manifest.json`, manifest_sha256: sha256(manifestText),
    acceptance_uri: `${releaseRoot}/acceptance/${acceptanceSha}.json`, acceptance_sha256: acceptanceSha };
  const files = new Map([[`${ACTION_CATALOG_ROOT}/current.json`, canonical(current)], [`${releaseRoot}/manifest.json`, manifestText],
    [current.acceptance_uri, acceptanceText],
    ...Object.entries(texts).map(([name, text]) => [`${releaseRoot}/${name}`, text])]);
  const reads = [];
  const remote = { callTool: async ({ name, arguments: args }) => {
    assert.equal(name, 'read'); reads.push(args.uris[0]);
    return { content: [{ type: 'text', text: files.get(args.uris[0]) }] };
  } };
  return { remote, files, reads };
}

test('pins and verifies the complete production release once', async () => {
  const data = await fixture();
  const pinned = await pinActionCatalog(data.remote);
  assert.equal(pinned.actions.size, 5);
  assert.equal(pinned.selectors.get('workflow.port.input.add').strategy, 'data_tid');
  assert.equal(pinned.pins.capabilityAbi, 1);
  assert.equal(pinned.pins.e2eCommit, '2cad5602158fd2e4836d821d644a2b8d92f571a2');
  assert.equal(data.reads.length, 6);
  assert.equal(pinned.acceptanceVerified, true);
  assert.equal(pinned.manifest.status, 'candidate');
  assert.equal(pinned.pins.catalogLifecycleStatus, 'production');
  data.files.set(`${ACTION_CATALOG_ROOT}/current.json`, '{}');
  assert.equal(pinned.actions.get('node.add').revision, '4');
});

test('pins an exact candidate only for operator-selected replay and rejects it in the production runtime', async () => {
  const data = await fixture({ mutate(values) {
    values['actions.json'].catalog_version += '-candidate';
    values['selectors.json'].catalog_version += '-candidate';
    values['source-index.json'].catalog_version += '-candidate';
    for (const action of values['actions.json'].actions) action.status = 'candidate';
  } });
  const manifestUri = [...data.files.keys()].find(uri => uri.endsWith('/manifest.json'));
  const manifest = JSON.parse(data.files.get(manifestUri));
  manifest.status = 'candidate';
  const manifestText = canonical(manifest);
  data.files.set(manifestUri, manifestText);
  const pinned = await pinActionCatalog(data.remote, { manifestUri, manifestSha256: sha256(manifestText), allowCandidate: true });
  assert.equal(pinned.pins.catalogLifecycleStatus, 'candidate');
  assert.equal(data.reads.length, 4);
  assert.throws(() => createActionRuntime({ pinned, execute: async () => {} }).describe('node.add'), /not executable/);
  assert.equal(createActionRuntime({ pinned, allowCandidate: true, execute: async () => {} }).describe('node.add').action.status, 'candidate');
  await assert.rejects(pinActionCatalog(data.remote, { manifestUri, manifestSha256: sha256(manifestText) }), /requires replay mode/);
});

test('rejects tampering, stale actions, server code and raw selectors before execution', async () => {
  const digestTamper = await fixture();
  const actionUri = [...digestTamper.files.keys()].find(uri => uri.endsWith('/actions.json'));
  digestTamper.files.set(actionUri, digestTamper.files.get(actionUri) + ' ');
  await assert.rejects(pinActionCatalog(digestTamper.remote), /digest mismatch/);

  for (const mutate of [
    values => { values['actions.json'].actions[0].status = 'stale'; },
    values => { values['actions.json'].actions[0].javascript = 'return true'; },
    values => { values['selectors.json'].selectors[0].css = '#unsafe'; },
    values => { values['actions.json'].actions[0].required_capabilities = ['unknown.v1']; },
    values => { values['actions.json'].actions[0].capability = 'link.create.v1'; },
    values => { values['actions.json'].actions[0].effect.kind = 'save'; },
    values => { values['source-index.json'].dependencies['link.create'].selectors = ['workspace.active_tab']; },
    values => { values['source-index.json'].dependencies['link.create'].files = ['bg/selectors.ts']; },
    values => { values['actions.json'].actions[0].evidence[0].sha256 = 'c'.repeat(64); },
  ]) {
    await assert.rejects(pinActionCatalog((await fixture({ mutate })).remote), /Invalid Dock action catalog/);
  }
});

test('production admission rejects missing, incomplete, altered and mismatched replay evidence', async () => {
  const data = await fixture();
  await assert.rejects(pinRemoteActionCatalog(data.remote), /requires the current client runtime identity/);
  await assert.rejects(pinActionCatalog(data.remote, { runtimeIdentity: { ...testRuntime, clientRevision: 'b'.repeat(64) } }), /does not cover this runtime/);
  const pinned = await pinActionCatalog(data.remote);
  const context = { manifest: pinned.manifest, manifestSha256: pinned.current.manifest_sha256, runtimeIdentity: testRuntime };
  for (const mutate of [
    value => { value.manifest_sha256 = 'b'.repeat(64); },
    value => { value.checks.cleanup = false; },
    value => { delete value.checks.ambiguous; },
    value => { value.agent.model = 'another-model'; },
    value => { value.agent.provider = 'xiaomi'; },
    value => { value.agent.reasoning_effort = 'high'; },
    value => { delete value.agent.reasoning_effort; },
    value => { value.target.loginom_build = 'other-build'; },
  ]) {
    const value = structuredClone(pinned.acceptance); mutate(value);
    assert.throws(() => validateReplayAcceptance(value, context), /Invalid Dock action catalog/);
  }
  assert.throws(() => assertCatalogTarget(pinned, { ...pinned.compatibility, loginom_build: 'other-build' }), /target build mismatch/);
  assert.deepEqual(assertCatalogTarget(pinned, pinned.compatibility), pinned.compatibility);
  data.files.set(pinned.current.acceptance_uri, data.files.get(pinned.current.acceptance_uri) + ' ');
  await assert.rejects(pinActionCatalog(data.remote), /acceptance digest mismatch/);
});

test('a second E2E rebuild cannot promote a stale action or rebrand a candidate as production', async () => {
  const [actions, selectors, index] = await Promise.all(['actions.json', 'selectors.json', 'source-index.json']
    .map(async name => JSON.parse(await readFile(new URL(name, root), 'utf8'))));
  const source = { commit: 'a'.repeat(40), files: Object.entries(index.source_files).map(([path, sha256]) => ({ path, sha256 })) };
  source.files.find(file => file.path === 'bg/helpers/workflow/links.ts').sha256 = 'b'.repeat(64);
  const first = updateForE2E(actions, selectors, index, source);
  const second = updateForE2E(first.actions, first.selectors, first.index, source);
  assert.deepEqual(first.staleActions, ['link.create']);
  assert.deepEqual(second.staleActions, ['link.create']);
  assert.equal(second.actions.actions.find(action => action.action_key === 'link.create').status, 'stale');
  assert.equal(second.actions.actions.find(action => action.action_key === 'node.add').status, 'candidate');
});

test('validates action parameters before browser preparation and checks successful output', async () => {
  const pinned = await pinActionCatalog((await fixture()).remote);
  const calls = [];
  const runtime = createActionRuntime({ pinned, execute: async (code, options) => {
    calls.push({ code, options });
    if (calls.length === 1) return { status: 'NOT_APPLIED', action_key: 'node.add', action_revision: '4',
      operation_id: 'unit-node-add', phase: 'prepared', effect_possible: false, checkpoint: { workflow_ref: { tab_tid: 'test-tab', prefix: 'test-prefix' } },
      output: {}, error: null, trace: [] };
    return { status: 'SUCCEEDED', action_key: 'node.add', action_revision: '4', operation_id: 'unit-node-add', phase: 'verified', effect_possible: true, output: {
      node_ref: { kind: 'node', node_label: 'Калькулятор', workflow_ref: { tab_tid: 'test-tab', prefix: 'test-prefix' } },
      auto_created_links: [], goal_verified: false,
    }, cleanup_complete: true, error: null, trace: [{ at_ms: 0, event: 'test' }] };
  } });
  assert.equal(runtime.describe('node.add').session_manifest.actionCatalogVersion, '2026.09.13-node14.1-candidate');
  await assert.rejects(runtime.run('node.add', { component_key: 'imports.text', target_position: { x: 100, y: 100 }, extra: true }), /unknown field extra/);
  await assert.rejects(runtime.run('node.add', { component_key: 'unknown', target_position: { x: 100, y: 100 } }), /allowed enum/);
  assert.equal(calls.length, 0);
  const outcome = await runtime.run('node.add', { component_key: 'transform.reform_columns', target_position: { x: 100, y: 100 } }, { operationId: 'unit-node-add' });
  assert.equal(outcome.status, 'SUCCEEDED');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.timeout, 65000);
  let brokenCalls = 0;
  const broken = createActionRuntime({ pinned, execute: async () => ++brokenCalls === 1
    ? { status: 'NOT_APPLIED', action_key: 'node.add', action_revision: '4', operation_id: 'unit-broken', phase: 'prepared', effect_possible: false,
      checkpoint: { workflow_ref: { tab_tid: 'test-tab', prefix: 'test-prefix' } }, output: {}, error: null, trace: [] }
    : { status: 'SUCCEEDED', action_key: 'node.add', action_revision: '4', operation_id: 'unit-broken', phase: 'verified', effect_possible: true,
      output: { auto_created_links: [], goal_verified: false }, error: null, trace: [] } });
  const invalid = await broken.run('node.add', { component_key: 'imports.text', target_position: { x: 100, y: 100 } }, { operationId: 'unit-broken' });
  assert.equal(invalid.status, 'AMBIGUOUS');
  assert.match(invalid.error.message, /missing node_ref/);
});

test('parses only a typed capability outcome', () => {
  const value = { status: 'NOT_APPLIED', action_key: 'link.create', action_revision: '1', phase: 'reconciling', effect_possible: false, output: {}, error: null, trace: [] };
  assert.deepEqual(parseCapabilityResult({ content: [{ type: 'text', text: `### Result\n${JSON.stringify(value)}\n### Ran Playwright code` }] }), value);
  assert.throws(() => parseCapabilityResult({ content: [{ type: 'text', text: '{"ok":true}' }] }), /no typed result/);
});

test('builder is deterministic and marks only actions affected by E2E dependency changes stale', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-action-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = join(directory, 'first'), second = join(directory, 'second');
  await mkdir(first); await mkdir(second);
  const script = new URL('../../deploy/loginom-dock/build-action-catalog.mjs', import.meta.url);
  await exec(process.execPath, [script.pathname, '--out', first]);
  await exec(process.execPath, [script.pathname, '--out', second]);
  for (const name of ['actions.json', 'selectors.json', 'source-index.json', 'manifest.json', 'current.json']) {
    assert.equal(await readFile(join(first, name), 'utf8'), await readFile(join(second, name), 'utf8'));
  }
  const index = JSON.parse(await readFile(new URL('source-index.json', root), 'utf8'));
  const source = { commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', files: Object.entries(index.source_files).map(([path, sha256]) => ({ path, sha256 })) };
  source.files.find(file => file.path === 'bg/helpers/workflow/links.ts').sha256 = 'b'.repeat(64);
  const sourcePath = join(directory, 'source-manifest.json'); await writeFile(sourcePath, canonical(source));
  const candidate = join(directory, 'candidate'); await mkdir(candidate);
  const run = await exec(process.execPath, [script.pathname, '--out', candidate, '--e2e-manifest', sourcePath]);
  assert.match(run.stdout, /"stale_actions": \[\n    "link.create"/);
  const actions = JSON.parse(await readFile(join(candidate, 'actions.json'), 'utf8'));
  assert.equal(actions.actions.find(action => action.action_key === 'link.create').status, 'stale');
  assert.equal(actions.actions.find(action => action.action_key === 'node.add').status, 'candidate');
  assert.equal(JSON.parse(await readFile(join(candidate, 'manifest.json'), 'utf8')).status, 'candidate');
  const replay = join(directory, 'replay'); await mkdir(replay);
  await exec(process.execPath, [script.pathname, '--out', replay, '--candidate']);
  assert.equal(JSON.parse(await readFile(join(replay, 'manifest.json'), 'utf8')).status, 'candidate');
  assert.ok(JSON.parse(await readFile(join(replay, 'actions.json'), 'utf8')).actions.every(action => action.status === 'candidate'));
});

test('batch descriptions reuse the pinned catalog and distinguish planned type cards from actions', async () => {
  const data = await fixture();
  const pinned = await pinActionCatalog(data.remote);
  const runtime = createActionRuntime({pinned, allowCandidate:true, execute:async()=>{throw new Error('No execution during description');}});
  const reads=data.reads.length;
  const batch=runtime.describe({action_keys:['node.add','link.create'],node_types:['imports.text','transform.join_data']});
  assert.equal(batch.actions.length,2);
  assert.equal(batch.node_types[0].catalog_add_available,true);
  assert.equal(batch.node_types[1].catalog_add_available,false);
  assert.equal(batch.node_types[1].full_node_apply_available,false);
  assert.equal(data.reads.length,reads);
  assert.deepEqual(runtime.describe({action_key:'node.add'}),runtime.describe('node.add'));
  assert.deepEqual(runtime.describe({}),runtime.describe());
  assert.throws(()=>runtime.describe({action_key:'node.add',node_types:['imports.text']}),/single action/);
  assert.throws(()=>runtime.describe({action_keys:['node.add','node.add']}),/distinct/);
});

test('array bounds are validated at catalog admission and before walking values',async()=>{
 const {validateJsonSchema,validateActionParameters}=await import('../lib/action-catalog.mjs');
 const schema={type:'array',minItems:1,maxItems:2,items:{type:'string'}};
 assert.doesNotThrow(()=>validateJsonSchema(schema));
 assert.deepEqual(validateActionParameters(schema,['a','b']),['a','b']);
 assert.throws(()=>validateActionParameters(schema,[]),/array is too short/);
 assert.throws(()=>validateActionParameters(schema,['a','b','c']),/array is too long/);
 for(const bounds of [{minItems:-1},{maxItems:1.5},{maxItems:Infinity},{minItems:3,maxItems:2}])
  assert.throws(()=>validateJsonSchema({...schema,...bounds}),/invalid|reversed/);
});
