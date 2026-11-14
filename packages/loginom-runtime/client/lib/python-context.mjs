import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makePythonContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readPythonContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readPythonBrowser.toString()})`;
}
export async function readPythonContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readPythonBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'python_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'python_node_changed'};
 return {...result,node_context:after};
}
// Read-only Ext/CodeMirror cache of the two Python pages; never calls setters.
export function readPythonBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;';
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const shown=e=>e?.checkVisibility?.({checkVisibilityCSS:true})===true;
 const pages=['PythonColumnsWizard','PythonCodeWizard'].flatMap(form=>exact(base+form).filter(shown).map(element=>({form,element})));
 if(pages.length!==1)return fail('python_page');
 const {form,element:root}=pages[0],view=globalThis.Ext?.getCmp?.(root.id);
 if(view?.el?.dom!==root)return fail('python_root');
 const checkbox=suffix=>{
  const es=exact(base+form+';'+suffix+';ValueControl'),c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);
  if(c?.el?.dom!==es[0]||!root.contains(es[0])||typeof c.checked!=='boolean'||c.checked!==es[0].classList.contains('x-form-cb-checked'))return null;
  return {checked:c.checked,disabled:c.disabled===true};
 };
 if(form==='PythonColumnsWizard'){
  const generation=checkbox('BooleanPropEdit');
  if(!generation)return fail('python_generation_checkbox');
  const grids=exact(base+form+';grdTargetColumns;tbl'),grid=grids.length===1&&globalThis.Ext?.getCmp?.(grids[0].id),store=grid?.getStore?.();
  const records=store?.getData?.()?.items;
  if(grid?.el?.dom!==grids[0]||store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||!Array.isArray(records)||records.length>64||store.getCount()!==records.length)return fail('python_columns_store');
  const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},columns=[];
  for(const r of records){
   const d=r?.data;
   if(!r?.isModel||typeof d?.Name!=='string'||!d.Name||!Object.hasOwn(types,d.DataType))return fail('python_column_record');
   columns.push({name:d.Name,label:typeof d.DisplayName==='string'&&d.DisplayName?d.DisplayName:d.Name,type:types[d.DataType]});
  }
  return {verified:true,page:'columns',generation:generation.checked,generation_disabled:generation.disabled,columns};
 }
 const wrappers=[...root.querySelectorAll('.CodeMirror')].filter(shown),cm=wrappers.length===1?wrappers[0].CodeMirror:null,doc=cm?.getDoc?.();
 if(!doc||typeof doc.lineCount!=='function'||typeof doc.getLine!=='function')return fail('python_code_editor');
 const count=doc.lineCount();
 if(!Number.isInteger(count)||count<1||count>4096||doc.firstLine()!==0)return fail('python_code_size');
 const lines=[];for(let i=0;i<count;i++){const line=doc.getLine(i);if(typeof line!=='string'||/[\r\n\0]/.test(line))return fail('python_code_line');lines.push(line);}
 const separate=checkbox('pedUseSeparateProcess');
 return {verified:true,page:'code',source:lines.join('\n'),separate_process:separate?.checked??null,separate_process_disabled:separate?.disabled??null,
  writable:cm.getOption('readOnly')===false};
}
