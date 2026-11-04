import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeVariablesToTableContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readVariablesToTableContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readVariablesToTableBrowser.toString()})`;}
export async function readVariablesToTableContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readVariablesToTableBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'variables_to_table_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'variables_to_table_node_changed'};
 return {...result,node_context:after};
}

// Loginom radios use button inputs. Read the local component and its rendered
// checked class together; InputEl.checked does not represent this setting.
export function readVariablesToTableBrowser(prefix){
 const base=prefix+';WizrdMCF;VariablesToDataWizard',exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const fail=reason=>({verified:false,reason}),roots=exact(base);
 if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('variables_to_table_root');
 const selected=[];
 for(const [mode,key] of [['columns','rbVarToColumns'],['rows','rbVarToRows']]){
  const elements=exact(base+';'+key),element=elements.length===1?elements[0]:null;
  const component=element&&globalThis.Ext?.getCmp?.(element.id);
  if(!element||!roots[0].contains(element)||!element.checkVisibility({checkVisibilityCSS:true})||component?.el?.dom!==element
   ||component.isDisabled?.()!==false)return fail('variables_to_table_radio_owner');
  const value=component.getValue?.();
  if(typeof value!=='boolean'||value!==element.classList.contains('x-form-cb-checked'))return fail('variables_to_table_radio_value');
  if(value)selected.push(mode);
 }
 if(selected.length!==1)return fail('variables_to_table_radio_selection');
 return {verified:true,inventory_complete:true,state_source:'owned_native_radio_controls',mode:selected[0],settings_applied:false};
}
