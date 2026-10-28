// Host-selected Loginom directories. These are server paths, never OS homes
// or paths inferred from the authenticated account's name.
import {guardLoginomConnection} from './connection-recovery.mjs';
import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,lstat,chmod,rm} from 'node:fs/promises';
import {join,basename} from 'node:path';
const purposes = ['packages', 'inputs', 'exports'];

export function storagePath(value) {
  if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/')
      || /[\\%?#\x00-\x1f\x7f]/.test(value)
      || value.slice(1).split('/').some(part => !part || part === '.' || part === '..' || part !== part.trim())) {
    throw Error('An exact absolute Loginom storage path is required');
  }
  return value;
}

export function storageDirectories(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== purposes.length
      || purposes.some(key => !Object.hasOwn(value, key))) throw Error('Explicit Loginom storage directories are required');
  return Object.freeze(Object.fromEntries(purposes.map(key => [key, storagePath(value[key])])));
}

export function requireStorageDestination(path, directories, purpose, { directory = false } = {}) {
  path = storagePath(path);
  const root = storageDirectories(directories)[purpose];
  if (!root || !(directory && path === root) && !path.startsWith(root + '/')) {
    throw Error('Destination is outside the selected Loginom directory');
  }
  if (!directory && purpose === 'packages' && !/\.lgp$/i.test(path)) throw Error('A Loginom package filename is required');
  if (!directory && purpose === 'exports' && !/\.(csv|tsv)$/i.test(path)) throw Error('A CSV or TSV filename is required');
  return path;
}

export function storageTidSuffix(name) {
  if (typeof name !== 'string' || !name || /[\/\\\x00-\x1f\x7f]/.test(name)) throw Error('Invalid Loginom entry name');
  // The matching visible label and object kind must also be checked: the
  // native TID conversion is not injective (spaces/underscores and commas).
  return name.replace(/\s/g, '_').replaceAll(',', '');
}

export function createStorageBinding({ sessionId, origin, build, documentId, account, directories }) {
  if (!['http:', 'https:'].includes(new URL(origin).protocol)) throw Error('Observed Loginom origin is required');
  if (![sessionId, documentId, account].every(v => typeof v === 'string' && v.trim() && v.length <= 200)
      || build !== '7.4.2' || new URL(origin).origin !== origin) throw Error('Observed Loginom identity is required');
  return Object.freeze({ version: 1, session_id: sessionId, origin, loginom_build: build,
    document_id: documentId, loginom_account: account, directories: storageDirectories(directories) });
}

// Every browser operation retains the account/document observed by prepare.
// This is an identity guard; destination existence is checked by native UI.
export function withStorageIdentity(code, binding) {
  if (!binding) throw Error('Prepare Loginom before using the selected directories');
  return `async page=>{
    const expected=${JSON.stringify(binding)};
    await (${guardLoginomConnection.toString()})(page,expected);
    return (${code})(page);
  }`;
}

export function requireExportDestination(value, directories = null) {
  if (directories) return requireStorageDestination(value, directories, 'exports');
  // Unchanged scope for legacy acceptance profiles and catalog revisions.
  if (typeof value !== 'string' || !/^\/test-2\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9][A-Za-z0-9_.-]*\.(csv|tsv)$/.test(value)
      || value.length > 512 || value.includes('..')) throw Error('Export requires an explicitly assigned CSV/TSV in /test-2');
  return value;
}

// References are minted only from native, row-bound FileStore observations in
// this prepared session. A model-supplied path/size/time is never a receipt.
export function createServerSourceRegistry({getBinding}) {
  const sources=new Map();
  const entries=outcome=>outcome?.status==='SUCCEEDED'&&outcome.output?.file_storage?.status==='observed'
    ?(outcome.output.ui?.elements??[]).map(e=>e.storage_entry).filter(e=>e?.kind==='file'
      &&e.bytes_source==='native_file_store'&&Number.isSafeInteger(e.bytes)&&e.bytes>=0
      &&typeof e.mtime==='string'&&e.mtime.length>0&&e.mtime.length<=128&&typeof e.path==='string'
      &&e.path.slice(0,e.path.lastIndexOf('/'))===outcome.output.file_storage.directory):[];
  const identity=entry=>({path:entry.path,bytes:entry.bytes,mtime:entry.mtime});
  return {
    retain(outcome) {
      const binding=getBinding();if(!binding)return;
      for(const entry of entries(outcome)) {
        try{requireStorageDestination(entry.path,binding.directories,'inputs');}catch{continue;}
        const ref='storage-'+randomUUID();
        sources.set(ref,{binding:structuredClone(binding),...identity(entry)});
        if(sources.size>10000)sources.delete(sources.keys().next().value);
        entry.server_source_ref=ref;
      }
    },
    peek(ref) {
      const source=sources.get(ref);
      if(!source)throw Error('Verified storage source reference is missing');
      return structuredClone(source);
    },
    async inspect(ref,observe) {
      const source=this.peek(ref),name=source.path.slice(source.path.lastIndexOf('/')+1);
      const roots=await observe({discover_roots:true,storage_name:name});
      const tid=roots.output?.workflow_ref?.prefix+';FileStorageForm;colName_'+storageTidSuffix(name);
      const matches=roots.output?.ui?.elements?.filter(e=>e.tid===tid)??[];
      if(roots.status!=='SUCCEEDED'||matches.length!==1||typeof matches[0].ref!=='string')
        throw Error('LOGINOM_FILE_CHANGED: storage file row is missing or ambiguous; observe the file again');
      // Roots carry only navigation refs. Read the exact row to obtain its
      // native FileStore binding; a root discovery is never source evidence.
      return this.resolve(ref,await observe({root_ref:matches[0].ref}));
    },
    resolve(ref,outcome) {
      const source=this.peek(ref),binding=getBinding();
      if(JSON.stringify(source.binding)!==JSON.stringify(binding))throw Error('LOGINOM_FILE_CHANGED: storage source account or session changed');
      const matches=entries(outcome).filter(entry=>entry.path===source.path);
      if(matches.length!==1||JSON.stringify(identity(matches[0]))!==JSON.stringify(identity(source)))
        throw Error('LOGINOM_FILE_CHANGED: native storage size/mtime or path changed; observe the file again');
      return {verified:true,kind:'storage',server_source_ref:ref,destination:source.path,bytes:source.bytes,mtime:source.mtime,
        origin:binding.origin,account:binding.loginom_account,document_id:binding.document_id,coverage:'preview'};
    },
  };
}

const sourceId={type:'string',minLength:1,maxLength:128,pattern:'^[A-Za-z0-9_.:-]+$'};
export const importSourceSchema={oneOf:[
  {type:'object',properties:{kind:{const:'storage'},server_source_ref:sourceId},required:['kind','server_source_ref'],additionalProperties:false},
  {type:'object',properties:{kind:{const:'verified_delivery'},artifact_id:sourceId,upload_operation_id:sourceId,
    bytes:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}},
    required:['artifact_id','upload_operation_id'],additionalProperties:false},
]};
export function validateImportSource(source) {
  const id=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value);
  const valid=source&&typeof source==='object'&&!Array.isArray(source)&&(source.kind==='storage'
    ?Object.keys(source).sort().join(',')==='kind,server_source_ref'&&id(source.server_source_ref)
    :(source.kind===undefined||source.kind==='verified_delivery')
      &&Object.keys(source).every(k=>['kind','artifact_id','upload_operation_id','bytes','sha256'].includes(k))
      &&id(source.artifact_id)&&id(source.upload_operation_id)
      &&(source.bytes===undefined||Number.isSafeInteger(source.bytes)&&source.bytes>=0)
      &&(source.sha256===undefined||typeof source.sha256==='string'&&/^[a-f0-9]{64}$/.test(source.sha256)));
  if(!valid)throw Error('Verified source identity required: storage reference or verified delivery IDs');
}

export function serverDownloadBudget(bytes) {
  if(!Number.isSafeInteger(bytes)||bytes<0)throw Error('Native server size is required');
  return Math.min(7200000,120000+Math.ceil(bytes/(5*1024*1024)*1000));
}

// The browser writes to disk; this registry transports only paths and metadata.
// Cache identity is private authority for the backend exact-scan receipt.
export function createServerDownloadRegistry({directory,inspect,download,recover,now=Date.now}) {
  const jobs=new Map();
  const native=s=>JSON.stringify([s.destination,s.bytes,s.mtime,s.origin,s.account,s.document_id]);
  const local=s=>({size:s.size,mtime:s.mtimeMs,ctime:s.ctimeMs,file_id:`${s.dev}:${s.ino}`});
  const find=id=>{const job=jobs.get(id);if(!job)throw Error('Unknown server download operation');return job;};
  const snapshot=job=>({result_version:'user-v1',operation_id:job.request.operation_id,state:job.state,
    ...(job.status?{status:job.status}:{}),action_key:'storage.download',phase:job.phase,
    cancel_requested:job.controller.signal.aborted,cleanup_complete:job.state==='settled'&&job.cleanup!==false,
    effect_possible:false,progress:{bytes:job.bytes??0,total_bytes:job.source?.bytes??null,
      elapsed_ms:Math.max(0,now()-job.started),deadline_at:job.deadline??null,
      byte_progress:'completed_copy_only'},output:job.output??{},error:job.error??null});
  const remove=async job=>{if(job.directory)await rm(job.directory,{recursive:true,force:true});};
  return {
    get busy(){return [...jobs.values()].some(j=>j.state==='running');},
    get unsettled(){return [...jobs.values()].some(j=>j.state==='running'||j.cleanup===false);},
    start(request) {
      if(!request||Object.keys(request).some(k=>!['operation_id','server_source_ref'].includes(k))
        ||![request.operation_id,request.server_source_ref].every(v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v)))
        throw Error('Server download requires operation_id and server_source_ref only');
      const old=jobs.get(request.operation_id);
      if(old){if(old.request.server_source_ref!==request.server_source_ref)throw Error('Download ID has different parameters');return snapshot(old);}
      if(this.unsettled)throw Error('Another server download is running or its cleanup is unconfirmed');
      if(jobs.size>=128)throw Error('Server download capacity reached');
      const job={request:structuredClone(request),state:'running',phase:'validating',controller:new AbortController(),started:now()};
      jobs.set(request.operation_id,job);
      job.completion=(async()=>{
        let timer;
        try {
          job.source=await inspect(request.server_source_ref);job.controller.signal.throwIfAborted();
          job.deadline=now()+serverDownloadBudget(job.source.bytes);
          timer=setTimeout(()=>job.controller.abort(Error('LOGINOM_DOWNLOAD_DEADLINE')),Math.max(1,job.deadline-now()));
          if(!/\.(csv|tsv|txt|xlsx)$/i.test(job.source.destination))throw Error('LOGINOM_DOWNLOAD_FORMAT_UNSUPPORTED');
          await mkdir(directory,{recursive:true,mode:0o700});
          const root=await lstat(directory);
          if(root.isSymbolicLink()||!root.isDirectory()||(root.mode&0o077)!==0)throw Error('LOGINOM_DOWNLOAD_CACHE_NOT_PRIVATE');
          job.directory=await mkdtemp(join(directory,'source-'));await chmod(job.directory,0o700);
          job.path=join(job.directory,basename(job.source.destination));job.phase='downloading';
          await download({source:structuredClone(job.source),path:job.path,operation_id:request.operation_id,
            signal:job.controller.signal,deadline:job.deadline});
          job.controller.signal.throwIfAborted();job.phase='verifying';
          const after=await inspect(request.server_source_ref),copy=await lstat(job.path);
          if(native(after)!==native(job.source)||!copy.isFile()||copy.isSymbolicLink()||copy.size!==job.source.bytes)
            throw Error('LOGINOM_FILE_CHANGED');
          await chmod(job.path,0o600);job.identity=local(await lstat(job.path));
          job.controller.signal.throwIfAborted();
          if(now()>=job.deadline)throw Error('LOGINOM_DOWNLOAD_DEADLINE');
          job.bytes=copy.size;job.status='SUCCEEDED';job.phase='cached';
          job.output={path:job.path,server_source_ref:request.server_source_ref,bytes:copy.size,
            native_size:after.bytes,native_mtime:after.mtime,coverage:'downloaded_copy',
            next_step:'loginom_file_profile on path, then loginom_file_scan and loginom_file_sample. Upload only the sample; switch back to the original storage ref.'};
        }catch(error){
          job.status='FAILED';job.phase='failed';
          job.error={code:job.controller.signal.aborted?(job.controller.signal.reason?.message==='LOGINOM_DOWNLOAD_DEADLINE'
            ?'LOGINOM_DOWNLOAD_DEADLINE':'LOGINOM_DOWNLOAD_CANCELLED'):/^LOGINOM_[A-Z_]+$/.test(error.message)?error.message:'LOGINOM_DOWNLOAD_FAILED',
            message:'Server cache is invalid; no full calculation is authorized. Observe the original file and start a new operation.'};
          if(error.cleanupUnconfirmed)job.browserUnsettled=true;
          try{if(job.browserUnsettled)throw Error('Browser transfer is unsettled');await remove(job);}
          catch{job.cleanup=false;job.error={code:'LOGINOM_DOWNLOAD_CLEANUP_FAILED',message:'Partial cache cleanup failed or browser transfer is unsettled'};}
        }finally{clearTimeout(timer);job.state='settled';}
      })();
      return snapshot(job);
    },
    status:id=>snapshot(find(id)),
    async wait(id,{timeoutMs=1000,signal}={}) {
      if(!Number.isInteger(timeoutMs)||timeoutMs<0||timeoutMs>60000)throw Error('Download wait must be 0..60000 ms');
      signal?.throwIfAborted();const job=find(id);let timer,abort;
      try{await Promise.race([job.completion,new Promise((resolve,reject)=>{
        timer=setTimeout(resolve,timeoutMs);
        if(signal){abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});}
      })]);return snapshot(job);}
      finally{clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort);}
    },
    cancel(id){const job=find(id);if(job.state==='running')job.controller.abort(Error('LOGINOM_DOWNLOAD_CANCELLED'));return snapshot(job);},
    async bind(source,receipt) {
      if(!receipt||receipt.basis!=='backend_exact_scan'||receipt.bytes!==source.bytes
        ||!/^[a-f0-9]{64}$/.test(receipt.sha256??''))return source;
      for(const job of jobs.values()) {
        if(job.status!=='SUCCEEDED'||job.phase!=='cached'||native(job.source)!==native(source)
          ||receipt.identity?.canonical_path!==job.path||JSON.stringify(localIdentity(receipt.identity))!==JSON.stringify(job.identity))continue;
        const copy=await lstat(job.path).catch(()=>null);
        if(!copy||copy.isSymbolicLink()||!copy.isFile()||JSON.stringify(local(copy))!==JSON.stringify(job.identity))return source;
        return {...source,sha256:receipt.sha256,cache_binding:{server_source_ref:source.server_source_ref,
          download_source_ref:job.source.server_source_ref,native_size:source.bytes,native_mtime:source.mtime,copy_bytes:copy.size,identity:receipt.identity}};
      }
      return source;
    },
    async cleanup(id) {
      const selected=id?[find(id)]:[...jobs.values()];
      for(const job of selected)if(job.state==='running')job.controller.abort(Error('LOGINOM_DOWNLOAD_CANCELLED'));
      await Promise.all(selected.map(j=>j.completion));
      for(const job of selected){
        if(job.browserUnsettled){if(!recover)throw Error('Original browser download cleanup is unconfirmed');await recover(job.request.operation_id);job.browserUnsettled=false;}
        await remove(job);job.phase='removed';job.output={cache_removed:true};job.cleanup=true;
      }
      return {result_version:'user-v1',operation_id:id??'storage-cache-cleanup',status:'SUCCEEDED',cleanup_complete:true,output:{cache_removed:true}};
    },
  };
}

function localIdentity(identity) {
  return {size:identity?.size,mtime:identity?.mtime,ctime:identity?.ctime,file_id:identity?.file_id};
}

const downloadId={type:'string',minLength:1,maxLength:128,pattern:'^[A-Za-z0-9_.:-]+$'};
export const serverDownloadTools=[
  {name:'dock_storage_source',description:'Locate an existing CSV/TSV/TXT/XLSX by its exact path in the assigned inputs directory. Navigates the native Files UI and returns an opaque server_source_ref with native size/mtime. Does not upload or import. Use this before preview/download when the CLI starts on the workflow graph.',
    properties:{operation_id:downloadId,path:{type:'string',minLength:1,maxLength:1024}},required:['operation_id','path']},
  {name:'dock_storage_download_start',description:'Download an observed server_source_ref once to a private local cache through the authenticated browser. First call dock_storage_source to open its exact Files directory (also after a preview returned to the graph). Asynchronous: status/wait/cancel use the SAME operation_id. Native size/mtime and copy size are checked before authorizing local profiling. Never uploads the full file. Byte progress is unknown until the browser finishes its disk copy.',
    properties:{operation_id:downloadId,server_source_ref:downloadId},required:['operation_id','server_source_ref']},
  {name:'dock_storage_download_status',description:'Read the original server download progress and terminal cache path.',properties:{operation_id:downloadId},required:['operation_id']},
  {name:'dock_storage_download_wait',description:'Wait at most 60 seconds for the original download; a wait timeout does not cancel it.',properties:{operation_id:downloadId,timeout_ms:{type:'integer',minimum:0,maximum:60000}},required:['operation_id']},
  {name:'dock_storage_download_cancel',description:'Cancel the original download. Wait for cleanup_complete before another browser action.',properties:{operation_id:downloadId},required:['operation_id']},
  {name:'dock_storage_download_cleanup',description:'Remove this completed cache after the full calculation, or cancel and drain its transfer before removing partials.',properties:{operation_id:downloadId},required:['operation_id']},
].map(({properties,required,...tool})=>({...tool,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}}));

export const isServerDownloadTool=name=>serverDownloadTools.some(tool=>tool.name===name);
