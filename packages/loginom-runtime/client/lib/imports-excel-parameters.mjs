import {importSourceSchema,validateImportSource} from './storage-policy.mjs';
const text=maxLength=>({type:'string',minLength:1,maxLength});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
export const excelSettingsSchema=object({
 source_path:{...text(2048),description:'Exact .xlsx destination returned by verified artifact delivery; use the original workbook, never convert it to CSV.'},
 sheet_name:{...text(120),description:'Exact worksheet name; omit for first sheet on initial import or to preserve it during source_switch. Named ranges unsupported.'},
 header_rows:{type:'integer',minimum:1,maximum:10,description:'Required for initial import: number of header rows, normally 1. Omit during source_switch to preserve.'},
 columns:{type:'array',minItems:1,maxItems:8,description:'Required for initial import; forbidden during source_switch. Every source column in original order, with explicit types. No automatic type detection. Preserve original names unless an explicit source_name identifies a header to rename.',items:object({
  source_name:text(120),name:{...text(120),pattern:'^[A-Za-z_][A-Za-z0-9_]*$'},label:text(120),
  type:{type:'string',enum:['string','integer','real','datetime']},
  data_kind:{type:'string',enum:['Непрерывный','Дискретный']},
 },['name','label','type'])},
},['source_path']);
export const excelParametersSchema=object({
 source:importSourceSchema,
 excel:excelSettingsSchema,
 source_switch:{...object({profile_id:text(128),save_operation_id:text(128)}),description:'Existing Excel import only: after exact XLSX scan and package.save_checkpoint, supply profile_id and save_operation_id; excel contains source_path and optional sheet_name only. Preserves columns and mapping, independently reopens, executes once and compares completed output N with the backend scan. Never supply expected_records.'},
},['source','excel']);
export function validateExcelParameters(p,mode,r){
 const need=(v,m)=>{if(!v)throw Error('Excel import: '+m);};
 const switching=Object.hasOwn(p??{},'source_switch');
 need(mode==='xlsx'&&p&&Object.keys(p).filter(k=>k!=='source_switch').sort().join(',')==='excel,source','source and excel settings are required, mode xlsx');
 validateImportSource(p.source);
 const e=p.excel;
 need(e&&Object.keys(e).every(k=>Object.hasOwn(excelSettingsSchema.properties,k)),'unsupported Excel setting');
 need(typeof e.source_path==='string'&&e.source_path.length<=2048&&/^\/(?!\/)/.test(e.source_path)&&/\.xlsx$/i.test(e.source_path)
  &&!/[|*?%\\\x00-\x1f]/.test(e.source_path)&&e.source_path.split('/').slice(1).every(s=>s&&s!=='.'&&s!=='..'),'one explicit verified XLSX storage path is required');
 need(e.sheet_name===undefined||typeof e.sheet_name==='string'&&e.sheet_name.length>0&&e.sheet_name.length<=120&&!/[\x00-\x1f]/.test(e.sheet_name),'invalid sheet name');
 if(switching){
  need(r.target?.kind==='existing'&&r.finish==='execute'&&r.inputs.length===0&&r.mappings.length===0&&r.read.ports.length===1&&r.read.ports[0]===0
   &&Object.keys(e).every(k=>['source_path','sheet_name'].includes(k))&&p.source_switch&&Object.keys(p.source_switch).sort().join(',')==='profile_id,save_operation_id'
   &&Object.values(p.source_switch).every(v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v)),
   'source_switch requires an existing Excel import, source_path/sheet_name only, scan/save IDs and executed output 0; no column or mapping edits');
  return;
 }
 need(Number.isInteger(e.header_rows)&&e.header_rows>=1&&e.header_rows<=10,'header_rows must be 1..10');
 need(Array.isArray(e.columns)&&e.columns.length>=1&&e.columns.length<=8,'1..8 explicit columns are required');
 for(const c of e.columns){
  need(c&&Object.keys(c).every(k=>['source_name','name','label','type','data_kind'].includes(k)),'unsupported column setting');
  need(typeof c.name==='string'&&c.name.length<=120&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name),'technical names must be ASCII identifiers; keep the header in source_name');
  need(['label',...(c.source_name===undefined?[]:['source_name'])].every(k=>typeof c[k]==='string'&&c[k].length>0&&c[k].length<=120&&!/[\x00-\x1f]/.test(c[k])),'column label/header is required');
  need(['string','integer','real','datetime'].includes(c.type),'explicit string/integer/real/datetime type required');
  need(c.data_kind===undefined||['Непрерывный','Дискретный'].includes(c.data_kind),'invalid data kind');
  need(c.type!=='string'||c.data_kind===undefined||c.data_kind==='Дискретный','string columns require discrete kind');
 }
 need(new Set(e.columns.map(c=>c.name)).size===e.columns.length&&new Set(e.columns.map(c=>c.source_name??c.name)).size===e.columns.length,'duplicate source or output names');
 need(r.inputs.length===0&&r.mappings.length===0,'Excel has no table input; output remapping is outside stage 1');
 need(['done','execute','close'].includes(r.finish)&&r.read.ports.every(p=>p===0)&&r.read.ports.length<=1,'only output 0 is supported');
}
export const excelColumns=e=>e.columns.map(c=>({name:c.name,label:c.label,type:c.type,data_kind:c.data_kind??(c.type==='string'?'Дискретный':'Непрерывный'),used:true}));
