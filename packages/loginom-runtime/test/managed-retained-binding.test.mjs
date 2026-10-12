import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import * as fs from 'node:fs';import * as fsp from 'node:fs/promises';
import {randomUUID} from 'node:crypto';import {join} from 'node:path';import {tmpdir} from 'node:os';
const text=await fsp.readFile(process.env.MANAGED_MODULE??new URL('../src/managed-entry.mjs',import.meta.url),'utf8');
const body=text.slice(text.indexOf('function closeRejection('),text.indexOf('const stop ='));
for(const mode of ['foreign-control','empty-directory','missing-owner'])test('retained original binding retry '+mode,async()=>{
 const root=await fsp.mkdtemp(join(tmpdir(),'retained-owner-review-'));
 const original=join(root,'original'),foreign=join(root,'foreign');await fsp.mkdir(original);await fsp.mkdir(foreign);
 const owner={directory:original};let changed=false,native=0,released=0,opens=0;
 const state={session:owner,authenticatedReadiness:{account:'fixture'},bridge:{async close(){native++;return {cleanup_complete:true,browser_transport_closed:true,native_logout_confirmed:true}}},client:{async close(){released++}},browserServer:{async close(){released++}},browser:{async close(){released++}}};
 const close=(fd,cb)=>{const directory=fs.fstatSync(fd).isDirectory();fs.close(fd,error=>{if(!changed&&directory&&state.bridgeCleanup){changed=true;owner.directory=foreign}cb(error)})};
 const f=vm.runInNewContext(body+';({close})',{state,requests:new Set(),evidenceOpen:(...args)=>{opens++;return fs.open(...args)},evidenceWrite:fs.writeFile,evidenceSync:fs.fsync,evidenceClose:close,evidenceRename:fs.rename,constants:fs.constants,lstat:fsp.lstat,randomUUID,join,rm:fsp.rm,Promise,Error});
 try{
  await assert.rejects(f.close(),/LOGINOM_MANAGED_OWNER_DIRECTORY_CHANGED/);
  assert.equal(native,1);assert.equal(released,0);assert.equal(state.evidenceOwnerBinding.owner,owner);assert.equal(state.evidenceOwnerBinding.directory,original);
  if(mode==='empty-directory')owner.directory='';
  if(mode==='missing-owner')state.session=undefined;
  const before=opens;let rejected=false,error;try{await f.close()}catch(e){rejected=true;error=e}
  const allowed=state.shutdown.stages.some(s=>s.stage==='outer_acknowledgement'&&s.status==='allowed');
  const result={mode,fixture:true,source:process.env.MANAGED_MODULE,retained_binding_present:!!state.evidenceOwnerBinding,rejected,error:error?.message,native,released,allowed,io_open_delta:opens-before,
   scope:'whole actual recordClose/close functions; real FS/kernel callbacks; private owner/native/handles labelled doubles; no native Loginom or live IPC ACK'};
  if(process.env.REVIEW_RESULTS_DIR){await fsp.mkdir(process.env.REVIEW_RESULTS_DIR,{recursive:true});await fsp.writeFile(join(process.env.REVIEW_RESULTS_DIR,mode+'.json'),JSON.stringify(result,null,2)+'\n')}
  console.log(JSON.stringify({mode,rejected,native,released,allowed,io_open_delta:opens-before}));
  assert.equal(rejected,true,'retained original owner must not become no-start success when current owner/directory is missing');
  assert.equal(released,0);assert.equal(native,1);assert.equal(allowed,false);assert.equal(opens,before);
  state.session=owner;owner.directory=original;await f.close();assert.equal(native,1);assert.equal(released,3);
 }finally{await fsp.rm(root,{recursive:true,force:true})}
});

for(const resource of [null,'session','bridge','browser','browserProfile','evidenceWriters','evidencePublication'])test('no-start requires no acquired resource: '+resource,async()=>{
 const state={};let calls=0;
 if(resource==='session')state.session={directory:''};
 else if(resource==='evidenceWriters')state.evidenceWriters=new Set([{}]);
 else if(resource)state[resource]={};
 const unexpected=()=>{calls++;throw Error('unexpected IO or native call')};
 const f=vm.runInNewContext(body+';({recordClose})',{state,requests:new Set(),evidenceOpen:unexpected,lstat:unexpected,Promise,Error});
 if(resource)await assert.rejects(f.recordClose('probe',{}),/LOGINOM_MANAGED_OWNER_DIRECTORY_CHANGED/);
 else await f.recordClose('probe',{});
 assert.equal(calls,0);assert.equal(state.evidenceOwnerBinding,undefined);
});

test('legitimate never-started close retains the no-IO path',async()=>{
 const state={};let calls=0;
 const unexpected=()=>{calls++;throw Error('unexpected IO or native call')};
 const f=vm.runInNewContext(body+';({close})',{state,requests:new Set(),evidenceOpen:unexpected,lstat:unexpected,rm:unexpected,Promise,Error});
 await f.close();assert.equal(calls,0);assert.equal(state.evidenceOwnerBinding,undefined);
 assert.equal(state.shutdown.stages.at(-1).stage,'outer_acknowledgement');
 assert.equal(state.shutdown.stages.at(-1).status,'allowed');
});
