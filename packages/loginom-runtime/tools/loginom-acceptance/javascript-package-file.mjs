import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {nativeRead, nativeFilePins} from './collapse/native-gates/readonly-download.mjs';
import {requireJavascriptSavedPackagePath} from './javascript-package-binding.mjs';

const need=(ok,message)=>{if(!ok)throw Error(message);};

// Private read-only audit of one already saved package. The native reader pins
// Loginom's own FileDownloader methods and checks the active FileStorageForm.
export async function readJavascriptPackageFile({page,documentId,path,directory}) {
  requireJavascriptSavedPackagePath(path);
  need(page&&typeof page.evaluate==='function','Owned browser page required');
  need(typeof documentId==='string'&&documentId.length>0&&documentId.length<=128,'Prepared document required');
  need(typeof directory==='string'&&directory.startsWith('/'),'Private evidence directory required');
  const raw=await page.evaluate(nativeRead,{documentId,path,functions:nativeFilePins.functions,sha256:nativeFilePins.sha256});
  const bytes=Buffer.from(raw?.base64??'','base64');
  need(raw?.kind==='collapse_native_download_v1'&&raw.document_id===documentId&&raw.path===path
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

export async function openJavascriptPackageDirectory(page,path) {
  requireJavascriptSavedPackagePath(path);
  const expected=path.slice(0,path.lastIndexOf('/'));
  await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnFilestorage"]').click();
  const state=()=>page.evaluate(()=>{
    const form=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
    const controller=form?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
    if(form?.FMapTree?.FServerConnection?.UserName!=='jsteach'||controller?.constructor?.name!=='FileStorageForm'
      ||controller.FFileStore?.loading||!controller.FFileStore?.complete)return null;
    const rows=controller.FFileStore.data.items;
    if(!Array.isArray(rows)||rows.length>512)return null;
    return {directory:controller.FCurrentDirPath.replace(/\/$/,''),
      entries:rows.map(r=>({name:r.data.FileName,path:r.data.FilePath,type:r.data.Type,size:r.data.Size})),
      tids:[...document.querySelectorAll('[data-tid*=";FileStorageForm;colName_"]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true}))
        .map(e=>e.getAttribute('data-tid')).slice(0,512)};
  });
  await page.waitForFunction(()=>{
    const f=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
    const c=f?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
    return f?.FMapTree?.FServerConnection?.UserName==='jsteach'&&c?.constructor?.name==='FileStorageForm'
      &&c.FFileStore?.loading===false&&c.FFileStore?.complete===true;
  },undefined,{timeout:30000});
  let current=await state();
  for(let step=0;step<3&&current?.directory!==expected;step++){
    need(current&&expected.startsWith(current.directory+'/'),'Own package directory outside native storage');
    const folder=expected.slice(current.directory.length+1).split('/')[0];
    need(current.entries.filter(row=>row.name===folder&&row.type===1).length===1,'Own folder not observed');
    const tids=current.tids.filter(tid=>tid.endsWith(';FileStorageForm;colName_'+folder));
    need(tids.length===1,'Own folder control not unique');
    await page.locator('[data-tid="'+tids[0]+'"]').dblclick();
    const next=current.directory+'/'+folder;
    await page.waitForFunction(directory=>{
      const f=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
      const c=f?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
      return f?.FMapTree?.FServerConnection?.UserName==='jsteach'&&c?.constructor?.name==='FileStorageForm'
        &&c.FFileStore?.loading===false&&c.FFileStore?.complete===true&&c.FCurrentDirPath.replace(/\/$/,'')===directory;
    },next,{timeout:30000});
    current=await state();
  }
  need(current?.directory===expected,'Own package directory not reached');
  const files=current.entries.filter(row=>row.path===path&&row.type===0);
  need(files.length===1&&Number.isSafeInteger(files[0].size)&&files[0].size>=0&&files[0].size<=262144,
    'Own package file not uniquely observed within native bound');
  return {directory:expected,path,size:files[0].size};
}
