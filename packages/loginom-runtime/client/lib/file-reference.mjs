// Private backend/Host/runtime boundary. Never accept these descriptors from MCP.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const blockBytes = 256 * 1024;
const fail = code => { throw Error(code); };
const identity = (canonical_path, s) => ({ canonical_path, size:s.size, mtime:s.mtimeMs, ctime:s.ctimeMs, file_id:`${s.dev}:${s.ino}` });
const same = (a,b) => ['canonical_path','size','mtime','ctime','file_id'].every(k=>a[k]===b[k]);
const checkAbort = signal => { if(signal?.aborted)fail('LOGINOM_UPLOAD_CANCELLED'); };
const mapError = error => {
  if(['ENOENT','ENOTDIR'].includes(error.code))fail('LOGINOM_FILE_NOT_FOUND');
  if(['EACCES','EPERM'].includes(error.code))fail('LOGINOM_FILE_ACCESS_DENIED');
  if(error.code==='ELOOP')fail('LOGINOM_FILE_CHANGED');
  throw error;
};

export function referenceUploadBudget(size) {
  if(!Number.isSafeInteger(size)||size<0)fail('LOGINOM_INPUT_INVALID');
  return Math.min(7200000,120000+Math.ceil(size/(5*1024*1024))*1000);
}

export async function inspectReferenceFile(path) {
  try {
    const canonical = await realpath(path), s = await lstat(canonical);
    if(!s.isFile()||s.isSymbolicLink())fail('LOGINOM_FILE_NOT_REGULAR');
    if(!Number.isSafeInteger(s.size)||s.size<0)fail('LOGINOM_FILE_TOO_LARGE');
    return identity(canonical,s);
  } catch(error) { mapError(error); }
}

function validateSnapshot(s) {
  if(!s||Object.keys(s).sort().join(',')!=='canonical_path,ctime,file_id,mtime,sha256,size'
    ||!isAbsolute(s.canonical_path??'')||!Number.isSafeInteger(s.size)||s.size<0
    ||!Number.isFinite(s.mtime)||!Number.isFinite(s.ctime)||typeof s.file_id!=='string'
    ||!/^\d+:\d+$/.test(s.file_id)||!/^[a-f0-9]{64}$/.test(s.sha256??''))fail('LOGINOM_INPUT_INVALID');
}

async function checkFile(file,path,expected,immutable=false) {
  const s = await file.stat();
  if(!s.isFile()||!same(identity(expected.canonical_path,s),expected)
    ||!same(await inspectReferenceFile(path),expected))fail('LOGINOM_FILE_CHANGED');
  if(immutable&&process.platform!=='win32'&&(s.mode&0o777)!==0o400)fail('LOGINOM_FILE_CHANGED');
}

// One reusable buffer, positional reads/writes and no size/offset bitwise math.
// Hashing the open handle also detects replacement of the path during a pass.
export async function verifyReferenceFile(snapshot,{signal,onProgress}={}) {
  validateSnapshot(snapshot);
  let file;
  try {
    checkAbort(signal);
    file = await open(snapshot.canonical_path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    await checkFile(file,snapshot.canonical_path,snapshot,true);
    const buffer=Buffer.alloc(blockBytes),digest=createHash('sha256');
    let offset=0;
    while(offset<snapshot.size) {
      checkAbort(signal);
      const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,snapshot.size-offset),offset);
      if(!bytesRead)fail('LOGINOM_FILE_CHANGED');
      digest.update(buffer.subarray(0,bytesRead));offset+=bytesRead;
      await onProgress?.(offset);
    }
    checkAbort(signal);
    await checkFile(file,snapshot.canonical_path,snapshot,true);
    if(digest.digest('hex')!==snapshot.sha256)fail('LOGINOM_FILE_CHANGED');
    return snapshot;
  } catch(error) { mapError(error); }
  finally { await file?.close(); }
}

// Called only after authorizeLoginomFile. The destination is a Host reservation,
// never a path selected by the model. Failed copies are unpublished and removed.
export async function stageReferenceFile(source,expected,slot,{sha256,signal,onProgress}={}) {
  let input,output,created=false,complete=false;
  try {
    checkAbort(signal);
    if(!same(await inspectReferenceFile(source),expected))fail('LOGINOM_FILE_CHANGED');
    input=await open(expected.canonical_path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    await checkFile(input,source,expected);
    output=await open(slot.path,'wx',0o600);created=true;
    const buffer=Buffer.alloc(blockBytes),digest=createHash('sha256');
    let offset=0;
    while(offset<expected.size) {
      checkAbort(signal);
      const {bytesRead}=await input.read(buffer,0,Math.min(buffer.length,expected.size-offset),offset);
      if(!bytesRead)fail('LOGINOM_FILE_CHANGED');
      digest.update(buffer.subarray(0,bytesRead));
      let written=0;
      while(written<bytesRead) {
        const result=await output.write(buffer,written,bytesRead-written,offset+written);
        if(!result.bytesWritten)fail('LOGINOM_FILE_CHANGED');
        written+=result.bytesWritten;
      }
      offset+=bytesRead;await onProgress?.(offset);
    }
    checkAbort(signal);
    await checkFile(input,source,expected);
    const hash=digest.digest('hex');
    if(sha256!==undefined&&hash!==sha256)fail('LOGINOM_FILE_CHANGED');
    await output.sync();await output.close();output=null;
    await chmod(slot.path,0o400);
    const snapshot={...await inspectReferenceFile(slot.path),sha256:hash};
    complete=true;
    return {grant:slot.grant,chat:slot.chat,userMessage:slot.userMessage,generation:slot.generation,name:slot.name,snapshot};
  } catch(error) { mapError(error); }
  finally {
    await input?.close();await output?.close();
    if(created&&!complete)await unlink(slot.path);
  }
}
