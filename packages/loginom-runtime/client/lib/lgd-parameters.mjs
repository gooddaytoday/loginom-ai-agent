import {importSourceSchema,validateImportSource,requireExportDestination} from './storage-policy.mjs';
const need=(v,m)=>{if(!v)throw Error('LGD: '+m);};
const object=properties=>({type:'object',properties,required:[],additionalProperties:false});
export const LGD_EXPORT_FIELDS=Object.freeze(Object.fromEntries(Object.entries({destination:'edtFileName',compression:'cbbCompression',checksum:'cbbWriteChecksum',string_cache_max_size:'edtStringCacheMaxSize'}).map(([key,id])=>[key,['ExportNativeParamsWizard',id]])));
export const lgdImportSettingsSchema=object({checksum:{type:'string',enum:['verify'],description:'Verify the stored checksum; never disable after corruption.'},
 bindings:{type:'object',properties:{source_path:{type:'object',properties:{variable:{type:'string',pattern:'^[_A-Za-z][_A-Za-z0-9]{0,127}$'}},required:['variable'],additionalProperties:false}},required:['source_path'],additionalProperties:false,
  description:'Bind filename to one mapped string variable from an executed source. Use variable_inputs kind variables, input 0 (native Input_Var-1), not control. Supply source for the exact current verified file when selecting a binding.'}});
export const lgdImportParametersSchema=object({source:importSourceSchema,lgd_import:lgdImportSettingsSchema});
export const lgdExportSettingsSchema=object({
 destination:{type:'string',minLength:1,maxLength:512,description:'New absolute .lgd file in the selected own export directory.'},
 compression:{type:'string',enum:['lz4'],description:'Native LZ4 compression.'},
 checksum:{type:'string',enum:['compressed'],description:'Checksum of compressed data.'},
 overwrite:{type:'string',enum:['reject'],description:'Never overwrite an existing file.'},
});
export const lgdExportParametersSchema=object({lgd_export:lgdExportSettingsSchema});
export function validateLgdImportParameters(p,mode,r){
 need(mode==='native'&&p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['source','lgd_import'].includes(k)),'use source and lgd_import, mode native');
 if(p.source!==undefined)validateImportSource(p.source);
 const s=p.lgd_import??{};
 need(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>['checksum','bindings'].includes(k))&&(s.checksum===undefined||s.checksum==='verify'),'checksum must be verify');
 if(s.bindings!==undefined)need(p.source&&s.bindings&&Object.keys(s.bindings).join(',')==='source_path'
  &&s.bindings.source_path&&Object.keys(s.bindings.source_path).join(',')==='variable'
  &&typeof s.bindings.source_path.variable==='string'&&/^[_A-Za-z][_A-Za-z0-9]{0,127}$/.test(s.bindings.source_path.variable),'binding requires a verified source and exact mapped variable name');
 need((r.variable_inputs??[]).length<=1&&(r.variable_inputs??[]).every(i=>i.kind==='variables'&&i.input===0),'LGD uses the ordinary variables input 0, not a hidden control port');
 if(r.target.kind==='new'&&s.bindings)need(r.variable_inputs?.length===1,'new binding needs the executed variable source');
 if(r.target.kind==='new')need(p.source&&s.checksum==='verify','new import requires verified source and checksum verify');
 need(r.inputs.length===0&&r.mappings.every(m=>m.kind==='variables'&&m.direction==='input'&&m.port===0)&&r.read.ports.every(p=>p===0)&&r.read.ports.length<=1,'import has no table inputs; only variable input mapping 0 and table output 0');
}
export function validateLgdExportDestination(path,directories=null){
 need(typeof path==='string'&&path.length<=512&&/\.lgd$/i.test(path),'destination must be .lgd');
 return requireExportDestination(path,directories);
}
export function validateLgdExportParameters(p,mode,r,directories=null){
 need(mode==='native'&&p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='lgd_export'),'use lgd_export, mode native');
 const s=p.lgd_export??{};
 need(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>Object.hasOwn(lgdExportSettingsSchema.properties,k)),'unknown export setting');
 if(r.target.kind==='new')for(const k of Object.keys(lgdExportSettingsSchema.properties))need(Object.hasOwn(s,k),'new export requires '+k);
 if('destination'in s)validateLgdExportDestination(s.destination,directories);
 for(const [k,v]of Object.entries({compression:'lz4',checksum:'compressed',overwrite:'reject'}))need(!(k in s)||s[k]===v,'unsupported '+k);
 need(r.read.ports.length===0&&(r.read.sample_rows??0)===0&&(r.read.require_exact_numbers??false)===false,'sink requires read ports [], sample_rows 0, require_exact_numbers false');
 need(r.mappings.length===0&&r.inputs.length<=1&&(r.target.kind==='existing'||r.inputs.length===1),'new export needs one table; no requested mappings');
}
export function validateNativeLgdExport(values,directories=null){
 validateLgdExportDestination(values.destination?.value,directories);
 need(values.compression?.value===2&&values.checksum?.value===1&&values.string_cache_max_size?.value===131072,'unsupported retained native LGD format');
}
