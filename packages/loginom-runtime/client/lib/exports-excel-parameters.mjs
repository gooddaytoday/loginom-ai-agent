import {requireExportDestination} from './storage-policy.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export const EXCEL_EXPORT_FIELDS=Object.freeze(Object.fromEntries(Object.entries({destination:'edtFileName',sheet_name:'edtSheetName',file_type:'cbbFileType',header:'cbbHeadersRow',number_format:'cbbFloatFormat',decimal_count:'pedDecimalCount',divide_thousands:'chkDivideThousands'}).map(([key,id])=>[key,['ExportExcelFilePreviewWizard',id]])));
export const excelExportSettingsSchema={type:'object',description:'XLSX workbook. XLS is unavailable in Loginom 7.4.2 and refused before changes; use XLSX. New: destination, sheet_name, header, overwrite required. Existing: preserve omissions.',properties:{
 destination:{type:'string',minLength:1,maxLength:512,description:'.xlsx in selected exports directory. XLS paths are unavailable and refused before changes.'},
 sheet_name:{type:'string',minLength:1,maxLength:31,description:'One worksheet; no []:*?/\\ or edge apostrophes.'},
 header:{type:'string',enum:['none','names','labels'],description:'No header, names or labels.'},
 overwrite:{type:'string',enum:['reject','replace'],description:'reject preserves an existing file; replace explicitly authorizes replacing the ENTIRE workbook, deleting all old sheets.'},
 bindings:{type:'object',additionalProperties:false,minProperties:1,properties:Object.fromEntries(['destination','sheet_name'].map(key=>[key,{type:'object',additionalProperties:false,required:['variable'],properties:{variable:{type:'string',minLength:1,maxLength:128}},description:'Exact mapped string variable on variable_inputs kind variables, input 0. Omit the bound literal; source must be executed.'}]))},
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
 need(!(mode==='xls'||typeof p?.excel_export?.destination==='string'&&/\.xls$/i.test(p.excel_export.destination)),'формат XLS в этой версии Loginom не выгружает данные. Используй XLSX.');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='excel_export'),'Invalid parameters: use excel_export');
 const s=p.excel_export??{};
 need(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>Object.hasOwn(excelExportSettingsSchema.properties,k)),'Invalid parameters.excel_export: unknown setting');
 need(['xlsx','xls'].includes(mode),'Invalid parameters.mode: Excel export uses xlsx or xls');
 need(r.read.ports.length===0&&(r.read.sample_rows??0)===0&&(r.read.require_exact_numbers??false)===false,'Invalid parameters.read: Excel sink requires ports:[], sample_rows:0, require_exact_numbers:false');
 need(r.mappings.length===0,'Invalid parameters.mappings: Excel export has no requested mappings');
 need(r.inputs.length<=1&&(r.target.kind==='existing'||r.inputs.length===1),'Invalid parameters.inputs: new Excel export needs one table');
 if(s.bindings!==undefined){
  need(s.bindings&&typeof s.bindings==='object'&&!Array.isArray(s.bindings)&&Object.keys(s.bindings).length>0,'Invalid Excel bindings');
  for(const [key,b]of Object.entries(s.bindings))need(['destination','sheet_name'].includes(key)&&b&&typeof b==='object'&&!Array.isArray(b)&&Object.keys(b).join(',')==='variable'&&typeof b.variable==='string'&&b.variable.length>0&&b.variable.length<=128&&!/[\0\r\n]/.test(b.variable)&&!Object.hasOwn(s,key),'Invalid or conflicting Excel binding: '+key);
  // Close returns before the variables input is mapped, so a binding could only be blamed falsely.
  need(r.finish!=='close','Invalid parameters.excel_export.bindings: finish=close discards the draft; use done or execute to bind variables');
  if(r.target.kind==='new')need(r.variable_inputs?.length===1&&r.variable_inputs[0].kind==='variables'&&r.variable_inputs[0].input===0,'Excel bindings need variables input 0');
 }
 if(r.target.kind==='new')for(const k of ['destination','sheet_name','header','overwrite'])need(Object.hasOwn(s,k)||['destination','sheet_name'].includes(k)&&s.bindings?.[k],'Invalid parameters.excel_export.'+k+': required on new export');
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
