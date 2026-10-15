import vm from 'node:vm';
import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

// Real producer/lifecycle functions and filesystem. Page/Application/locators
// and external connection services are labelled doubles; no native browser.
export async function durabilityFixture({source,managed,phase,rejected,when='before',primary,guard,writeAndClose=false,verifyDurability=true}={}) {
 const directory=await fs.mkdtemp(join(tmpdir(),'startup-durable-')),events=[],document={querySelectorAll:()=>[]};
 const map={PackageNodes:{Count:0},FServerConnection:{Connected:true,UserName:'own'},HasRunningNodes:()=>guard?guard.value:false};
 const app={Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:map}}}};
 const state=vm.createContext({document,location:{origin:'https://own.invalid',href:'https://own.invalid/app'},bg:{app},getComputedStyle:()=>({visibility:'visible'}),Error});
 const owner={directory,artifacts:{fixture:true},deadline:null};let native=0,context=0,consumed=false,secondaryConsumed=false;
 const fault=(p)=>{if(!consumed&&phase===p&&(when==='before'||(when==='context'?context>0:native>0))){consumed=true;throw rejected}};
 const handles=[];
 const open=async(path,flags,mode)=>{
  const dir=path===directory,label=dir?'directory':'file';fault(label+'_open');events.push(label+'_open');
  const fd=await fs.open(path,flags,mode);handles.push(fd);let closed=false;
  return {async writeFile(bytes){events.push('write');fault('write');await fd.writeFile(bytes)},
   async sync(){events.push(label+'_sync');fault(label+'_sync');await fd.sync()},
   async close(){events.push(label+'_close');if(writeAndClose&&label==='file'&&!secondaryConsumed){secondaryConsumed=true;throw Error('secondary close',{cause:false})}fault(label+'_close');await fd.close();closed=true}};
 };
 const rename=async(a,b)=>{events.push('rename');fault('rename');return fs.rename(a,b)};
 const code=(await fs.readFile(source,'utf8')).slice((await fs.readFile(source,'utf8')).indexOf('export function browserEnvironment')).replaceAll('export ','');
 const functions=vm.runInNewContext(code+';({startupOwner})',{...fs,open,rename,constants,createHash,runtimeModulePath:String(source),join,dirname,randomUUID,URL,process,Error});
 functions.startupOwner(owner,directory,{username:'own',url:'https://own.invalid'});
 state.__loginomStartupV1={document,id:owner.id,account:'own'};
 if(primary){owner.primaryFailure=primary.value;owner.evidence.primary_rejection=serial(primary.value)}
 owner.page={evaluate:async(fn,arg)=>vm.runInContext('('+fn.toString()+')',state)(arg),locator:s=>({locator(){return this},
  async click(){if(s.includes('btnLogOut')){native++;events.push('native_logout');map.FServerConnection.Connected=false}},
  innerText:async()=>'own',waitFor:async()=>{},isVisible:async()=>s.includes('btnAvatar')?map.FServerConnection.Connected:true})};
 owner.context={pages:()=>owner.contextClosed?[]:[owner.page],async close(){
  const proof=JSON.parse(await fs.readFile(join(directory,'startup-cleanup.json'),'utf8'));assert.equal(proof.native.logged_out,true);
  if(verifyDurability)assert.ok(events.lastIndexOf('directory_close')>events.lastIndexOf('native_logout'),'native producer sync/close before context exit');
  events.push('context_close');context++;
 }};
 let lifecycle;
 if(managed){const s=await fs.readFile(managed,'utf8'),m=s.slice(s.indexOf('function closeRejection('),s.indexOf('const stop ='));
  const outer={startupOwner:owner,browser:owner.context,authenticatedReadiness:true,session:{directory}};
  lifecycle=vm.runInNewContext(m+';({close,state})',{state:outer,requests:new Set(),...fs,join,Promise,Error});
 }
 return {owner,map,events,directory,lifecycle,native:()=>native,context:()=>context,serial,async dispose(){await Promise.allSettled(handles.map(h=>h.close()));await fs.rm(directory,{recursive:true,force:true})}};
}
export function serial(value){return value instanceof Error?{kind:'Error',name:value.name,message:value.message,...('cause'in value?{cause:serial(value.cause)}:{})}:{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined}}
