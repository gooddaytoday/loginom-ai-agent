import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectReferenceFile, verifyReferenceFile, referenceUploadBudget } from '../lib/file-reference.mjs';
import { createArtifactStore, admitStartupArtifacts, artifactFailure } from '../lib/artifacts.mjs';

test('upload cancellation and uncertainty preserve typed codes without private error details',()=>{
  for(const code of ['LOGINOM_UPLOAD_CANCELLED','LOGINOM_UPLOAD_UNCERTAIN']) {
    assert.deepEqual(artifactFailure(Object.assign(Error(code),{details:{path:'/private',bytes:'SECRET'}})),{error:code,details:{}});
  }
});

for(const size of [0,1,16*1024*1024,2**31-1,2**31,2**31+1,2**32-1,2**32,2**32+1048576,Number.MAX_SAFE_INTEGER]) {
  test(`reference deadline uses safe arithmetic for ${size} bytes`,()=>{
    assert.equal(referenceUploadBudget(size),Math.min(7200000,120000+Math.ceil(size/5242880)*1000));
  });
}
test('invalid sizes never enter upload arithmetic',()=>{
  for(const size of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,1.5,'4294967296'])assert.throws(()=>referenceUploadBudget(size),/LOGINOM_INPUT_INVALID/);
});

test('metadata-only reference checks preserve an existing backend digest without a new SHA pass',async()=>{
  const root=await mkdtemp(join(tmpdir(),'runtime-metadata-reference-'));
  try {
    const source=join(root,'source.csv');await writeFile(source,'original');
    const snapshot={...await inspectReferenceFile(source),sha256:'f'.repeat(64)};
    assert.equal(snapshot.mtime_ns,String((await stat(source,{bigint:true})).mtimeNs));
    assert.deepEqual(await verifyReferenceFile(snapshot),snapshot);
    assert.deepEqual(await readdir(root),['source.csv']);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('runtime admits a large reference without a second copy or bytes in the descriptor; same grant is idempotent',async()=>{
  const root=await mkdtemp(join(tmpdir(),'runtime-reference-'));
  try {
    const source=join(root,'source.csv');
    const file=await open(source,'w');await file.truncate(16*1024*1024+1);await file.close();
    const reference={grant:'a'.repeat(64),chat:'chat',userMessage:'msg_original',generation:1,name:'source.csv',snapshot:{...await inspectReferenceFile(source),sha256:null}};
    const store=await createArtifactStore({directory:join(root,'artifacts'),storageDirectories:{inputs:'/user',exports:'/user',packages:'/user'}});
    const artifact=await store.admitReference(reference,{directory:'/user',overwrite:'reject'});
    assert.deepEqual(await store.admitReference(reference,{directory:'/user',overwrite:'reject'}),artifact);
    assert.equal(artifact.bytes,16*1024*1024+1);
    assert.equal(Object.hasOwn(artifact,'snapshot'),false);
    assert.equal(Object.hasOwn(artifact,'data'),false);
    assert.deepEqual(await readdir(join(root,'artifacts')),[]);
    const lease=await store.stageUpload(artifact.artifact_id);
    assert.equal(lease.path,source);
    assert.deepEqual(await lease.verify(),artifact);
    await lease.release();
    await assert.rejects(()=>lease.verify(),/released/);
    // The old byte admission is still bounded; it cannot smuggle a reference.
    await assert.rejects(()=>admitStartupArtifacts(store,[reference]),/Invalid input artifact request/);
    await assert.rejects(()=>store.resolve(artifact.artifact_id),/LOGINOM_FILE_TOO_LARGE/);
    await writeFile(source,'changed');
    await assert.rejects(()=>store.stageUpload(artifact.artifact_id),/LOGINOM_FILE_CHANGED/);
    await assert.rejects(()=>store.admitReference(reference,{directory:'/user',overwrite:'reject'}),/LOGINOM_FILE_CHANGED/);
    assert.deepEqual(await store.releaseUploads(),[]);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('small byte admission upload/download retains byte verification and leaves the source intact',async()=>{
  const root=await mkdtemp(join(tmpdir(),'runtime-small-reference-'));
  try {
    const source=join(root,'input.csv'),bytes=Buffer.from('region;amount\nNorth;25\n');
    await writeFile(source,bytes);
    const store=await createArtifactStore({directory:join(root,'artifacts')});
    const artifact=await store.admit({sourcePath:source,name:'input.csv',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),upload:{directory:'/user',overwrite:'reject'}});
    assert.equal(artifact.sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual((await store.resolve(artifact.artifact_id)).buffer,bytes);
    const download=await store.stageDownload(artifact.artifact_id);
    await writeFile(download.path,bytes);
    assert.deepEqual(await download.verify('input.csv'),artifact);
    await download.release();
    await store.discardUnpublished([artifact.artifact_id]);
    assert.deepEqual(await readFile(source),bytes);
  } finally { await rm(root,{recursive:true,force:true}); }
});
