import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const source=await fsp.readFile(process.env.MANAGED_MODULE??new URL('../src/managed-entry.mjs',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function closeRejection('),source.indexOf('const stop ='));
for(const late of [false,true])test('managed final directory-close owner boundary '+(late?'late replacement must refuse':'canonical'),async()=>{
 const root=await fsp.mkdtemp(join(tmpdir(),'managed-owner-review-'));
 const original=join(root,'original'),replacement=join(root,'replacement');await fsp.mkdir(original);await fsp.mkdir(replacement);
 const events=[];let changed=false,native=0,released=0;
 const state={session:{directory:original},authenticatedReadiness:{account:'fixture'},
  bridge:{async close(){native++;return {cleanup_complete:true,browser_transport_closed:true,native_logout_confirmed:true}}},
  client:{async close(){released++;events.push('client-release')}},
  browserServer:{async close(){released++;events.push('server-release')}},
  browser:{async close(){released++;events.push('context-release')}}};
 const close=(fd,callback)=>{
  const isDirectory=fs.fstatSync(fd).isDirectory();
  fs.close(fd,error=>{
   // Genuine original kernel callback. Only the private owner-directory double
   // changes, after confirmed bridge cleanup and before callback delivery.
   // No external filesystem race, adversary, native Loginom or other account.
   if(late&&!changed&&isDirectory&&state.bridgeCleanup){
    changed=true;state.session.directory=replacement;events.push('owner-directory-replaced-after-kernel-close');
   }
   callback(error);
  });
 };
 const f=vm.runInNewContext(code+';({close,recordClose})',{state,requests:new Set(),evidenceOpen:fs.open,evidenceWrite:fs.writeFile,evidenceSync:fs.fsync,evidenceClose:close,evidenceRename:fs.rename,constants:fs.constants,lstat:fsp.lstat,randomUUID,join,rm:fsp.rm,Promise,Error});
 try{
  let rejected=false,error;try{await f.close()}catch(value){rejected=true;error=value}
  const allowed=state.shutdown.stages.some(x=>x.stage==='outer_acknowledgement'&&x.status==='allowed');
  const result={fixture:true,source:process.env.MANAGED_MODULE,late,changed,rejected,error:error?.message,native,released,allowed,original_directory:original,current_directory:state.session.directory,events,
   scope:'whole actual recordClose/close functions; genuine FS/kernel callbacks; private owner/native/handles are labelled doubles; no message IPC or native Loginom leak claim'};
  if(process.env.REVIEW_RESULTS_DIR){await fsp.mkdir(process.env.REVIEW_RESULTS_DIR,{recursive:true});await fsp.writeFile(join(process.env.REVIEW_RESULTS_DIR,late?'late-owner.json':'canonical.json'),JSON.stringify(result,null,2)+'\n')}
  console.log(JSON.stringify({late,changed,rejected,native,released,allowed}));
  assert.equal(rejected,late,'late original owner-directory replacement must refuse before release/outer acknowledgement');
  assert.equal(native,1);
  assert.equal(released,late?0:3);
  assert.equal(allowed,!late);
  if(late){
   await assert.rejects(f.close());assert.equal(released,0);assert.equal(native,1);
   state.session.directory=original;await f.close();assert.equal(released,3);assert.equal(native,1);
  }
 }finally{await fsp.rm(root,{recursive:true,force:true})}
});
