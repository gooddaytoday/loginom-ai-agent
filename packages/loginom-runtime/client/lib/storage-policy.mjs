// Host-selected Loginom directories. These are server paths, never OS homes
// or paths inferred from the authenticated account's name.
import {guardLoginomConnection} from './connection-recovery.mjs';
import {randomUUID} from 'node:crypto';
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
