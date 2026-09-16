import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {EXPORT_FIELDS} from './text-export-parameters.mjs';
export function makeTextExportContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readTextExportContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readTextExportBrowser.toString()},${JSON.stringify(EXPORT_FIELDS)})`;}
export async function readTextExportContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readTextExportBrowser,fields=EXPORT_FIELDS){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'export_node_surface'};
 const result=await page.evaluate(readBrowser,{prefix:binding.workflow_ref.prefix,fields}),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'export_owner_changed'};
 return {...result,node_context:after};
}
export function readTextExportBrowser({prefix,fields}){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=['ExportTextFileParamsWizard','ExportTextFilePreviewWizard'].flatMap(name=>exact(base+name).filter(e=>e.checkVisibility({checkVisibilityCSS:true})).map(e=>({name,e})));
 if(roots.length!==1)return fail('export_page');const {name,e:root}=roots[0];
 const cmp=tid=>{const es=exact(tid);if(es.length!==1||!root.contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const values={};
 for(const [key,[card,id]]of Object.entries(fields)){
  if(card!==name)continue;const tid=base+card+';'+id,c=cmp(tid+';ValueControl'),sw=cmp(tid+';SwitchButton'),value=c?.getValue?.();
  if(!c||!sw||typeof sw.pressed!=='boolean'||sw.pressed||!['string','number','boolean'].includes(typeof value)||typeof value==='string'&&(value.length>512||value.includes('\0')))return fail('export_control_'+key);
  const input=c.inputEl?.dom,display=typeof c.getRawValue==='function'?c.getRawValue():value;
  if(input&&typeof display==='string'&&input.value!==display)return fail('export_uncommitted_'+key);
  values[key]={value,display,tid:tid+';ValueControl',variable:false};
 }
 if(name==='ExportTextFileParamsWizard'){
  const c=cmp(base+name+';edtConnection');if(c?.getValue?.()!=='Локальное')return fail('export_connection');
 }else{
  const c=cmp(base+name+';edtFormatType;ValueControl'),v=c?.getValue?.(),sw=cmp(base+name+';edtFormatType;SwitchButton');
  if(!v||Object.values(v).length!==1||String(Object.values(v)[0])!=='0'||sw?.pressed!==false)return fail('export_fixed_width_or_variable');
 }
 return {verified:true,stage:name==='ExportTextFileParamsWizard'?'text_export_params':'text_export_format',values,connection:'Локальное',format:'delimited',settings_applied:false};
}
