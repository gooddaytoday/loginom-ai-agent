import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {nativeFilePins} from './collapse/native-gates/readonly-download.mjs';
import {nativeReadOwnedPackage,readJavascriptPackageFile} from './javascript-package-file.mjs';

const path='/jsteach/js-g2-12345678-1234-1234-1234-123456789abc/JavaScript-12345678-1234-1234-1234-123456789abc.lgp';
const documentId='document-1';
const bytes=Buffer.from('PK\x03\x04a saved JavaScript package');
const raw={kind:'javascript_owned_package_download_v1',document_id:documentId,path,bytes:bytes.length,mode:0,
  stream_released:true,disposed:true,base64:bytes.toString('base64'),function_sha256:{OpenFile:'pinned'}};

test('private package-byte audit saves exact native bytes and digest once',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'js-package-byte-'));
  try {
    const page={evaluate:async(fn,args)=>{assert.equal(fn.name,'nativeReadOwnedPackage');assert.equal(args.documentId,documentId);
      assert.equal(args.path,path);assert.equal(typeof args.functions.OpenFile,'string');return raw;}};
    const result=await readJavascriptPackageFile({page,documentId,path,packageHandle:{},directory});
    assert.deepEqual(await readFile(result.local_file),bytes);
    assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));
    await assert.rejects(()=>readJavascriptPackageFile({page,documentId,path,packageHandle:{},directory}),{code:'EEXIST'});
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('wrong owner, incomplete stream and foreign path refuse before saving bytes',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'js-package-byte-'));
  try {
    for(const changed of [{document_id:'other'},{stream_released:false},{base64:'QQ=='},{bytes:262145}]){
      const page={evaluate:async()=>({...raw,...changed})};
      await assert.rejects(()=>readJavascriptPackageFile({page,documentId,path,packageHandle:{},directory}));
    }
    await assert.rejects(()=>readJavascriptPackageFile({page:{evaluate:async()=>{throw Error('called');}},
      documentId,path:path.replace('/jsteach/','/other/'),packageHandle:{},directory}));
    assert.deepEqual(await readdir(directory),[]);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('actual native reader binds saved package path and releases its read stream',async()=>{
  const packageNode={PackageFileName:path.slice(1).replaceAll('/','\\')};
  const map={FServerConnection:{UserName:'jsteach',Connected:true},PackageNodes:{Count:1,Items:()=>packageNode}};
  const storage={},controller={constructor:{name:'FileStorageForm'},FFileStorage:storage};
  const card={Controller:{FController:controller}},workspace={getActiveTab:()=>card};
  const preparation={id:documentId,document:{}};
  const calls=[];
  const pin=(name,fn)=>{fn.toString=()=>nativeFilePins.functions[name];return fn;};
  const fileDownloader=pin('constructor',function(name,directory,bound){
    assert.equal(bound,storage);this.FullFilename=directory+name;this.FShareDenyNone=false;
    this.offset=0;this.released=false;this.disposed=false;
  });
  fileDownloader.prototype.GetFileSize=pin('GetFileSize',async function(){calls.push('size');return bytes.length;});
  fileDownloader.prototype.GetFileStream=pin('GetFileStream',async function(){calls.push('stream');return {
    ReadBuffer:pin('ReadBuffer',async chunk=>{chunk.set(bytes.subarray(this.offset,this.offset+chunk.length));this.offset+=chunk.length;})};});
  fileDownloader.prototype.Dispose=pin('Dispose',async function(){calls.push('dispose');this.released=true;this.disposed=true;});
  fileDownloader.prototype.IsStreamReleased=pin('IsStreamReleased',function(){return this.released;});
  for(const key of ['CreateStream','ReleaseStreamObj','GetNextBufferSize'])fileDownloader.prototype[key]=pin(key,function(){});
  Object.defineProperty(fileDownloader.prototype,'IsDisposed',{get:pin('IsDisposed',function(){return this.disposed;})});
  Object.defineProperty(fileDownloader.prototype,'FileName',{get:pin('FileName',function(){return path.split('/').at(-1);})});
  storage.OpenFile=pin('OpenFile',function(){});storage.GetFileInfo=pin('GetFileInfo',function(){});
  const context={args:{documentId,path,packageNode,functions:nativeFilePins.functions,sha256:nativeFilePins.sha256},
    document:preparation.document,__loginomDockPreparationV1:preparation,btoa,
    bg:{app:{Application:{FInstance:{FMainForm:{FMapTree:map,Items:{Workspace:workspace}}}}},
      filestorage:{FileDownloader:fileDownloader},TBGFileOpenMode:{fomRead:0}}};
  const invoke=()=>vm.runInNewContext('('+nativeReadOwnedPackage.toString()+')(args)',context);
  const result=await invoke();
  assert.equal(Buffer.from(result.base64,'base64').toString('hex'),bytes.toString('hex'));
  assert.deepEqual(calls,['size','stream','dispose']);
  assert.equal(result.stream_released,true);assert.equal(result.disposed,true);
  packageNode.PackageFileName='foreign.lgp';calls.length=0;
  await assert.rejects(invoke(),/owner changed/);assert.deepEqual(calls,[]);
});
