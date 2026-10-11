import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runReviewerStorage} from '../reviewer-matrix15-storage.mjs';
import {makePackageCleanupCode} from '../../../packages/loginom-runtime/client/lib/package-cleanup.mjs';
async function setup(){
 const directory=await mkdtemp(join(tmpdir(),'reviewer-storage-'));
 const identity={sessionId:'session',account:'own',packagePath:'/shared/source.lgp',personalDirectory:'/own',loginomUrl:'http://fixture.invalid',loginomBuild:'7.4.2'};
 const prepared={status:'READY',document_id:'document',package_ref:{path:identity.packagePath},workflow_ref:{tab_tid:'tab'}};
 const page={},events=[],owner={},runtime={hasUnsettledWork:()=>false};
 const options={directory,identity,page,runtime,context:{close:async()=>{assert.equal(JSON.parse(await readFile(join(directory,'cleanup.json'))).confirmed,true);events.push('exit')}},makeCleanupCode:o=>o,execute:async o=>{events.push('cleanup');return {status:'SUCCEEDED',package_closed:true,logged_out:true,session_id:o.sessionId,document_id:o.documentId,account:o.account,package_path:o.packagePath}},observeIdentity:async()=>({account:'own',sessionId:'session',documentId:'document',tabTid:'tab',personalDirectory:'/own',path:identity.packagePath,running:false,modified:false,readOnly:false,owned:true}),scenario:async({bindPrepared})=>bindPrepared(prepared)};
 return {directory,identity,prepared,page,events,owner,runtime,options,finish:()=>rm(directory,{recursive:true,force:true})};
}
for(const error of [Error('original'),null,undefined,false,0,''])test('real reviewer caller retains exact rejection '+String(error),async()=>{
 const x=await setup();try{
 x.options.scenario=async({bindPrepared})=>{await bindPrepared(x.prepared);throw error};
 await runReviewerStorage(x.options,x.owner);
 assert.equal(x.owner.failed,true);assert.equal(x.owner.error,error);assert.equal(x.owner.page,x.page);assert.equal(x.owner.execute,x.options.execute);assert.equal(x.owner.context,x.options.context);assert.deepEqual(x.events,[]);
 await x.owner.recover();assert.deepEqual(x.events,['cleanup','exit']);assert.equal(x.owner.error,error);
 }finally{await x.finish()}
});
test('cleanup refusal retains original handles until same-page guarded completion',async()=>{
 const x=await setup();try{const execute=x.options.execute;let refused=true;x.options.execute=async o=>{if(refused){x.events.push('refusal');return {status:'BLOCKED'}}return execute(o)};
 await runReviewerStorage(x.options,x.owner);assert.equal(x.owner.failed,true);assert.equal(x.owner.closed,false);assert.deepEqual(x.events,['refusal']);
 const retained=x.owner.execute;refused=false;await x.owner.recover();assert.equal(x.owner.execute,retained);assert.deepEqual(x.events,['refusal','cleanup','exit']);
 }finally{await x.finish()}
});
for(const change of [{running:true},{owned:false},{account:'foreign'},{documentId:'foreign'},{path:'/foreign.lgp'},{readOnly:true},{modified:null},{tabTid:'foreign'}])test('recovery refuses foreign or incomplete identity '+JSON.stringify(change),async()=>{
 const x=await setup();try{x.options.scenario=async({bindPrepared})=>{await bindPrepared(x.prepared);throw Error('scenario')};await runReviewerStorage(x.options,x.owner);const observe=x.options.observeIdentity;x.options.observeIdentity=async()=>({...await observe(),...change});await assert.rejects(x.owner.recover());assert.deepEqual(x.events,[])}finally{await x.finish()}
});
test('pending runtime forbids recovery and cleanup',async()=>{const x=await setup();try{x.options.scenario=async({bindPrepared})=>{await bindPrepared(x.prepared);x.runtime.hasUnsettledWork=()=>true};await runReviewerStorage(x.options,x.owner);assert.equal(x.owner.error.message,'DIAGNOSTIC_RUNTIME_UNSETTLED');await assert.rejects(x.owner.recover());assert.deepEqual(x.events,[])}finally{await x.finish()}});
test('dirty own state saves absent private UUID with fail policy before cleanup',async()=>{
 const x=await setup();try{
 x.options.scenario=async({bindPrepared})=>{await bindPrepared(x.prepared);throw Error('evidence failure')};
 x.options.observeIdentity=async()=>({account:'own',sessionId:'session',documentId:'document',tabTid:'tab',personalDirectory:'/own',path:x.identity.packagePath,running:false,modified:true,readOnly:false,owned:true});
 x.options.pathExists=async path=>{assert.match(path,/^\/own\/[0-9a-f-]{36}\.lgp$/);return false};
 x.runtime.run=async(action,input)=>{assert.equal(action,'package.save_checkpoint');assert.equal(input.conflict_policy,'fail');x.events.push('save');return {status:'SUCCEEDED',output:{save_completed:true,package_ref:{path:input.path}}}};
 await runReviewerStorage(x.options,x.owner);await x.owner.recover();assert.deepEqual(x.events,['save','cleanup','exit']);assert.match(x.owner.identity.packagePath,/^\/own\//);
 }finally{await x.finish()}
});
test('existing save path refuses before mutation',async()=>{const x=await setup();try{x.options.scenario=async({bindPrepared})=>{await bindPrepared(x.prepared);throw Error('scenario')};x.options.observeIdentity=async()=>({account:'own',sessionId:'session',documentId:'document',tabTid:'tab',personalDirectory:'/own',path:x.identity.packagePath,running:false,modified:true,readOnly:false,owned:true});x.options.pathExists=async()=>true;await runReviewerStorage(x.options,x.owner);await assert.rejects(x.owner.recover(),/PATH_EXISTS/);assert.deepEqual(x.events,[])}finally{await x.finish()}});
for(const candidate of [undefined,{status:'BLOCKED',document_id:'document',workflow_ref:{tab_tid:'tab'},package_ref:{path:'/shared/source.lgp'}},{status:'READY',document_id:'',workflow_ref:{tab_tid:''},package_ref:{path:'/shared/source.lgp'}},{status:'READY',document_id:'document',workflow_ref:{tab_tid:'tab'},package_ref:{path:'/foreign.lgp'}}])test('unverified prepared refuses before preservation admission '+JSON.stringify(candidate),async()=>{
 const x=await setup();try{
 let saves=0,cleanups=0;x.options.makeCleanupCode=makePackageCleanupCode;x.options.execute=async()=>{cleanups++};
 x.options.scenario=async({bindPrepared})=>{if(candidate!==undefined)await bindPrepared(candidate);throw Error('scenario')};
 x.options.observeIdentity=async()=>({account:'own',sessionId:'session',documentId:candidate?.document_id,tabTid:candidate?.workflow_ref?.tab_tid,path:x.identity.packagePath,personalDirectory:'/own',modified:true,running:false,readOnly:false,owned:true});
 x.options.pathExists=async()=>false;x.runtime.run=async(_action,input)=>{saves++;return {status:'SUCCEEDED',output:{save_completed:true,package_ref:{path:input.path}}}};
 await runReviewerStorage(x.options,x.owner);const error=x.owner.error;
 await assert.rejects(x.owner.recover());assert.equal(saves,0);assert.equal(cleanups,0);assert.deepEqual(x.events,[]);assert.equal(x.owner.error,error);assert.equal(x.owner.page,x.page);
 }finally{await x.finish()}
});
