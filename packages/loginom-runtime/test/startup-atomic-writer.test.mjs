import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const path=process.env.STARTUP_SOURCE;
const source=await fs.readFile(path,'utf8');
const text=source.slice(source.indexOf('function startupRejection('),source.indexOf('// Internal foreground owner'));
async function fixture({phase,rejected,secondary=false,fixedUUID,clock=Date.now,onSync,onRename}={}) {
 const directory=await fs.mkdtemp(join(tmpdir(),'review-atomic-startup-'));
 const final=join(directory,'startup-cleanup.json'),old='{"previous_receipt":true}\n';
 await fs.writeFile(final,old,{mode:0o600});
 const events=[],handles=[],owner={directory,evidence:{stages:[],native:{logged_out:true},cleanup_complete:false}};
 let injected=false,secondaryInjected=false;
 const fail=p=>{if(phase===p&&!injected){injected=true;throw rejected}};
 const open=async(p,flags,mode)=>{
  const label=p===directory?'directory':'file';events.push(label+'_open');fail(label+'_open');
  const real=await fs.open(p,flags,mode);handles.push(real);
  return {async writeFile(bytes){events.push('write');fail('write');await real.writeFile(bytes)},
   async sync(){events.push(label+'_sync');fail(label+'_sync');await real.sync();onSync?.(label)},
   async close(){events.push(label+'_close');if(secondary&&label==='file'&&!secondaryInjected){secondaryInjected=true;throw Error('secondary',{cause:false})}fail(label+'_close');await real.close()}};
 };
 const rename=async(a,b)=>{events.push('rename');fail('rename');await fs.rename(a,b);onRename?.()};
 const {startupEvidence}=vm.runInNewContext(text+';({startupEvidence})',{open,rename,unlink:fs.unlink,constants,randomUUID:fixedUUID?()=>fixedUUID:randomUUID,join,Error,Date:class extends Date{static now(){return clock()}}});
 return {owner,directory,final,old,events,write:()=>startupEvidence(owner),
  async dispose(){await Promise.allSettled(handles.map(h=>h.close()));await fs.rm(directory,{recursive:true,force:true})}};
}
async function save(f,label,extra={}) {
 await fs.writeFile(join(process.env.REVIEW_RESULTS,label+'.json'),JSON.stringify({source:path,fixture:true,real_filesystem:true,events:f.events,evidence:f.owner.evidence,...extra},null,2)+'\n');
}
test('atomic producer success uses real file/directory sync and private mode',async()=>{
 const f=await fixture();try{
  await f.write();assert.deepEqual(f.events,['file_open','write','file_sync','file_close','rename','directory_open','directory_sync','directory_close']);
  assert.equal((await fs.stat(f.final)).mode&0o777,0o600);assert.equal(await fs.readFile(f.final,'utf8'),JSON.stringify(f.owner.evidence,null,2)+'\n');
  await save(f,'atomic-success');
 }finally{await f.dispose()}
});
for(const phase of ['file_open','write','file_sync','file_close','rename','directory_open','directory_sync','directory_close'])
for(const [label,value] of [['Error',Error('first storage',{cause:0})],['zero',0]])test('atomic '+phase+' '+label+' preserves old receipt until rename and repairs storage only',async()=>{
 const f=await fixture({phase,rejected:value});try{
  let caught;try{await f.write()}catch(e){caught=e}assert.equal(caught,value);
  const beforeRename=['file_open','write','file_sync','file_close','rename'].includes(phase);
  if(beforeRename)assert.equal(await fs.readFile(f.final,'utf8'),f.old);
  else assert.equal(JSON.parse(await fs.readFile(f.final,'utf8')).native.logged_out,true);
  const first=JSON.stringify(f.owner.evidence.persistence_attempts[0]);await f.write();
  assert.equal(JSON.stringify(f.owner.evidence.persistence_attempts[0]),first);
  assert.equal(f.owner.evidencePendingClose.length,0);assert.equal((await fs.readdir(f.directory)).some(n=>n.startsWith('.startup-cleanup-')),false);
  await save(f,phase+'-'+label,{old_receipt_preserved_before_rename:beforeRename});
 }finally{await f.dispose()}
});
test('zero write refusal preserves secondary close cause independently',async()=>{
 const f=await fixture({phase:'write',rejected:0,secondary:true});try{
  let caught;try{await f.write()}catch(e){caught=e}assert.equal(caught,0);assert.equal(await fs.readFile(f.final,'utf8'),f.old);
  const a=f.owner.evidence.persistence_attempts[0];assert.equal(a.phase,'write');assert.equal(a.rejection.value,0);assert.equal(a.secondary[0].rejection.cause.value,false);
  assert.equal(f.owner.evidencePendingClose.length,1);await f.write();assert.equal(f.owner.evidencePendingClose.length,0);await save(f,'primary-zero-secondary-close');
 }finally{await f.dispose()}
});
test('exclusive temporary creation refuses an existing symlink without changing its target',async()=>{
 const f=await fixture({fixedUUID:'review-collision'});try{
  const foreign=join(f.directory,'other-original');await fs.writeFile(foreign,'UNCHANGED');
  const link=join(f.directory,'.startup-cleanup-review-collision.json');await fs.symlink(foreign,link);
  await assert.rejects(f.write(),e=>e.code==='EEXIST'||e.code==='ELOOP');
  assert.equal(await fs.readFile(foreign,'utf8'),'UNCHANGED');assert.equal(await fs.readFile(f.final,'utf8'),f.old);assert.equal((await fs.lstat(link)).isSymbolicLink(),true);
  await save(f,'temporary-symlink-refused');
 }finally{await f.dispose()}
});
test('atomic replacement does not follow an existing receipt symlink',async()=>{
 const f=await fixture();try{
  const foreign=join(f.directory,'other-original');await fs.writeFile(foreign,'UNCHANGED');await fs.unlink(f.final);await fs.symlink(foreign,f.final);
  await f.write();assert.equal(await fs.readFile(foreign,'utf8'),'UNCHANGED');assert.equal((await fs.lstat(f.final)).isSymbolicLink(),false);
  assert.equal((await fs.stat(f.final)).mode&0o777,0o600);await save(f,'receipt-symlink-replaced-without-following');
 }finally{await f.dispose()}
});

test('timing remains beside evidence until next atomic write, with no added IO',async()=>{
 let now=1000;const f=await fixture({clock:()=>now,onSync:label=>{now+=label==='file'?17:23},onRename:()=>{now+=5}});
 f.owner.initialReadiness={local_deadline:6000,budget_ms:5000};
 try{
  await f.write();assert.equal(f.owner.evidence.phase_timing.length,0);
  assert.equal(await fs.readFile(f.final,'utf8'),JSON.stringify(f.owner.evidence,null,2)+'\n');
  assert.equal(f.owner.phaseTiming.find(x=>x.name==='file_sync').duration_ms,17);
  await f.write();const receipt=JSON.parse(await fs.readFile(f.final,'utf8'));
  assert.equal(JSON.stringify(receipt),JSON.stringify(f.owner.evidence));
  assert.equal(receipt.phase_timing.find(x=>x.name==='file_sync').duration_ms,17);
  assert.equal(receipt.phase_timing.find(x=>x.name==='rename').duration_ms,5);
  assert.equal(receipt.phase_timing.find(x=>x.name==='directory_sync').duration_ms,23);
  assert.deepEqual(f.events,Array(2).fill(['file_open','write','file_sync','file_close','rename','directory_open','directory_sync','directory_close']).flat());
 }finally{await f.dispose()}
});
test('timing caps at 32 and next receipt preserves truncated flag',async()=>{
 const f=await fixture({clock:()=>1000});f.owner.initialReadiness={local_deadline:6000,budget_ms:5000};
 try{
  for(let i=0;i<10;i++)await f.write();
  assert.equal(f.owner.phaseTiming.length,32);const receipt=JSON.parse(await fs.readFile(f.final,'utf8'));
  assert.equal(receipt.phase_timing.length,32);assert.equal(receipt.phase_timing_truncated,true);
  for(const mark of receipt.phase_timing){assert.ok(['evidence_before','file_sync','rename','directory_sync','evidence_after'].includes(mark.name));assert.deepEqual(Object.keys(mark).sort(),['file_sync','rename','directory_sync'].includes(mark.name)?['at_ms','duration_ms','name']:['at_ms','name']);}
  assert.equal(f.events.length,80);
 }finally{await f.dispose()}
});
test('negative and fractional clock differences become null in next receipt',async()=>{
 let now=1000;const f=await fixture({clock:()=>now,onSync:label=>{now=label==='file'?1000.5:999}});
 f.owner.initialReadiness={local_deadline:6000,budget_ms:5000};
 try{
  await f.write();now=1000;await f.write();const receipt=JSON.parse(await fs.readFile(f.final,'utf8'));
  for(const name of ['file_sync','directory_sync']){const mark=receipt.phase_timing.find(x=>x.name===name);assert.equal(mark.at_ms,null);assert.equal(mark.duration_ms,null);}
 }finally{await f.dispose()}
});
