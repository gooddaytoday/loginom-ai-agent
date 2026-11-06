import {importSourceSchema,validateImportSource,requireExportDestination} from './storage-policy.mjs';
const need=(v,m)=>{if(!v)throw Error('LGD: '+m);};
const object=properties=>({type:'object',properties,required:[],additionalProperties:false});
export const LGD_EXPORT_FIELDS=Object.freeze(Object.fromEntries(Object.entries({destination:'edtFileName',compression:'cbbCompression',checksum:'cbbWriteChecksum',string_cache_max_size:'edtStringCacheMaxSize'}).map(([key,id])=>[key,['ExportNativeParamsWizard',id]])));
export const lgdImportSettingsSchema=object({checksum:{type:'string',enum:['verify','ignore'],description:'Use verify by default. ignore requires an explicit user request before any checksum failure; never disable after corruption.'}});
export const lgdImportParametersSchema=object({source:importSourceSchema,lgd_import:lgdImportSettingsSchema});
export const lgdExportSettingsSchema=object({
 destination:{type:'string',minLength:1,maxLength:512,description:'Absolute .lgd file in the selected own export directory. Exclusive with bindings.destination.'},
 compression:{type:'string',enum:['lz4'],description:'Native LZ4 compression.'},
 checksum:{type:'string',enum:['compressed'],description:'Checksum of compressed data.'},
 overwrite:{type:'string',enum:['reject','replace'],description:'Default reject. Replace requires an explicit destination or binding in this request; only the exact own file may be replaced.'},
 bindings:object({destination:{type:'object',additionalProperties:false,properties:{variable:{type:'string',minLength:1,maxLength:128}},required:['variable'],description:'Exact string variable on the connected variables input 0; its observed value must be an own absolute .lgd path.'}}),
});
export const lgdExportParametersSchema=object({lgd_export:lgdExportSettingsSchema});
export function validateLgdImportParameters(p,mode,r){
 need(mode==='native'&&p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['source','lgd_import'].includes(k)),'use source and lgd_import, mode native');
 if(p.source!==undefined)validateImportSource(p.source);
 const s=p.lgd_import??{};
 need(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>k==='checksum')&&(s.checksum===undefined||['verify','ignore'].includes(s.checksum)),'checksum must be verify or explicit ignore');
 if(r.target.kind==='new')need(p.source&&['verify','ignore'].includes(s.checksum),'new import requires verified source and an explicit checksum policy (default verify)');
 need(r.inputs.length===0&&r.mappings.length===0&&r.read.ports.every(p=>p===0)&&r.read.ports.length<=1,'import has no table inputs or requested mappings; output 0 only');
}
export function validateLgdExportDestination(path,directories=null){
 need(typeof path==='string'&&path.length<=512&&/\.lgd$/i.test(path),'destination must be .lgd');
 return requireExportDestination(path,directories);
}
export function validateLgdExportParameters(p,mode,r,directories=null){
 need(mode==='native'&&p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='lgd_export'),'use lgd_export, mode native');
 const s=p.lgd_export??{};
 need(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>Object.hasOwn(lgdExportSettingsSchema.properties,k)),'unknown export setting');
 const bindings=s.bindings;
 if(bindings!==undefined)need(bindings&&typeof bindings==='object'&&!Array.isArray(bindings)&&Object.keys(bindings).join(',')==='destination'
  &&bindings.destination&&typeof bindings.destination==='object'&&!Array.isArray(bindings.destination)&&Object.keys(bindings.destination).join(',')==='variable'
  &&typeof bindings.destination.variable==='string'&&bindings.destination.variable.length>0&&bindings.destination.variable.length<=128&&!/[\0\r\n]/.test(bindings.destination.variable)
  &&s.destination===undefined,'bindings require one exact destination variable without a conflicting literal');
 if(r.target.kind==='new'){
  for(const k of ['compression','checksum','overwrite'])need(Object.hasOwn(s,k),'new export requires '+k);
  need(Object.hasOwn(s,'destination')||bindings,'new export requires destination or bindings.destination');
 }
 if('destination'in s)validateLgdExportDestination(s.destination,directories);
 for(const [k,v]of Object.entries({compression:'lz4',checksum:'compressed'}))need(!(k in s)||s[k]===v,'unsupported '+k);
 need(!('overwrite'in s)||['reject','replace'].includes(s.overwrite),'unsupported overwrite');
 need(s.overwrite!=='replace'||Object.hasOwn(s,'destination')||bindings,'replace requires explicit destination or binding in this request');
 need(r.read.ports.length===0&&(r.read.sample_rows??0)===0&&(r.read.require_exact_numbers??false)===false,'sink requires read ports [], sample_rows 0, require_exact_numbers false');
 need(r.mappings.length===0&&r.inputs.length<=1&&(r.target.kind==='existing'||r.inputs.length===1),'new export needs one table; no requested mappings');
}
export function validateNativeLgdExport(values,directories=null){
 validateLgdExportDestination(values.destination?.value,directories);
 need(values.compression?.value===2&&values.checksum?.value===1&&values.string_cache_max_size?.value===131072,'unsupported retained native LGD format');
}
