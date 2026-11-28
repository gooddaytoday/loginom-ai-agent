import {join} from 'node:path';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';

// Chromium appends a GUID and .crdownload. Keep this runtime-owned component
// short for Windows MAX_PATH without moving files outside the private session.
export function browserDownloadsPath(directory){return join(directory,'d');}

export const DOWNLOAD_LOCAL_STORAGE_UNAVAILABLE='DOWNLOAD_LOCAL_STORAGE_UNAVAILABLE';

export function downloadStorageFailure(error) {
  const reason=({
    EDQUOT:'The disk quota for the local download directory is exhausted.',
    ENOSPC:'There is no free space for the local download.',
    EACCES:'The local download directory is not writable.',
    EPERM:'The local download directory is not writable.',
    EROFS:'The local download directory is on a read-only filesystem.',
    ENOENT:'The local download directory is unavailable.',
    ENOTDIR:'The local download directory is unavailable.',
  })[error?.code];
  return typeof reason==='string'?{code:DOWNLOAD_LOCAL_STORAGE_UNAVAILABLE,message:reason}:null;
}

export async function checkDownloadStorage(directory) {
  let probe;
  try {
    probe=await mkdtemp(join(directory,'.write-'));
    await writeFile(join(probe,'probe'),'0',{mode:0o600,flag:'wx',flush:true});
    return null;
  } catch(error) {
    const failure=downloadStorageFailure(error);
    if(!failure)throw error;
    return failure;
  } finally {
    if(probe)await rm(probe,{recursive:true,force:true});
  }
}

// Loginom chooses its save mechanism while loading. File System Access writes
// bypass Playwright downloads and MCP's chooser interception rejects its picker.
// Hide only that capability before page scripts so Loginom uses native downloads.
export function browserDownloadScript(loginomUrl) {
  const origin = loginomUrl ? new URL(loginomUrl).origin : null;
  return `if (${origin === null ? 'true' : `globalThis.location.origin === ${JSON.stringify(origin)}`}) delete globalThis.showSaveFilePicker;`;
}
