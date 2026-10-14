// Whole exact managed module + real child IPC/atomic FS. Native/handles are doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as module from 'node:module';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as os from 'node:os';
import * as url from 'node:url';
import vm from 'node:vm';
const entryPath=process.env.MANAGED_MODULE??url.fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url));
if(process.env.ABSENT_RELEASE_CHILD==='1') {
  const scenario=process.env.ABSENT_RELEASE_SCENARIO,events=[],handles=new Map();
  let state,publication=0,releases=0,deliver;
  const send=process.send.bind(process);
  process.send=(message,callback)=>{
    if(message.id==='close')send({fixture:'proof',events,publication,releases,shutdown:state.shutdown,release:state.release});
    return send(message,callback);
  };
  const callbackFs={...fs,
    open(p,flags,mode,callback){fs.open(p,flags,mode,(error,fd)=>{if(!error)handles.set(fd,fs.fstatSync(fd).isDirectory());events.push({event:'open',directory:handles.get(fd)===true});callback(error,fd)})},
    fsync(fd,callback){fs.fsync(fd,error=>{events.push({event:'kernel-sync',directory:handles.get(fd)===true});callback(error)})},
    close(fd,callback){const directory=handles.get(fd);fs.close(fd,error=>{
      handles.delete(fd);events.push({event:'kernel-close',directory});
      const finish=()=>{if(directory){publication++;events.push({event:'original-directory-callback',publication})}callback(error)};
      if(directory&&publication===0&&scenario==='held-callback'){deliver=finish;send({fixture:'held',events,releases})}else finish();
    })},
  };
  const context=vm.createContext({process,URL,AbortController,setImmediate,console,Error,Promise,Map,Set});
  const builtin={'node:module':module,'node:crypto':crypto,'node:path':path,'node:os':os,'node:fs':callbackFs,'node:fs/promises':fsp};
  const text=await fsp.readFile(entryPath,'utf8');
  const entry=new vm.SourceTextModule(text+'\nexport {state};',{context,identifier:url.pathToFileURL(entryPath).href,initializeImportMeta(m){m.url=url.pathToFileURL(entryPath).href}});
  await entry.link(name=>{
    const exports=builtin[name]??{
      './resources.mjs':{verifyResources(){throw Error('fixture forbids startup')}},
      './start-input.mjs':{validateStartInput(){throw Error('fixture forbids startup')}},
      './connection-check.mjs':{loginBrowser(){throw Error('fixture forbids login')},checkConnection(){throw Error('fixture forbids login')},loginomAddress(){}},
      '../client/lib/session.mjs':{createSession(){}},'../client/lib/artifacts.mjs':{admitStartupArtifacts(){}},'../client/lib/bridge.mjs':{createBridge(){}},
    }[name];
    if(!exports)throw Error('unexpected dependency '+name);
    return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v)},{context});
  });
  await entry.evaluate();state=entry.namespace.state;
  state.startupOwner={directory:process.env.ABSENT_RELEASE_DIRECTORY,id:'original-owner',account:'fixture',origin:'https://fixture.invalid',context:{fixture:true},page:{fixture:true},closed:true,contextClosed:true,receipt:{cleanup_complete:true,logged_out:true,context_closed:true},close(){throw Error('fixture forbids native/context replay')}};
  if(scenario==='present'||scenario==='held-callback')for(const key of ['client','browserServer','browser'])state[key]={async close(){releases++;events.push({event:'release-double',key,publication})}};
  // An attempted release is never treated as an unacquired absent handle.
  if(scenario==='attempted')state.release={client_attempted:true,client_failure:Error('original close unknown',{cause:0})};
  process.on('message',m=>{
    if(m.fixture==='deliver'){const d=deliver;deliver=undefined;d?.()}
    if(m.fixture==='dispose')process.disconnect(); // Only a test double refusal owner.
  });
  send({fixture:'ready'});
} else {
  for(const scenario of ['absent','present','held-callback','attempted'])test('whole-module release inventory '+scenario,async()=>{
    const root=await fsp.mkdtemp(path.join(os.tmpdir(),'managed-absent-'));
    const messages=[],logs=[];let exited;
    const child=fork(url.fileURLToPath(import.meta.url),[],{execPath:process.execPath,execArgv:['--experimental-vm-modules'],stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,ABSENT_RELEASE_CHILD:'1',ABSENT_RELEASE_SCENARIO:scenario,ABSENT_RELEASE_DIRECTORY:root}});
    child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));
    const exit=new Promise(resolve=>child.on('exit',(code,signal)=>{exited={code,signal};resolve(exited)}));
    const until=async predicate=>{const end=Date.now()+10000;while(!predicate()){assert.ok(Date.now()<end,JSON.stringify({messages,logs,exited}));await new Promise(r=>setTimeout(r,5))}};
    try {
      await until(()=>messages.some(m=>m.fixture==='ready'));child.send({id:'close',operation:'close'});
      if(scenario==='held-callback'){
        await until(()=>messages.some(m=>m.fixture==='held'));assert.equal(messages.some(m=>m.id==='close'),false);assert.equal(messages.find(m=>m.fixture==='held').releases,0);child.send({fixture:'deliver'});
      }
      await until(()=>messages.some(m=>m.id==='close'));
      const reply=messages.find(m=>m.id==='close'),proof=messages.find(m=>m.fixture==='proof');
      if(scenario==='attempted'){
        assert.ok(reply.error);assert.equal(proof.shutdown.primaryFailure.rejection.message,'original close unknown');assert.equal(proof.shutdown.primaryFailure.rejection.cause.value,0);assert.equal(proof.shutdown.stages.some(s=>s.stage==='outer_acknowledgement'),false);child.send({fixture:'dispose'});
      }else{
        assert.deepEqual(reply.result,{closed:true});assert.equal(proof.events.at(-1).event,'original-directory-callback');
        assert.equal(proof.publication,scenario==='absent'?3:7);
        assert.equal(proof.releases,scenario==='absent'?0:2); // Confirmed startup context is already closed.
        if(scenario==='absent'){assert.equal(proof.shutdown.stages.some(s=>['client','browser_server','browser_context'].includes(s.stage)),false);assert.deepEqual(proof.release,{})}
        else for(const e of proof.events.filter(e=>e.event==='release-double'))assert.ok(e.publication>=3);
      }
      await exit;assert.equal(exited.signal,null);
      if(process.env.ABSENT_RELEASE_REPORT){await fsp.mkdir(process.env.ABSENT_RELEASE_REPORT,{recursive:true});await fsp.writeFile(path.join(process.env.ABSENT_RELEASE_REPORT,scenario+'.json'),JSON.stringify({entryPath,scenario,messages,logs,exit:exited,scope:'Whole module/real atomic FS/kernel callbacks/child IPC; original native cleanup/handles are labelled doubles'},null,2)+'\n')}
    }finally {
      if(!exited){child.kill('SIGKILL');await exit}
      await fsp.rm(root,{recursive:true,force:true});
    }
  });
}
