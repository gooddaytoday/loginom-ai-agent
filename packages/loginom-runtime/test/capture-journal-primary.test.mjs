import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const source=await fsp.readFile(process.env.CAPTURE_BRIDGE_SOURCE,'utf8');
const begin=source.indexOf('    async function closeCaptureWriter('),end=source.indexOf('    function closeBridge()',begin);
const helpers=source.slice(begin,end);
const closeStart=source.indexOf('    function closeBridge() {');
const closeEnd=source.indexOf('      shutdownStarted = true;',closeStart);
assert.ok(begin>=0&&end>begin&&closeEnd>closeStart);
// Exact early close branches; the unrelated native/lifecycle tail is a labelled
// cleanup probe. This reviewer test adds no native/whole host or IPC proof.
const closeBranches=source.slice(closeStart,closeEnd)+'      return cleanupProbe();\n    }';
const serialize=value=>value instanceof Error?{kind:'Error',message:value.message,...('cause'in value?{cause:serialize(value.cause)}:{})}:{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined};

for(const kind of ['error','undefined','null','false','zero','empty'])for(const held of [false,true])test('journal '+kind+' / diagnostic close '+(held?'unknown':'confirmed'),async()=>{
  const directory=await fsp.mkdtemp(join(tmpdir(),'review-capture-journal-'));
  const raw={error:Error('original journal rejection',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''}[kind];
  const diagnosticFailure=Error('secondary diagnostic close',{cause:false});
  const events=[],owned=new Set(),targets=new Map();let deliver,kernel,selected=false,journalCalls=0,harnessCalls=0,cleanupCalls=0,captureWrites=0;
  const binding={revision:1,harness:'calculator-grouped-before-done-v1',owner:'owner',run:'run',lease:'owner:run',generation:7,chat:'chat',account:'user',packagePath:'/user/p.lgp',admission:'admission',session:'session',expires:Date.now()+60000};
  const state={loginom_account:'user',document_id:'document',workflow_ref:{tab_tid:'tab'}};
  const session={directory,metadata:{workspaceReady:true,sessionId:'session',workspacePreparation:{attempted:true,state},targetIdentity:{loginom_build:'7.4.2'}}};
  const open=(p,mode,permissions,cb)=>fs.open(p,mode,permissions,(e,fd)=>{if(!e){owned.add(fd);targets.set(fd,p)}cb(e,fd)});
  const write=(fd,bytes,cb)=>{if(targets.get(fd)?.endsWith('/acceptance-capture.json'))captureWrites++;fs.writeFile(fd,bytes,cb)};
  const close=(fd,cb)=>{
    if(held&&!selected&&targets.get(fd)?.endsWith('/acceptance-capture-failure.json')){
      selected=true;kernel=new Promise(resolve=>fs.close(fd,e=>{owned.delete(fd);events.push('diagnostic-kernel-close-completed');deliver=()=>cb(e);resolve()}));
      throw diagnosticFailure;
    }
    fs.close(fd,e=>{if(!e)owned.delete(fd);cb(e)});
  };
  const globals={captureOpen:open,captureWrite:write,captureSync:fs.fsync,captureClose:close,captureWriters:new Set(),capturePersistenceFailures:[],capturePersistencePrimary:undefined,captureEvidenceBinding:undefined,captureReceiptWritten:false,captureJournalWritten:false,session,binding,
    managedSave:{sessionId:'session',documentId:'document',tabTid:'tab',account:'user',packagePath:'/user/p.lgp',loginomBuild:'7.4.2'},Error,Date,JSON,join,readFile:fsp.readFile,
    actionRuntime:{assertPreparationAllowed(){},hasUnsettledWork:()=>false,hasActiveWork:()=>false},clipboardUncertain:false,heldLeases:new Set(),savedPackages:new Set(['/user/p.lgp']),browser:{fixture:true},browserGate:async fn=>fn(),
    recordExecution:async value=>{journalCalls++;await fsp.writeFile(join(directory,'reviewer-journal.json'),JSON.stringify(value));if(journalCalls===1)throw raw},shutdownRejection:serialize,
    acceptanceCapture:{binding,harness:async({identity})=>{harnessCalls++;return {...identity,settings_applied:false,cancel_verified:true}}},
    captureConsumed:false,captureInFlight:undefined,captureUnknown:false,captureRejected:false,captureRejection:undefined,captureEvidence:undefined,shutdownStarted:false,cleanupRefused:false,importRefused:false,
    cleanupProbe:async()=>{cleanupCalls++;return {fixture:true,cleanup_complete:true}}};
  const context=vm.createContext(globals);const api=vm.runInContext(helpers+closeBranches+';({captureAcceptance,closeBridge})',context);
  const outcome=async p=>{try{return {ok:true,value:await p}}catch(value){return {ok:false,value}}};
  let initial,retry,repaired;
  try{
    initial=await outcome(api.captureAcceptance());assert.equal(initial.ok,false);assert.equal(initial.value,raw);assert.equal(context.captureRejection,raw);
    assert.equal(context.captureReceiptWritten,true);assert.equal(context.captureJournalWritten,false);assert.equal(captureWrites,1);assert.equal(harnessCalls,1);assert.equal(cleanupCalls,0);
    if(held){
      await kernel;assert.equal(context.captureWriters.size,1);retry=await outcome(api.closeBridge());
      assert.equal(retry.ok,false);assert.equal(context.captureReceiptWritten,true);assert.equal(context.captureJournalWritten,false);assert.equal(cleanupCalls,0);assert.equal(captureWrites,1);
      // The diagnostic writer must remain held, but its secondary rejection
      // must not replace the original journal/capture rejection at Close.
      assert.equal(retry.value,raw,'Close must preserve the original journal rejection while diagnostic writer is unknown');
    }else{
      retry=await outcome(api.closeBridge());assert.equal(retry.ok,true);assert.equal(context.captureJournalWritten,true);assert.equal(cleanupCalls,1);assert.equal(captureWrites,1);assert.equal(harnessCalls,1);
    }
  }finally{
    if(kernel)await kernel;if(deliver)deliver();
    if(held){repaired=await outcome(api.closeBridge());assert.equal(repaired.ok,true);assert.equal(captureWrites,1);assert.equal(harnessCalls,1);assert.equal(cleanupCalls,1)}
    for(const fd of owned)await new Promise(resolve=>fs.close(fd,()=>resolve()));
    await fsp.mkdir(process.env.REVIEW_RESULTS_DIR,{recursive:true});
    await fsp.writeFile(join(process.env.REVIEW_RESULTS_DIR,kind+'-'+held+'.json'),JSON.stringify({kind,held,initial:initial&&{ok:initial.ok,rejection:serialize(initial.value)},retry:retry&&{ok:retry.ok,rejection:serialize(retry.value)},ownerPrimary:serialize(context.captureRejection),diagnosticFailure:serialize(diagnosticFailure),metadata:session.metadata,captureWrites,journalCalls,harnessCalls,cleanupCalls,events,scope:'exact capture IO/transaction and early close branches in VM; real callback FS/kernel; journal rejection projection, harness and native cleanup probe doubles; no whole-module host/native/message IPC claim'},null,2));
    await fsp.rm(directory,{recursive:true,force:true});
  }
});
