import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, statSync, chmodSync, rmSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateProjectRouting, resolveProjectRoute, routingReceiptPath } from '../project-routing.mjs';
import { runHook, parseHookInput, buildChildEnvironment, activationPath, HOOK_SCRIPTS } from '../hook-router.mjs';
import { deriveWorkspacePeerId } from '../vendor/workspace-peer.mjs';

const CONFIG = `export function loadConfig() {
 const env = process.env.OPENVIKING_CREDENTIAL_SOURCE === 'env';
 return { credentialSource: env ? 'env' : 'ovcli',
 baseUrl: env ? process.env.OPENVIKING_URL : 'https://memory.example.test',
 apiKey: env ? (process.env.FIXTURE_CONNECTION_DRIFT ? 'wrong-fixture-key' : process.env.OPENVIKING_API_KEY) : 'fixture-key-not-a-secret',
 account: env ? process.env.OPENVIKING_ACCOUNT : 'fixture-account',
 user: env ? process.env.OPENVIKING_USER : 'fixture-user',
 authMode: env ? process.env.OPENVIKING_AUTH_MODE : 'api_key', sendIdentityHeaders: false,
 peerId: env ? process.env.OPENVIKING_PEER_ID : '', recallPeerScope: env ? process.env.OPENVIKING_RECALL_PEER_SCOPE : 'actor' };
}`;
const SCRIPT = `import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { join } from 'node:path';
const chunks=[];for await(const c of process.stdin)chunks.push(c);
const raw=Buffer.concat(chunks);const input=JSON.parse(raw);
if(process.env.FIXTURE_FAIL==='1')process.exit(9);
const statePath=join(process.env.OPENVIKING_CODEX_STATE_DIR,input.session_id+'.json');
const state=existsSync(statePath)?JSON.parse(readFileSync(statePath)):{codexSessionId:input.session_id,workspacePeerId:'',ovSessionId:null,capturedTurnCount:0};
if(process.argv[1].endsWith('session-start-commit.mjs'))writeFileSync(statePath,JSON.stringify(state));
process.stdout.write(JSON.stringify({raw:raw.toString(),cwd:process.cwd(),stateDir:process.env.OPENVIKING_CODEX_STATE_DIR,peer:process.env.OPENVIKING_PEER_ID,scope:process.env.OPENVIKING_RECALL_PEER_SCOPE,source:process.env.OPENVIKING_CREDENTIAL_SOURCE,script:process.argv[1].split('/').at(-1)})+'\\n');
`;

function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'ov-hook-router-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const projectRoot = join(root, 'project'), cwd = join(projectRoot, '.worktrees', 'node-11');
  const stateDir = join(root, 'project-state'), pluginRoot = join(root, 'plugin-0.8.1');
  const legacyStateDir = join(root, 'legacy-state');
  for (const path of [cwd, stateDir, pluginRoot, legacyStateDir]) mkdirSync(path, { recursive: true, mode: 0o700 });
  mkdirSync(join(pluginRoot, 'scripts')); mkdirSync(join(pluginRoot, '.codex-plugin'));
  mkdirSync(join(pluginRoot, 'hooks')); writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), '{}');
  writeFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({version:'0.8.1'}));
  writeFileSync(join(pluginRoot, 'scripts', 'config.mjs'), CONFIG);
  for (const name of ['session-start-commit.mjs', 'auto-recall.mjs', 'auto-capture.mjs', 'pre-compact-capture.mjs', 'session-end.mjs'])
    writeFileSync(join(pluginRoot, 'scripts', name), SCRIPT);
  const routing = validateProjectRouting({ version: 1, projects: [{ projectRoot, workspaces:[cwd], stateDir, pluginRoot, generation:'test-1' }] });
  const route = resolveProjectRoute(cwd, routing), threadId = 'node11-test-thread';
  const context = { cwd, threadId }, raw = Buffer.from(JSON.stringify({cwd, session_id:threadId, source:'startup', untouched:{value:'original'}})+'\n');
  mkdirSync(join(stateDir, 'routing-activations'), {mode:0o700});
  const activation = {version:1,...context,routeHash:route.routeHash,generation:route.generation,sourceStateDir:legacyStateDir,
    originalStateRetired:true,originalProjectHooksDisabled:true,disablementMethod:'project-hook-config',verifiedAt:'2026-09-13T00:00:00Z'};
  writeFileSync(activationPath(context, route), JSON.stringify(activation), {mode:0o600});
  const options = {raw,cwd,routing,legacyStateDir,parentEnv:{OPENVIKING_CREDENTIAL_SOURCE:'cli'}};
  async function run(event, extra={}) {
    let out='',err='';
    const result = await runHook(event,{...options,...extra,
      stdout:new Writable({write(chunk,_,done){out+=chunk;done();}}),
      stderr:new Writable({write(chunk,_,done){err+=chunk;done();}})});
    return {result,out,err,data:out ? JSON.parse(out) : null};
  }
  return {root,route,context,raw,options,run,activation,stateDir,legacyStateDir,pluginRoot,cwd};
}

function legacyState(f, overrides = {}) {
  return {codexSessionId:f.context.threadId,workspacePeerId:deriveWorkspacePeerId(f.cwd),
    ovSessionId:'cx-'+f.context.threadId,capturedTurnCount:37,...overrides};
}

test('root and unmapped workspaces skip all five hooks without starting a child or writing routing state',async t=>{
  const f=fixture(t), unrelated=join(f.root,'unrelated');mkdirSync(unrelated);
  const before=readdirSync(f.stateDir,{recursive:true});
  for(const cwd of [f.route.projectRoot,unrelated]) for(const event of Object.keys(HOOK_SCRIPTS)) {
    const answer=await f.run(event,{cwd,raw:Buffer.from(JSON.stringify({cwd,session_id:f.context.threadId})),
      spawnImpl(){assert.fail('unmapped hook started a child');}});
    assert.equal(answer.result.skipped,'unmapped-workspace');
    assert.equal(answer.result.routeEstablished,false);assert.equal(answer.result.captureVerified,false);
    assert.equal(answer.out,'');assert.equal(answer.err,'');
  }
  assert.deepEqual(readdirSync(f.stateDir,{recursive:true}),before);
});

test('unactivated mapped task with exact protected legacy state stays in standby for all five hooks',async t=>{
  const f=fixture(t);rmSync(activationPath(f.context,f.route));
  const path=join(f.legacyStateDir,f.context.threadId+'.json'),bytes=JSON.stringify(legacyState(f));
  writeFileSync(path,bytes,{mode:0o600});
  chmodSync(f.legacyStateDir,0o755);
  const before=readdirSync(f.stateDir,{recursive:true});
  for(const mode of [0o600,0o644]) {
    chmodSync(path,mode);
    for(const event of Object.keys(HOOK_SCRIPTS)) {
      const answer=await f.run(event,{spawnImpl(){assert.fail('standby hook started a child');}});
      assert.equal(answer.result.skipped,'legacy-standby');assert.equal(answer.result.routeEstablished,false);
      assert.equal(answer.result.captureVerified,false);assert.equal(answer.out,'');assert.equal(answer.err,'');
      assert.equal(readFileSync(path,'utf8'),bytes);assert.equal(statSync(path).mode & 0o777,mode);
    }
  }
  assert.equal(statSync(f.legacyStateDir).mode & 0o777,0o755);
  assert.deepEqual(readdirSync(f.stateDir,{recursive:true}),before);
});

test('standby rejects foreign or malformed legacy identities and cursors',async t=>{
  const f=fixture(t);rmSync(activationPath(f.context,f.route));
  const path=join(f.legacyStateDir,f.context.threadId+'.json');
  for(const state of [legacyState(f,{codexSessionId:'foreign'}),legacyState(f,{workspacePeerId:f.route.canonicalPeerId}),
    legacyState(f,{workspacePeerId:''}),legacyState(f,{ovSessionId:'cx-foreign'}),
    legacyState(f,{capturedTurnCount:-1}),legacyState(f,{capturedTurnCount:0.5}),null]) {
    writeFileSync(path,JSON.stringify(state),{mode:0o600});
    await assert.rejects(f.run('Stop'),/Original hook state does not match/);
  }
  writeFileSync(path,'{broken');await assert.rejects(f.run('Stop'),/not valid JSON/);
});

test('standby refuses insecure legacy files and symlinked legacy paths',async t=>{
  const f=fixture(t);rmSync(activationPath(f.context,f.route));
  const path=join(f.legacyStateDir,f.context.threadId+'.json');
  writeFileSync(path,JSON.stringify(legacyState(f)),{mode:0o600});
  for(const mode of [0o664,0o666]) {
    chmodSync(path,mode);await assert.rejects(f.run('Stop'),/owner-controlled/);
  }
  chmodSync(path,0o600);
  chmodSync(f.legacyStateDir,0o777);await assert.rejects(f.run('Stop'),/owner-controlled/);chmodSync(f.legacyStateDir,0o700);
  const linkedDir=join(f.root,'legacy-link');symlinkSync(f.legacyStateDir,linkedDir);
  await assert.rejects(f.run('Stop',{legacyStateDir:linkedDir}),/owner-controlled/);
  rmSync(path);symlinkSync(join(f.root,'missing'),path);
  await assert.rejects(f.run('Stop'),/owner-controlled/);
});

test('present invalid activation never falls back to otherwise valid legacy standby',async t=>{
  const f=fixture(t),path=activationPath(f.context,f.route);
  writeFileSync(join(f.legacyStateDir,f.context.threadId+'.json'),JSON.stringify(legacyState(f)),{mode:0o600});
  writeFileSync(path,JSON.stringify({...f.activation,generation:'old'}));
  await assert.rejects(f.run('Stop'),/activation/);
  rmSync(path);symlinkSync(join(f.root,'missing'),path);
  await assert.rejects(f.run('Stop'),/activation/);
});

test('removing activation after shared state or receipt exists cannot downgrade to standby',async t=>{
  const f=fixture(t);rmSync(activationPath(f.context,f.route));
  writeFileSync(join(f.legacyStateDir,f.context.threadId+'.json'),JSON.stringify(legacyState(f)),{mode:0o600});
  mkdirSync(join(f.stateDir,'routing-receipts'),{mode:0o700});
  for(const path of [join(f.stateDir,f.context.threadId+'.json'),routingReceiptPath(f.route,f.context.threadId)]) {
    writeFileSync(path,'{}',{mode:0o600});
    await assert.rejects(f.run('SessionStart'),/Shared hook state exists without a valid activation/);rmSync(path);
  }
});

test('five hooks preserve exact input/cwd/session and pin child-only project routing from CLI credentials',async t=>{
  const f=fixture(t);
  const first=await f.run('SessionStart');
  assert.equal(first.data.raw,f.raw.toString()); assert.equal(first.data.cwd,f.cwd);
  assert.equal(first.data.peer,f.route.canonicalPeerId); assert.equal(first.data.scope,'actor');
  assert.equal(first.data.stateDir,f.stateDir); assert.equal(first.data.source,'env');
  assert.equal(first.result.captureVerified,false); assert.equal(first.result.routeEstablished,true);
  const receipt=routingReceiptPath(f.route,f.context.threadId), receiptBytes=readFileSync(receipt);
  assert.equal(statSync(receipt).mode & 0o777,0o600);
  assert.equal(statSync(join(f.stateDir,f.context.threadId+'.json')).mode & 0o777,0o600);
  for(const event of ['UserPromptSubmit','Stop','PreCompact','SessionEnd']){
    const answer=await f.run(event);
    assert.equal(answer.data.raw,f.raw.toString());assert.equal(answer.result.captureVerified,false);
    assert.deepEqual(readFileSync(receipt),receiptBytes);
  }
});

test('preserves existing cursor and cx session ID across SessionStart',async t=>{
  const f=fixture(t), path=join(f.stateDir,f.context.threadId+'.json');
  const state={codexSessionId:f.context.threadId,workspacePeerId:'',ovSessionId:'cx-'+f.context.threadId,capturedTurnCount:387};
  writeFileSync(path,JSON.stringify(state),{mode:0o600});
  await f.run('SessionStart');assert.deepEqual(JSON.parse(readFileSync(path)),state);
});

test('unsupported events and mismatching host cwd/session are refused before execution',async t=>{
  const f=fixture(t);
  await assert.rejects(f.run('Unknown'),/Unsupported/);
  assert.throws(()=>parseHookInput(Buffer.from('{}'),f.cwd),/session_id/);
  await assert.rejects(f.run('SessionStart',{cwd:f.route.projectRoot}),/cwd/);
  await assert.rejects(f.run('SessionStart',{raw:Buffer.from(JSON.stringify({cwd:f.cwd,session_id:'../other'}))}),/session_id/);
  assert.equal(existsSync(routingReceiptPath(f.route,f.context.threadId)),false);
});

test('missing activation and stale activation fail even when legacy state is absent',async t=>{
  const f=fixture(t), activation=activationPath(f.context,f.route);
  writeFileSync(activation,JSON.stringify({...f.activation,originalProjectHooksDisabled:false}));
  await assert.rejects(f.run('SessionStart'),/activation/);
  rmSync(activation);await assert.rejects(f.run('SessionStart'),/activation/);
});

test('any active original state/lock/end marker blocks shared hooks',async t=>{
  const f=fixture(t);
  for(const suffix of ['.json','.lock','.ended','.ended.12345']){
    const path=join(f.legacyStateDir,f.context.threadId+suffix);writeFileSync(path,'fixture');
    await assert.rejects(f.run('SessionStart'),/original hook/);rmSync(path);
  }
});

test('receipt is issued only after successful SessionStart and validated private state',async t=>{
  const f=fixture(t);
  await assert.rejects(f.run('Stop'),/receipt/);
  await assert.rejects(f.run('SessionStart',{parentEnv:{...f.options.parentEnv,FIXTURE_FAIL:'1'}}),/successfully/);
  assert.equal(existsSync(routingReceiptPath(f.route,f.context.threadId)),false);
  const path=join(f.stateDir,f.context.threadId+'.json');
  writeFileSync(path,JSON.stringify({codexSessionId:'foreign',workspacePeerId:'',capturedTurnCount:0}),{mode:0o600});
  await assert.rejects(f.run('SessionStart'),/state disagrees/);
  assert.equal(existsSync(routingReceiptPath(f.route,f.context.threadId)),false);
});

test('stale generation and wrong plugin version refuse execution',async t=>{
  const f=fixture(t);await f.run('SessionStart');
  const receipt=routingReceiptPath(f.route,f.context.threadId), old=JSON.parse(readFileSync(receipt));
  writeFileSync(receipt,JSON.stringify({...old,generation:'stale'}));
  await assert.rejects(f.run('Stop'),/stale/);
  writeFileSync(join(f.pluginRoot,'.codex-plugin','plugin.json'),JSON.stringify({version:'0.8.2'}));
  await assert.rejects(f.run('SessionStart'),/0.8.1/);
});

test('child environment replaces stale alternative credentials without altering parent',()=>{
  const parent={OPENVIKING_CREDENTIAL_SOURCE:'cli',OPENVIKING_BEARER_TOKEN:'wrong',OPENVIKING_MCP_URL:'https://wrong.test/mcp',OV_HOOK_WORKER:'1',UNRELATED:'keep'};
  const copy={...parent},cfg={baseUrl:'https://right.test',apiKey:'right',account:'a',user:'u',authMode:'api_key',sendIdentityHeaders:false,peerId:''};
  const child=buildChildEnvironment(parent,cfg,{canonicalPeerId:'project',stateDir:'/private/state',pluginRoot:'/private/plugin'});
  assert.deepEqual(parent,copy);assert.equal(child.OPENVIKING_API_KEY,'right');assert.equal(child.OPENVIKING_BEARER_TOKEN,undefined);
  assert.equal(child.OPENVIKING_MCP_URL,undefined);assert.equal(child.OV_HOOK_WORKER,undefined);assert.equal(child.UNRELATED,'keep');
});

test('changed source content is rejected even when manifest version stays pinned',async t=>{
  const f=fixture(t);
  writeFileSync(join(f.pluginRoot,'scripts','auto-capture.mjs'),SCRIPT+'\n// changed\n');
  await assert.rejects(f.run('SessionStart'),/plugin.*changed/i);
  assert.equal(existsSync(routingReceiptPath(f.route,f.context.threadId)),false);
});

test('a child credential resolution drift fails before the official hook starts',async t=>{
  const f=fixture(t);
  await assert.rejects(f.run('SessionStart',{parentEnv:{...f.options.parentEnv,FIXTURE_CONNECTION_DRIFT:'1'}}),/successfully/);
  assert.equal(existsSync(routingReceiptPath(f.route,f.context.threadId)),false);
  assert.equal(existsSync(join(f.stateDir,f.context.threadId+'.json')),false);
});

test('CLI entrypoint works with reviewed route config and exact host stdin',t=>{
  const f=fixture(t), configDir=join(f.root,'.openviking'), legacy=join(configDir,'codex-plugin-state');
  mkdirSync(legacy,{recursive:true,mode:0o700});
  const route=f.route;
  writeFileSync(join(configDir,'project-memory-routing.json'),JSON.stringify({version:1,projects:[{
    projectRoot:route.projectRoot,workspaces:route.workspaces,stateDir:route.stateDir,pluginRoot:route.pluginRoot,generation:route.generation,
  }]}),{mode:0o600});
  writeFileSync(activationPath(f.context,route),JSON.stringify({...f.activation,sourceStateDir:legacy}));
  const script=fileURLToPath(new URL('../hook-router.mjs',import.meta.url));
  const answer=spawnSync(process.execPath,[script,'SessionStart'],{cwd:f.cwd,input:f.raw,encoding:'utf8',env:{HOME:f.root,OPENVIKING_CREDENTIAL_SOURCE:'cli'}});
  assert.equal(answer.status,0);assert.equal(answer.stderr,'');
  assert.equal(JSON.parse(answer.stdout).raw,f.raw.toString());
  assert.equal(existsSync(routingReceiptPath(route,f.context.threadId)),true);
});

test('activation and receipt directories must stay private',async t=>{
  const f=fixture(t), directory=join(f.stateDir,'routing-activations');
  chmodSync(directory,0o755);
  await assert.rejects(f.run('SessionStart'),/0700/);
  chmodSync(directory,0o700);await f.run('SessionStart');
  chmodSync(join(f.stateDir,'routing-receipts'),0o755);
  await assert.rejects(f.run('Stop'),/0700/);
});
