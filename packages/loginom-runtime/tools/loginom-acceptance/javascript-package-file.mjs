import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {nativeFilePins} from './collapse/native-gates/readonly-download.mjs';
import {requireJavascriptSavedPackagePath} from './javascript-package-binding.mjs';

const need=(ok,message)=>{if(!ok)throw Error(message);};

// Read the exact path already proved by the saved-package binding. FileStorage's
// listing omitted this saved folder in two headed runs, so it cannot prove ownership.
export async function nativeReadOwnedPackage(a) {
  const preparation=globalThis.__loginomDockPreparationV1;
  const form=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
  const map=form?.FMapTree,workspace=form?.Items?.Workspace;
  const card=workspace?.getActiveTab?.(),controller=card?.Controller?.FController;
  const owned=a.packageNode;
  const normalized=()=>{
    const raw=owned?.PackageFileName;
    return typeof raw==='string'&&raw?'/'+raw.replaceAll('\\','/').replace(/^\/+/, ''):null;
  };
  const owner=()=>{
    if(preparation?.id!==a.documentId||preparation.document!==document
      ||globalThis.__loginomDockPreparationV1!==preparation
      ||map?.FServerConnection?.UserName!=='jsteach'||map.FServerConnection.Connected!==true
      ||map.PackageNodes?.Count!==1||map.PackageNodes.Items(0)!==owned||normalized()!==a.path
      ||workspace.getActiveTab()!==card||controller?.constructor?.name!=='FileStorageForm'
      ||!controller.FFileStorage)throw Error('Saved package file owner changed');
  };
  owner();
  const check=(key,method)=>{if(typeof method!=='function'||method.toString()!==a.functions[key])throw Error('Unpinned native '+key);};
  check('constructor',bg.filestorage.FileDownloader);
  check('OpenFile',controller.FFileStorage.OpenFile);
  check('GetFileInfo',controller.FFileStorage.GetFileInfo);
  if(bg.TBGFileOpenMode.fomRead!==0)throw Error('Unpinned readonly mode');
  const name=a.path.split('/').at(-1),directory=a.path.slice(0,-name.length);
  const downloader=new bg.filestorage.FileDownloader(name,directory,controller.FFileStorage);
  const result={kind:'javascript_owned_package_download_v1',document_id:a.documentId,path:a.path,mode:0,calls:[]};
  try {
    for(const key of ['Dispose','CreateStream','GetFileSize','IsStreamReleased','ReleaseStreamObj','GetFileStream','GetNextBufferSize'])check(key,downloader[key]);
    for(const key of ['IsDisposed','FileName']){
      let object=downloader,descriptor;
      for(let depth=0;object&&depth<8&&!descriptor;depth++,object=Object.getPrototypeOf(object))descriptor=Object.getOwnPropertyDescriptor(object,key);
      check(key,descriptor?.get);
    }
    if(downloader.FullFilename!==a.path)throw Error('Native full filename differs');
    owner();result.calls.push('GetFileSize');
    const size=await downloader.GetFileSize();
    if(!Number.isSafeInteger(size)||size<0||size>262144)throw Error('Saved package file size outside bound');
    owner();result.bytes=size;result.calls.push('GetFileStream');
    const stream=await downloader.GetFileStream();
    if(downloader.FShareDenyNone)throw Error('Native shared-write fallback rejected');
    check('ReadBuffer',stream.ReadBuffer);
    const chunks=[];
    for(let offset=0;offset<size;){
      owner();const chunk=new Uint8Array(Math.min(16384,size-offset));
      await stream.ReadBuffer(chunk);result.calls.push({ReadBuffer:chunk.length});
      chunks.push(...chunk);offset+=chunk.length;
    }
    owner();result.base64=btoa(chunks.map(byte=>String.fromCharCode(byte)).join(''));
    result.function_sha256=a.sha256;
  } finally {
    await downloader.Dispose();result.calls.push('Dispose');
    result.stream_released=downloader.IsStreamReleased();result.disposed=downloader.IsDisposed;
  }
  if(!result.stream_released||!result.disposed)throw Error('Native stream cleanup unconfirmed');
  return result;
}

export async function readJavascriptPackageFile({page,documentId,path,packageHandle,directory}) {
  requireJavascriptSavedPackagePath(path);
  need(page&&typeof page.evaluate==='function','Owned browser page required');
  need(typeof documentId==='string'&&documentId.length>0&&documentId.length<=128,'Prepared document required');
  need(packageHandle,'Bound saved package handle required');
  need(typeof directory==='string'&&directory.startsWith('/'),'Private evidence directory required');
  const raw=await page.evaluate(nativeReadOwnedPackage,{documentId,path,packageNode:packageHandle,
    functions:nativeFilePins.functions,sha256:nativeFilePins.sha256});
  const bytes=Buffer.from(raw?.base64??'','base64');
  need(raw?.kind==='javascript_owned_package_download_v1'&&raw.document_id===documentId&&raw.path===path
    &&raw.mode===0&&raw.stream_released===true&&raw.disposed===true
    &&Number.isSafeInteger(raw.bytes)&&raw.bytes>=0&&raw.bytes<=262144
    &&bytes.length===raw.bytes&&bytes.toString('base64')===raw.base64,'Owned package bytes unconfirmed');
  await mkdir(directory,{recursive:true,mode:0o700});
  const output=join(directory,path.split('/').at(-1));
  await writeFile(output,bytes,{flag:'wx',mode:0o600});
  return {kind:'javascript_saved_package_bytes_v1',document_id:documentId,path,bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex'),local_file:output,
    native_function_sha256:raw.function_sha256,stream_released:true,disposed:true};
}

export async function openJavascriptPackageFileTab(page,{account,path,packageHandle}) {
  requireJavascriptSavedPackagePath(path);
  need(account==='jsteach'&&packageHandle,'Bound account/package required');
  await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnFilestorage"]').click();
  await page.waitForFunction(({account,path,owned})=>{
    const form=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
    const map=form?.FMapTree,controller=form?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
    const raw=owned?.PackageFileName;
    const normalized=typeof raw==='string'&&raw?'/'+raw.replaceAll('\\','/').replace(/^\/+/, ''):null;
    return map?.FServerConnection?.UserName===account&&map.FServerConnection.Connected===true
      &&map.PackageNodes?.Count===1&&map.PackageNodes.Items(0)===owned&&normalized===path
      &&controller?.constructor?.name==='FileStorageForm'&&!!controller.FFileStorage;
  },{account,path,owned:packageHandle},{timeout:30000});
  return {path,owner_verified:true,file_tab_open:true};
}
