import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {EXCEL_EXPORT_FIELDS} from './exports-excel-parameters.mjs';
export function makeExcelExportContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readExcelExportContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readExcelExportBrowser.toString()},${JSON.stringify(EXCEL_EXPORT_FIELDS)})`;}
export async function readExcelExportContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readExcelExportBrowser,fields=EXCEL_EXPORT_FIELDS){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'excel_export_node_surface'};
 const result=await page.evaluate(readBrowser,{prefix:binding.workflow_ref.prefix,fields}),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'excel_export_owner_changed'};
 return {...result,node_context:after};
}
export function readExcelExportBrowser({prefix,fields}){
 const base=prefix+';WizrdMCF;',fail=reason=>({verified:false,reason}),exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base+'ExportExcelFilePreviewWizard').filter(e=>e.checkVisibility({checkVisibilityCSS:true}));
 if(!roots.length&&exact(base+'DoneWizard').filter(e=>e.checkVisibility({checkVisibilityCSS:true})).length===1)return {verified:true,stage:'done'};
 if(roots.length!==1)return fail('excel_export_page');const root=roots[0];
 const cmp=tid=>{const es=exact(tid);if(es.length!==1||!root.contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const values={};
 for(const [key,[card,id]]of Object.entries(fields)){
  const tid=base+card+';'+id,c=cmp(tid+';ValueControl'),sw=cmp(tid+';SwitchButton'),value=c?.getValue?.();
  if(!c||sw?.pressed!==false||!['string','number','boolean'].includes(typeof value)||typeof value==='string'&&(value.length>512||value.includes('\0')))return fail('excel_export_control_'+key);
  const input=c.inputEl?.dom,display=typeof c.getRawValue==='function'?c.getRawValue():value;
  if(input&&typeof display==='string'&&input.value!==display)return fail('excel_export_uncommitted_'+key);
  values[key]={value,display,tid:tid+';ValueControl',variable:false};
 }
 if(cmp(base+'ExportExcelFilePreviewWizard;edtConnection')?.getValue?.()!=='Локальное')return fail('excel_export_connection');
 return {verified:true,stage:'excel_export',values,connection:'Локальное',format:'xlsx',settings_applied:false};
}
