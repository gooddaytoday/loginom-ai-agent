import {importSourceSchema,validateImportSource} from './storage-policy.mjs';
const text=maxLength=>({type:'string',minLength:1,maxLength});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
export const excelSettingsSchema=object({
 source_path:{...text(2048),description:'Exact .xlsx destination returned by verified artifact delivery; use the original workbook, never convert it to CSV.'},
 sheet_name:{...text(120),description:'Optional exact worksheet name. Omit to import the first worksheet. One sheet only; named ranges are unsupported.'},
 header_rows:{type:'integer',minimum:1,maximum:10,description:'Number of header rows, normally 1.'},
 columns:{type:'array',minItems:1,maxItems:8,description:'Every source column in original order, with explicit types. No automatic type detection. Preserve original names unless an explicit source_name identifies a header to rename.',items:object({
  source_name:text(120),name:{...text(120),pattern:'^[A-Za-z_][A-Za-z0-9_]*$'},label:text(120),
  type:{type:'string',enum:['string','integer','real','datetime']},
  data_kind:{type:'string',enum:['Непрерывный','Дискретный']},
 },['name','label','type'])},
},['source_path','header_rows','columns']);
export const excelParametersSchema=object({
 source:importSourceSchema,
 excel:excelSettingsSchema,
});
export function validateExcelParameters(p,mode,r){
 const need=(v,m)=>{if(!v)throw Error('Excel import: '+m);};
 need(p?.source_switch===undefined,'LOGINOM_IMPORT_SCHEMA_CHANGED: schema-preserving Excel source switching is not installed; keep the sample and do not execute a full replacement');
 need(mode==='xlsx'&&p&&Object.keys(p).sort().join(',')==='excel,source','source and excel settings are required, mode xlsx');
 validateImportSource(p.source);
 const e=p.excel;
 need(e&&Object.keys(e).every(k=>Object.hasOwn(excelSettingsSchema.properties,k)),'unsupported Excel setting');
 need(typeof e.source_path==='string'&&e.source_path.length<=2048&&/^\/(?!\/)/.test(e.source_path)&&/\.xlsx$/i.test(e.source_path)
  &&!/[|*?%\\\x00-\x1f]/.test(e.source_path)&&e.source_path.split('/').slice(1).every(s=>s&&s!=='.'&&s!=='..'),'one explicit verified XLSX storage path is required');
 need(e.sheet_name===undefined||typeof e.sheet_name==='string'&&e.sheet_name.length>0&&e.sheet_name.length<=120&&!/[\x00-\x1f]/.test(e.sheet_name),'invalid sheet name');
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
