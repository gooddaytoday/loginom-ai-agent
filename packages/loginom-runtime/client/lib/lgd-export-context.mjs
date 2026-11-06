import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {LGD_EXPORT_FIELDS} from './lgd-parameters.mjs';
export function makeLgdExportContextCode(binding,variableMapping=null){validatePreparedNodeContext(binding);return `async page=>(${readLgdExportContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readLgdExportBrowser.toString()},${JSON.stringify(LGD_EXPORT_FIELDS)},${JSON.stringify(variableMapping)})`;}
export async function readLgdExportContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readLgdExportBrowser,fields=LGD_EXPORT_FIELDS,variableMapping=null){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'lgd_export_node_surface'};
 const result=await page.evaluate(readBrowser,{prefix:binding.workflow_ref.prefix,fields,variableMapping}),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'lgd_export_owner_changed'};
 return {...result,node_context:after};
}
export function readLgdExportBrowser({prefix,fields,variableMapping=null}){
 const base=prefix+';WizrdMCF;',fail=reason=>({verified:false,reason}),exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base+'ExportNativeParamsWizard').filter(e=>e.checkVisibility({checkVisibilityCSS:true}));
 if(!roots.length&&exact(base+'DoneWizard').filter(e=>e.checkVisibility({checkVisibilityCSS:true})).length===1)return {verified:true,stage:'done'};
 if(roots.length!==1)return fail('lgd_export_page');const root=roots[0];
 const cmp=tid=>{const es=exact(tid);if(es.length!==1||!root.contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const values={};
 for(const [key,[card,id]]of Object.entries(fields)){
  const tid=base+card+';'+id,c=cmp(tid+';ValueControl'),sw=cmp(tid+';SwitchButton'),value=c?.getValue?.();
  if(key==='destination'&&sw?.pressed===true){
   const v=cmp(tid+';VariableControl'),rows=v?.getStore?.()?.getData?.()?.items,selected=v?.getValue?.();
   const matches=Array.isArray(rows)?rows.filter(r=>r.data.field1===selected):[];
   const caption=matches.length===1&&matches[0].data.field2;
   const fields=variableMapping?.kind==='variables'&&variableMapping.direction==='input'&&variableMapping.port===0?variableMapping.fields:[];
   // Native captions include a formatted value. Match the whole caption to
   // the independently read string; never parse a path out of UI text.
   const source=typeof caption==='string'&&Array.isArray(fields)?fields.filter(f=>f.source&&f.type===5&&!f.is_null&&typeof f.value==='string'&&caption===f.name+' ( '+f.value+' )'):[];
   if(source.length!==1||typeof source[0].value!=='string'||source[0].value.length>512||source[0].value.includes('\0'))return fail('lgd_export_destination_variable');
   values[key]={value:source[0].value,display:caption,tid:tid+';VariableControl',variable:true,variable_name:source[0].name};continue;
  }
  if(!c||sw?.pressed!==false||!['string','number','boolean'].includes(typeof value)||typeof value==='string'&&(value.length>512||value.includes('\0')))return fail('lgd_export_control_'+key);
  const input=c.inputEl?.dom,display=typeof c.getRawValue==='function'?c.getRawValue():value;
  if(input&&typeof display==='string'&&input.value!==display)return fail('lgd_export_uncommitted_'+key);
  values[key]={value,display,tid:tid+';ValueControl',variable:false};
  if(key==='checksum'){
   const disabled=typeof c.isDisabled==='function'?c.isDisabled():c.disabled;
   if(typeof disabled==='boolean')values[key].disabled=disabled;
  }
 }
 // Loginom restores the inactive checksum combo to its default on reopen.
 // Without compression/LZO the writer ignores it; retain its raw value while
 // exposing the effective "none" only with an observed disabled control.
 if([0,1].includes(values.compression.value)&&values.checksum.disabled===true&&[0,1,2].includes(values.checksum.value)){
  values.checksum.native_value=values.checksum.value;values.checksum.value=0;
 }
 if(cmp(base+'ExportNativeParamsWizard;edtConnection')?.getValue?.()!=='Локальное')return fail('lgd_export_connection');
 return {verified:true,stage:'lgd_export',values,connection:'Локальное',format:'lgd',settings_applied:false};
}
