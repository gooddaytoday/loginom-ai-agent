import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const text=await fsp.readFile(process.env.BRIDGE_MODULE??new URL('../lib/bridge.mjs',import.meta.url),'utf8');
const start=text.indexOf('    async function writeCleanupReceipt(cleanup) {');
const writer=text.slice(start,text.indexOf('    function closeBridge() {',start));
const rs=text.indexOf('function shutdownRejection('),rejection=text.slice(rs,text.indexOf('\n}',rs)+2);
const primaryValues={error:Error('first IO failure',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''};
const scenarios=['canonical','directory-after-file-close','session-after-directory-close','binding-ref-after-file-close','cache-after-file-close','captured-bytes','pending-write',...Object.keys(primaryValues).map(k=>'primary-'+k)];
for(const scenario of scenarios)test('direct writer binding '+scenario,async()=>{
  const root=await fsp.mkdtemp(join(tmpdir(),'lab66-direct-binding-'));
  const original=join(root,'A'),replacement=join(root,'B');await fsp.mkdir(original);await fsp.mkdir(replacement);
  const session={directory:original,metadata:{sessionId:'own-session'}};
  const receipt={status:'SUCCEEDED',session_id:'own-session',package_closed:true,logged_out:true,note:'captured'};
  const events=[],paths=new Map(),owned=new Set();let instance,changed=false,deliver,writing,primaryThrown=false;
  const primary=primaryValues[scenario.slice(8)];
  const open=(p,mode,permissions,cb)=>fs.open(p,mode,permissions,(error,fd)=>{
    if(!error){paths.set(fd,p);owned.add(fd)}events.push({phase:'open',path:p.replace(root,'<fixture>')});
    cb(error,fd);if(scenario==='captured-bytes'&&!changed){changed=true;receipt.note='later mutation';}
  });
  const write=(fd,bytes,cb)=>{
    if(scenario==='pending-write'&&!changed){changed=true;
      writing=new Promise(resolve=>fs.writeFile(fd,bytes,error=>{deliver=()=>{session.directory=replacement;cb(error);resolve()}}));
      throw 0;
    }
    return fs.writeFile(fd,bytes,cb);
  };
  const sync=(fd,cb)=>{
    if(scenario.startsWith('primary-')&&!primaryThrown){primaryThrown=true;
      return new Promise((resolve,reject)=>fs.fsync(fd,error=>{cb(error);reject(primary)}));
    }
    return fs.fsync(fd,cb);
  };
  const close=(fd,cb)=>fs.close(fd,error=>{
    if(!error)owned.delete(fd);const p=paths.get(fd);events.push({phase:'original_close_callback',path:p.replace(root,'<fixture>')});
    cb(error);
    if(changed)return;
    if(p===join(original,'package-cleanup.json')){
      if(scenario==='directory-after-file-close'||scenario.startsWith('primary-')){changed=true;session.directory=replacement;}
      if(scenario==='binding-ref-after-file-close'){changed=true;instance.replaceBoundReceipt({...receipt});}
      if(scenario==='cache-after-file-close'){changed=true;instance.replaceCache({...receipt});}
    }
    if(p===original&&scenario==='session-after-directory-close'){changed=true;session.metadata.sessionId='replacement-session';}
  });
  const body=`let confirmedCleanup=receipt,cleanupEvidenceBinding,cleanupReceiptWritten=false,cleanupPersistencePrimary;const cleanupPersistenceFailures=[],cleanupWriters=new Set();${rejection}\n${writer}\n({write:writeCleanupReceipt,replaceCache:r=>{confirmedCleanup=r},replaceBoundReceipt:r=>{cleanupEvidenceBinding=Object.freeze({...cleanupEvidenceBinding,receipt:r})},inspect:()=>({marker:cleanupReceiptWritten,writers:cleanupWriters.size,primary:cleanupPersistencePrimary,failures:cleanupPersistenceFailures})})`;
  instance=vm.runInNewContext(body,{receipt,session,join,Promise,Error,receiptOpen:open,receiptWrite:write,receiptSync:sync,receiptClose:close});
  let failure,refused=false,afterRefusal;
  try{
    try{await instance.write(receipt)}catch(value){failure=value;refused=true;}
    if(scenario==='canonical'||scenario==='captured-bytes'){
      assert.equal(refused,false);assert.equal(instance.inspect().marker,true);
      const persisted=JSON.parse(await fsp.readFile(join(original,'package-cleanup.json'),'utf8'));
      assert.equal(persisted.note,'captured');
    }else{
      assert.equal(refused,true);assert.equal(instance.inspect().marker,false);
      if(scenario.startsWith('primary-')){
        assert.equal(failure,primary);assert.equal(instance.inspect().primary.value,primary);
        assert.match(instance.inspect().failures.at(-1).rejection.message,/BINDING_CHANGED/);
      }else if(scenario==='pending-write'){
        assert.equal(failure,0);const openCount=events.filter(x=>x.phase==='open').length;
        await assert.rejects(instance.write(receipt),value=>value===0);
        assert.equal(events.some(x=>x.phase==='original_close_callback'),false);
        assert.equal(events.filter(x=>x.phase==='open').length,openCount);
        while(!deliver)await new Promise(r=>setTimeout(r,1));deliver();await writing;
        await assert.rejects(instance.write(receipt),/BINDING_CHANGED/);
      }else assert.match(failure.message,/BINDING_CHANGED/);
      assert.equal(events.some(x=>x.path.startsWith('<fixture>/B')),false);
      afterRefusal=instance.inspect();
      session.directory=original;session.metadata.sessionId='own-session';instance.replaceCache(receipt);instance.replaceBoundReceipt(receipt);
      await instance.write(receipt);assert.equal(instance.inspect().marker,true);assert.equal(instance.inspect().writers,0);
      assert.equal(events.some(x=>x.path.startsWith('<fixture>/B')),false);
      assert.deepEqual(JSON.parse(await fsp.readFile(join(original,'package-cleanup.json'),'utf8')),receipt);
      if(scenario.startsWith('primary-')||scenario==='pending-write')assert.equal(instance.inspect().primary.value,scenario==='pending-write'?0:primary);
    }
    if(process.env.BINDING_RESULTS){await fsp.mkdir(process.env.BINDING_RESULTS,{recursive:true});await fsp.writeFile(join(process.env.BINDING_RESULTS,scenario+'.json'),JSON.stringify({scenario,events,refused,afterRefusal,final:instance.inspect(),scope:'exact direct writer VM; real callback FS; session/confirmed cache doubles; no native/release/IPC proof'},null,2));}
  }finally{
    if(deliver&&owned.size){deliver();await writing;}
    for(const fd of owned)await new Promise(r=>fs.close(fd,()=>r()));
    await fsp.rm(root,{recursive:true,force:true});
  }
});
