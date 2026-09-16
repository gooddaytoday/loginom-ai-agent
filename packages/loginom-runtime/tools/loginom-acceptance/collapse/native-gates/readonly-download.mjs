// Acceptance-only native file reader. No artifact admission or upload side effects.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const pins = JSON.parse(await fs.readFile(new URL('./native-functions.json', import.meta.url)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [key, value] of Object.entries(pins.functions)) {
  if (sha(value) !== pins.sha256[key]) throw Error('Native function manifest changed: '+key);
}

async function nativeRead(a) {
  const preparation = globalThis.__loginomDockPreparationV1;
  const workspace = bg.app.Application.FInstance.FMainForm.Items.Workspace;
  const card = workspace.getActiveTab(), controller = card.Controller.FController;
  if (preparation?.id !== a.documentId || controller.constructor.name !== 'FileStorageForm' ||
      controller.FFileStore.loading || !controller.FFileStore.complete) throw Error('Readonly owner not ready');
  const match = controller.FFileStore.data.items.filter(r => r.data.FilePath === a.path);
  if (match.length !== 1) throw Error('Unique native file required');
  const record = match[0], size = record.data.Size;
  if (record.data.Type !== 0 || record.data.IsVirtual || !Number.isInteger(size) || size < 0 || size > 262144 ||
      controller.FCurrentDirPath + record.data.FileName !== a.path) throw Error('Readonly file bounds');
  const check = (key, method) => { if (typeof method !== 'function' || method.toString() !== a.functions[key]) throw Error('Unpinned native '+key); };
  check('constructor', bg.filestorage.FileDownloader);
  check('OpenFile', controller.FFileStorage.OpenFile);
  check('GetFileInfo', controller.FFileStorage.GetFileInfo);
  if (bg.TBGFileOpenMode.fomRead !== 0) throw Error('Unpinned readonly mode');
  const downloader = new bg.filestorage.FileDownloader(record.data.FileName, controller.FCurrentDirPath, controller.FFileStorage);
  const result = {kind:'collapse_native_download_v1', document_id:a.documentId, path:a.path, bytes:size, mode:0, calls:[]};
  const owner = () => {
    if (globalThis.__loginomDockPreparationV1 !== preparation || preparation.id !== a.documentId ||
        workspace.getActiveTab() !== card || controller.FFileStore.loading ||
        !controller.FFileStore.data.items.includes(record) || record.data.Size !== size || record.data.FilePath !== a.path)
      throw Error('Native read owner changed');
  };
  try {
    for (const key of ['Dispose','CreateStream','GetFileSize','IsStreamReleased','ReleaseStreamObj','GetFileStream','GetNextBufferSize']) check(key, downloader[key]);
    for (const key of ['IsDisposed','FileName']) {
      let object=downloader, descriptor;
      for(let depth=0;object&&depth<8&&!descriptor;depth++,object=Object.getPrototypeOf(object)) descriptor=Object.getOwnPropertyDescriptor(object,key);
      check(key,descriptor?.get);
    }
    if (downloader.FullFilename !== a.path) throw Error('Native full filename differs');
    owner(); result.calls.push('GetFileStream');
    const stream = await downloader.GetFileStream();
    if (downloader.FShareDenyNone) throw Error('Native shared-write fallback rejected');
    check('ReadBuffer', stream.ReadBuffer);
    result.calls.push('GetFileSize');
    if (await downloader.GetFileSize() !== size) throw Error('Native size changed');
    const chunks = []; let count = 0;
    while (count < size) {
      owner();
      const chunk = new Uint8Array(Math.min(16384, size-count));
      await stream.ReadBuffer(chunk);
      result.calls.push({ReadBuffer:chunk.length}); chunks.push(...chunk); count += chunk.length;
    }
    owner(); result.base64 = btoa(chunks.map(x=>String.fromCharCode(x)).join(''));
    result.function_sha256 = a.sha256;
  } finally {
    await downloader.Dispose();
    result.calls.push('Dispose');
    result.stream_released = downloader.IsStreamReleased(); result.disposed = downloader.IsDisposed;
  }
  if (!result.stream_released || !result.disposed) throw Error('Native stream cleanup unconfirmed');
  return result;
}

export async function downloadReadonly({execute, documentId, path, directory, expectedSha256}) {
  if (!/^\/test-1\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.(csv|lgp)$/.test(path) || path.includes('..')) throw Error('Explicit owned file required');
  const args = {documentId,path,functions:pins.functions,sha256:pins.sha256};
  const raw = await execute(`async page=>page.evaluate(${nativeRead.toString()},${JSON.stringify(args)})`);
  const bytes = Buffer.from(raw.base64, 'base64');
  if (raw.path !== path || raw.document_id !== documentId || raw.mode !== 0 || bytes.length !== raw.bytes ||
      !raw.stream_released || !raw.disposed || bytes.toString('base64') !== raw.base64) throw Error('Invalid native download');
  const digest = sha(bytes);
  if (expectedSha256 && digest !== expectedSha256) throw Error('Downloaded bytes differ');
  await fs.mkdir(directory,{recursive:true});
  const local = directory+'/'+path.split('/').at(-1);
  await fs.writeFile(local,bytes,{flag:'wx'});
  return {...raw,sha256:digest,local_file:local};
}

export async function openReadonlyDirectory(execute, directory) {
  if (!/^\/test-1\/[A-Za-z0-9_-]+$/.test(directory)) throw Error('Explicit test directory required');
  return execute(String.raw`async page=>{
    const directory=${JSON.stringify(directory)};
    await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnFilestorage"]').click();
    const state=async()=>page.evaluate(()=>{
      const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
      if(c.constructor.name!=='FileStorageForm'||c.FFileStore.loading||!c.FFileStore.complete)return null;
      return {directory:c.FCurrentDirPath,files:c.FFileStore.data.items.map(r=>({name:r.data.FileName,path:r.data.FilePath,type:r.data.Type})),
       tids:[...document.querySelectorAll('[data-tid]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})&&e.dataset.tid.includes(';FileStorageForm;colName_')).map(e=>e.dataset.tid)};
    });
    await page.waitForFunction(()=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;return c?.constructor.name==='FileStorageForm'&&!c.FFileStore.loading&&c.FFileStore.complete});
    let s=await state();
    for(let step=0;step<3&&s.directory.replace(/\/$/,'')!==directory;step++){
      const current=s.directory.replace(/\/$/,'');
      if(!directory.startsWith(current+'/'))throw Error('Native files outside direct path');
      const name=directory.slice(current.length+1).split('/')[0];
      const rows=s.files.filter(r=>r.name===name&&r.type===1);
      const tids=s.tids.filter(t=>t.endsWith(';FileStorageForm;colName_'+name));
      if(rows.length!==1||tids.length!==1)throw Error('Observed folder required '+JSON.stringify({current,name,records:s.files.slice(0,12),tids:s.tids.slice(0,12)}));
      await page.locator('[data-tid="'+tids[0]+'"]').dblclick();
      await page.waitForFunction(expected=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;return !c.FFileStore.loading&&c.FFileStore.complete&&c.FCurrentDirPath.replace(/\/$/,'')===expected&&c.FFileStore.data.items.length>0&&c.FFileStore.data.items.every(r=>(r.data.Type===2&&r.data.FileName==='..'&&r.data.FilePath===expected.slice(0,expected.lastIndexOf('/')+1))||(r.data.FilePath.startsWith(expected+'/')&&r.data.FilePath!==expected+'/'))},current+'/'+name,{timeout:10000}).catch(async()=>{throw Error('Directory did not settle '+JSON.stringify(await state()));});
      s=await state();
    }
    if(s.directory.replace(/\/$/,'')!==directory)throw Error('Native destination mismatch');
    return s;
  }`);
}
