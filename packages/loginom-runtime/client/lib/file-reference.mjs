// Private backend/Host/runtime boundary. Never accept these descriptors from MCP.
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const fail = code => { throw Error(code); };
const milliseconds = ns => Number(ns/1000000000n)*1000+Number(ns%1000000000n)/1000000;
const identity = (canonical_path,s) => ({canonical_path,size:Number(s.size),mtime:milliseconds(s.mtimeNs),ctime:milliseconds(s.ctimeNs),
  mtime_ns:String(s.mtimeNs),ctime_ns:String(s.ctimeNs),file_id:`${s.dev}:${s.ino}`});
const same = (a,b) => ['canonical_path','size','mtime','ctime','mtime_ns','ctime_ns','file_id'].every(k=>a[k]===b[k]);
const checkAbort = signal => { if(signal?.aborted)fail('LOGINOM_UPLOAD_CANCELLED'); };
const mapError = (error,granted=false) => {
  if(['ENOENT','ENOTDIR','ELOOP'].includes(error.code))fail(granted?'LOGINOM_FILE_CHANGED':'LOGINOM_FILE_NOT_FOUND');
  if(['EACCES','EPERM'].includes(error.code))fail('LOGINOM_FILE_ACCESS_DENIED');
  throw error;
};

export function referenceUploadBudget(size) {
  if(!Number.isSafeInteger(size)||size<0)fail('LOGINOM_INPUT_INVALID');
  return Math.min(7200000,120000+Math.ceil(size/(5*1024*1024))*1000);
}

export async function inspectReferenceFile(path) {
  try {
    const canonical=await realpath(path),s=await lstat(canonical,{bigint:true});
    if(!s.isFile()||s.isSymbolicLink())fail('LOGINOM_FILE_NOT_REGULAR');
    if(s.size<0n||s.size>BigInt(Number.MAX_SAFE_INTEGER))fail('LOGINOM_FILE_TOO_LARGE');
    return identity(canonical,s);
  } catch(error) { mapError(error); }
}

function validateSnapshot(s) {
  if(!s||Object.keys(s).sort().join(',')!=='canonical_path,ctime,ctime_ns,file_id,mtime,mtime_ns,sha256,size'
    ||!isAbsolute(s.canonical_path??'')||!Number.isSafeInteger(s.size)||s.size<0
    ||!Number.isFinite(s.mtime)||!Number.isFinite(s.ctime)||typeof s.file_id!=='string'
    ||!/^\d+:\d+$/.test(s.file_id)||!/^-?\d+$/.test(s.mtime_ns??'')||!/^-?\d+$/.test(s.ctime_ns??'')
    ||s.sha256!==null&&!/^[a-f0-9]{64}$/.test(s.sha256??''))fail('LOGINOM_INPUT_INVALID');
}

// Hold a read handle through upload. Node's portable API cannot deny concurrent
// Windows writes: metadata checks detect changes; no write lock is claimed.
// SHA, when present, is a backend exact-scan receipt, never recomputed for upload.
export async function openReferenceFile(snapshot,{signal}={}) {
  validateSnapshot(snapshot);
  let file;
  const verify=async()=>{
    checkAbort(signal);
    try {
      const [s,pathStat,canonical]=await Promise.all([file.stat({bigint:true}),lstat(snapshot.canonical_path,{bigint:true}),realpath(snapshot.canonical_path)]);
      if(!s.isFile()||!pathStat.isFile()||pathStat.isSymbolicLink()||canonical!==snapshot.canonical_path
        ||!same(identity(canonical,s),snapshot)||!same(identity(canonical,pathStat),snapshot))fail('LOGINOM_FILE_CHANGED');
      checkAbort(signal);
      return snapshot;
    } catch(error) { mapError(error,true); }
  };
  try {
    checkAbort(signal);
    file=await open(snapshot.canonical_path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    await verify();
    return {verify,close:()=>file.close()};
  } catch(error) { await file?.close();mapError(error,true); }
}

export async function verifyReferenceFile(snapshot,options) {
  const file=await openReferenceFile(snapshot,options);
  try { return await file.verify(); } finally { await file.close(); }
}
