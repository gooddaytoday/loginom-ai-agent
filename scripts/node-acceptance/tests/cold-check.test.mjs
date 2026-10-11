import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {runColdCheck} from '../cold-check.mjs'
async function fixture(run){
 const dir=await mkdtemp(join(tmpdir(),'cold-caller-')),root=join(dir,'resources'),output=join(dir,'evidence')
 await mkdir(join(root,'runtime/executor/catalog'),{recursive:true})
 await writeFile(join(root,'runtime/executor/catalog/actions.json'),JSON.stringify({actions:[{action_key:'package.save_checkpoint',effect:{}}]}))
 await writeFile(join(root,'runtime/executor/catalog/selectors.json'),JSON.stringify({selectors:[]}))
 await writeFile(join(dir,'config.json'),JSON.stringify({loginom_url:'https://fixture.invalid',workflow_profile:{loginom_user:'own',passwordless_login:true}}))
 await writeFile(join(dir,'expected.json'),JSON.stringify({package_path:'/source/original.lgp',nodes:[{type:'imports.text'}],output_node_type:'imports.text',columns:[{name:'x',type:'integer'}],rows:[]}))
 const args={resources:root,config:join(dir,'config.json'),expected:join(dir,'expected.json'),saved:'/source/original.lgp',output}
 const prepared={status:'READY',document_id:'document',workflow_ref:{tab_tid:'tab',navigation_path:[]},package_ref:{path:args.saved}}
 const owner={},events=[],page={},s={modified:false,running:false,path:args.saved,account:'own',sessionId:'session',owned:true,readOnly:false,unsettled:false,cleanupCalls:0,saveCalls:0,exitCalls:0}
 const context={close:async()=>{assert.equal(JSON.parse(await readFile(join(output,'cleanup.json'))).confirmed,true);assert.equal(JSON.parse(await readFile(join(output,'package-cleanup.json'))).unsaved_changes_discarded,false);s.exitCalls++;events.push('exit')}}
 const runtime={hasUnsettledWork:()=>s.unsettled,run:async(action,input)=>{assert.equal(action,'package.save_checkpoint');assert.equal(input.conflict_policy,'fail');assert.match(input.path,/^\/own\/[0-9a-f-]{36}\.lgp$/);s.saveCalls++;events.push('save');s.path=input.path;s.modified=false;return {status:'SUCCEEDED',output:{save_completed:true,package_ref:{path:input.path}}}}}
 const foreground={context,page,runtime,sessionId:'session',load:async name=>{
  if(name==='src/resources.mjs')return {verifyResources:async()=>({manifest:{target:'linux-x64'},manifestHash:'fixture'})}
  if(name==='client/lib/workspace.mjs')return {makeWorkspacePrepareCode:()=>JSON.stringify({kind:'prepare'})}
  return import(new URL('../../../packages/loginom-runtime/'+name,import.meta.url))
 },execute:async code=>{const p=JSON.parse(code);if(p.kind==='prepare')return prepared;s.cleanupCalls++;events.push('cleanup');if(s.refuse)return {status:'BLOCKED',reason:'ACCOUNT_CHANGED',package_closed:false,logged_out:false};if(s.cleanupThrow)throw s.cleanupError;return {status:'SUCCEEDED',session_id:p.sessionId,document_id:p.documentId,account:p.account,package_path:p.packagePath,package_closed:true,logged_out:true,unsaved_changes_discarded:s.discard??false}},makeCleanupCode:o=>JSON.stringify({kind:'cleanup',...o}),observeIdentity:async()=>({account:s.account,sessionId:s.sessionId,documentId:s.documentId??'document',tabTid:s.tabTid??'tab',path:s.path,owned:s.owned,modified:s.modified,running:s.running,readOnly:s.readOnly,personalDirectory:'/own'}),scenario:async()=>{}}
 try{await run({args,owner,foreground,prepared,s,events,context,page,runtime,output})}finally{await rm(dir,{recursive:true,force:true})}
}
for(const error of [Error('original'),null,undefined,false,0,''])test('cold exact rejection '+String(error),()=>fixture(async x=>{
 x.foreground.scenario=async()=>{throw error};await runColdCheck(x.args,x.owner,x.foreground)
 assert.equal(x.owner.failed,true);assert.equal(x.owner.error,error);assert.equal(x.owner.context,x.context);assert.equal(x.owner.page,x.page);assert.equal(x.owner.runtime,x.runtime);const execute=x.owner.execute
 assert.equal(x.s.cleanupCalls,0);assert.equal(x.s.exitCalls,0)
 await x.owner.recover();assert.equal(x.owner.error,error);assert.equal(x.owner.execute,execute);assert.deepEqual(x.events,['cleanup','exit']);assert.equal(JSON.parse(await readFile(join(x.output,'result.json'))).status,'FAIL')
}))
test('cold refusal then same-owner recovery without replay',()=>fixture(async x=>{
 let scenarios=0;x.foreground.scenario=async()=>{scenarios++};x.s.refuse=true;await runColdCheck(x.args,x.owner,x.foreground)
 assert.equal(x.owner.failed,true);assert.equal(x.s.exitCalls,0);const error=x.owner.error,execute=x.owner.execute
 x.s.refuse=false;await x.owner.recover();assert.equal(x.owner.error,error);assert.equal(x.owner.execute,execute);assert.equal(scenarios,1);assert.equal(x.s.exitCalls,1);assert.equal(JSON.parse(await readFile(join(x.output,'result.json'))).status,'FAIL')
}))
test('cold dirty recovery preserves private UUID copy without discard',()=>fixture(async x=>{
 x.foreground.scenario=async()=>{x.s.modified=true;throw Error('cold mismatch')};await runColdCheck(x.args,x.owner,x.foreground)
 const error=x.owner.error;await x.owner.recover();assert.equal(x.owner.error,error);assert.deepEqual(x.events,['save','cleanup','exit']);assert.notEqual(x.owner.identity.packagePath,x.args.saved);assert.equal(JSON.parse(await readFile(join(x.output,'result.json'))).status,'FAIL')
}))
for(const change of [{unsettled:true},{running:true},{owned:false},{account:'foreign'},{sessionId:'foreign'},{documentId:'foreign'},{tabTid:'foreign'},{path:'/foreign.lgp'},{readOnly:true},{modified:null}])test('cold recovery guard '+JSON.stringify(change),()=>fixture(async x=>{
 x.foreground.scenario=async()=>{throw Error('scenario')};await runColdCheck(x.args,x.owner,x.foreground);Object.assign(x.s,change);await assert.rejects(x.owner.recover());assert.equal(x.s.saveCalls,0);assert.equal(x.s.cleanupCalls,0);assert.equal(x.s.exitCalls,0);assert.equal(x.owner.page,x.page)
}))
test('cold runtime substitution refuses',()=>fixture(async x=>{x.foreground.scenario=async()=>{throw Error('scenario')};await runColdCheck(x.args,x.owner,x.foreground);x.owner.runtime={hasUnsettledWork:()=>false};await assert.rejects(x.owner.recover(),/RUNTIME_UNVERIFIED/);assert.equal(x.s.cleanupCalls,0)}))
for(const error of [Error('cleanup'),null,undefined,false,0,''])test('cold cleanup throw '+String(error),()=>fixture(async x=>{
 x.s.cleanupThrow=true;x.s.cleanupError=error;await runColdCheck(x.args,x.owner,x.foreground);assert.equal(x.owner.failed,true);assert.equal(x.owner.page,x.page);assert.equal(x.s.exitCalls,0);await assert.rejects(x.owner.recover(),/RUNTIME_UNSETTLED/);assert.equal(x.s.cleanupCalls,1)
}))
test('cold evidence error retains rejection',()=>fixture(async x=>{x.foreground.scenario=async()=>{await mkdir(join(x.output,'result.json'));throw null};await runColdCheck(x.args,x.owner,x.foreground);assert.equal(x.owner.failed,true);assert.equal(x.owner.error,null);assert.ok(x.owner.evidenceError);assert.equal(x.s.exitCalls,0);assert.equal(x.s.cleanupCalls,0)}))
test('cold discard receipt refuses',()=>fixture(async x=>{x.s.discard=true;await runColdCheck(x.args,x.owner,x.foreground);assert.equal(x.owner.failed,true);assert.equal(x.s.exitCalls,0)}))
test('cold success persists receipt before exit',()=>fixture(async x=>{await runColdCheck(x.args,x.owner,x.foreground);assert.equal(x.owner.failed,false);assert.equal(x.owner.closed,true);assert.equal(JSON.parse(await readFile(join(x.output,'result.json'))).status,'PASS');assert.deepEqual(x.events,['cleanup','exit'])}))
for(const change of [{status:'BLOCKED'},{document_id:''},{workflow_ref:{tab_tid:'',navigation_path:[]}},{package_ref:{path:'/foreign.lgp'}}])test('cold incomplete prepared refuses before admission '+JSON.stringify(change),()=>fixture(async x=>{Object.assign(x.prepared,change);await runColdCheck(x.args,x.owner,x.foreground);assert.equal(x.owner.failed,true);assert.equal(x.s.saveCalls,0);assert.equal(x.s.cleanupCalls,0);assert.equal(x.s.exitCalls,0)}))
for(const field of ['account','sessionId'])test('cold private identity rejects field mutation '+field,()=>fixture(async x=>{x.foreground.scenario=async()=>{throw Error('scenario')};await runColdCheck(x.args,x.owner,x.foreground);x.owner.identity[field]='foreign';await assert.rejects(x.owner.recover());assert.equal(x.s.cleanupCalls,0);assert.equal(x.s.saveCalls,0)}))
test('cold missing inspector retains context',()=>fixture(async x=>{x.runtime.hasUnsettledWork=undefined;await runColdCheck(x.args,x.owner,x.foreground);assert.equal(x.owner.error.message,'DIAGNOSTIC_RUNTIME_UNVERIFIED');assert.equal(x.owner.page,x.page);assert.equal(x.s.cleanupCalls,0)}))
test('cold ambiguous save remains pending without cleanup',()=>fixture(async x=>{x.foreground.scenario=async()=>{x.s.modified=true;throw Error('original')};x.runtime.run=async()=>{x.s.unsettled=true;return {status:'AMBIGUOUS',effect_possible:true,cleanup_complete:false}};await runColdCheck(x.args,x.owner,x.foreground);const error=x.owner.error;await assert.rejects(x.owner.recover(),/SAVE_UNCONFIRMED/);await assert.rejects(x.owner.recover(),/RUNTIME_UNSETTLED/);assert.equal(x.owner.error,error);assert.equal(x.s.cleanupCalls,0);assert.equal(x.s.exitCalls,0)}))
test('cold unknown browser reply cannot be cleared via owner flag',()=>fixture(async x=>{x.s.cleanupThrow=true;x.s.cleanupError=null;await runColdCheck(x.args,x.owner,x.foreground);x.owner.unknownEffect=false;await assert.rejects(x.owner.recover(),/RUNTIME_UNSETTLED/);assert.equal(x.s.cleanupCalls,1);assert.equal(x.s.exitCalls,0)}))
test('cold cleanup evidence error refuses exit',()=>fixture(async x=>{x.foreground.scenario=async()=>{await mkdir(join(x.output,'cleanup.json'))};await runColdCheck(x.args,x.owner,x.foreground);assert.equal(x.owner.failed,true);assert.equal(x.s.exitCalls,0);assert.equal(x.owner.page,x.page);assert.equal(x.s.cleanupCalls,1)}))
test('cold concurrent recovery admits only one cleanup',()=>fixture(async x=>{x.foreground.scenario=async()=>{throw Error('scenario')};await runColdCheck(x.args,x.owner,x.foreground);const first=x.owner.recover();await assert.rejects(x.owner.recover(),/RECOVERY_RUNNING/);await first;assert.equal(x.s.cleanupCalls,1);assert.equal(x.s.exitCalls,1);await assert.rejects(x.owner.recover(),/OWNER_CHANGED/)}))
for(const receipt of [undefined,false,{status:'BLOCKED',reason:'NATIVE_CLOSE_UNCONFIRMED',package_closed:false,logged_out:false}])test('cold missing/uncertain cleanup receipt forbids replay '+JSON.stringify(receipt),()=>fixture(async x=>{const execute=x.foreground.execute;x.foreground.execute=async code=>JSON.parse(code).kind==='prepare'?execute(code):receipt;await runColdCheck(x.args,x.owner,x.foreground);assert.equal(x.owner.failed,true);assert.equal(x.s.exitCalls,0);await assert.rejects(x.owner.recover(),/RUNTIME_UNSETTLED/)}))
async function assertEarlyRetention(x){
 assert.equal(x.owner.failed,true)
 assert.equal(x.owner.context,x.context);assert.equal(x.owner.page,x.page)
 assert.equal(x.owner.execute,x.foreground.execute);assert.equal(x.owner.runtime,x.runtime)
 assert.equal(x.owner.closed,false)
 await assert.rejects(x.owner.recover(),/DIAGNOSTIC_PACKAGE_IDENTITY_UNCONFIRMED/)
 assert.equal(x.s.saveCalls,0);assert.equal(x.s.cleanupCalls,0);assert.equal(x.s.exitCalls,0)
 assert.equal(x.owner.prepared,undefined)
}
for(const stage of ['resources','config','expected','output'])test('cold early '+stage+' failure retains supplied foreground',()=>fixture(async x=>{
 const original=Error('resource verification failed')
 if(stage==='resources'){const load=x.foreground.load;x.foreground.load=async name=>name==='src/resources.mjs'?{verifyResources:async()=>{throw original}}:load(name)}
 else if(stage==='output')await writeFile(x.args.output,'not a directory')
 else x.args[stage]=join(x.output,'missing-'+stage+'.json')
 await runColdCheck(x.args,x.owner,x.foreground)
 if(stage==='resources')assert.equal(x.owner.error,original)
 else assert.equal(x.owner.error.code,stage==='output'?'EEXIST':'ENOENT')
 const error=x.owner.error;await assertEarlyRetention(x);assert.equal(x.owner.error,error)
}))
for(const error of [Error('early original'),null,undefined,false,0,''])test('cold early exact rejection '+String(error),()=>fixture(async x=>{
 x.foreground.load=async()=>{throw error}
 await runColdCheck(x.args,x.owner,x.foreground)
 assert.equal(x.owner.error,error);await assertEarlyRetention(x);assert.equal(x.owner.error,error)
}))
