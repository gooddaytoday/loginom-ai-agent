import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {ACTION_CATALOG_ROOT, ACCEPTANCE_CHECKS, EXECUTOR_REVISION} from '../../lib/action-catalog.mjs';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createConnection} from '@playwright/mcp';
import {createActionCatalogFixture} from './action-catalog-fixture.mjs';
import {NodeReleaseBlocked} from '../../lib/node-pending-release.mjs';
import {RECOVERY_BROWSER_TOOLS} from '../../lib/browser-recovery.mjs';
const stopped = await import('./stopped-node-fixture.mjs');
const executor = await import('../../lib/executor.mjs');
const sdk = await import('@modelcontextprotocol/sdk/client/index.js');
const server = await createConnection({capabilities: ['core', 'vision'], snapshot: {mode: 'none'}}, async () => { throw Error('no native browser'); });
const catalogClient = new sdk.Client({name: 'catalog', version: '1'});
const [catalogA, catalogB] = InMemoryTransport.createLinkedPair();
await server.connect(catalogB); await catalogClient.connect(catalogA);
const browserTools = (await catalogClient.listTools()).tools;
await catalogClient.close(); await server.close();
const target = {profile_id: 'test', loginom_build: '7.4.2', platform: 'macos', browser: 'chromium'};
const catalog = await createActionCatalogFixture(target);
const runtimeIdentity={clientRevision:'a'.repeat(64),playwright:'fixture',chromiumRevision:'fixture'};
// Synthetic external catalog admission for the preview compatibility regression only.
const acceptance=JSON.stringify({schema_version:1,status:'PASSED',manifest_sha256:catalog.manifestSha256,
  runtime:{...runtimeIdentity,capabilityAbi:1,executorRevision:EXECUTOR_REVISION},target,
  agent:{name:'hermes',provider:'openai-codex',model:'gpt-5.6-sol',reasoning_effort:'low'},
  checks:Object.fromEntries(ACCEPTANCE_CHECKS.map(key=>[key,true])),evidence_uri:'unit-test:synthetic',
  evidence_sha256:'e'.repeat(64),recorded_at:'2026-09-04T00:00:00Z'});
const acceptanceHash=createHash('sha256').update(acceptance).digest('hex');
const releaseRoot=catalog.manifestUri.slice(0,-'/manifest.json'.length);
catalog.files.set(releaseRoot+'/acceptance/'+acceptanceHash+'.json',acceptance);
catalog.files.set(ACTION_CATALOG_ROOT+'/current.json',JSON.stringify({schema_version:1,status:'production',
  catalog_version:JSON.parse(catalog.files.get(catalog.manifestUri)).catalog_version,
  manifest_uri:catalog.manifestUri,manifest_sha256:catalog.manifestSha256,
  acceptance_uri:releaseRoot+'/acceptance/'+acceptanceHash+'.json',acceptance_sha256:acceptanceHash}));
const remoteNames = ['find', 'search', 'read', 'grep', 'glob', 'list', 'tree'];
const path = '/user/result.lgp';
const save = {action_key: 'package.save_checkpoint', parameters: {path, conflict_policy: 'replace'}, operation_id: 'save-1'};
const report = {actions: ['Save'], result: 'Saved package', settings: []};
const revision = JSON.parse([...catalog.files.values()].find(text => text.includes('"actions"'))).actions.find(action => action.action_key === save.action_key).revision;
let current;
const response = value => ({content: [{type: 'text', text: JSON.stringify(value)}]});
class ExternalClient {
  constructor(identity) { this.browser = identity.name === 'loginom-dock-browser'; this.f = current; }
  async connect(transport) { this.transport = transport; }
  async close() { this.f.closed.push(this.browser ? 'browser' : 'remote'); this.transport?.onclose?.(); }
  async listTools() { return {tools: this.browser ? browserTools : remoteNames.map(name => ({name, inputSchema: {type: 'object'}}))}; }
  async callTool(request) {
    const f = this.f;
    if (!this.browser) return {content: [{type: 'text', text: catalog.files.get(request.arguments.uris[0])}]};
    if (request.name !== 'browser_run_code_unsafe') { f.browserCalls.push(request); f.browserEntered?.(); if(f.browserReply instanceof Error)throw f.browserReply; return f.browserReply; }
    const code = request.arguments.code;
    f.browserCodes.push(code);
    if (f.codeEntered) await f.codeEntered(code);
    if (code.includes('action_key:"node.apply.transport"')) return response({...f.nodeReceipt, action_key:'node.apply.transport', output:{value:{}}});
    if (f.nodeReceipt && code.includes('"receipt_read":true')) return response({...f.nodeReceipt, action_key:'operation.inspect', output:{state:'completed', receipt:f.nodeReceipt}});
    if (code.includes('function readRecoveryPage')) return response(f.page);
    if (code.includes('function readSavedPackageState')) {
      const value = {version: 1, session_id: 'session', document_id: 'doc', account: 'user', package_path: path,
        modified: false, observation: 'after_confirmed_save', read_only: true, persisted_content_verified: false};
      if (code.includes('action_key:"browser.recovery.transport"')) return response({status: 'SUCCEEDED', action_key: 'browser.recovery.transport',
        action_revision: '1', operation_id: JSON.parse(code.match(/operation_id:("[^"]+")/)[1]), phase: 'transport', effect_possible: true,
        trace: [], error: null, output: {value}});
      return response(value);
    }
    const id = JSON.parse(code.match(/"operation_id":("[^"]+")/)[1]);
    const outcome = {status: 'AMBIGUOUS', action_key: save.action_key, action_revision: revision, operation_id: id,
      phase: 'applied', effect_possible: true, cleanup_complete: true, error: null, trace: [], output: {}};
    if (code.includes('"receipt_read":true')) return response({...outcome, status: 'SUCCEEDED', action_key: 'operation.inspect', action_revision: '1',
      effect_possible: false, output: {state: 'completed', receipt: {...outcome, operation_id: JSON.parse(code.match(/"receipt_id":("[^"]+")/)[1])}}});
    if (code.includes('"mode":"reconcile"') || code.includes('"receipt_namespace":')) return response(outcome);
    return response({...outcome, status: 'NOT_APPLIED', phase: 'prepared', effect_possible: false,
      checkpoint: {document_id: 'doc', workflow_ref: {workflow_id: 'wf'}}});
  }
}
class ExternalTransport {}
mock.module('@modelcontextprotocol/sdk/client/index.js', {exports: {Client: ExternalClient}});
mock.module('@modelcontextprotocol/sdk/client/stdio.js', {exports: {StdioClientTransport: ExternalTransport, getDefaultEnvironment: () => ({})}});
mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', {exports: {StreamableHTTPClientTransport: ExternalTransport}});
// Save uses the normal executor; node regressions compose the existing real
// executor fixture with the same external MCP transport and durable journal.
mock.module(new URL('../../lib/executor.mjs', import.meta.url).href, {exports: {...executor, createActionRuntime: options => {
  const f = current;
  if (!f.node) return executor.createActionRuntime(options);
  f.nodeFixture=stopped.fixture({release:state=>f.releaseDriver(state),
    browserRecovery:options.browserRecovery, execute:options.execute,
    onRecord:async event=>{await f.recordEntered?.(event);return options.onRecord(event);},
    nodeApplyDriverFactory:(context, drivers)=>{
      const finish=drivers.finish;
      drivers.finish=async mode=>{
        const id=context.operation.id+':finish';
        context.receiptOptions(id,'node.finish','fixture-signature');
        f.nodeReceipt={status:'SUCCEEDED',action_key:'node.finish',action_revision:'1',operation_id:id,
          phase:'finished',effect_possible:true,cleanup_complete:true,error:null,trace:[],output:{}};
        await context.execute('async page => ({})');
        return finish(mode);
      };
      return drivers;
    },
    acceptanceFault:[{kind:'phase_stop',node_type:'imports.text',phase:'finish',code:'UI_SCAN_LIMIT',times:1},
      ...(f.node==='pending'?[{kind:'release_refusal',node_type:'imports.text',times:1}]:[])],
  });
  return f.nodeFixture.runtime;
}}});
const {createBridge} = await import('../../lib/bridge.mjs');
async function recoveryBridge(t, {browserRecovery, mode = 'executor-replay', resultProfile = 'user-v1', node, ...config} = {browserRecovery:true}) {
  const directory = await mkdtemp(join(tmpdir(), 'browser-recovery-bridge-'));
  const f = current = {node, releaseDriver:stopped.proved(), browserCodes: [], browserCalls: [], closed: [], browserReply: response('snapshot'),
    page: {origin_ok: true, document_present: true, page_count: 1}};
  const session = {directory, browserCli: '/test/browser', browserRoot: '/test', browserConfig: '/test/config',
    metadata: {client: 'test', sessionId: 'session', ...runtimeIdentity, workspaceReady: true, skillRevision: 'fixture', targetIdentity: target,
      storageBinding: {session_id: 'session', document_id: 'doc', loginom_account: 'user', origin: 'http://loginom.invalid', loginom_build: '7.4.2'},
      workspacePreparation: {attempted: true, state: {document_id: 'doc', loginom_account: 'user', workflow_ref: {tab_tid: 'tab'}}}},
    async save() {}, artifactStore: {list: () => [], async releaseUploads() {}}};
  const bridge = await createBridge({actionManifestUri: catalog.manifestUri, actionManifestSha256: catalog.manifestSha256,
    mode, resultProfile, browserRecovery, apiKey: 'fixture-key', endpoint: 'https://dock.invalid/mcp', stateDir: directory,
    loginomUrl: 'http://loginom.invalid/app', ...config}, session);
  const client = new sdk.Client({name: 'recovery-test', version: '1'});
  const [a, b] = InMemoryTransport.createLinkedPair(); await bridge.server.connect(b); await client.connect(a);
  t.after(async () => { await client.close(); await bridge.close(); await rm(directory, {recursive: true, force: true}); });
  return Object.assign(f, {bridge, directory,
    callRaw: (name, args = {}) => client.callTool({name, arguments: args}),
    async call(name, args) { return JSON.parse((await this.callRaw(name, args)).content[0].text); },
    async tools() { return (await client.listTools()).tools.map(tool => tool.name); },
    async events() { return (await readFile(join(directory, 'execution-events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse); },
  });
}

test('real executor Save inspect, browser recovery, verified receipt and ordinary catalog', async t => {
  const b = await recoveryBridge(t);
  assert.ok((await b.tools()).includes('dock_browser_recovery'));
  assert.equal((await b.tools()).some(name => name.startsWith('browser_')), false);
  await b.call('dock_action_run', save);
  assert.equal((await b.call('dock_browser_recovery', {action: 'start', operation_id: save.operation_id})).error.code, 'BROWSER_RECOVERY_NOT_OFFERED');
  const inspected = await b.call('dock_operation_inspect', {operation_id: save.operation_id});
  assert.equal(inspected.next_step?.tool, 'dock_browser_recovery', JSON.stringify(inspected));
  const started = await b.call('dock_browser_recovery', {action: 'start', operation_id: save.operation_id});
  assert.equal(started.state, 'browser', JSON.stringify(started));
  assert.deepEqual((await b.tools()).sort(), [...remoteNames, 'dock_diagnostics', 'dock_browser_recovery', ...RECOVERY_BROWSER_TOOLS].sort());
  assert.notEqual((await b.callRaw('read',{uris:[catalog.manifestUri]})).isError,true);
  assert.equal((await b.call('dock_diagnostics',{checkConnections:false})).sessionId,'session');
  await b.callRaw('browser_snapshot');
  assert.equal(b.browserCalls.length, 1);
  const finished = await b.call('dock_browser_recovery', {action: 'finish', report});
  assert.equal(finished.result, 'completed', JSON.stringify(finished));
  assert.equal(finished.receipt_id, 'br-1:receipt');
  assert.equal((await b.tools()).some(name => name.startsWith('browser_')), false);
  assert.ok((await b.events()).some(event => event.phase === 'browser_recovery_verified'));
});

test('browser lease refuses known Dock mutations and local cancellation before dispatch', async t => {
  const b = await recoveryBridge(t);
  await b.call('dock_action_run', save);
  await b.call('dock_operation_inspect', {operation_id: save.operation_id});
  await b.call('dock_browser_recovery', {action: 'start', operation_id: save.operation_id});
  const before = b.browserCodes.length;
  for (const name of ['dock_action_run', 'dock_node_apply', 'dock_node_cancel', 'dock_node_stop', 'dock_prepare', 'dock_operation_inspect']) {
    const reply = await b.call(name, save);
    assert.equal(reply.error.code, 'BROWSER_RECOVERY_ACTIVE', name);
  }
  assert.equal(b.browserCodes.length, before);
  assert.equal(b.bridge.hasActiveWork(), true);
  assert.equal(b.bridge.hasUnsettledWork(), true);
});

test('oversized browser snapshots are refused after charging the call and retain lease metadata', async t => {
  const b = await recoveryBridge(t);
  await b.call('dock_action_run', save);
  await b.call('dock_operation_inspect', {operation_id: save.operation_id});
  await b.call('dock_browser_recovery', {action: 'start', operation_id: save.operation_id});
  b.browserReply = {content: [{type: 'text', text: 'x'.repeat(47000)}]};
  const reply = await b.callRaw('browser_snapshot');
  assert.equal(reply.isError, true);
  assert.equal(JSON.parse(reply.content[0].text).error.code, 'USER_RESPONSE_BUDGET');
  assert.equal(reply._meta['loginom/browser_recovery'].calls_remaining, 29);
  assert.equal(b.browserCalls.length, 1);
});


test('run release waits for an accepted browser call and retains stopped uncertainty', async t => {
  const b = await recoveryBridge(t);
  await b.call('dock_action_run', save);
  await b.call('dock_operation_inspect', {operation_id: save.operation_id});
  await b.call('dock_browser_recovery', {action:'start', operation_id:save.operation_id});
  assert.equal(typeof b.bridge.releaseRun,'function');
  const entered=Promise.withResolvers(), native=Promise.withResolvers();
  b.browserEntered=entered.resolve; b.browserReply=native.promise;
  const calling=b.callRaw('browser_snapshot'); await entered.promise;
  let released=false;
  const releasing=b.bridge.releaseRun().then(() => { released=true; });
  await Promise.resolve(); assert.equal(released,false);
  native.resolve(response('confirmed browser result'));
  const reply=await calling; await releasing;
  assert.equal(reply.content[0].text,JSON.stringify('confirmed browser result'));
  assert.equal(reply.structuredContent.stop_reason,'run_released');
  assert.equal((await b.tools()).some(name => name.startsWith('browser_')),false);
  assert.equal(b.bridge.hasUnsettledWork(),true);
  assert.equal((await b.call('dock_action_run',save)).error.code,'BROWSER_RECOVERY_ACTIVE');
});


async function stoppedBridge(t, node='pending') {
  const b=await recoveryBridge(t,{browserRecovery:true,node,closeSavedPackageOnShutdown:true});
  b.nodeFixture.runtime.startNodeApply(stopped.request());
  const job=await b.nodeFixture.runtime.waitNodeApply('apply',{timeoutMs:1000});
  assert.equal(job.outcome.status,'AMBIGUOUS');
  const release=await b.call('dock_operation_recover',{operation_id:'apply',strategy:'abandon_operation',recovery_operation_id:'initial-release'});
  assert.equal(release.status,node==='pending'?'AMBIGUOUS':'SUCCEEDED',JSON.stringify(release));
  return b;
}

test('stopped safe release requires the same operation and actual native proof plus durable ACK', async t => {
  const b=await stoppedBridge(t);
  const start=await b.call('dock_browser_recovery',{action:'start',operation_id:'apply'});
  assert.equal(start.state,'browser',JSON.stringify(start));
  await b.call('dock_browser_recovery',{action:'stop',reason:'No further browser action'});
  const args={operation_id:'apply',strategy:'abandon_operation',recovery_operation_id:'safe-release'};
  for(const wrong of [{...args,operation_id:'other'},{...args,strategy:'restore_control'}])
    assert.equal((await b.call('dock_operation_recover',wrong)).error.code,'BROWSER_RECOVERY_ACTIVE');
  assert.notEqual((await b.call('dock_operation_recover',{...args,recovery_operation_id:'initial-release'})).status,'SUCCEEDED');
  const entered=Promise.withResolvers(), proof=Promise.withResolvers(), ackEntered=Promise.withResolvers(), ack=Promise.withResolvers();
  b.recordEntered=async event=>{if(event.phase==='node_operation_released'){ackEntered.resolve();await ack.promise;}};
  b.releaseDriver=async state=>{entered.resolve();await proof.promise;return stopped.proved()(state);};
  const releasing=b.call('dock_operation_recover',args);await entered.promise;
  assert.equal(b.bridge.hasUnsettledWork(),true);
  assert.equal((await b.call('dock_action_run',save)).error.code,'BROWSER_RECOVERY_ACTIVE');
  proof.resolve();await ackEntered.promise;
  assert.equal(b.bridge.hasUnsettledWork(),true);
  assert.equal((await b.call('dock_action_run',save)).error.code,'BROWSER_RECOVERY_ACTIVE');
  ack.resolve();const released=await releasing;
  assert.equal(released.status,'SUCCEEDED',JSON.stringify(released));
  assert.equal(b.bridge.hasUnsettledWork(),false);
  assert.ok((await b.events()).some(event=>event.phase==='node_operation_released'));
  assert.ok((await b.tools()).includes('dock_action_run'));
});

test('disabled, nonboolean and other profiles retain their original catalog and reject recovery routes', async t => {
  for(const browserRecovery of [undefined, false, null, 1, 'true']) {
    const b=await recoveryBridge(t,{browserRecovery});
    assert.equal((await b.tools()).includes('dock_browser_recovery'),false);
    assert.equal((await b.tools()).some(name=>name.startsWith('browser_')),false);
    await assert.rejects(b.callRaw('browser_click',{target:'e1'}),/Unknown Dock tool/);
    await assert.rejects(b.callRaw('dock_browser_recovery',{action:'start',operation_id:save.operation_id}),/Unknown Dock tool/);
    await b.call('dock_action_run',save);
    assert.notEqual((await b.call('dock_operation_inspect',{operation_id:save.operation_id})).next_step?.tool,'dock_browser_recovery');
  }
  for(const config of [{browserRecovery:true,mode:'classic'},{browserRecovery:true,resultProfile:'diagnostic'},
    {browserRecovery:true,mode:'executor-preview'},{browserRecovery:false,mode:'executor-preview'}]) {
    const b=await recoveryBridge(t,config);
    assert.equal((await b.tools()).includes('dock_browser_recovery'),false);
    await assert.rejects(b.callRaw('dock_browser_recovery',{action:'start',operation_id:save.operation_id}),/Unknown Dock tool/);
  }
});

test('a Dock call queued before recovery start is refused inside the existing gate', async t => {
  const b=await recoveryBridge(t);
  await b.call('dock_action_run',save);
  const entered=Promise.withResolvers(), native=Promise.withResolvers();
  b.codeEntered=async code=>{if(code.includes('"mode":"reconcile"')){entered.resolve();await native.promise;}};
  const inspecting=b.call('dock_operation_inspect',{operation_id:save.operation_id});await entered.promise;
  const starting=b.call('dock_browser_recovery',{action:'start',operation_id:save.operation_id});
  const queued=b.call('dock_action_run',{...save,operation_id:'queued-save'});
  await b.tools();native.resolve();await inspecting;
  assert.equal((await starting).state,'browser');
  assert.equal((await queued).error.code,'BROWSER_RECOVERY_ACTIVE');
  assert.equal(b.browserCodes.some(code=>code.includes('"operation_id":"queued-save"')),false);
});

test('close releases the browser lease, waits for accepted work and closes clients with honest blocked cleanup', async t => {
  const b=await recoveryBridge(t,{browserRecovery:true,closeSavedPackageOnShutdown:true});
  await b.call('dock_action_run',save);
  await b.call('dock_operation_inspect',{operation_id:save.operation_id});
  await b.call('dock_browser_recovery',{action:'start',operation_id:save.operation_id});
  const entered=Promise.withResolvers(), native=Promise.withResolvers();
  b.browserEntered=entered.resolve;b.browserReply=native.promise;
  const calling=b.callRaw('browser_snapshot');await entered.promise;
  const closing=b.bridge.close();
  await Promise.resolve();assert.deepEqual(b.closed,[]);
  native.resolve(response('confirmed before close'));
  const reply=await calling, closed=await closing;
  assert.equal(reply.content[0].text,JSON.stringify('confirmed before close'));
  assert.equal(reply.structuredContent.stop_reason,'runtime_closed');
  assert.equal(closed.browser_transport_closed,true);
  assert.equal(closed.package_cleanup.status,'BLOCKED');
  assert.equal(b.browserCodes.some(code=>code.includes('async function closeOwnedPackage')),false);
  assert.deepEqual(b.closed.sort(),['browser','remote']);
});


for(const failure of ['timeout','isError','page_changed']) test('settled T4 keeps unknown browser work out of Dock and package cleanup: '+failure, async t => {
  const b=await stoppedBridge(t,'settled');
  assert.equal(b.nodeFixture.runtime.hasUnsettledWork(),false);
  assert.equal((await b.nodeFixture.runtime.inspect({operationId:'apply'})).output.state,'resolved');
  assert.equal((await b.call('dock_browser_recovery',{action:'start',operation_id:'apply'})).state,'browser');
  assert.equal(b.bridge.hasActiveWork(),true);
  if(failure==='timeout')b.browserReply=Error('Browser call timed out');
  if(failure==='isError')b.browserReply={isError:true,...response('Unconfirmed browser failure')};
  if(failure==='page_changed')b.page={origin_ok:false,document_present:false,page_count:2};
  const reply=await b.callRaw('browser_snapshot');
  assert.equal(reply.structuredContent.state,'stopped');
  assert.equal(b.nodeFixture.runtime.hasUnsettledWork(),false);
  assert.equal(b.bridge.hasUnsettledWork(),true);
  const before=b.browserCodes.length;
  assert.equal((await b.call('dock_action_run',save)).error.code,'BROWSER_RECOVERY_ACTIVE');
  assert.equal((await b.call('dock_operation_recover',{operation_id:'apply',strategy:'abandon_operation',recovery_operation_id:'unknown-release'})).error.code,'BROWSER_RECOVERY_ACTIVE');
  assert.equal(b.browserCodes.length,before);
  const closed=await b.bridge.close();
  assert.equal(closed.package_cleanup.reason,'CLEANUP_OR_OPERATION_UNCONFIRMED');
  assert.equal(closed.browser_transport_closed,true);
  assert.equal(b.browserCodes.length,before);
  assert.deepEqual(b.closed.sort(),['browser','remote']);
});


test('queued A admission cannot revive after release and a newer B admission', async t => {
  const b=await stoppedBridge(t);
  await b.call('dock_browser_recovery',{action:'start',operation_id:'apply'});
  await b.call('dock_browser_recovery',{action:'stop',reason:'Stop'});
  const entered=Promise.withResolvers(), native=Promise.withResolvers();
  b.releaseDriver=async()=>{entered.resolve();await native.promise;throw new NodeReleaseBlocked('Native proof refused','Stop');};
  const args={operation_id:'apply',strategy:'abandon_operation'};
  const holding=b.call('dock_operation_recover',{...args,recovery_operation_id:'holding-release'});
  await entered.promise;
  const oldA=b.call('dock_operation_recover',{...args,recovery_operation_id:'old-A'});
  await b.tools();
  await b.bridge.releaseRun();
  const newB=b.call('dock_operation_recover',{...args,recovery_operation_id:'new-B'});
  await b.tools();
  b.releaseDriver=stopped.proved();native.resolve();
  assert.equal((await holding).error.code,'NODE_RELEASE_REFUSED');
  assert.equal((await oldA).error.code,'BROWSER_RECOVERY_ACTIVE');
  assert.equal((await newB).status,'SUCCEEDED');
  const dispatched=(await b.events()).filter(event=>event.phase==='recovery_prepared').map(event=>event.operation_id);
  assert.equal(dispatched.includes('old-A'),false);
  assert.ok(dispatched.includes('new-B'));
  assert.equal(b.nodeFixture.calls.filter(call=>call==='release:finish').length,2);
  assert.equal(b.bridge.hasUnsettledWork(),false);
});


test('a safe release completed after run release retains proof without reopening Dock', async t => {
  const b=await stoppedBridge(t);
  await b.call('dock_browser_recovery',{action:'start',operation_id:'apply'});
  await b.call('dock_browser_recovery',{action:'stop',reason:'Stop'});
  const entered=Promise.withResolvers(), native=Promise.withResolvers();
  b.releaseDriver=async state=>{entered.resolve();await native.promise;return stopped.proved()(state);};
  const releasing=b.call('dock_operation_recover',{operation_id:'apply',strategy:'abandon_operation',recovery_operation_id:'late-release'});
  await entered.promise;await b.bridge.releaseRun();native.resolve();
  assert.equal((await releasing).status,'SUCCEEDED');
  assert.equal(b.nodeFixture.runtime.hasUnsettledWork(),false);
  assert.equal(b.bridge.hasUnsettledWork(),true);
  const stoppedReply=await b.call('dock_browser_recovery',{action:'start',operation_id:'apply'});
  assert.equal(stoppedReply.summary.safe_release.recovery_operation_id,'late-release');
  assert.equal(stoppedReply.summary.safe_release.output.resolution,'released_after_proof');
  assert.equal((await b.call('dock_action_run',save)).error.code,'BROWSER_RECOVERY_ACTIVE');
});

test('auxiliary resume journal failure does not erase the verified recovery receipt', async t => {
  const b=await recoveryBridge(t);
  await b.call('dock_action_run',save);
  await b.call('dock_operation_inspect',{operation_id:save.operation_id});
  await b.call('dock_browser_recovery',{action:'start',operation_id:save.operation_id});
  const finished=await b.call('dock_browser_recovery',{action:'finish',report});
  assert.equal(finished.result,'completed');
  await rm(join(b.directory,'execution-events.jsonl'));
  await mkdir(join(b.directory,'execution-events.jsonl'));
  const inspected=await b.call('dock_operation_inspect',{operation_id:finished.receipt_id});
  assert.equal(inspected.status,'SUCCEEDED');
  assert.equal(inspected.output.outcome.operation_id,finished.receipt_id);
  assert.equal(b.bridge.hasUnsettledWork(),false);
  assert.ok((await b.tools()).includes('dock_action_run'));
});
