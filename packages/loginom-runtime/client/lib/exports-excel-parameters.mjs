import {requireExportDestination} from './storage-policy.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export const EXCEL_EXPORT_FIELDS=Object.freeze(Object.fromEntries(Object.entries({destination:'edtFileName',sheet_name:'edtSheetName',file_type:'cbbFileType',header:'cbbHeadersRow',number_format:'cbbFloatFormat',decimal_count:'pedDecimalCount',divide_thousands:'chkDivideThousands'}).map(([key,id])=>[key,['ExportExcelFilePreviewWizard',id]])));
export const excelExportSettingsSchema={type:'object',description:'XLS/XLSX workbook. New: destination, sheet_name, header, overwrite required. Existing: preserve omissions.',properties:{
 destination:{type:'string',minLength:1,maxLength:512,description:'.xls for mode xls; .xlsx for mode xlsx, in selected exports directory.'},
 sheet_name:{type:'string',minLength:1,maxLength:31,description:'One worksheet; no []:*?/\\ or edge apostrophes.'},
 header:{type:'string',enum:['none','names','labels'],description:'No header, names or labels.'},
 overwrite:{type:'string',enum:['reject','replace'],description:'reject preserves an existing file; replace explicitly authorizes replacing the ENTIRE workbook, deleting all old sheets.'},
 number_format:{type:'string',enum:['general','numeric'],description:'Cell display style only; numeric never rounds stored values.'},
 decimal_count:{type:'integer',minimum:0,maximum:30,description:'Displayed decimals for numeric style, default 2 on new nodes.'},
 divide_thousands:{type:'boolean',description:'Thousands separator for numeric style, default false on new nodes.'}
},required:[],additionalProperties:false};
export const excelExportParametersSchema={type:'object',properties:{excel_export:excelExportSettingsSchema},required:[],additionalProperties:false};
export function validateExcelExportDestination(value,directories=null){
 need(typeof value==='string'&&value.length<=512&&/\.xlsx?$/i.test(value),'Invalid parameters.excel_export.destination: expected .xls or .xlsx');
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
 need(['xlsx','xls'].includes(mode),'Invalid parameters.mode: Excel export uses xlsx or xls');
 need(r.read.ports.length===0&&(r.read.sample_rows??0)===0&&(r.read.require_exact_numbers??false)===false,'Invalid parameters.read: Excel sink requires ports:[], sample_rows:0, require_exact_numbers:false');
 need(r.mappings.length===0,'Invalid parameters.mappings: Excel export has no requested mappings');
 need(r.inputs.length<=1&&(r.target.kind==='existing'||r.inputs.length===1),'Invalid parameters.inputs: new Excel export needs one table');
 if(r.target.kind==='new')for(const k of ['destination','sheet_name','header','overwrite'])need(Object.hasOwn(s,k),'Invalid parameters.excel_export.'+k+': required on new export');
 if('destination'in s){validateExcelExportDestination(s.destination,directories);need(s.destination.toLowerCase().endsWith('.'+mode),'Invalid parameters.excel_export.destination: extension must match mode');}
 if('sheet_name'in s)validateExcelSheetName(s.sheet_name);
 if('header'in s)need(['none','names','labels'].includes(s.header),'Invalid parameters.excel_export.header');
 if('overwrite'in s)need(['reject','replace'].includes(s.overwrite),'Invalid parameters.excel_export.overwrite: reject or whole-workbook replace');
 if('number_format'in s)need(['general','numeric'].includes(s.number_format),'Invalid parameters.excel_export.number_format');
 if('decimal_count'in s)need(Number.isInteger(s.decimal_count)&&s.decimal_count>=0&&s.decimal_count<=30,'Invalid parameters.excel_export.decimal_count: integer 0..30');
 if('divide_thousands'in s)need(typeof s.divide_thousands==='boolean','Invalid parameters.excel_export.divide_thousands');
}
export function validateNativeExcelExport(values,directories=null,mode='xlsx'){
 validateExcelExportDestination(values.destination?.value,directories);validateExcelSheetName(values.sheet_name?.value);
 need(values.file_type?.value==={xls:0,xlsx:1}[mode]&&values.destination.value.toLowerCase().endsWith('.'+mode)&&[0,1].includes(values.number_format?.value)&&typeof values.divide_thousands?.value==='boolean'&&[0,1,2].includes(values.header?.value),'Unsupported retained Excel export format');
 if(values.number_format.value===1)need(Number.isInteger(values.decimal_count?.value)&&values.decimal_count.value>=0&&values.decimal_count.value<=30,'Unsupported retained Excel decimal count');
}

export function validateExcelWorkbookArtifact(artifact){
 need(Number.isSafeInteger(artifact?.bytes)&&artifact.bytes>0,'Native Excel exporter returned an empty workbook; the file is not a valid XLS/XLSX workbook');
 return artifact;
}
