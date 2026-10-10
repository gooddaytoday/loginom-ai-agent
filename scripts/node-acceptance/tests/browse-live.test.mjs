import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runBrowseLive } from '../browse-live.mjs'

async function fixture(run) {
 const dir=await mkdtemp(join(tmpdir(),'browse-caller-')),root=join(dir,'resources'),events=[]
 const state={events,packages:0,account:'own',cleanupCalls:0,closed:false,importCalls:0,saveCalls:[],refuse:false}
 const key='caller'+dir.replaceAll(/\W/g,'')
 globalThis[key]=state
 const module=async(file,content)=>{await mkdir(join(root,'runtime',file,'..'),{recursive:true});await writeFile(join(root,'runtime',file),`const s=globalThis[${JSON.stringify(key)}];\n`+content)}
 state.page={url:()=> 'https://example.com/app/',evaluate:async()=>({account:state.account,packages:state.packages})}
 state.context={pages:()=>[state.page],close:async()=>{state.closed=true;events.push('browser exit')}}
 await module('src/resources.mjs',`export async function verifyResources(){return {browserPath:'pinned'}}`)
 await module('src/connection-check.mjs',`export async function loginBrowser(){return {context:s.context}};export async function loginPage(){}`)
 await module('client/lib/workspace.mjs',`export function makeWorkspacePrepareCode(p){return 'async()=>globalThis[${JSON.stringify(key)}].prepare('+JSON.stringify(p)+')'}`)
 await module('client/lib/package-cleanup.mjs',`export function makePackageCleanupCode(p){return 'async()=>globalThis[${JSON.stringify(key)}].cleanup('+JSON.stringify(p)+')'}`)
 await module('client/lib/executor.mjs',`export function createActionRuntime(){return s.runtime}`)
 await module('client/lib/node-support.mjs',`export function createCandidateNodeSupport(){return {}}`)
 await module('client/lib/artifacts.mjs',`export function createArtifactStore(){return {admit:async()=>({artifact_id:'csv',upload:{grant_id:'grant',destination:'/own/data.csv'}})}}`)
 await module('client/lib/execution-journal.mjs',`export function createExecutionJournal(){return ()=>{}}`)
 state.prepare=p=>{state.session=p.sessionId;state.packages=1;return {status:'READY',document_id:'original-document',package_ref:{path:p.packagePath},workflow_ref:{tab_tid:'original-tab'}}}
 state.cleanup=p=>{state.cleanupCalls++;if(state.refuse)return {status:'NOT_APPLIED',reason:'ACCOUNT_CHANGED'};events.push('close/logout');return {status:'SUCCEEDED',package_closed:true,logged_out:true,session_id:p.sessionId,document_id:p.documentId,account:p.account,package_path:p.packagePath}}
 state.runtime={deliverArtifact:async()=>({outcome:{status:'SUCCEEDED'}}),runNodeApply:async()=>{state.importCalls++;if(state.throwImport)throw state.error;return {status:'SUCCEEDED'}},run:async(action,input)=>{state.saveCalls.push(input);events.push(input.path.includes('final')?'final save':'bootstrap save');if(input.path.includes('final')&&state.failSave)return {status:'NOT_APPLIED',effect_possible:true};return {status:'SUCCEEDED',output:{save_completed:true}}}}
 await module('executor/catalog/actions.json','')
 await writeFile(join(root,'runtime/executor/catalog/actions.json'),JSON.stringify({actions:[{action_key:'package.save_checkpoint',effect:{}}]}))
 await writeFile(join(root,'runtime/executor/catalog/selectors.json'),JSON.stringify({selectors:[]}))
 await writeFile(join(dir,'config.json'),JSON.stringify({loginom_url:'https://example.com/app/',workflow_profile:{loginom_user:'own'}}))
 await writeFile(join(dir,'golden.csv'),'a\n1\n')
 await writeFile(join(dir,'template.json'),JSON.stringify({parameters:{settings:{source:{}}}}))
 const args=[root,join(dir,'config.json'),join(dir,'evidence'),join(dir,'golden.csv'),join(dir,'template.json')]
 try {await run(state,args)}finally{delete globalThis[key];await rm(dir,{recursive:true,force:true})}
}

test('success saves a separate absent name with fail policy and closes only after cleanup',()=>fixture(async(s,args)=>{
 const owner={};assert.equal(await runBrowseLive(args,owner),owner);assert.equal(owner.failed,false);assert.equal(owner.closed,true)
 assert.deepEqual(s.saveCalls.map(x=>x.conflict_policy),['fail','fail']);assert.notEqual(s.saveCalls[0].path,s.saveCalls[1].path)
 assert.equal(owner.identity.packagePath,s.saveCalls[1].path);assert.deepEqual(s.events,['bootstrap save','close/logout','final save','close/logout','browser exit'])
}))
for(const value of [null,undefined,false,0,'',Error('scenario')])test('foreground retains original error/context: '+String(value),()=>fixture(async(s,args)=>{
 s.throwImport=true;s.error=value;const owner=await runBrowseLive(args,{})
 assert.equal(owner.failed,true);assert.equal(owner.error,value);assert.equal(owner.context,s.context);assert.equal(owner.page,s.page);assert.equal(typeof owner.execute,'function');assert.equal(s.closed,false);assert.equal(s.cleanupCalls,1)
 await owner.recover();assert.equal(s.closed,true);assert.equal(s.importCalls,1)
}))
test('cleanup refusal preserves exact handles for guarded recovery without scenario replay',()=>fixture(async(s,args)=>{
 const original=s.cleanup;s.cleanup=p=>{if(s.saveCalls.length===2)s.refuse=true;return original(p)}
 const owner=await runBrowseLive(args,{});assert.equal(owner.failed,true);assert.equal(s.closed,false);assert.equal(owner.page,s.page)
 s.cleanup=original;s.refuse=false;await owner.recover();assert.equal(s.closed,true);assert.equal(s.importCalls,1);assert.equal(s.saveCalls.length,2)
}))
test('unknown final-save effect retains handles without retry or automatic cleanup',()=>fixture(async(s,args)=>{
 s.failSave=true;const owner=await runBrowseLive(args,{});assert.equal(owner.failed,true);assert.match(owner.error.message,/FINAL_SAVE_UNCONFIRMED/)
 assert.equal(owner.finalSave.effect_possible,true);assert.equal(s.closed,false);assert.equal(s.cleanupCalls,1);assert.equal(s.saveCalls.length,2)
}))
test('owner must exist before any browser launch',async()=>assert.rejects(runBrowseLive([],null),/FOREGROUND_OWNER_REQUIRED/))
