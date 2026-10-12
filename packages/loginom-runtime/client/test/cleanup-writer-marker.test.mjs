import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import {pbkdf2,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const source=await fsp.readFile(process.env.BRIDGE_MODULE??new URL('../lib/bridge.mjs',import.meta.url),'utf8');
const writer=source.slice(source.indexOf('    async function writeCleanupReceipt(cleanup) {'),source.indexOf('    return { server, catalog, hasActiveWork:'));
const rejection=source.slice(source.indexOf('function shutdownRejection('),source.indexOf('\n}',source.indexOf('function shutdownRejection('))+2);
for(const scenario of ['lost-file','early-file','withheld-file','lost-directory','pending-write','first-cause','foreign-binding'])test(scenario,async()=>{
  const directory=await fsp.mkdtemp(join(tmpdir(),'review-cleanup-callback-'));
  const events=[],owned=new Set();let selected=false,fd,blocker,kernel,deliver,confirmed=false,openCalls=0;
  const primary=Error('original sync',{cause:0});
  const session={directory,metadata:{sessionId:'own-session'}};
  const receipt={status:'SUCCEEDED',session_id:'own-session',package_closed:true,logged_out:true};
  let run;
  const physical=()=>{try{fs.fstatSync(fd);return true}catch{return false}};
  const open=(p,mode,permissions,cb)=>{
    openCalls++;if(selected&&!confirmed)events.push({event:'replacement-before-confirmation',physical:physical()});
    fs.open(p,mode,permissions,(e,value)=>{if(!e)owned.add(value);cb(e,value)});
  };
  const write=(value,bytes,cb)=>{
    if(['pending-write','foreign-binding'].includes(scenario)&&!selected){selected=true;fd=value;
      kernel=new Promise(resolve=>fs.writeFile(value,bytes,e=>{events.push({event:'original-write-completed'});deliver=()=>{confirmed=true;cb(e);resolve()}}));throw 0;
    }
    fs.writeFile(value,bytes,cb);
  };
  const sync=(value,cb)=>{
    if(scenario==='first-cause'&&!selected){selected=true;fd=value;
      return new Promise((resolve,reject)=>fs.fsync(value,e=>{cb(e);reject(primary)}));
    }
    fs.fsync(value,cb);
  };
  const close=(value,cb)=>{
    if(['pending-write','foreign-binding'].includes(scenario)&&value===fd&&!confirmed)events.push({event:'close-before-write-confirmation'});
    const fault=!selected&&(scenario==='lost-directory'?fs.fstatSync(value).isDirectory():!fs.fstatSync(value).isDirectory())||scenario==='first-cause'&&value===fd&&!kernel;
    if(fault){selected=true;fd=value;
      blocker=new Promise((resolve,reject)=>pbkdf2('fixture','fixture',1000000,8,'sha256',e=>e?reject(e):resolve()));
      kernel=new Promise(resolve=>fs.close(value,e=>{owned.delete(value);events.push({event:'original-kernel-close',physical:physical()});
        deliver=()=>{confirmed=true;cb(e);resolve()};if(scenario!=='withheld-file')deliver();
      }));
      events.push({event:'close-scheduled',physical:physical()});
      if(['early-file','withheld-file'].includes(scenario))return Promise.resolve('premature fulfilled projection');
      throw scenario==='first-cause'?false:0;
    }
    fs.close(value,e=>{if(!e)owned.delete(value);cb(e)});
  };
  const body=`let confirmedCleanup=receipt,cleanupEvidenceBinding,cleanupPublication,cleanupReceiptWritten=false,cleanupPersistencePrimary;const cleanupPersistenceFailures=[],cleanupWriters=new Set();${rejection}\n${writer}\n({write:writeCleanupReceipt,inspect:()=>({marker:cleanupReceiptWritten,writers:cleanupWriters.size,primary:cleanupPersistencePrimary,failures:cleanupPersistenceFailures})})`;
  const f=vm.runInNewContext(body,{receipt,session,receiptOpen:open,receiptWrite:write,receiptSync:sync,receiptClose:close,constants:fs.constants,randomUUID,receiptRename:fs.rename,receiptUnlink:fs.unlink,join,Promise,Error});
  const until=async predicate=>{const end=Date.now()+5000;while(!predicate()){assert.ok(Date.now()<end,'fixture timeout');await new Promise(resolve=>setTimeout(resolve,2))}};
  let outcome;
  try{
    run=f.write(receipt).then(()=>{outcome={ok:true}},e=>{outcome={ok:false,error:e}});
    await until(()=>selected);
    if(scenario==='withheld-file'){
      await until(()=>!!deliver);assert.equal(physical(),false);assert.equal(outcome,undefined);assert.equal(f.inspect().marker,false);assert.equal(f.inspect().writers,1);
      const calls=openCalls;await assert.rejects(f.write(receipt));assert.equal(openCalls,calls);assert.equal(f.inspect().marker,false);deliver();await run;assert.equal(outcome.ok,true);
    }else if(scenario==='early-file'){
      assert.equal(physical(),true);assert.equal(outcome,undefined);assert.equal(f.inspect().marker,false);await run;assert.equal(outcome.ok,true);
    }else{
      await run;assert.equal(outcome.ok,false);assert.equal(outcome.error,scenario==='first-cause'?primary:0);assert.equal(f.inspect().marker,false);assert.equal(f.inspect().writers,1);
      const calls=openCalls;
      if(['pending-write','foreign-binding'].includes(scenario)){
        await until(()=>!!deliver);await assert.rejects(f.write(receipt),e=>e===0);assert.equal(events.some(e=>e.event==='close-before-write-confirmation'),false);
        if(scenario==='foreign-binding'){
          session.metadata.sessionId='foreign';await assert.rejects(f.write(receipt),/BINDING_CHANGED/);assert.equal(openCalls,calls);session.metadata.sessionId='own-session';
          session.directory=directory+'-foreign';await assert.rejects(f.write(receipt),/BINDING_CHANGED/);assert.equal(openCalls,calls);session.directory=directory;
        }
        deliver();
      }
      if(scenario==='first-cause'){
        assert.equal(f.inspect().primary.value,primary);assert.equal(f.inspect().failures[0].rejection.cause.value,0);
        assert.equal(f.inspect().failures.at(-1).rejection.value,false);
      }
      await kernel;await f.write(receipt);assert.equal(f.inspect().marker,true);
    }
    assert.equal(events.some(e=>e.event==='replacement-before-confirmation'),false);assert.equal(f.inspect().writers,0);assert.equal(f.inspect().marker,true);
    assert.deepEqual(JSON.parse(await fsp.readFile(join(directory,'package-cleanup.json'),'utf8')),receipt);
  }finally{
    if(blocker)await blocker;if(deliver&&!confirmed)deliver();if(kernel)await kernel;if(run)await run;
    for(const value of owned)await new Promise(resolve=>fs.close(value,()=>resolve()));
    if(process.env.REVIEW_RESULTS_DIR){await fsp.mkdir(process.env.REVIEW_RESULTS_DIR,{recursive:true});
    await fsp.writeFile(join(process.env.REVIEW_RESULTS_DIR,scenario+'.json'),JSON.stringify({scenario,events,openCalls,inspection:f.inspect(),scope:'exact production writer in VM; real callback FS/fstat/kernel queue; fault projections doubles; no transport/native/message IPC assertion in these controls'},null,2));}
    await fsp.rm(directory,{recursive:true,force:true});
  }
});
