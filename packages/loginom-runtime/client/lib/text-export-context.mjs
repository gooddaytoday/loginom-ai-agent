import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {EXPORT_FIELDS} from './text-export-parameters.mjs';
export function makeTextExportContextCode(binding,variableMapping=null){validatePreparedNodeContext(binding);return `async page=>(${readTextExportContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readTextExportBrowser.toString()},${JSON.stringify(EXPORT_FIELDS)},${JSON.stringify(variableMapping)})`;}
export async function readTextExportContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readTextExportBrowser,fields=EXPORT_FIELDS,variableMapping=null){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'export_node_surface'};
 const result=await page.evaluate(readBrowser,{prefix:binding.workflow_ref.prefix,fields,variableMapping}),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'export_owner_changed'};
 return {...result,node_context:after};
}
export function readTextExportBrowser({prefix,fields,variableMapping=null}){
 let stage,format='delimited';
 const fail=reason=>({verified:false,reason,...(stage?{stage}:{})}),base=prefix+';WizrdMCF;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=['ExportTextFileParamsWizard','ExportTextFilePreviewWizard'].flatMap(name=>exact(base+name).filter(e=>e.checkVisibility({checkVisibilityCSS:true})).map(e=>({name,e})));
 if(roots.length!==1)return fail('export_page');const {name,e:root}=roots[0];
 stage=name==='ExportTextFileParamsWizard'?'text_export_params':'text_export_format';
 const cmp=tid=>{const es=exact(tid);if(es.length!==1||!root.contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const values={};
 for(const [key,[card,id]]of Object.entries(fields)){
  if(card!==name)continue;const tid=base+card+';'+id,c=cmp(tid+';ValueControl'),sw=cmp(tid+';SwitchButton'),value=c?.getValue?.();
  if(key==='destination'&&sw?.pressed===true){
   // Variable mode: the hidden ValueControl keeps a stale literal. The active
   // selector names one mapped variable; its observed mapped value is the path.
   const v=cmp(tid+';VariableControl'),store=v?.getStore?.(),rows=store?.getData?.()?.items;
   const selected=Array.isArray(rows)&&!store.isLoading?.()?rows.filter(r=>r.data.field1===v.getValue?.()):[];
   const caption=selected.length===1?selected[0].data.field2:null;
   const mapped=variableMapping?.kind==='variables'&&variableMapping.direction==='input'&&variableMapping.port===0?variableMapping.fields:[];
   const matches=typeof caption==='string'?mapped.filter(f=>f.source&&f.type===5&&f.is_null===false&&typeof f.value==='string'&&caption===(f.label??f.name)+' ( '+f.value+' )'):[];
   if(matches.length!==1||matches[0].value.length>512||matches[0].value.includes('\0'))return fail('export_variable_'+key);
   values[key]={value:matches[0].value,display:caption,tid:tid+';VariableControl',variable:true,variable_name:matches[0].name};continue;
  }
  if(!c||!sw||typeof sw.pressed!=='boolean'||sw.pressed||!['string','number','boolean'].includes(typeof value)||typeof value==='string'&&(value.length>512||value.includes('\0')))return fail('export_control_'+key);
  const input=c.inputEl?.dom,display=typeof c.getRawValue==='function'?c.getRawValue():value;
  if(input&&typeof display==='string'&&input.value!==display)return fail('export_uncommitted_'+key);
  values[key]={value,display,tid:tid+';ValueControl',variable:false};
 }
 if(name==='ExportTextFileParamsWizard'){
  const c=cmp(base+name+';edtConnection');if(c?.getValue?.()!=='Локальное')return fail('export_connection');
 }else{
  const c=cmp(base+name+';edtFormatType;ValueControl'),v=c?.getValue?.(),sw=cmp(base+name+';edtFormatType;SwitchButton');
  if(!v||Object.values(v).length!==1||!['0','1'].includes(String(Object.values(v)[0]))||sw?.pressed!==false)return fail('export_format_or_variable');
  format=String(Object.values(v)[0])==='1'?'fixed_width':'delimited';
 }
 return {verified:true,stage,values,connection:'Локальное',format,settings_applied:false};
}
