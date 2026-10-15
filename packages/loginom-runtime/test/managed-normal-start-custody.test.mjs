import vm from 'node:vm';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import * as module from 'node:module';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as url from 'node:url';
import * as os from 'node:os';
import {fork} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
const {validateStartInput}=await import(process.env.START_PROBE_VALIDATOR?url.pathToFileURL(process.env.START_PROBE_VALIDATOR):new URL('../src/start-input.mjs',import.meta.url));
const faultMode=(process.env.START_PROBE_MODE??'').replace('-repair','-replacement');
if(process.env.START_PROBE_CHILD==='1'){
 const entryPath=process.env.START_PROBE_ENTRY,events=[],fds=new Set();let state,originalOwner,originalTuple,completeStart,completed=false,selected=false,nativeDouble=0;
 const realSend=process.send.bind(process);
 const proof=()=>({sameOriginalOwner:state.startupOwner===originalOwner,completed,nativeDouble,
   sameDirectoryIdAccountOrigin:originalOwner.directory===originalTuple.directory&&originalOwner.id===originalTuple.id&&originalOwner.account===originalTuple.account&&originalOwner.origin===originalTuple.origin,
   closed:originalOwner?.closed,contextClosed:originalOwner?.contextClosed, knownContextChanged:originalOwner.context!==originalTuple.context, knownPageChanged:originalOwner.page!==originalTuple.page,
   bindingContextUndefined:state.evidenceOwnerBinding?state.evidenceOwnerBinding.context===undefined:null,
   currentContextPresent:!!originalOwner?.context,bindingOwnerSame:state.evidenceOwnerBinding?state.evidenceOwnerBinding.owner===originalOwner:null,
   writers:state.evidenceWriters?.size??0, releaseFlags:state.release,allowed:state.shutdown?.stages?.some(x=>x.stage==='outer_acknowledgement'&&x.status==='allowed')===true,startupFailure:state.shutdown?.startupFailure,events});
 process.send=(message,callback)=>{
  if(message.id==='close1'||message.id==='close2'||message.id==='close3')realSend({fixture:'state-proof',request:message.id,...proof()});
  return realSend(message,callback);
 };
 const callbackFs={...fs,
  open(p,flags,mode,callback){fs.open(p,flags,mode,(error,fd)=>{if(!error)fds.add(fd);callback(error,fd)})},
  close(fd,callback){const directory=fs.fstatSync(fd).isDirectory();fs.close(fd,error=>{
    if(!error)fds.delete(fd);events.push({event:'original-kernel-close-callback',directory});
    if(!error&&directory&&!selected&&completeStart){selected=true;completeStart()}
    callback(error);
  })},
 };
 const checkConnection=async options=>{
   originalOwner=options.owner;
   // Labelled native/start double follows real connection-check publication:
   // same private owner gets id/account/origin before awaited launch, and
   // context/page + confirmed validation cleanup before returning.
   Object.assign(originalOwner,{id:'fixture-owned-start',account:'fixture',origin:'https://fixture.invalid'});
   Object.assign(originalOwner,{context:{known:'original-context'},page:{known:'original-page'}});
   originalTuple={context:originalOwner.context,page:originalOwner.page,directory:originalOwner.directory,id:originalOwner.id,account:originalOwner.account,origin:originalOwner.origin};
   originalOwner.close=()=>{throw Error('fixture forbids replay of confirmed cleanup')};
   await new Promise(resolve=>{
    completeStart=()=>{
     if(completed)return;completed=true;nativeDouble++;if(faultMode==='normal-known-id-replacement')originalOwner.id='fixture-replaced-id';
     Object.assign(originalOwner,{context:faultMode.endsWith('context-replacement')?{replacement:true}:originalTuple.context,page:faultMode.endsWith('page-replacement')?{replacement:true}:originalTuple.page,closed:true,contextClosed:true,receipt:{cleanup_complete:true,native_logout_confirmed:true}});
     events.push({event:'original-start-completed',knownContextChanged:originalOwner.context!==originalTuple.context,knownPageChanged:originalOwner.page!==originalTuple.page,sameOwner:state.startupOwner===originalOwner});resolve();
    };
    events.push({event:'known-original-context-page-acquired-before-pause'});realSend({fixture:'start-paused'});
    if(process.env.START_PROBE_MODE==='stable')completeStart();
   });
 };
 const context=vm.createContext({process,URL,AbortController,setImmediate,console,Error,Promise,Map,Set});
 const builtins={'node:module':module,'node:crypto':crypto,'node:path':path,'node:os':os,'node:fs':callbackFs,'node:fs/promises':fsp};
 const bytes=await fsp.readFile(entryPath);
 const entry=new vm.SourceTextModule(bytes.toString()+'\nexport {state,requests};',{context,identifier:url.pathToFileURL(entryPath).href,initializeImportMeta(meta){meta.url=url.pathToFileURL(entryPath).href}});
 await entry.link(name=>{
  const exports=builtins[name]??{
   './resources.mjs':{verifyResources:async()=>({browserPath:'/fixture-not-executed'})},
   './start-input.mjs':{validateStartInput},
   './connection-check.mjs':{checkConnection,async loginBrowser(options){await checkConnection(options);return {context:options.owner.context}},loginomAddress(){}},
   '../client/lib/session.mjs':{createSession(){throw Error('fixture-normal-start-after-launch')}},
   '../client/lib/artifacts.mjs':{admitStartupArtifacts(){}},'../client/lib/bridge.mjs':{createBridge(){throw Error('validation creates no bridge')}},
  }[name];
  if(!exports)throw Error('unexpected import '+name);
  return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value)},{context});
 });
 await entry.evaluate();state=entry.namespace.state;
 const keepAlive=setInterval(()=>{},1000);
 process.on('message',async message=>{
  if(message.fixture==='finish-normal-start')completeStart?.();
  if(message.fixture==='restore-original'){Object.assign(originalOwner,{id:originalTuple.id,context:originalTuple.context,page:originalTuple.page});realSend({fixture:'restored'});}
  if(message.fixture==='dispose'){
   if(!completed)completeStart?.();
   for(const fd of fds)await new Promise(resolve=>fs.close(fd,()=>resolve()));
   clearInterval(keepAlive);process.exit(0); // Fixture disposal, never production cleanup/ACK.
  }
 });
 realSend({fixture:'ready',moduleSHA256:crypto.createHash('sha256').update(bytes).digest('hex')});
}else{
 for(const mode of ['normal-known-stable','normal-known-context-replacement','normal-known-page-replacement','normal-known-id-replacement','validation-known-context-replacement','normal-known-id-repair','normal-known-context-repair','normal-known-page-repair'])test('whole module original start settlement '+mode,async()=>{
 const entryPath=process.env.MANAGED_MODULE??url.fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url));
 const output=process.env.START_REPORT_DIR?path.join(process.env.START_REPORT_DIR,mode+'.json'):undefined;
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'managed-start-ipc-'));
 const messages=[],logs=[];let exited;
 const child=fork(url.fileURLToPath(import.meta.url),[],{execArgv:['--experimental-vm-modules'],stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,START_PROBE_CHILD:'1',START_PROBE_ENTRY:entryPath,START_PROBE_MODE:mode}});
 child.on('message',message=>messages.push(message));child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));
 const exit=new Promise(resolve=>child.on('exit',(code,signal)=>{exited={code,signal};resolve(exited)}));
 const until=async predicate=>{const deadline=Date.now()+5000;while(!predicate()){if(exited)throw Error('child exited '+JSON.stringify(exited));if(Date.now()>deadline)throw Error('fixture deadline '+JSON.stringify(messages));await new Promise(resolve=>setTimeout(resolve,5))}};
 try{
  await until(()=>messages.some(m=>m.fixture==='ready'));
  child.send({id:'start1',operation:'start',input:{protocol:1,validation:!mode.startsWith('normal-'),stateDir:root,generation:1,chat:'fixture',resources:'fixture',endpoint:'https://knowledge.fixture.invalid',connection:{url:'https://fixture.invalid',username:'fixture',password:'',apiKey:'fixture'}}});
  await until(()=>messages.some(m=>m.fixture==='start-paused'));
  if(mode==='stable')await until(()=>messages.some(m=>m.id==='start1'));
  child.send({id:'close1',operation:'close'});
  if(mode.startsWith('normal-'))child.send({fixture:'finish-normal-start'});
  await until(()=>messages.some(m=>m.id==='close1'));
  if(messages.find(m=>m.id==='close1').error){
   await until(()=>messages.some(m=>m.id==='start1'));child.send({id:'close2',operation:'close'});await until(()=>messages.some(m=>m.id==='close2'));
   if(mode.endsWith('-repair')){child.send({fixture:'restore-original'});await until(()=>messages.some(m=>m.fixture==='restored'));child.send({id:'close3',operation:'close'});await until(()=>messages.some(m=>m.id==='close3'));assert.deepEqual(messages.find(m=>m.id==='close3')?.result,{closed:true});await exit;}
  }else await exit;
 }finally{
  if(!exited){child.send({fixture:'dispose'});await exit}
  if(output){await fsp.mkdir(path.dirname(output),{recursive:true});await fsp.writeFile(output,JSON.stringify({messages,logs,exit:exited,
   scope:'whole exact managed module; real input validation/FS/kernel callbacks/child message IPC; original tracked start/close handlers; resources/checkConnection/native/Page doubles; no installed authenticated CLI or live host ACK'},null,2)+'\n');}
  await fsp.rm(root,{recursive:true,force:true});
 }
 if(mode.startsWith('normal-')){assert.equal(messages.find(m=>m.id==='start1')?.error,'LOGINOM_RUNTIME_FAILED');assert.equal(messages.find(m=>m.fixture==='state-proof')?.startupFailure?.message,'fixture-normal-start-after-launch');}
 const ack=messages.find(m=>m.id==='close1');if(mode.endsWith('-repair')){assert.equal(ack?.error,'LOGINOM_MANAGED_OWNER_DIRECTORY_CHANGED');assert.equal(messages.find(m=>m.id==='close2')?.error,'LOGINOM_MANAGED_OWNER_DIRECTORY_CHANGED');assert.deepEqual(messages.find(m=>m.id==='close3')?.result,{closed:true});const p=messages.find(m=>m.fixture==='state-proof'&&m.request==='close3');assert.equal(p.nativeDouble,1);assert.equal(p.writers,0);assert.equal(p.knownContextChanged,false);assert.equal(p.knownPageChanged,false);assert.equal(p.sameDirectoryIdAccountOrigin,true);return;}if(mode.endsWith('replacement')){assert.equal(ack?.error,'LOGINOM_MANAGED_OWNER_DIRECTORY_CHANGED');assert.equal(messages.find(m=>m.id==='close2')?.error,'LOGINOM_MANAGED_OWNER_DIRECTORY_CHANGED');return;}assert.deepEqual(ack?.result,{closed:true});
 const proof=messages.find(m=>m.fixture==='state-proof');assert.equal(proof.sameOriginalOwner,true);assert.equal(proof.sameDirectoryIdAccountOrigin,true);assert.equal(proof.completed,true);assert.equal(proof.nativeDouble,1);assert.equal(proof.writers,0);assert.equal(proof.currentContextPresent,true);assert.equal(proof.bindingContextUndefined,false);assert.equal(exited.code,0);
 console.log(JSON.stringify({first:messages.find(m=>m.id==='close1'),retry:messages.find(m=>m.id==='close2'),proofs:messages.filter(m=>m.fixture==='state-proof'),exit:exited}));
 });
}
