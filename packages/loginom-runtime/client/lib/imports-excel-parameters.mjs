import {importSourceSchema,validateImportSource} from './storage-policy.mjs';
const text=maxLength=>({type:'string',minLength:1,maxLength});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
export const excelSettingsSchema=object({
 source_path:{...text(2048),description:'verified .xlsx delivery path; original bytes, no CSV. Omit if bound.'},
 source_paths:{type:'array',items:text(2048),minItems:2,maxItems:16},
 source_mask:text(2048),
 parallel_processing:{type:'boolean'},
 max_threads:{enum:['auto',2,4,8,16,32]},
 auto_detect:{enum:['none','new','all'],description:'none keeps positions/types; new adds fields; all redetects names/types, forbids columns. Path-only existing patch: mode, no headers/columns.'},
 sheet_name:{...text(120),description:'Exact sheet, exclusive with named_range. Omitted: first initially, saved on switch.'},
 named_range:{...text(120),description:'Exact defined name (SalesRange); its columns only, no sheet_name.'},
 extend_range:{type:'boolean',description:'named_range only: false/default=its bounds; true=its columns through last populated row.'},
 header_rows:{type:'integer',minimum:1,maximum:1000,description:'Initial required, usually 1; omit on switch to preserve.'},
 columns:{type:'array',minItems:1,maxItems:64,description:'Full source-order manual fields; source_name for renaming. Required unless new/all; forbidden for all. Omit on path-only policy patch.',items:object({
  source_name:text(120),name:{...text(120),pattern:'^[A-Za-z_][A-Za-z0-9_]*$'},label:text(120),
  type:{type:'string',enum:['string','integer','real','datetime','boolean']},
  data_kind:{type:'string',enum:['Непрерывный','Дискретный']},
 },['name','label','type'])},
},[]);
// List/mask refs are validated as importSourceSchema items before mutation.
const excelSourceSchema={oneOf:[...importSourceSchema.oneOf,object({kind:{const:'verified_sources'},sources:{type:'array',minItems:1,maxItems:16}})]};
export const excelParametersSchema=object({
 source:excelSourceSchema,
 excel:excelSettingsSchema,
 source_switch:{...object({profile_id:text(128),save_operation_id:text(128)}),description:'Exact XLSX scan + Save IDs. Existing: source_path, optional sheet_name only; keeps schema/mapping, reopens, executes once, checks scan N. No expected_records.'},
},['source','excel']);
// An empty existing Excel patch executes its saved native configuration.
export const isUnchangedExcelImportExecution=r=>r?.target?.type==='imports.excel'&&r.target.kind==='existing'&&!r.bindings?.length
 &&r.mode==='xlsx'&&r.finish==='execute'&&Array.isArray(r.inputs)&&r.inputs.length===0&&Array.isArray(r.mappings)&&r.mappings.length===0
 &&!(r.variable_inputs?.length)&&JSON.stringify(r.parameters)==='{"excel":{}}'&&JSON.stringify(r.read?.ports)==='[0]';
export const validExcelPath=(path,mask)=>typeof path==='string'&&path.length<=2048&&/^\/(?!\/)/.test(path)&&/\.xlsx$/i.test(path)
 &&!(mask?/[｜|?%\\\x00-\x1f\[\]{}]/:/[｜|*?%\\\x00-\x1f]/).test(path)&&path.split('/').slice(1).every(s=>s&&s!=='.'&&s!=='..')
 &&(!mask||!path.slice(0,path.lastIndexOf('/')).includes('*')&&path.slice(path.lastIndexOf('/')+1).includes('*'));
// Native filename input value: one path, list joined by U+FF5C, or one mask.
export const excelNativeSource=e=>e.source_paths?e.source_paths.join('｜'):e.source_mask??e.source_path;
const multiple=e=>Object.hasOwn(e??{},'source_paths')||Object.hasOwn(e??{},'source_mask');
export function validateExcelParameters(p,mode,r){
 const need=(v,m)=>{if(!v)throw Error('Excel import: '+m);};
 if(isUnchangedExcelImportExecution({...r,parameters:p,mode}))return;
 const switching=Object.hasOwn(p??{},'source_switch');
 need((r.variable_inputs??[]).every(i=>i.kind==='variables'&&i.input===0),'only variables input 0 (native Input_Var-1) is supported');
 if(r.bindings?.length){
  const code=(v,c)=>{if(!v)throw Error(c+': /excel/source_path');};
  code(r.finish!=='close'&&!switching,'BINDING_PARAMETER_UNSUPPORTED');
  code(!Object.hasOwn(p?.excel??{},'source_path'),'BINDING_CONFLICT');
  code(r.target.kind==='existing'||r.variable_inputs?.length===1,'BINDING_PORT_MISMATCH');
  need(p?.source?.kind==='storage','bound file requires parameters.source from dock_storage_source');
  p={...p,excel:{...p.excel,source_path:'/binding-validation.xlsx'}};
 }
 need(r.target?.kind!=='existing'||r.bindings?.length||!p?.excel||Object.keys(p.excel).length>0,
  'execute the SAME node unchanged with parameters exactly {excel:{}} (no source); its saved file or bound variable is used');
 need(mode==='xlsx'&&p&&Object.keys(p).filter(k=>k!=='source_switch').sort().join(',')==='excel,source','source and excel settings are required, mode xlsx');
 const e=p.excel,list=p.source?.kind==='verified_sources';
 need(e&&Object.keys(e).every(k=>Object.hasOwn(excelSettingsSchema.properties,k)),'unsupported Excel setting');
 const policy=Object.hasOwn(e,'auto_detect');
 if(policy){
  need(['none','new','all'].includes(e.auto_detect),'auto_detect must be none/new/all');
  need(!list&&!switching&&!r.bindings?.length,'auto_detect requires one literal source without binding/source_switch');
  need(e.auto_detect!=='all'||e.columns===undefined,'auto_detect all forbids manual columns');
  need(r.finish==='execute'&&r.read.ports.length===1&&r.read.ports[0]===0&&r.inputs.length===0&&r.mappings.length===0,
   'auto_detect requires Execute/read output 0, no inputs or mappings');
 }
 need(list===multiple(e),'source_paths/source_mask require source kind:verified_sources (one ref per file) and vice versa');
 if(list){
  need(!switching&&!r.bindings?.length,'a list or mask cannot use a binding or source_switch');
  need(Object.keys(p.source).sort().join(',')==='kind,sources'&&Array.isArray(p.source.sources)&&p.source.sources.length>=1&&p.source.sources.length<=16,'verified_sources needs 1..16 refs');
  p.source.sources.forEach(validateImportSource);
  need(['source_path','source_paths','source_mask'].filter(k=>Object.hasOwn(e,k)).length===1,'choose one of source_path, source_paths, source_mask');
  if(e.source_paths)need(Array.isArray(e.source_paths)&&e.source_paths.length>=2&&e.source_paths.length<=16&&e.source_paths.every(x=>validExcelPath(x))
   &&new Set(e.source_paths).size===e.source_paths.length&&e.source_paths.join('｜').length<=2048&&p.source.sources.length===e.source_paths.length,
   'source_paths: 2..16 distinct .xlsx paths, one verified source each, same order');
  else need(validExcelPath(e.source_mask,true),'source_mask: * only in the .xlsx basename of one directory');
 }else{
  validateImportSource(p.source);
  need(validExcelPath(e.source_path),'one explicit verified XLSX storage path is required');
 }
 need(!Object.hasOwn(e,'parallel_processing')||list&&typeof e.parallel_processing==='boolean','parallel_processing requires a list or mask and a boolean');
 need(!Object.hasOwn(e,'max_threads')||e.parallel_processing===true&&['auto',2,4,8,16,32].includes(e.max_threads),'max_threads requires parallel_processing:true; auto/2/4/8/16/32');
 need(e.sheet_name===undefined||typeof e.sheet_name==='string'&&e.sheet_name.length>0&&e.sheet_name.length<=120&&!/[\x00-\x1f]/.test(e.sheet_name),'invalid sheet name');
 if(Object.hasOwn(e,'named_range'))need(typeof e.named_range==='string'&&e.named_range.length>0&&e.named_range.length<=120&&!/[\x00-\x1f]/.test(e.named_range),'invalid named_range');
 need(e.named_range===undefined||e.sheet_name===undefined,'sheet_name and named_range are mutually exclusive');
 need(!Object.hasOwn(e,'extend_range')||e.named_range!==undefined&&typeof e.extend_range==='boolean','extend_range requires named_range and a boolean');
 if(switching){
  need(r.target?.kind==='existing'&&r.finish==='execute'&&r.inputs.length===0&&r.mappings.length===0&&r.read.ports.length===1&&r.read.ports[0]===0
   &&Object.keys(e).every(k=>['source_path','sheet_name'].includes(k))&&p.source_switch&&Object.keys(p.source_switch).sort().join(',')==='profile_id,save_operation_id'
   &&Object.values(p.source_switch).every(v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v)),
   'source_switch requires an existing Excel import, source_path/sheet_name only, scan/save IDs and executed output 0; no column or mapping edits');
  return;
 }
 if(policy&&r.target?.kind==='existing'&&e.header_rows===undefined&&e.columns===undefined){
  need(Object.keys(e).every(k=>['source_path','sheet_name','auto_detect'].includes(k)),'path-only auto_detect patch preserves other settings');return;
 }
 need(Number.isInteger(e.header_rows)&&e.header_rows>=1&&e.header_rows<=1000,'header_rows must be 1..1000');
 if(policy&&['new','all'].includes(e.auto_detect)&&e.columns===undefined)return;
 need(Array.isArray(e.columns)&&e.columns.length>=1&&e.columns.length<=64,'1..64 explicit columns are required');
 for(const c of e.columns){
  need(c&&Object.keys(c).every(k=>['source_name','name','label','type','data_kind'].includes(k)),'unsupported column setting');
  need(typeof c.name==='string'&&c.name.length<=120&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name),'technical names must be ASCII identifiers; keep the header in source_name');
  need(['label',...(c.source_name===undefined?[]:['source_name'])].every(k=>typeof c[k]==='string'&&c[k].length>0&&c[k].length<=120&&!/[\x00-\x1f]/.test(c[k])),'column label/header is required');
  need(['string','integer','real','datetime','boolean'].includes(c.type),'explicit string/integer/real/datetime/boolean type required');
  need(c.data_kind===undefined||['Непрерывный','Дискретный'].includes(c.data_kind),'invalid data kind');
  need(c.type!=='string'||c.data_kind===undefined||c.data_kind==='Дискретный','string columns require discrete kind');
  need(c.type!=='boolean'||c.data_kind===undefined||c.data_kind==='Дискретный','boolean columns require discrete kind');
 }
 need(new Set(e.columns.map(c=>c.name)).size===e.columns.length&&new Set(e.columns.map(c=>c.source_name??c.name)).size===e.columns.length,'duplicate source or output names');
 need(r.inputs.length===0&&r.mappings.length===0,'Excel has no table input; output remapping is outside stage 1');
 need(['done','execute','close'].includes(r.finish)&&r.read.ports.every(p=>p===0)&&r.read.ports.length<=1,'only output 0 is supported');
}
export const excelColumns=e=>e.columns.map(c=>({name:c.name,label:c.label,type:c.type,data_kind:c.data_kind??(['string','boolean'].includes(c.type)?'Дискретный':'Непрерывный'),used:true}));
