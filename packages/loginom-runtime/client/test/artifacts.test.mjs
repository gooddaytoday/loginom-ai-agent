import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,symlink,rm,chmod,stat,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {createArtifactStore,admitStartupArtifacts} from '../lib/artifacts.mjs';

test('admission snapshots approved bytes and revalidates the staged artifact before upload',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dock-artifact-'));
  try {
    const input=join(directory,'source.csv'),payload=Buffer.from('a;b\n1;2\n');await writeFile(input,payload);
    const approved={sourcePath:input,name:'sales.csv',bytes:payload.length,sha256:createHash('sha256').update(payload).digest('hex')};
    const store=await createArtifactStore({directory:join(directory,'staged')});
    const artifact=await store.admit(approved);
    assert.ok(!JSON.stringify(store.list()).includes(input));
    await writeFile(input,'changed source');
    assert.deepEqual((await store.resolve(artifact.artifact_id)).buffer,payload);
    await writeFile(join(directory,'staged',artifact.artifact_id),'tampered');
    await assert.rejects(()=>store.resolve(artifact.artifact_id),/changed|match/);
    await assert.rejects(()=>store.resolve('../source.csv'),/not admitted/);
    const other=await createArtifactStore({directory:join(directory,'other')});
    await assert.rejects(()=>other.resolve(artifact.artifact_id),/not admitted/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('admission rejects symlinks, oversized files, wrong identity and path-like names',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dock-artifact-'));
  try {
    const input=join(directory,'source');await writeFile(input,'abc');
    const store=await createArtifactStore({directory:join(directory,'staged'),maxBytes:3});
    const approved={sourcePath:input,name:'data.csv',bytes:3,sha256:createHash('sha256').update('abc').digest('hex')};
    for(const change of [{bytes:4},{sha256:'0'.repeat(64)},{name:'../file'},{name:'bad\nname'},{name:'data.csv:stream'},{name:'CON.csv'}])
      await assert.rejects(()=>store.admit({...approved,...change}));
    const link=join(directory,'link');await symlink(input,link);
    await assert.rejects(()=>store.admit({...approved,sourcePath:link}),/regular file/);
    assert.deepEqual(store.list(),[]);
    assert.equal((await readFile(input)).toString(),'abc');
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('startup admission validates the whole batch before file access and exposes descriptors only',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dock-artifact-startup-'));
  try {
    const sourcePath=join(directory,'private-source.csv');await writeFile(sourcePath,'abc');
    const request={sourcePath,name:'Sales.csv',bytes:3,sha256:createHash('sha256').update('abc').digest('hex')};
    const store=await createArtifactStore({directory:join(directory,'staged')});
    for(const requests of [null,[request,{...request,name:'sales.csv'}],[request,{...request,name:'other',extra:true}],
      [{...request,sourcePath:'relative.csv'}],[{...request,bytes:16*1024*1024+1}],Array.from({length:9},(_,i)=>({...request,name:String(i)})),
      Array.from({length:5},(_,i)=>({...request,name:String(i),bytes:16*1024*1024}))]) {
      await assert.rejects(()=>admitStartupArtifacts(store,requests));assert.deepEqual(store.list(),[]);
    }
    const admitted=await admitStartupArtifacts(store,[request]);
    assert.deepEqual(admitted,store.list());
    assert.equal(JSON.stringify(admitted).includes(sourcePath),false);
    assert.deepEqual(Object.keys(admitted[0]).sort(),['artifact_id','bytes','name','sha256']);
    assert.equal((await store.resolve(admitted[0].artifact_id)).buffer.toString(),'abc');
    admitted[0].name='mutated';assert.equal(store.list()[0].name,'Sales.csv');
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('host startup upload grant binds artifact, exact Loginom destination and explicit overwrite policy',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dock-upload-grant-'));
  try {
    const sourcePath=join(directory,'private-source');await writeFile(sourcePath,'abc');
    const store=await createArtifactStore({directory:join(directory,'store')});
    const request={sourcePath,name:'Продажи.csv',bytes:3,sha256:createHash('sha256').update('abc').digest('hex')};
    const [descriptor]=await admitStartupArtifacts(store,[{...request,upload:{directory:'/test/данные',overwrite:'reject'}}]);
    assert.equal(descriptor.upload.destination,'/test/данные/Продажи.csv');
    assert.equal(descriptor.upload.overwrite,'reject');
    assert.notEqual(descriptor.upload.grant_id,descriptor.artifact_id);
    const grant=store.getUploadGrant(descriptor.artifact_id,descriptor.upload.grant_id);
    assert.deepEqual(grant,descriptor);
    grant.upload.directory='/other';grant.upload.overwrite='replace';
    const exposed=store.list();exposed[0].upload.destination='/other/file';
    assert.deepEqual(store.getUploadGrant(descriptor.artifact_id,descriptor.upload.grant_id),descriptor);
    assert.ok(!JSON.stringify(descriptor).includes(sourcePath));
    const ungranted=await store.admit(request);
    for(const [artifactId,grantId] of [[descriptor.artifact_id,'made-up'],[descriptor.artifact_id,undefined],
      [ungranted.artifact_id,descriptor.upload.grant_id],[descriptor.upload.grant_id,descriptor.artifact_id]])
      assert.throws(()=>store.getUploadGrant(artifactId,grantId),/not authorized/);
    const other=await createArtifactStore({directory:join(directory,'other')});
    assert.throws(()=>other.getUploadGrant(descriptor.artifact_id,descriptor.upload.grant_id),/not authorized/);
    const replace=await store.admit({...request,upload:{directory:'/analyst',overwrite:'replace'}});
    assert.equal(replace.upload.destination,'/analyst/Продажи.csv');
    assert.equal(replace.upload.overwrite,'replace');
    for(const method of ['stageUpload','stageDownload']) {
      const lease=await store[method](descriptor.artifact_id);
      assert.throws(()=>{lease.descriptor.upload.overwrite='replace';},TypeError);
      await lease.release();
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('malformed upload grants reject the entire startup batch before admission',async()=>{
  const request={sourcePath:'/not-read/source',name:'file.csv',bytes:3,sha256:'0'.repeat(64)};
  let admitted=0;const store={admit:async()=>{admitted++;}};
  const valid={directory:'/test',overwrite:'reject'};
  for(const upload of [null,undefined,[],{}, {directory:'/test'}, {...valid,overwrite:true},
    {...valid,overwrite:'skip'}, {...valid,extra:'field'}, {...valid,destination:'/test/other.csv'},
    ...['test','/','/test/','//test','/test//data','/test/../other','/test/./data','/ test','/test ',
      '/test\\other','/test\nother','/test\u007fother','/'+('x'.repeat(201)),
      '/'+Array(33).fill('a').join('/'),'/'+Array(20).fill('a'.repeat(100)).join('/')]
      .map(directory=>({...valid,directory}))]) {
    await assert.rejects(()=>admitStartupArtifacts(store,[request,{...request,name:'other.csv',upload}]));
    assert.equal(admitted,0);
  }
});

test('browser upload staging preserves basename and verified bytes until explicit release',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dock-upload-stage-'));
  try {
    const sourcePath=join(directory,'source');await writeFile(sourcePath,'abc');
    const store=await createArtifactStore({directory:join(directory,'store')});
    const descriptor=await store.admit({sourcePath,name:'Продажи.csv',bytes:3,sha256:createHash('sha256').update('abc').digest('hex')});
    const lease=await store.stageUpload(descriptor.artifact_id);
    assert.throws(()=>{lease.path=sourcePath;},TypeError);
    assert.throws(()=>{lease.descriptor.name='other.csv';},TypeError);
    assert.equal(basename(lease.path),'Продажи.csv');assert.deepEqual(await lease.verify(),descriptor);
    await writeFile(sourcePath,'new input');assert.equal((await readFile(lease.path)).toString(),'abc');
    if(process.platform!=='win32')assert.equal((await stat(lease.path)).mode&0o777,0o400);
    assert.equal(JSON.stringify(store.list()).includes(lease.path),false);
    // An unconfirmed browser call must leave its source available for recovery.
    await Promise.reject(new Error('transport timeout')).catch(()=>{});
    assert.equal((await readFile(lease.path)).toString(),'abc');
    await Promise.all([lease.release(),lease.release()]);
    await assert.rejects(()=>readFile(lease.path),/ENOENT/);
    await assert.rejects(()=>lease.verify(),/released/);
    assert.equal((await store.resolve(descriptor.artifact_id)).buffer.toString(),'abc');
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('upload staging detects tampering and shutdown drains in-progress staging',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dock-upload-close-'));
  try {
    const sourcePath=join(directory,'source');await writeFile(sourcePath,'abc');
    const store=await createArtifactStore({directory:join(directory,'store')});
    const descriptor=await store.admit({sourcePath,name:'data.csv',bytes:3,sha256:createHash('sha256').update('abc').digest('hex')});
    const lease=await store.stageUpload(descriptor.artifact_id);
    await chmod(lease.path,0o600);await writeFile(lease.path,'bad');
    await assert.rejects(()=>lease.verify(),/match/);await lease.release();
    const pending=Array.from({length:8},()=>store.stageUpload(descriptor.artifact_id));
    await assert.rejects(()=>store.stageUpload(descriptor.artifact_id),/Too many/);
    const shutdown=store.releaseUploads();
    const leases=await Promise.all(pending);assert.ok((await shutdown).every(r=>r.status==='fulfilled'));
    for(const item of leases)await assert.rejects(()=>readFile(item.path),/ENOENT/);
    await assert.rejects(()=>store.stageUpload(descriptor.artifact_id),/closed/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('download verification requires new bytes, exact filename, size and digest',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dock-download-'));
  try {
    const sourcePath=join(directory,'source');await writeFile(sourcePath,'abc');
    const store=await createArtifactStore({directory:join(directory,'store')});
    const descriptor=await store.admit({sourcePath,name:'Продажи.csv',bytes:3,sha256:createHash('sha256').update('abc').digest('hex')});
    const lease=await store.stageDownload(descriptor.artifact_id);
    assert.throws(()=>{lease.path=sourcePath;},TypeError);
    await assert.rejects(()=>lease.verify(descriptor.name),/ENOENT/);
    await writeFile(lease.path,'abc');
    for (const name of [undefined,'Продажи.zip','../Продажи.csv'])
      await assert.rejects(()=>lease.verify(name),/filename/);
    for (const bytes of ['ab','abcd','bad']) {
      await writeFile(lease.path,bytes);
      await assert.rejects(()=>lease.verify(descriptor.name),/changed|match/);
    }
    await writeFile(lease.path,'abc');
    const verified=await lease.verify(descriptor.name);
    assert.deepEqual(verified,descriptor);
    assert.ok(!JSON.stringify(verified).includes(lease.path));
    verified.sha256='0'.repeat(64);assert.deepEqual(await lease.verify(descriptor.name),descriptor);
    await lease.release();await assert.rejects(()=>lease.verify(descriptor.name),/released/);
    assert.equal((await store.resolve(descriptor.artifact_id)).buffer.toString(),'abc');
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('download cleanup drains missing and pending files and shares the upload limit',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dock-download-close-'));
  try {
    const sourcePath=join(directory,'source');await writeFile(sourcePath,'');
    const store=await createArtifactStore({directory:join(directory,'store')});
    const descriptor=await store.admit({sourcePath,name:'empty.csv',bytes:0,sha256:createHash('sha256').update('').digest('hex')});
    const empty=await store.stageDownload(descriptor.artifact_id);
    await assert.rejects(()=>empty.verify(descriptor.name),/ENOENT/);
    await writeFile(empty.path,'');assert.deepEqual(await empty.verify(descriptor.name),descriptor);
    await empty.release();
    const pending=Array.from({length:8},(_,i)=>i%2 ? store.stageDownload(descriptor.artifact_id) : store.stageUpload(descriptor.artifact_id));
    await assert.rejects(()=>store.stageDownload(descriptor.artifact_id),/Too many/);
    await assert.rejects(()=>store.stageUpload(descriptor.artifact_id),/Too many/);
    const shutdown=store.releaseUploads();const leases=await Promise.all(pending);
    assert.ok((await shutdown).every(r=>r.status==='fulfilled'));
    for(const lease of leases)await assert.rejects(()=>readFile(lease.path),/ENOENT/);
    await assert.rejects(()=>store.stageDownload(descriptor.artifact_id),/closed/);
    await assert.rejects(()=>store.stageUpload(descriptor.artifact_id),/closed/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('download rejects symlink bytes and transfer cleanup leaves the target untouched',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dock-download-link-'));
  try {
    const sourcePath=join(directory,'source');await writeFile(sourcePath,'abc');
    const store=await createArtifactStore({directory:join(directory,'store')});
    const descriptor=await store.admit({sourcePath,name:'data.csv',bytes:3,sha256:createHash('sha256').update('abc').digest('hex')});
    await chmod(sourcePath,0o400);
    for(const download of [false,true]) {
      const lease=await (download ? store.stageDownload(descriptor.artifact_id) : store.stageUpload(descriptor.artifact_id));
      if(!download) {await chmod(join(lease.path,'..'),0o700);await unlink(lease.path);}
      await symlink(sourcePath,lease.path);
      await assert.rejects(()=>lease.verify(descriptor.name),/regular file/);
      await lease.release();assert.equal((await readFile(sourcePath)).toString(),'abc');
      if(process.platform!=='win32')assert.equal((await stat(sourcePath)).mode&0o777,0o400);
    }
  } finally {await chmod(join(directory,'source'),0o600);await rm(directory,{recursive:true,force:true});}
});
