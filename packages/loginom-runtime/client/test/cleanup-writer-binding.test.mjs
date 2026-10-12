import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import vm from 'node:vm';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
const modulePath=process.env.BRIDGE_MODULE??new URL('../lib/bridge.mjs',import.meta.url);
const text=await fsp.readFile(modulePath,'utf8');
const writer=text.slice(text.indexOf('    async function writeCleanupReceipt(cleanup) {'),text.indexOf('    return { server, catalog, hasActiveWork:'));
const start=text.indexOf('function shutdownRejection(');
const rejection=text.slice(start,text.indexOf('\n}',start)+2);
const results=[];
for(const scenario of ['canonical','directory-replaced-after-file-close','session-id-replaced-after-directory-close']) test('post-await cleanup binding '+scenario,async()=>{
  const root=await fsp.mkdtemp(join(tmpdir(),'receiving71-binding-'));
  const original=join(root,'original'),replacement=join(root,'replacement');
  await fsp.mkdir(original);await fsp.mkdir(replacement);
  const session={directory:original,metadata:{sessionId:'own-original'}};
  const receipt=Object.freeze({status:'SUCCEEDED',session_id:'own-original',logged_out:true,package_closed:true});
  const events=[],kinds=new Map(),fds=new Set();let changed=false;
  const open=(path,flags,mode,callback)=>{
    events.push({event:'open',location:path===original?'original-directory':path===replacement?'replacement-directory':'owned-temp'});
    fs.open(path,flags,mode,(error,fd)=>{if(!error){kinds.set(fd,path===original||path===replacement?'directory':'file');fds.add(fd)}callback(error,fd)});
  };
  const close=(fd,callback)=>fs.close(fd,error=>{
    if(!error)fds.delete(fd);
    events.push({event:'original-kernel-close-callback',kind:kinds.get(fd)});
    if(!changed&&scenario==='directory-replaced-after-file-close'&&kinds.get(fd)==='file'){
      changed=true;session.directory=replacement;
    }
    if(!changed&&scenario==='session-id-replaced-after-directory-close'&&kinds.get(fd)==='directory'){
      changed=true;session.metadata.sessionId='own-replacement';
    }
    callback(error);
  });
  const rename=(from,to,callback)=>{
    events.push({event:'rename',target:to.startsWith(original)?'original':'replacement'});
    fs.rename(from,to,callback);
  };
  const body=`let confirmedCleanup=receipt,cleanupEvidenceBinding,cleanupPublication,cleanupReceiptWritten=false,cleanupPersistencePrimary;const cleanupWriters=new Set(),cleanupPersistenceFailures=[];${rejection}\n${writer}\n({write:writeCleanupReceipt,inspect:()=>({marker:cleanupReceiptWritten,boundDirectory:cleanupEvidenceBinding.directory,boundSessionId:cleanupEvidenceBinding.sessionId,writers:cleanupWriters.size})})`;
  const f=vm.runInNewContext(body,{receipt,session,constants:fs.constants,randomUUID,join,Promise,Error,
    receiptOpen:open,receiptWrite:fs.writeFile,receiptSync:fs.fsync,receiptClose:close,receiptRename:rename,receiptUnlink:fs.unlink});
  try {
    const exists=async dir=>fsp.readFile(join(dir,'package-cleanup.json'),'utf8').then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error});
    if(scenario==='canonical'){
      await f.write(receipt);assert.equal(f.inspect().marker,true);
      assert.equal(await exists(original),true);assert.equal(await exists(replacement),false);
      assert.equal(changed,false);
    }else{
      await assert.rejects(f.write(receipt),/LOGINOM_CLEANUP_RECEIPT_BINDING_CHANGED/);
      assert.equal(f.inspect().marker,false);
      assert.equal(await exists(replacement),false);
      assert.equal(events.some(e=>e.event==='rename'&&e.target==='replacement'),false);
      assert.equal(events.some(e=>e.event==='open'&&e.location==='replacement-directory'),false);
      if(scenario==='directory-replaced-after-file-close'){
        assert.equal(await exists(original),false);assert.equal(session.directory,replacement);
        const temps=(await fsp.readdir(original)).filter(n=>n.startsWith('.package-cleanup-'));
        assert.equal(temps.length,1);assert.deepEqual(JSON.parse(await fsp.readFile(join(original,temps[0]),'utf8')),receipt);
        assert.equal(f.inspect().writers,1); // Confirmed closed file record/temp retained.
        session.directory=original;
      }else{
        assert.equal(session.metadata.sessionId,'own-replacement');
        assert.equal(f.inspect().writers,1); // Original directory close callback confirmed.
        session.metadata.sessionId='own-original';
      }
      await f.write(receipt);assert.equal(f.inspect().marker,true);
      assert.equal(await exists(original),true);assert.equal(await exists(replacement),false);
      assert.equal(f.inspect().writers,0);
    }
    results.push({scenario,events,marker:f.inspect().marker,custodyVerified:true});
  }finally{for(const fd of fds)await new Promise(resolve=>fs.close(fd,()=>resolve()));if(process.env.BINDING_RESULTS){await fsp.mkdir(process.env.BINDING_RESULTS,{recursive:true});await fsp.writeFile(join(process.env.BINDING_RESULTS,scenario+'.json'),JSON.stringify({scenario,events,inspection:f.inspect(),scope:'exact writer; real FS/original callbacks; supplied SUCCEEDED/session fixtures; no native/IPC'},null,2))};await fsp.rm(root,{recursive:true,force:true})}
});
