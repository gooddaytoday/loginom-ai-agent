// Loginom 7.4.2 Linux, observed in node17 native discovery (2026-09-13).
import { requireExportDestination } from './storage-policy.mjs';
export const EXPORT_FIELDS=Object.freeze({
 destination:['ExportTextFileParamsWizard','edtFileName'],
 text_qualifier:['ExportTextFileParamsWizard','edtTextQualifier'],
 decimal_separator:['ExportTextFileParamsWizard','edtDecimalSeparator'],
 date_separator:['ExportTextFileParamsWizard','edtDateSeparator'],
 time_separator:['ExportTextFileParamsWizard','edtTimeSeparator'],
 true_value:['ExportTextFileParamsWizard','edtValueTrue'],
 false_value:['ExportTextFileParamsWizard','edtValueFalse'],
 null_marker:['ExportTextFileParamsWizard','edtValueNull'],
 date_format:['ExportTextFileParamsWizard','edtDateFormat'],
 time_format:['ExportTextFileParamsWizard','edtTimeFormat'],
 delimiter:['ExportTextFilePreviewWizard','edtDelimiterChar'],
 encoding:['ExportTextFilePreviewWizard','edtCodePage'],
 bom:['ExportTextFilePreviewWizard','edtWriteBOM'],
 line_ending:['ExportTextFilePreviewWizard','edtLineEnding'],
 header:['ExportTextFilePreviewWizard','edtCaptionType'],
});
const need=(v,m)=>{if(!v)throw Error(m);};
export function validateExportDestination(value,directories=null){
 return requireExportDestination(value,directories);
}
export function validateTextExportParameters(p,mode,r,directories=null){
 need(p&&typeof p==='object'&&!Array.isArray(p),'Invalid parameters.parameters: expected export settings object');
 const unknown=Object.keys(p).find(k=>k!=='overwrite'&&!Object.hasOwn(EXPORT_FIELDS,k));
 need(unknown===undefined,'Invalid parameters.parameters.'+unknown+': unknown text export parameter; use the exports.text parameter_schema');
 need(mode==='delimited','Invalid parameters.mode: text export supports delimited mode');
 need(r.read.ports.length===0,'Invalid parameters.read.ports: use an empty list; text export returns output.file_artifacts');
 need(r.mappings.length===0,'Invalid parameters.mappings: use an empty list; text export does not support requested port mappings');
 need(r.inputs.length<=1,'Invalid parameters.inputs: text export accepts at most one table');
 need((r.read.sample_rows??0)===0,'Invalid parameters.read.sample_rows: use 0; text export returns verified file bytes');
 need((r.read.require_exact_numbers??false)===false,'Invalid parameters.read.require_exact_numbers: use false; text export has no tabular preview');
 need(r.target.kind==='existing'||r.inputs.length===1,'Invalid parameters.inputs: a new export requires exactly one input table');
 if(r.target.kind==='new'){
  const missing=['destination','encoding','delimiter','header','bom','line_ending','decimal_separator','null_marker','text_qualifier'].filter(k=>!(k in p));
  need(!missing.length,'Invalid parameters.'+missing[0]+': required for a new export; missing fields: '+missing.join(', '));
 }
 if('destination'in p)validateExportDestination(p.destination,directories);
 for(const [k,values]of Object.entries({encoding:['UTF-8'],delimiter:[';',',','\t'],header:['none','names','labels'],line_ending:['LF','CRLF'],
  decimal_separator:['.',','],text_qualifier:['"'],null_marker:['','?','null','NULL'],date_separator:['.','/','\\','-'],time_separator:[':', '.'],
  date_format:['dd/mm/yyyy','mm/dd/yyyy','yyyy/mm/dd','dd/mm/yy','mm/dd/yy','yy/mm/dd'],time_format:['h:mm','hh:mm','h:mm:ss','hh:mm:ss'],
  true_value:['True','Истина','Да'],false_value:['False','Ложь','Нет'],overwrite:['reject','replace']}))
  if(k in p)need(values.includes(p[k]),'Unsupported export '+k);
 if('bom'in p)need(typeof p.bom==='boolean','BOM must be boolean');
 if(p.overwrite==='replace')need('destination'in p,'Replace requires an explicit destination on every operation');
}
export function nativeExportValue(key,value){
 return key==='encoding'?65001:key==='header'?{none:0,names:1,labels:2}[value]:key==='line_ending'?{LF:0,CRLF:1}[value]:value;
}

// Existing nodes may retain formats outside the candidate contract. Check the
// observed final format before Done/Execute, including fields omitted by a patch.
export function validateNativeExportFormat(values){
 for(const [key,allowed] of Object.entries({encoding:[65001],delimiter:[';',',','\t'],header:[0,1,2],line_ending:[0,1],bom:[true,false]}))
  need(allowed.includes(values[key]?.value),'Unsupported retained export '+key);
}

export function validateNativeExportParams(values,directories=null){
 validateExportDestination(values.destination?.value,directories);
 // Empty date/time settings are the supported, preserved native defaults;
 // unlike decimal/qualifier they are not reported as a resolved separator.
 const allowed={text_qualifier:['"'],decimal_separator:['.',','],null_marker:['','?','null','NULL'],
  true_value:['True','Истина','Да'],false_value:['False','Ложь','Нет'],
  date_separator:['','.','/','\\','-'],time_separator:['',':','.'],
  date_format:['','dd/mm/yyyy','mm/dd/yyyy','yyyy/mm/dd','dd/mm/yy','mm/dd/yy','yy/mm/dd'],
  time_format:['','h:mm','hh:mm','h:mm:ss','hh:mm:ss']};
 for(const [key,options] of Object.entries(allowed))need(options.includes(values[key]?.value),'Unsupported retained export '+key+'; choose an explicit supported value');
}
