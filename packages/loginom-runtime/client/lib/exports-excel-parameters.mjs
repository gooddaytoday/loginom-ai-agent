import {requireExportDestination} from './storage-policy.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export const EXCEL_EXPORT_FIELDS=Object.freeze(Object.fromEntries(Object.entries({destination:'edtFileName',sheet_name:'edtSheetName',file_type:'cbbFileType',header:'cbbHeadersRow',number_format:'cbbFloatFormat',decimal_count:'pedDecimalCount',divide_thousands:'chkDivideThousands'}).map(([key,id])=>[key,['ExportExcelFilePreviewWizard',id]])));
export const excelExportSettingsSchema={type:'object',description:'New XLSX: all four fields. Existing: preserve omissions.',properties:{
 destination:{type:'string',minLength:1,maxLength:512,description:'New .xlsx in selected exports directory.'},
 sheet_name:{type:'string',minLength:1,maxLength:31,description:'One worksheet; no []:*?/\\ or edge apostrophes.'},
 header:{type:'string',enum:['none','names','labels'],description:'No header, names or labels.'},
 overwrite:{type:'string',enum:['reject'],description:'New file only; never overwrite or append.'}
},required:[],additionalProperties:false};
export const excelExportParametersSchema={type:'object',properties:{excel_export:excelExportSettingsSchema},required:[],additionalProperties:false};
export function validateExcelExportDestination(value,directories=null){
 need(typeof value==='string'&&value.length<=512&&/\.xlsx$/i.test(value),'Invalid parameters.excel_export.destination: expected .xlsx');
 return requireExportDestination(value,directories);
}
export function validateExcelSheetName(value){
 need(typeof value==='string'&&value.trim().length>0&&value.length<=31&&!/[\[\]:*?/\\\x00-\x1f]/.test(value)&&!value.startsWith("'")&&!value.endsWith("'"),'Invalid parameters.excel_export.sheet_name: invalid Excel worksheet name');
 return value;
}
export function validateExcelExportParameters(p,mode,r,directories=null){
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='excel_export'),'Invalid parameters: use excel_export');
 const s=p.excel_export??{};
 need(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>Object.hasOwn(excelExportSettingsSchema.properties,k)),'Invalid parameters.excel_export: unknown setting');
 need(mode==='xlsx','Invalid parameters.mode: Excel export uses xlsx');
 need(r.read.ports.length===0&&(r.read.sample_rows??0)===0&&(r.read.require_exact_numbers??false)===false,'Invalid parameters.read: Excel sink requires ports:[], sample_rows:0, require_exact_numbers:false');
 need(r.mappings.length===0,'Invalid parameters.mappings: Excel export has no requested mappings');
 need(r.inputs.length<=1&&(r.target.kind==='existing'||r.inputs.length===1),'Invalid parameters.inputs: new Excel export needs one table');
 if(r.target.kind==='new')for(const k of Object.keys(excelExportSettingsSchema.properties))need(Object.hasOwn(s,k),'Invalid parameters.excel_export.'+k+': required on new export');
 if('destination'in s)validateExcelExportDestination(s.destination,directories);
 if('sheet_name'in s)validateExcelSheetName(s.sheet_name);
 if('header'in s)need(['none','names','labels'].includes(s.header),'Invalid parameters.excel_export.header');
 if('overwrite'in s)need(s.overwrite==='reject','Invalid parameters.excel_export.overwrite: only reject');
}
export function validateNativeExcelExport(values,directories=null){
 validateExcelExportDestination(values.destination?.value,directories);validateExcelSheetName(values.sheet_name?.value);
 need(values.file_type?.value===1&&values.number_format?.value===0&&values.divide_thousands?.value===false&&[0,1,2].includes(values.header?.value),'Unsupported retained Excel export format');
}
