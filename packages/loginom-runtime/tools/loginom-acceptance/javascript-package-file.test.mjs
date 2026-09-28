import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readJavascriptPackageFile} from './javascript-package-file.mjs';

const path='/jsteach/js-g2-12345678-1234-1234-1234-123456789abc/JavaScript-12345678-1234-1234-1234-123456789abc.lgp';
const documentId='document-1';
const bytes=Buffer.from('PK\x03\x04a saved JavaScript package');
const raw={kind:'collapse_native_download_v1',document_id:documentId,path,bytes:bytes.length,mode:0,
  stream_released:true,disposed:true,base64:bytes.toString('base64'),function_sha256:{OpenFile:'pinned'}};

test('private package-byte audit saves exact native bytes and digest once',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'js-package-byte-'));
  try {
    const page={evaluate:async(fn,args)=>{assert.equal(fn.name,'nativeRead');assert.equal(args.documentId,documentId);
      assert.equal(args.path,path);assert.equal(typeof args.functions.OpenFile,'string');return raw;}};
    const result=await readJavascriptPackageFile({page,documentId,path,directory});
    assert.deepEqual(await readFile(result.local_file),bytes);
    assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));
    await assert.rejects(()=>readJavascriptPackageFile({page,documentId,path,directory}),{code:'EEXIST'});
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('wrong owner, incomplete stream and foreign path refuse before saving bytes',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'js-package-byte-'));
  try {
    for(const changed of [{document_id:'other'},{stream_released:false},{base64:'QQ=='},{bytes:262145}]){
      const page={evaluate:async()=>({...raw,...changed})};
      await assert.rejects(()=>readJavascriptPackageFile({page,documentId,path,directory}));
    }
    await assert.rejects(()=>readJavascriptPackageFile({page:{evaluate:async()=>{throw Error('called');}},
      documentId,path:path.replace('/jsteach/','/other/'),directory}));
    assert.deepEqual(await readdir(directory),[]);
  } finally {await rm(directory,{recursive:true,force:true});}
});
