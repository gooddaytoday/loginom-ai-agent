// Host-only admission. Never expose sourcePath or this API as a model tool.
import {mkdir, mkdtemp, open, lstat, realpath, unlink, chmod, rmdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, isAbsolute} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {requireExportDestination,requireStorageDestination} from './storage-policy.mjs';
import {protectWindowsDirectory} from './platform.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const validName = name => typeof name==='string' && name.length>0 && name.length<=200
  && !/[\\/:<>"|?*\x00-\x1f\x7f]/.test(name) && !/[. ]$/.test(name)
  && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);

// Loginom virtual paths, not local filesystem paths or URLs. Match the explicit
// directory contract used by the acceptance harness; never infer a user root.
function validateUploadAuthorization(upload) {
  if (!upload || typeof upload!=='object' || Array.isArray(upload)
      || Object.keys(upload).sort().join(',')!=='directory,overwrite'
      || !['reject','replace'].includes(upload.overwrite)
      || typeof upload.directory!=='string' || !upload.directory.startsWith('/')
      || upload.directory.length>2000 || /[\\\x00-\x1f\x7f]/.test(upload.directory))
    throw new Error('Invalid artifact upload authorization');
  const parts=upload.directory.slice(1).split('/');
  if(parts.length>32 || parts.some(part=>!part || part.length>200 || part!==part.trim() || ['.','..'].includes(part)))
    throw new Error('Invalid Loginom upload directory');
  return {directory:upload.directory,overwrite:upload.overwrite};
}

// Explicit host startup arguments, never accepted from an MCP/model request.
// Validate the complete batch before copying any file. A failed copy aborts
// startup, so partially admitted batches are never exposed to an agent.
export async function admitStartupArtifacts(store, requests) {
  if (!Array.isArray(requests) || requests.length>8) throw new Error('Invalid input artifact batch');
  const names=new Set();let total=0;
  for (const request of requests) {
    if (!request || typeof request!=='object' || Array.isArray(request)
        || !['bytes,name,sha256,sourcePath','bytes,name,sha256,sourcePath,upload'].includes(Object.keys(request).sort().join(','))
        || typeof request.sourcePath!=='string' || !isAbsolute(request.sourcePath)
        || !validName(request.name) || !Number.isSafeInteger(request.bytes)
        || request.bytes<0 || request.bytes>16*1024*1024
        || typeof request.sha256!=='string' || !/^[a-f0-9]{64}$/.test(request.sha256)) throw new Error('Invalid input artifact request');
    if(Object.hasOwn(request,'upload'))validateUploadAuthorization(request.upload);
    const name=request.name.normalize('NFC').toLowerCase();
    if (names.has(name)) throw new Error('Input artifact names must be distinct');
    names.add(name);total+=request.bytes;
  }
  if (total>64*1024*1024) throw new Error('Input artifact batch exceeds its byte limit');
  const admitted=[];
  try { for (const request of requests) admitted.push(await store.admit(request)); }
  catch (error) {
    if (store.discardUnpublished) await store.discardUnpublished(admitted.map(item=>item.artifact_id));
    throw error;
  }
  return admitted;
}

async function readVerified(path, expected, maxBytes) {
  if (!Number.isSafeInteger(expected.bytes) || expected.bytes<0 || expected.bytes>maxBytes
      || !/^[a-f0-9]{64}$/.test(expected.sha256)) throw new Error('Invalid artifact identity');
  const info=await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Artifact must be a regular file');
  const file=await open(path,constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat=await file.stat();
    if (!stat.isFile() || stat.size!==expected.bytes || stat.ino!==info.ino || stat.dev!==info.dev) throw new Error('Artifact changed before reading');
    // Bounded even if another process grows the file after stat().
    const bytes=Buffer.alloc(expected.bytes+1);let offset=0;
    while(offset<bytes.length) {
      const result=await file.read(bytes,offset,bytes.length-offset,offset);
      if (!result.bytesRead) break;
      offset+=result.bytesRead;
    }
    const result=bytes.subarray(0,offset);
    if (offset!==expected.bytes || sha(result)!==expected.sha256) throw new Error('Artifact size or SHA does not match the admitted identity');
    return result;
  } finally {await file.close();}
}

export async function createArtifactStore({directory,maxBytes=16*1024*1024,sessionId=null,storageDirectories=null}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes<1 || maxBytes>64*1024*1024) throw new Error('Invalid artifact limit');
  await mkdir(directory,{recursive:true,mode:0o700});
  const info=await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Artifact directory must be a real directory');
  const root=await realpath(resolve(directory)),entries=new Map(),transfers=new Set(),outputs=new Map();
  const browserDirectory=async fallback=>{
    if(process.platform!=='win32'){await mkdir(fallback,{mode:0o700});return fallback;}
    // Chromium's Windows file plumbing still encounters MAX_PATH in native
    // upload/download handlers. Keep the user-visible basename but move only
    // the disposable browser-facing copy to a short, private temp directory.
    const path=await mkdtemp(join(tmpdir(),'la'));
    protectWindowsDirectory(path);
    return path;
  };
  const pendingStages=new Set();let closing=false;
  const stageTransfer=async (artifactId,download=false) => {
      const descriptor=entries.get(artifactId);
      if (!descriptor) throw new Error('Artifact was not admitted in this session');
      const buffer=download ? null : await readVerified(join(root,artifactId),descriptor,maxBytes);
      const directory=await browserDirectory(join(root,(download?'download-':'transfer-')+randomUUID())),path=join(directory,descriptor.name);
      const owner=await lstat(directory);
      let file;
      try {
        if (!download) {
        file=await open(path,'wx',0o600);
        await file.writeFile(buffer);await file.sync();await file.close();file=null;
        await chmod(path,0o400);await chmod(directory,0o500);
        }
      } catch(error) {
        await file?.close();await chmod(directory,0o700);
        await unlink(path).catch(()=>{});await rmdir(directory);throw error;
      }
      let released=false,releasing;
      const assertOwner=async()=>{
        if (released) throw new Error('Artifact transfer was released');
        const current=await lstat(directory);
        if (!current.isDirectory() || current.isSymbolicLink() || current.dev!==owner.dev || current.ino!==owner.ino)
          throw new Error('Artifact transfer directory was replaced');
      };
      const leaseDescriptor=structuredClone(descriptor);
      if(leaseDescriptor.upload)Object.freeze(leaseDescriptor.upload);
      const lease=Object.freeze({
        path,descriptor:Object.freeze(leaseDescriptor),
        async verify(suggestedName) {
          if (download && suggestedName!==descriptor.name) throw new Error('Downloaded filename does not match the admitted identity');
          await assertOwner();await readVerified(path,descriptor,maxBytes);return structuredClone(descriptor);
        },
        async release() {
          if (released) return;
          releasing ??= (async()=>{
            await assertOwner();await chmod(directory,0o700);
            // Unlink a replaced symlink itself; never chmod/follow its target.
            // Downloads may not have created their file yet when the browser closes.
            const target=await lstat(path).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
            if(target) {
              if(!target.isFile() && !target.isSymbolicLink()) throw new Error('Artifact transfer target is not a file');
              if(process.platform==='win32' && !target.isSymbolicLink()) await chmod(path,0o600);
              await unlink(path);
            }
            await rmdir(directory);
            released=true;transfers.delete(lease);
          })();
          return releasing;
        },
      });
      transfers.add(lease);
      return lease;
  };
  const startTransfer=async (artifactId,download) => {
    if (closing) throw new Error('Artifact staging is closed');
    if (transfers.size+pendingStages.size>=8) throw new Error('Too many unresolved artifact transfers');
    const pending=stageTransfer(artifactId,download);pendingStages.add(pending);
    pending.then(()=>pendingStages.delete(pending),()=>pendingStages.delete(pending));
    return pending;
  };
  const stageNativeOutput=async binding => {
      if(!sessionId||!binding||Object.keys(binding).sort().join(',')!=='destination,document_id,execution_id,node_id,session_id,workflow_id'
        ||binding.session_id!==sessionId||!['document_id','workflow_id','node_id','execution_id'].every(k=>typeof binding[k]==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(binding[k]))
        )throw Error('Invalid native output binding');
      requireExportDestination(binding.destination,storageDirectories);
      binding=structuredClone(binding);
      const artifactId=randomUUID(),name=binding.destination.split('/').at(-1),dir=await browserDirectory(join(root,'output-'+artifactId)),path=join(dir,name);
      const owner=await lstat(dir);let released=false,retained=false,descriptor=null;
      const check=async()=>{const current=await lstat(dir);if(released||!current.isDirectory()||current.isSymbolicLink()||current.ino!==owner.ino||current.dev!==owner.dev)throw Error('Output lease owner changed');};
      const lease={path,artifact_id:artifactId,name,binding:Object.freeze(binding),
        async verify(suggestedName,expectedBytes){
          await check();if(retained)throw Error('Output already retained');if(suggestedName!==name||!Number.isSafeInteger(expectedBytes)||expectedBytes<0||expectedBytes>maxBytes)throw Error('Output name or size differs');
          const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size!==expectedBytes)throw Error('Output is not the bounded downloaded file');
          const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
          let buffer;try{const stat=await file.stat();if(!stat.isFile()||stat.ino!==info.ino||stat.dev!==info.dev||stat.size!==expectedBytes)throw Error('Output changed before read');
            buffer=Buffer.alloc(expectedBytes+1);let offset=0;while(offset<buffer.length){const r=await file.read(buffer,offset,buffer.length-offset,offset);if(!r.bytesRead)break;offset+=r.bytesRead;}
            if(offset!==expectedBytes)throw Error('Output changed during read');buffer=buffer.subarray(0,offset);
          }finally{await file.close();}
          await check();const digest=sha(buffer);await readVerified(path,{bytes:expectedBytes,sha256:digest},maxBytes);
          descriptor={artifact_id:artifactId,name,bytes:expectedBytes,sha256:digest,...binding};
          return structuredClone(descriptor);
        },
        async retain(){await check();if(!descriptor)throw Error('Unverified output cannot be retained');await readVerified(path,descriptor,maxBytes);outputs.set(artifactId,{descriptor:structuredClone(descriptor),path,check});retained=true;transfers.delete(lease);return structuredClone(descriptor);},
        async release(){if(released)return;await check();const info=await lstat(path).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
          if(info){if(!info.isFile()&&!info.isSymbolicLink())throw Error('Output cleanup target changed');await unlink(path);}await rmdir(dir);outputs.delete(artifactId);released=true;transfers.delete(lease);},
      };transfers.add(lease);return Object.freeze(lease);
    };
  return {
    // Native output is not admitted as an input and carries no upload grant.
    // Only the owning node driver may allocate a lease after fresh execution.
    async stageOutput(binding) {
      if(closing||transfers.size+pendingStages.size>=8)throw Error('Output staging unavailable');
      const pending=stageNativeOutput(binding);pendingStages.add(pending);
      pending.then(()=>pendingStages.delete(pending),()=>pendingStages.delete(pending));
      return pending;
    },
    async resolveOutput(artifactId){const item=outputs.get(artifactId);if(!item)throw Error('Unknown session output');await item.check();return {descriptor:structuredClone(item.descriptor),buffer:await readVerified(item.path,item.descriptor,maxBytes)};},
    get outputSessionId(){return sessionId;},
    async admit({sourcePath,name,bytes,sha256,upload}) {
      if (!validName(name)) throw new Error('Invalid artifact display name');
      const authorization=upload===undefined ? null : validateUploadAuthorization(upload);
      if(authorization && storageDirectories)requireStorageDestination(authorization.directory,storageDirectories,'inputs',{directory:true});
      const payload=await readVerified(sourcePath,{bytes,sha256},maxBytes);
      const artifactId=randomUUID(),path=join(root,artifactId);
      const file=await open(path,'wx',0o600);
      try {await file.writeFile(payload);await file.sync();}
      catch(error) {await file.close();await unlink(path);throw error;}
      await file.close();
      const descriptor={artifact_id:artifactId,name,bytes,sha256,
        ...(authorization ? {upload:{grant_id:randomUUID(),...authorization,destination:authorization.directory+'/'+name}} : {})};
      entries.set(artifactId,descriptor);
      return structuredClone(descriptor);
    },
    list() {return [...entries.values()].map(value=>structuredClone(value));},
    async discardUnpublished(ids) {
      if (transfers.size || pendingStages.size) throw Error('Cannot discard artifacts during transfer');
      const paths=ids.filter(id=>entries.has(id)).map(id=>{entries.delete(id);return join(root,id);});
      for(const path of paths)await unlink(path);
    },
    // Trusted dispatcher resolves BOTH identifiers. A model cannot supply a
    // different directory, filename or overwrite policy through this lookup.
    // This is authorization only; it does not prove absence/ownership, perform
    // an upload, or make the reject policy enforceable by a browser adapter.
    getUploadGrant(artifactId,grantId) {
      const descriptor=entries.get(artifactId);
      if (!descriptor?.upload || typeof grantId!=='string' || descriptor.upload.grant_id!==grantId) {
        const error=new Error('Artifact upload was not authorized for this session and grant. Copy the exact artifact_id and upload.grant_id pair from input_artifacts; dock_action_describe can reread them without preparing a new workspace.');
        error.code='ARTIFACT_GRANT_NOT_FOUND';throw error;
      }
      return structuredClone(descriptor);
    },
    async resolve(artifactId) {
      const descriptor=entries.get(artifactId);
      if (!descriptor) throw new Error('Artifact was not admitted in this session');
      const buffer=await readVerified(join(root,artifactId),descriptor,maxBytes);
      // Private upload adapter gets the verified bytes, never a mutable source path.
      return {descriptor:structuredClone(descriptor),buffer};
    },
    // Private browser adapter only. Native setInputFiles accepts a path and
    // preserves its basename; no payload needs to be embedded in browser code.
    // A transport timeout does NOT release this lease. The adapter must confirm
    // completion (or close the browser) before releasing it.
    async stageUpload(artifactId) {
      return startTransfer(artifactId,false);
    },
    // Private download.saveAs destination. No file exists until the browser
    // writes it, so a missing download cannot validate against a local copy.
    // verify requires the browser event's suggested filename and compares the
    // downloaded bytes with the original admission identity. The caller must
    // separately bind that event to the exact Loginom file/destination/action.
    // This method alone makes no claim about remote origin or overwrite safety.
    async stageDownload(artifactId) {
      return startTransfer(artifactId,true);
    },
    // Call only after the browser transport has confirmed shutdown. Historical
    // name retained: drains upload AND download leases, including pending stages.
    async releaseUploads() {
      closing=true;
      await Promise.allSettled([...pendingStages]);
      return Promise.allSettled([...transfers].map(lease=>lease.release()));
    },
  };
}
