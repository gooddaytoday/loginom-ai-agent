import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync,chmodSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadEnrollment,enrollmentPath,observationPath,observeBootstrap,requireEnrolledTask,hash} from '../enrollment-routing.mjs';
import {validateProjectRouting,makeRoutingReceipt,routingReceiptPath} from '../project-routing.mjs';
import {enrollFreshTask,validateBootstrapEvidence,validateEnrollmentHooks} from '../enrollment-management.mjs';
import {runHook} from '../hook-router.mjs';
import {resolveContext,CAPABILITY} from '../adapter.mjs';

function fixture(t) {
 const base=mkdtempSync(join(realpathSync(tmpdir()),'memory-enrollment-'));
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 const projectRoot=join(base,'project'),directory=join(base,'registrations'),stateDir=join(base,'state'),pluginRoot=join(base,'plugin'),legacy=join(base,'legacy');
 for(const p of [projectRoot,join(projectRoot,'.worktrees'),join(projectRoot,'.codex'),directory,stateDir,pluginRoot,legacy,
  join(pluginRoot,'.codex-plugin'),join(pluginRoot,'hooks'),join(pluginRoot,'scripts')])mkdirSync(p,{mode:0o700});
 writeFileSync(join(pluginRoot,'.codex-plugin/plugin.json'),JSON.stringify({version:'0.8.1'}));
 writeFileSync(join(pluginRoot,'hooks/hooks.json'),'{}');
 for(const name of ['session-start-commit','auto-recall','auto-capture','pre-compact-capture','session-end','config'])writeFileSync(join(pluginRoot,'scripts',name+'.mjs'),'// fixture');
 writeFileSync(join(projectRoot,'.codex/hooks.json'),'{}',{mode:0o600});
 const options={directory,projectRoot};
 function prepare(n){
  const cwd=join(projectRoot,'.worktrees','node-'+n);mkdirSync(cwd);mkdirSync(join(cwd,'.codex'));
  writeFileSync(join(cwd,'.codex/config.toml'),'# private',{mode:0o600});
  const routeSpec={projectRoot,workspaces:[cwd],stateDir,pluginRoot,generation:'20260913.5'};
  const route=validateProjectRouting({version:1,projects:[routeSpec]}).projects[0];
  const record={version:1,cwd,registrationId:randomUUID(),routeSpec,routeHash:route.routeHash,status:'pending',threadId:null,
   prepared:{configSha256:hash('# private'),hooksSha256:hash('{}')},createdAt:new Date().toISOString()};
  writeFileSync(enrollmentPath(cwd,directory),JSON.stringify(record),{mode:0o600});
  return {cwd,route,record};
 }
 const f=prepare(21),threadId='fresh-node-21';
 const evidence={threadId,cwd:f.cwd,registrationId:f.record.registrationId,turnStatus:'completed',threadStatus:'idle',developmentStarted:false,turnId:'bootstrap-turn',checkedAt:new Date().toISOString()};
 const hooksReceipt={generation:'20260913.5',hooksSha256:hash('{}'),checkedAt:new Date().toISOString(),workspaces:[{cwd:f.cwd,originalMemoryHooks:[],projectHooks:Array(2).fill(['sessionStart','userPromptSubmit','stop','preCompact','sessionEnd']).flat().map(event=>({event,trustStatus:'trusted',currentHash:'sha256:'+'a'.repeat(64)}))}]};
 const load=cwd=>loadEnrollment(cwd,options);
 const context={cwd:f.cwd,threadId};
 const observe=()=>observeBootstrap(load(f.cwd),context,{},'SessionStart');
 const initialize=async(event,args)=>{
  assert.equal(event,'SessionStart');assert.equal(args.enrollmentSetup,true);assert.equal(JSON.parse(args.raw).source,'resume');
  const e=load(f.cwd);assert.equal(e.record.status,'enrolling');
  writeFileSync(join(stateDir,threadId+'.json'),JSON.stringify({codexSessionId:threadId,workspacePeerId:'',ovSessionId:null,capturedTurnCount:0}),{mode:0o600});
  writeFileSync(routingReceiptPath(e.route,threadId),JSON.stringify(makeRoutingReceipt(context,e.route)),{mode:0o600});
 };
 const enroll=(extra={})=>enrollFreshTask({cwd:f.cwd,threadId,evidence,hooksReceipt,enrollmentOptions:options,legacyStateDir:legacy,hookRunner:initialize,...extra});
 return {base,projectRoot,directory,stateDir,legacy,options,prepare,load,observe,enroll,evidence,hooksReceipt,threadId,context,...f};
}

test('adding/removing/corrupting another independent registration preserves existing hash and access',async t=>{
 const f=fixture(t);f.observe();await f.enroll();const before=JSON.stringify(f.load(f.cwd));
 const second=f.prepare(22);assert.equal(JSON.stringify(f.load(f.cwd)),before);
 writeFileSync(enrollmentPath(second.cwd,f.directory),'invalid');rmSync(second.cwd,{recursive:true});
 assert.equal(JSON.stringify(f.load(f.cwd)),before);requireEnrolledTask(f.load(f.cwd),f.threadId);
});

test('pending hook observes metadata once and never calls official capture',async t=>{
 const f=fixture(t);let spawns=0;
 for(const event of ['SessionStart','UserPromptSubmit','Stop','PreCompact','SessionEnd']){
  const r=await runHook(event,{cwd:f.cwd,raw:Buffer.from(JSON.stringify({session_id:f.threadId,cwd:f.cwd,prompt:'must not persist'})),routing:{projects:[]},enrollmentLoader:f.load,spawnImpl:()=>{spawns++;throw Error('must not spawn');}});
  assert.equal(r.skipped,'enrollment-pending');
 }
 assert.equal(spawns,0);assert.equal(existsSync(join(f.stateDir,f.threadId+'.json')),false);
 assert.equal(readFileSync(observationPath(f.load(f.cwd)),'utf8').includes('must not persist'),false);
});

test('enrollment-only hooks do nothing for existing tasks and never load legacy routing',async t=>{
 const f=fixture(t);let calls=0;
 for(const event of ['SessionStart','UserPromptSubmit','Stop','PreCompact','SessionEnd']){
  const r=await runHook(event,{cwd:f.cwd,raw:Buffer.from(JSON.stringify({session_id:'legacy-task',cwd:f.cwd})),
   enrollmentsOnly:true,enrollmentLoader:()=>null,spawnImpl:()=>{calls++;throw Error('duplicate capture');}});
  assert.equal(r.skipped,'not-independently-enrolled');
 }
 assert.equal(calls,0);assert.equal(existsSync(join(f.stateDir,'legacy-task.json')),false);
});

test('pending MCP fails before any own-peer fallback; foreign task is rejected after activation',async t=>{
 const f=fixture(t),meta={threadId:f.threadId,[CAPABILITY]:{sandboxCwd:pathToFileURL(f.cwd).href}};
 assert.throws(()=>resolveContext(meta,f.legacy,{projects:[]},f.load),/pending/);
 f.observe();await f.enroll();
 assert.equal(resolveContext(meta,f.legacy,{projects:[]},f.load).peerId,f.route.canonicalPeerId);
 assert.throws(()=>resolveContext({...meta,threadId:'another'},f.legacy,{projects:[]},f.load),/different task/);
});

test('strict new-task adapter refuses missing or deleted registration instead of own Peer fallback',async t=>{
 const f=fixture(t),meta={threadId:f.threadId,[CAPABILITY]:{sandboxCwd:pathToFileURL(f.cwd).href}};
 f.observe();await f.enroll();rmSync(enrollmentPath(f.cwd,f.directory));
 assert.throws(()=>resolveContext(meta,f.legacy,{projects:[]},f.load,true),/registration is missing/);
 const broken=enrollmentPath(f.cwd,f.directory);symlinkSync(broken+'.absent',broken);
 assert.throws(()=>f.load(f.cwd),/private/);
});

test('new state initialized exactly once; duplicate enrollment preserves advanced capture cursor',async t=>{
 const f=fixture(t);f.observe();assert.equal((await f.enroll()).status,'enrolled');
 const path=join(f.stateDir,f.threadId+'.json');const state=JSON.parse(readFileSync(path));state.capturedTurnCount=37;writeFileSync(path,JSON.stringify(state));
 const r=await f.enroll({hookRunner:()=>{throw Error('must not run twice');}});
 assert.equal(r.status,'already-enrolled');assert.equal(r.capturedTurnCount,37);
 await assert.rejects(f.enroll({threadId:'other'}),/Another task/);
});

test('existing legacy or shared capture is rejected without reset',async t=>{
 const f=fixture(t);f.observe();const path=join(f.legacy,f.threadId+'.json');writeFileSync(path,'{}');
 await assert.rejects(f.enroll(),/original hook/);rmSync(path);
 const shared=join(f.stateDir,f.threadId+'.json');writeFileSync(shared,'preserve',{mode:0o600});
 await assert.rejects(f.enroll(),/Existing task state/);assert.equal(readFileSync(shared,'utf8'),'preserve');
});

test('interrupted coordinator remains fail-closed and can resume exact enrollment',async t=>{
 const f=fixture(t);f.observe();await assert.rejects(f.enroll({hookRunner:()=>{throw Error('interrupted');}}),/interrupted/);
 assert.equal(f.load(f.cwd).record.status,'enrolling');assert.throws(()=>requireEnrolledTask(f.load(f.cwd),f.threadId),/pending/);
 assert.equal((await f.enroll()).status,'enrolled');
});

test('concurrent enrollment reservation never steals lock or starts second initializer',async t=>{
 const f=fixture(t);f.observe();mkdirSync(enrollmentPath(f.cwd,f.directory)+'.lock',{mode:0o700});
 await assert.rejects(f.enroll(),/EEXIST/);assert.equal(f.load(f.cwd).record.status,'pending');
});

test('bootstrap requires actual observed task, not just coordinator parameters',async t=>{
 const f=fixture(t);await assert.rejects(f.enroll(),/ENOENT/);f.observe();
 assert.throws(()=>observeBootstrap(f.load(f.cwd),{...f.context,threadId:'other'},{},'SessionStart'),/Another task/);
});

test('changed installed configuration or hook definitions stop enrollment',async t=>{
 const f=fixture(t);f.observe();writeFileSync(join(f.cwd,'.codex/config.toml'),'changed');
 await assert.rejects(f.enroll(),/changed/);assert.equal(f.load(f.cwd).record.status,'pending');
});

test('registration cannot widen cwd, generation, Peer, or accept loose/symlink record',t=>{
 const f=fixture(t),path=enrollmentPath(f.cwd,f.directory),original=readFileSync(path);
 for(const change of [{cwd:f.projectRoot},{routeHash:'a'.repeat(64)},{routeSpec:{...f.record.routeSpec,canonicalPeerId:'foreign'}},{routeSpec:{...f.record.routeSpec,generation:'other'}}]){
  writeFileSync(path,JSON.stringify({...f.record,...change}));assert.throws(()=>f.load(f.cwd));
 }
 writeFileSync(path,original);chmodSync(path,0o644);assert.throws(()=>f.load(f.cwd),/private/);chmodSync(path,0o600);
 const other=path+'.other';renameForTest(path,other);symlinkSync(other,path);assert.throws(()=>f.load(f.cwd),/private/);
});
import {renameSync as renameForTest} from 'node:fs';

for(const change of [{turnStatus:'inProgress'},{threadStatus:'active'},{developmentStarted:true},{checkedAt:'2000-01-01'},{registrationId:'wrong'}]){
 test('bootstrap evidence rejects '+JSON.stringify(change),t=>{const f=fixture(t);assert.throws(()=>validateBootstrapEvidence({...f.evidence,...change},f.record,f.threadId));});
}
test('hook admission rejects stale trust, another generation and original capture',t=>{
 const f=fixture(t);
 for(const change of [{generation:'old'},{checkedAt:'2000-01-01'},{hooksSha256:'wrong'}, {workspaces:[{...f.hooksReceipt.workspaces[0],originalMemoryHooks:[{enabled:true}]}]}])assert.throws(()=>validateEnrollmentHooks({...f.hooksReceipt,...change},f.record));
});
