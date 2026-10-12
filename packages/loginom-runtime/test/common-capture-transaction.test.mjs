import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {open as captureOpen,writeFile as captureWrite,fsync as captureSync,close as captureClose} from 'node:fs';
import {readFile,writeFile,open,mkdtemp,mkdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const source=await readFile(process.env.CAPTURE_BRIDGE_SOURCE??new URL('../client/lib/bridge.mjs',import.meta.url),'utf8');
const code=source.slice(source.indexOf('    async function closeCaptureWriter('),source.indexOf('    function closeBridge()',source.indexOf('    async function closeCaptureWriter(')));
for(const scenario of ['success','foreign-account','expired','pending','running','unknown','changed-after','missing-receipt','write-refusal','throw-error','throw-undefined','throw-null','throw-false','throw-zero','throw-empty'])test('common capture transaction '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'common-capture-')),events=[];
 const binding={revision:1,harness:'calculator-grouped-before-done-v1',owner:'owner',run:'run',lease:'owner:run',generation:7,chat:'chat',account:'user',packagePath:'/user/p.lgp',admission:'admission',session:'session',expires:Date.now()+60000};
 const state={loginom_account:'user',document_id:'document',workflow_ref:{tab_tid:'tab'}};
 const session={directory,metadata:{workspaceReady:true,sessionId:'session',workspacePreparation:{attempted:true,state},targetIdentity:{loginom_build:'7.4.2'}}};
 const managedSave={sessionId:'session',documentId:'document',tabTid:'tab',account:'user',packagePath:'/user/p.lgp',loginomBuild:'7.4.2'};
 if(scenario==='foreign-account')binding.account='foreign';if(scenario==='expired')binding.expires=0;
 const throws={error:Error('primary',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''};
 const raw=throws[scenario.slice(6)];
 const globals={captureOpen,captureWrite,captureSync,captureClose,captureWriters:new Set(),capturePersistenceFailures:[],capturePersistencePrimary:undefined,captureEvidenceBinding:undefined,captureReceiptWritten:false,captureJournalWritten:false,session,binding,managedSave,Error,Date,JSON,open,writeFile,readFile,join,
  actionRuntime:{assertPreparationAllowed(){if(scenario==='pending')throw Error('pending')},hasUnsettledWork:()=>scenario==='unknown',hasActiveWork:()=>scenario==='running'},
  clipboardUncertain:false,heldLeases:new Set(),savedPackages:new Set(['/user/p.lgp']),browser:{fixture:true},
  browserGate:async fn=>{events.push('gate');return fn()},
  recordExecution:async value=>{events.push(value.event);},
  shutdownRejection:value=>value instanceof Error?{kind:'Error',message:value.message,cause:value.cause}:{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined},
  closeBridge:async()=>{events.push('cleanup');await writeFile(join(directory,'package-cleanup.json'),JSON.stringify({status:'SUCCEEDED',package_closed:true,logged_out:true}));return {cleanup_complete:true,browser_transport_closed:true}},
  acceptanceCapture:{binding,harness:async({identity})=>{events.push('harness');if(scenario.startsWith('throw-'))throw raw;if(scenario==='changed-after')state.document_id='foreign';return scenario==='missing-receipt'?undefined:{...identity,settings_applied:false,cancel_verified:true}}},
  captureIOAssert:undefined,diagnosticCapture:undefined,captureConsumed:false,captureInFlight:undefined,captureUnknown:false,captureRejected:false,captureRejection:undefined,captureEvidence:undefined,shutdownStarted:false,cleanupRefused:false};
 const context=vm.createContext(globals);const api=vm.runInContext(code+';({captureAcceptance})',context);
 try{
  if(scenario==='write-refusal')await mkdir(join(directory,'acceptance-capture.json'));
  let result,failed=false,primary;try{result=await api.captureAcceptance()}catch(value){failed=true;primary=value}
  if(scenario==='success'){assert.equal(failed,false);assert.equal(result.cleanupComplete,true);assert.ok(events.indexOf('acceptance_capture')<events.indexOf('cleanup'));assert.equal(JSON.parse(await readFile(join(directory,'acceptance-capture.json'),'utf8')).binding.lease,'owner:run')}
  else {assert.equal(failed,true);assert.equal(events.includes('cleanup'),false);if(scenario.startsWith('throw-')){assert.equal(primary,raw);assert.equal(context.captureRejection,raw);const receipt=JSON.parse(await readFile(join(directory,'acceptance-capture-failure.json'),'utf8'));assert.equal(receipt.failed,true);assert.equal(receipt.rejection.is_undefined,raw===undefined?true:raw instanceof Error?undefined:false)}}
  await assert.rejects(api.captureAcceptance());assert.equal(events.filter(x=>x==='harness').length,events.includes('harness')?1:0);
 }finally{await rm(directory,{recursive:true,force:true})}
});
