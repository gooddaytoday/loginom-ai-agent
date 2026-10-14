import assert from 'node:assert/strict';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const root=process.argv[2]??new URL('../../../packages/loginom-runtime/',import.meta.url).pathname;
const {readAmountOwnPage,inspectAmountOwnPage}=await import(pathToFileURL(root+'/src/amount-own-page.mjs'));
let passed=0;
async function check(name,modify,expected,reads){
 const log=[],doc={},o={id:'owner',account:'own',origin:'https://app.loginom.ai'};
 const guid='11111111-2222-3333-4444-555555555555';
 const user={get_Name:async()=>{log.push('name');hooks.name?.();return o.account}};
 const session={get_CurrentUser:async()=>{log.push('user');hooks.user?.();return user},get_Guid:async()=>{log.push('guid');hooks.guid?.();return guid}};
 const map={FPackagesParentNode:{},PackageNodes:{Count:0},FServerConnection:{Connected:true,UserName:'own',Session:session},HasRunningNodes:async()=>{log.push('running');hooks.running?.();return running}};
 const app={Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:map}}}};
 const ctx={document:doc,location:{origin:o.origin},bg:{app},__loginomStartupV1:{document:doc,id:o.id,account:o.account}};
 const hooks={};let running=false;
 modify?.({ctx,app,map,session,user,hooks,setRunning:v=>running=v});
 const fn=vm.runInNewContext('('+readAmountOwnPage.toString()+')',ctx);
 const receipt=await fn(o);
 assert.equal(receipt.status==='OWN_EMPTY_IDLE_PAGE'?'PASS':receipt.reason,expected,name);
 if(reads)assert.deepEqual(log,reads,name+' subsequent RPC');
 assert.equal(receipt.mutation_authorized,false);assert.equal(receipt.release_authorized,false);
 console.log('PASS',name);passed++;
}
await check('own empty idle',null,'PASS',['user','name','guid','running']);
await check('foreign marker',s=>s.ctx.__loginomStartupV1.id='foreign','ORIGINAL_PAGE_IDENTITY_CHANGED',[]);
await check('nonempty cache',s=>s.map.PackageNodes.Count=1,'ORIGINAL_PREPARED_PACKAGE_REQUIRED',[]);
await check('undefined Count',s=>s.map.PackageNodes.Count=undefined,'NATIVE_CACHE_COUNT_UNAVAILABLE',[]);
await check('app drift after user',s=>s.hooks.user=()=>s.ctx.bg.app={...s.app},'ORIGINAL_PAGE_IDENTITY_CHANGED',['user']);
await check('count drift after user',s=>s.hooks.user=()=>s.map.PackageNodes.Count=1,'ORIGINAL_PREPARED_PACKAGE_REQUIRED',['user']);
await check('root drift after guid',s=>s.hooks.guid=()=>s.map.FPackagesParentNode={},'NATIVE_RESOURCE_REFERENCE_UNAVAILABLE',['user','name','guid']);
await check('Session drift after name',s=>s.hooks.name=()=>s.map.FServerConnection.Session={},'ORIGINAL_PAGE_IDENTITY_CHANGED',['user','name']);
await check('running undefined',s=>s.setRunning(undefined),'NATIVE_IDLE_NOT_OBSERVED',['user','name','guid','running']);
await check('running true',s=>s.setRunning(true),'NATIVE_IDLE_NOT_OBSERVED');
await check('count drift within running',s=>s.hooks.running=()=>s.map.PackageNodes.Count=1,'ORIGINAL_PREPARED_PACKAGE_REQUIRED');
await check('getter replacement',s=>s.hooks.user=()=>s.map.HasRunningNodes=()=>false,'NATIVE_RESOURCE_REFERENCE_UNAVAILABLE',['user']);
for(const reason of [false,undefined,Error('native',{cause:0})]){
 const ctx={document:{},location:{origin:'https://app.loginom.ai'}};
 // Rejection identity must cross the original awaited getter unchanged.
 const owner={document:ctx.document,id:'owner',account:'own'},map={FPackagesParentNode:{},PackageNodes:{Count:0},HasRunningNodes:()=>false,
 FServerConnection:{Connected:true,UserName:'own',Session:{get_CurrentUser:async()=>{throw reason},get_Guid:async()=>''}}};
 ctx.__loginomStartupV1=owner;ctx.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:map}}}}};
 let caught=false;try{await vm.runInNewContext('('+readAmountOwnPage.toString()+')',ctx)({id:'owner',account:'own',origin:ctx.location.origin})}catch(e){caught=true;assert.equal(e,reason)}assert(caught);passed++;
}
console.log(JSON.stringify({pass:passed,fail:0,scope:'serialized original Page/native getter doubles; no native mutation authority'}));

const {retainCaptureOwner,bindCaptureRuntime}=await import(pathToFileURL(root+'/src/retained-capture.mjs'));
function retainedFixture() {
 const controller=new AbortController(),page={isClosed:()=>false},context={pages:()=>[page]};
 const owner={id:'owner',account:'own',origin:'https://app.loginom.ai',context,page,generation:1,chat:'chat'};
 const binding=Object.freeze({owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'own',session:'sdk',admission:'original',expires:Date.now()+60000});
 const session={metadata:{sessionId:'sdk',clientRevision:'revision'},directory:'/own'};
 const state={startupOwner:owner,session,captureStartupBinding:{owner,id:owner.id,account:owner.account,origin:owner.origin,context,page,generation:1,chat:'chat'}};
 const retained=retainCaptureOwner(state,binding,Object.freeze({sha256:'a'.repeat(64)}));state.bridge={};state.client={};bindCaptureRuntime(retained,state.bridge,state.client);
 const receipt={version:1,owner_id:'owner',account:'own',origin:owner.origin,started_at:new Date().toISOString(),finished_at:new Date().toISOString(),status:'OWN_EMPTY_IDLE_PAGE',own_reference_chain_verified:true,package_count:{observed:true,type:'number',value:0},packages:[],running:{observed:true,type:'boolean',value:false},read_only:true,mutation_authorized:false,release_authorized:false,native_session_guid:'11111111-2222-3333-4444-555555555555'};
 page.evaluate=async()=>receipt;return {retained,controller,receipt,page,state,owner};
}
for(const mode of ['success','refusal','late-owner','record-false','record-abort','stale','foreign-receipt']){
 const f=retainedFixture(),records=[];let guarded=0;
 if(mode==='refusal'){f.receipt.status='NOT_VERIFIED';f.receipt.reason='ORIGINAL_PREPARED_PACKAGE_REQUIRED'}
 if(mode==='stale')f.receipt.started_at=new Date(Date.now()-16000).toISOString();
 if(mode==='foreign-receipt')f.receipt.owner_id='foreign';
 if(mode==='late-owner')f.page.evaluate=async()=>{f.state.startupOwner={...f.owner};return f.receipt};
 let caught=false,error;try{await inspectAmountOwnPage(f.retained,{signal:f.controller.signal,guard:()=>{guarded++;f.controller.signal.throwIfAborted()},record:async value=>{records.push(value);if(mode==='record-false')throw false;if(mode==='record-abort')f.controller.abort(false)}})}catch(v){caught=true;error=v}
 if(mode==='success'){assert(!caught);assert.equal(records.length,1)}else assert(caught,mode);
 if(['late-owner','stale','foreign-receipt'].includes(mode))assert.equal(records.length,0);
 if(mode==='refusal'){assert.equal(records[0].receipt,f.receipt);assert.equal(error.cause,f.receipt)}
 if(['record-false','record-abort'].includes(mode))assert.equal(error,false);
 assert(guarded);passed++;
}
console.log(JSON.stringify({pass:passed,fail:0,includes:'15 browser-native VM +7 actual retained-owner/record controls; Page/native doubles'}));
