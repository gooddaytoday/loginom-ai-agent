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
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='overwrite'||k in EXPORT_FIELDS),'Unknown text export parameter');
 need(mode==='delimited'&&r.read.ports.length===0&&r.mappings.length===0&&r.inputs.length<=1,'Text export supports one table and file output, without requested port mappings');
 need((r.read.sample_rows??0)===0&&(r.read.require_exact_numbers??false)===false,'Text export returns verified file bytes, not tabular samples');
 need(r.target.kind==='existing'||r.inputs.length===1,'A new export requires its input table');
 if(r.target.kind==='new')need(['destination','encoding','delimiter','header','bom','line_ending','decimal_separator','null_marker','text_qualifier'].every(k=>k in p),'New export requires explicit format and destination');
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
