import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

// Original reviewer case; wrapper now forwards real FileHandle.fd so externally
// completed close is observable by production. A separate opaque control retains.
const source=await fs.readFile(process.env.MANAGED_MODULE??new URL('../src/managed-entry.mjs',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function closeRejection('),source.indexOf('const stop ='));
for(const scenario of ['normal','unclosed-file','settled-file','opaque-settled-file',...['error','undefined','null','false','zero','empty'].map(x=>'sync-'+x)])test('exact receiving management file completion: '+scenario,async()=>{
 const directory=await fs.mkdtemp(join(tmpdir(),'review-management-file-'));
 const values={error:Error('sync rejection',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''};
 const events=[],handles=[];let fault=true,blockedHandle,helperCalls=0;
 const state={session:{directory},authenticatedReadiness:{account:'own'},browser:{async close(){events.push('context-close')}},
  bridge:{async close(){helperCalls++;return {cleanup_complete:true,browser_transport_closed:true,native_logout_confirmed:true}}},
  client:{async close(){events.push('client-close')}},browserServer:{async close(){events.push('server-close')}}};
 const open=async(path,mode)=>{
  const handle=await fs.open(path,mode);handles.push(handle);
  const content=await fs.readFile(path,'utf8');
  const selected=fault&&scenario!=='normal'&&content.includes('"stage": "bridge"')&&content.includes('"status": "returned"');
  if(selected){fault=false;blockedHandle=handle;events.push('selected-original-handle')}
  return {get fd(){return scenario==='opaque-settled-file'?undefined:handle.fd},async sync(){if(selected&&scenario.startsWith('sync-'))throw values[scenario.slice(5)];await handle.sync();events.push('sync-complete')},
   async close(){if(selected){events.push('close-refused-before-real-fd-close');throw scenario.startsWith('sync-')?false:0}await handle.close();events.push('close-complete')}};
 };
 const functions=vm.runInNewContext(code+';({close})',{state,requests:new Set(),writeFile:fs.writeFile,open,join,rm:fs.rm,Promise,Error});
 let first,second;
 try{
  try{await functions.close()}catch(error){first={message:error?.message,cause:error?.cause}}
  if(scenario==='normal'){assert.equal(first,undefined);assert.ok(state.shutdown.stages.some(s=>s.stage==='outer_acknowledgement'));return}
  assert.ok(first);assert.equal(events.includes('context-close'),false);assert.equal(helperCalls,1);
  if(scenario.startsWith('sync-')){
   await fs.writeFile(join(process.env.REVIEW_RESULTS_DIR??directory,scenario+'.json'),JSON.stringify({fixture:true,source:process.env.MANAGED_MODULE,first,events,primary:state.shutdown.primaryFailure,scope:'exact receiving close/recordClose; real FileHandle; injected sync0 followed by closefalse before physical close'},null,2)+'\n');
   assert.equal(first.cause,values[scenario.slice(5)],'the first sync rejection must survive secondary close failure');assert.equal(state.shutdown.persistencePrimary.phase,'file_sync');assert.equal(state.shutdown.persistenceFailures[0].rejection.value,false);return;
  }
  assert.equal(blockedHandle.fd>=0,true);await blockedHandle.stat();
  if(scenario.includes('settled-file')&&scenario!=='unclosed-file'){await blockedHandle.close();events.push('original-fd-close-confirmed-by-fixture')}
  try{await functions.close()}catch(error){second={message:error?.message,cause:error?.cause}}
  const originalStillOpen=blockedHandle.fd>=0;
  const acknowledged=state.shutdown.stages.some(s=>s.stage==='outer_acknowledgement');
  await fs.writeFile(join(process.env.REVIEW_RESULTS_DIR??directory,scenario+'.json'),JSON.stringify({fixture:true,source:process.env.MANAGED_MODULE,first,second,events,helperCalls,originalStillOpen,acknowledged,scope:'exact receiving close/recordClose; real FileHandle; explicit close-refusal injection, Page/native handles doubles'},null,2)+'\n');
  assert.equal(acknowledged,scenario==='settled-file','management ACK must wait for completion of the original refused file close');
  assert.equal(helperCalls,1);
 }finally{for(const handle of handles)if(handle.fd>=0)await handle.close();await fs.rm(directory,{recursive:true,force:true})}
});
