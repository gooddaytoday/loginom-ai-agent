import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import {pbkdf2,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const text=await fsp.readFile(process.env.MANAGED_MODULE??new URL('../src/managed-entry.mjs',import.meta.url),'utf8');
const code=text.slice(text.indexOf('function closeRejection('),text.indexOf('const stop ='));
for(const scenario of ['lost-file','early-file','withheld-success','lost-directory','io-write','sync-unconfirmed'])test(scenario,async()=>{
  const directory=await fsp.mkdtemp(join(tmpdir(),'review-callback-'));
  const events=[],fds=new Set();let selected=false,selectedFd,completion,blocker,deliver,finished=false,native=0,released=0;
  const first=Error('original sync',{cause:0});
  const state={session:{directory},authenticatedReadiness:{account:'own'},
    bridge:{async close(){native++;return {cleanup_complete:true,browser_transport_closed:true,native_logout_confirmed:true}}},
    browser:{async close(){released++}},client:{async close(){released++}},browserServer:{async close(){released++}}};
  const physical=()=>{try{fs.fstatSync(selectedFd);return true}catch{return false}};
  const open=(p,flags,mode,cb)=>{
    if(selected&&!finished)events.push({event:'new-writer-before-confirmation',physical:physical()});
    fs.open(p,flags,mode,(e,fd)=>{if(!e)fds.add(fd);cb(e,fd)});
  };
  const write=(fd,bytes,cb)=>{
    if(scenario==='io-write'&&!selected&&state.bridgeCleanup){
      selected=true;selectedFd=fd;
      completion=new Promise(resolve=>fs.writeFile(fd,bytes,e=>{events.push({event:'original-write-complete'});deliver=()=>{finished=true;cb(e);resolve()}}));
      throw 0;
    }
    fs.writeFile(fd,bytes,cb);
  };
  const sync=(fd,cb)=>{
    if(scenario==='sync-unconfirmed'&&!selected&&state.bridgeCleanup){selected=true;selectedFd=fd;throw first}
    fs.fsync(fd,cb);
  };
  const close=(fd,cb)=>{
    if(scenario==='io-write'&&fd===selectedFd&&!finished)events.push({event:'close-before-original-io-confirmation'});
    if(scenario==='sync-unconfirmed'&&fd===selectedFd){events.push({event:'close-after-unknown-sync'});throw false}
    const target=!selected&&state.bridgeCleanup&&(scenario==='lost-directory'?fs.fstatSync(fd).isDirectory():!fs.fstatSync(fd).isDirectory());
    if(target){
      selected=true;selectedFd=fd;
      blocker=new Promise((resolve,reject)=>pbkdf2('fixture','fixture',1000000,8,'sha256',e=>e?reject(e):resolve()));
      completion=new Promise(resolve=>fs.close(fd,e=>{
        fds.delete(fd);events.push({event:'kernel-close-complete',physical:physical()});
        deliver=()=>{finished=true;cb(e);resolve()};
        if(scenario!=='withheld-success')deliver();
      }));
      events.push({event:'close-scheduled',physical:physical()});
      if(scenario==='lost-file'||scenario==='lost-directory')throw 0;
      return Promise.resolve('premature projection');
    }
    fs.close(fd,e=>{if(!e)fds.delete(fd);cb(e)});
  };
  const f=vm.runInNewContext(code+';({close,recordClose})',{state,requests:new Set(),evidenceOpen:open,evidenceWrite:write,evidenceSync:sync,evidenceClose:close,constants:fs.constants,randomUUID,evidenceRename:fs.rename,evidenceUnlink:fs.unlink,join,rm:fsp.rm,Promise,Error});
  const until=async p=>{const end=Date.now()+5000;while(!p()){assert.ok(Date.now()<end,'fixture timeout');await new Promise(r=>setTimeout(r,2))}};
  let firstOutcome;
  try{
    const pending=f.close().then(()=>{firstOutcome={ok:true}},error=>{firstOutcome={ok:false,error}});
    await until(()=>selected);
    if(scenario==='sync-unconfirmed'){
      await pending;
      assert.equal(state.evidencePrimary.value,first);
      assert.equal(state.shutdown.persistencePrimary.rejection.cause.value,0);
      assert.equal(state.evidenceWriters.size,1);
      assert.equal(events.some(e=>e.event==='close-after-unknown-sync'),false);
      // No original sync callback was scheduled, so this remains UNKNOWN.
      await assert.rejects(f.close(),e=>e===first && e.cause===0);
      assert.equal(native,1);assert.equal(released,0);
    }else if(scenario==='withheld-success'){
      await until(()=>!!deliver);
      assert.equal(physical(),false);
      assert.equal(firstOutcome,undefined);
      assert.equal(state.evidenceWriters.size,1);
      const same=f.close();assert.equal(same,state.closing);
      assert.equal(released,0);deliver();await same;await pending;
      assert.equal(native,1);assert.equal(released,3);
    }else if(scenario==='early-file'){
      assert.equal(physical(),true);assert.equal(firstOutcome,undefined);assert.equal(released,0);
      await pending;assert.equal(firstOutcome.ok,true);assert.equal(native,1);assert.equal(released,3);
    }else{
      await pending;assert.equal(firstOutcome.ok,false);assert.equal(firstOutcome.error.cause,0);
      assert.equal(released,0);assert.equal(native,1);assert.equal(state.evidenceWriters.size,1);
      if(scenario==='io-write'){
        await until(()=>!!deliver);await assert.rejects(f.close(),e=>e.cause===0);
        assert.equal(events.some(e=>e.event==='close-before-original-io-confirmation'),false);deliver();
      }
      await completion;await f.close();assert.equal(native,1);assert.equal(released,3);
    }
    assert.equal(events.some(e=>e.event==='new-writer-before-confirmation'),false);
    if(scenario!=='sync-unconfirmed'){
      assert.equal(state.evidenceWriters.size,0);
      const receipt=JSON.parse(await fsp.readFile(join(directory,'managed-shutdown.json'),'utf8'));
      assert.ok(receipt.stages.some(s=>s.stage==='outer_acknowledgement'&&s.status==='allowed'));
    }
  }finally{
    if(blocker)await blocker;
    if(deliver&&!finished)deliver();if(completion)await completion;
    for(const fd of fds)await new Promise(resolve=>fs.close(fd,()=>resolve()));
    if(process.env.REVIEW_RESULTS_DIR){await fsp.mkdir(process.env.REVIEW_RESULTS_DIR,{recursive:true});
    await fsp.writeFile(join(process.env.REVIEW_RESULTS_DIR,scenario+'.json'),JSON.stringify({scenario,events,native,released,writers:state.evidenceWriters?.size,shutdown:state.shutdown,scope:'exact production writer/close functions in VM; genuine callback FS/kernel queue/fstat; native/handles and reply faults doubles; no message IPC in reviewer controls'},null,2));}
    await fsp.rm(directory,{recursive:true,force:true});
  }
});
