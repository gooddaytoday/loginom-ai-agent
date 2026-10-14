import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import vm from 'node:vm';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';

const text=await fsp.readFile(process.env.BRIDGE_MODULE??new URL('../lib/bridge.mjs',import.meta.url),'utf8');
const writer=text.slice(text.indexOf('    async function writeCleanupReceipt(cleanup) {'),text.indexOf('    function closeBridge()'));
const start=text.indexOf('function shutdownRejection(');
const rejection=text.slice(start,text.indexOf('\n}',start)+2);
for(const scenario of ['canonical','metadata-after-file-close','unlink-callback-error'])test('original temp custody: '+scenario,async()=>{
  const root=await fsp.mkdtemp(join(tmpdir(),'cleanup-custody-review-'));
  const original=join(root,'A'),foreign=join(root,'B');await fsp.mkdir(original);await fsp.mkdir(foreign);
  const session={directory:original,metadata:{sessionId:'owned-original'}};
  const receipt=Object.freeze({status:'SUCCEEDED',session_id:'owned-original',logged_out:true,package_closed:true});
  const events=[],fds=new Set(),kinds=new Map();let fileClosed=false,changed=false,unlinkFaulted=false;
  const open=(path,flags,mode,cb)=>{
    events.push({event:'open',scope:path.startsWith(original)?'A':'B'});
    fs.open(path,flags,mode,(error,fd)=>{if(!error){fds.add(fd);kinds.set(fd,path===original?'directory':'file')}cb(error,fd)});
  };
  const close=(fd,cb)=>fs.close(fd,error=>{
    if(!error)fds.delete(fd);events.push({event:'close-callback',kind:kinds.get(fd)});
    if(kinds.get(fd)==='file'){
      fileClosed=true;
      if(scenario==='unlink-callback-error'&&!changed){changed=true;session.directory=foreign}
    }
    cb(error);
  });
  const stat=async path=>{
    const result=await fsp.lstat(path);
    if(scenario==='metadata-after-file-close'&&fileClosed&&!changed&&path===original){
      changed=true;session.directory=foreign;events.push({event:'late-binding-change',phase:'post-file-close-guard-lstat'});
    }
    return result;
  };
  const unlink=(path,cb)=>{
    events.push({event:'unlink',scope:path.startsWith(original)?'A':'B'});
    if(scenario==='unlink-callback-error'&&!unlinkFaulted){
      unlinkFaulted=true;
      // Known error callback; the original owned file remains. This is a
      // labelled fault reply, not a claim that the real kernel returned EACCES.
      queueMicrotask(()=>cb(Object.assign(Error('fixture unlink denied'),{code:'EACCES'})));
    }else fs.unlink(path,cb);
  };
  const body=`let confirmedCleanup=receipt,cleanupEvidenceBinding,cleanupPublication,cleanupReceiptWritten=false,cleanupPersistencePrimary;const cleanupWriters=new Set(),cleanupPersistenceFailures=[];${rejection}\n${writer}\n({write:writeCleanupReceipt,inspect:()=>({marker:cleanupReceiptWritten,writers:[...cleanupWriters].map(f=>({temporary:f.temporary,ownsTemporary:f.ownsTemporary,closeComplete:f.closeComplete})),publication:cleanupPublication,persistenceFailures:cleanupPersistenceFailures})})`;
  const f=vm.runInNewContext(body,{receipt,session,lstat:stat,constants:fs.constants,randomUUID,join,Promise,Error,
    receiptOpen:open,receiptWrite:fs.writeFile,receiptSync:fs.fsync,receiptClose:close,receiptRename:fs.rename,receiptUnlink:unlink});
  try{
    let refused=false;
    if(scenario==='canonical')await f.write(receipt);
    else{
      await assert.rejects(f.write(receipt),/LOGINOM_CLEANUP_RECEIPT_BINDING_CHANGED/);refused=true;
      session.directory=original;
      if(scenario==='unlink-callback-error')await assert.rejects(f.write(receipt));
    }
    const before=f.inspect(),tempsBefore=(await fsp.readdir(original)).filter(n=>n.startsWith('.package-cleanup.'));
    if(scenario!=='canonical')await f.write(receipt);
    const after=f.inspect(),tempsAfter=(await fsp.readdir(original)).filter(n=>n.startsWith('.package-cleanup.'));
    const result={scenario,fixture:true,refused,before,tempsBefore,after,tempsAfter,events,
      noB_IO:events.every(e=>e.scope!=='B'),scope:'exact production writer in VM; real FS/kernel except labelled unlink error callback and supplied owner/cache/native receipt doubles; no Loginom/native or live release/ACK'};
    if(process.env.REVIEW_RESULTS_DIR){await fsp.mkdir(process.env.REVIEW_RESULTS_DIR,{recursive:true});await fsp.writeFile(join(process.env.REVIEW_RESULTS_DIR,scenario+'.json'),JSON.stringify(result,null,2)+'\n')}
    console.log(JSON.stringify({scenario,custodyBefore:before.writers.length,tempsBefore:tempsBefore.length,markerAfter:after.marker,tempsAfter:tempsAfter.length,noB_IO:result.noB_IO}));
    assert.equal(result.noB_IO,true);
    if(scenario!=='canonical')assert.equal(before.writers.length,1,'a known existing owned original temporary must remain in custody after refusal');
    assert.deepEqual(tempsAfter,[],'same-tuple repair must retire the original owned temporary before the success marker');
    assert.equal(after.marker,true);
  }finally{
    for(const fd of fds)await new Promise(resolve=>fs.close(fd,()=>resolve()));
    await fsp.rm(root,{recursive:true,force:true});
  }
});

for(const mode of ['pending-lost-reply','early-fulfilled','callback-false'])test('original unlink custody '+mode,async()=>{
 const root=await fsp.mkdtemp(join(tmpdir(),'cleanup-unlink-custody-'));
 const original=join(root,'A'),foreign=join(root,'B');await fsp.mkdir(original);await fsp.mkdir(foreign);
 const session={directory:original,metadata:{sessionId:'owned'}};
 const receipt=Object.freeze({status:'SUCCEEDED',session_id:'owned'});
 let replaced=false,unlinkCalls=0,opens=0,deliver,originalFile,originalCloses=0;
 const events=[],fds=new Set();
 const close=(fd,cb)=>{if(fd===originalFile&&!replaced)originalCloses++;fs.close(fd,error=>{
  if(!error)fds.delete(fd);
  if(!replaced){replaced=true;session.directory=foreign;}cb(error);
 })};
 const unlink=(path,cb)=>{
  unlinkCalls++;assert.ok(path.startsWith(original+'/'));events.push('original-unlink');
  if(unlinkCalls!==1)return fs.unlink(path,cb);
  if(mode==='callback-false'){queueMicrotask(()=>cb(false));return;}
  fs.unlink(path,error=>{deliver=()=>cb(error)});
  if(mode==='early-fulfilled')return Promise.resolve('projection');
  throw 0;
 };
 const body=`let confirmedCleanup=receipt,cleanupEvidenceBinding,cleanupPublication,cleanupReceiptWritten=false,cleanupPersistencePrimary;const cleanupWriters=new Set(),cleanupPersistenceFailures=[];${rejection}\n${writer}\n({write:writeCleanupReceipt,inspect:()=>({marker:cleanupReceiptWritten,primary:cleanupPersistencePrimary,custody:[...cleanupWriters].filter(f=>f.ownsTemporary).length,pending:cleanupPublication?.pending,failures:cleanupPersistenceFailures})})`;
 const f=vm.runInNewContext(body,{receipt,session,lstat:fsp.lstat,constants:fs.constants,randomUUID,join,Promise,Error,
  receiptOpen:(path,flags,permissions,cb)=>{opens++;assert.ok(path===original||path.startsWith(original+'/'));fs.open(path,flags,permissions,(error,fd)=>{if(!error){fds.add(fd);if(originalFile===undefined)originalFile=fd;}cb(error,fd)})},
  receiptWrite:fs.writeFile,receiptSync:fs.fsync,receiptClose:close,receiptRename:fs.rename,receiptUnlink:unlink});
 let repair;
 try{
  let originalFailure;await assert.rejects(f.write(receipt),error=>{originalFailure=error;return /BINDING_CHANGED/.test(error.message)});assert.equal(f.inspect().custody,1);assert.equal(f.inspect().marker,false);
  session.directory=original;
  let settled=false,result;
  repair=f.write(receipt).then(()=>{settled=true;result={ok:true}},error=>{settled=true;result={ok:false,error}});
  const until=async pred=>{const end=Date.now()+5000;while(!pred()){assert.ok(Date.now()<end,'bounded callback fixture');await new Promise(r=>setTimeout(r,1))}};
  await until(()=>unlinkCalls===1);assert.equal(f.inspect().custody,1);assert.equal(f.inspect().marker,false);
  if(mode==='callback-false'){
   await repair;assert.equal(result.ok,false);assert.equal(result.error,originalFailure);assert.equal(f.inspect().primary.value,originalFailure);assert.equal(f.inspect().failures.at(-1).rejection.value,false);
  }else{
   await until(()=>!!deliver);
   if(mode==='pending-lost-reply'){await repair;assert.equal(result.ok,false);assert.equal(result.error,originalFailure);assert.equal(f.inspect().failures.at(-1).rejection.value,0)}
   else assert.equal(settled,false);
   const before=opens;await assert.rejects(f.write(receipt));assert.equal(opens,before);assert.equal(unlinkCalls,1);
   assert.equal(f.inspect().custody,1);assert.equal(f.inspect().marker,false);
   deliver();deliver=undefined;await repair;
  }
  if(!result.ok)await f.write(receipt);
  assert.equal(f.inspect().marker,true);assert.equal(f.inspect().custody,0);
  assert.deepEqual((await fsp.readdir(original)).filter(n=>n.startsWith('.package-cleanup.')),[]);
  assert.deepEqual(await fsp.readdir(foreign),[]);
  // FD numbers may be reused by later writers: compare original close before repair.
  assert.equal(originalCloses,1);assert.equal(unlinkCalls,mode==='callback-false'?2:1);
 }finally{
  if(deliver)deliver();if(repair)await repair;
  for(const fd of fds)await new Promise(r=>fs.close(fd,()=>r()));await fsp.rm(root,{recursive:true,force:true});
 }
});
