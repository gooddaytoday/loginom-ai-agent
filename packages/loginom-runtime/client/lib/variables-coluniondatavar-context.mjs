import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {readVariablesColumnUnionMapping} from './variables-column-union-procedure.mjs';
export function makeVariablesColumnUnionNextDialogCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readVariablesColumnUnionNextDialog.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readVariablesColumnUnionNextDialogBrowser.toString()},${readVariablesColumnUnionMapping.toString()})`;
}
export async function readVariablesColumnUnionNextDialog(page,binding,readNode,readBrowser,readMapping){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {status:'refused',reason:'union_wizard_owner_unconfirmed'};
 const snapshot=await page.evaluate(readBrowser,binding.workflow_ref.prefix),mapping=await page.evaluate(readMapping,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {status:'refused',reason:'union_wizard_owner_changed'};
 return {...snapshot,node_context:after,mapping};
}
// Diagnostic only: no callback, native method or answer is invoked here.
export function readVariablesColumnUnionNextDialogBrowser(prefix){
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')],visible=e=>e.checkVisibility({checkVisibilityCSS:true});
 const roots=exact(prefix+';WizrdMCF'),mapping=exact(prefix+';WizrdMCF;DerivedVariablesMappingEngineOutputPortWizard');
 if(roots.length!==1||!visible(roots[0])||mapping.length!==1||!roots[0].contains(mapping[0]))return {status:'refused',reason:'union_mapping_root_unconfirmed'};
 const boxes=[...document.querySelectorAll('[role="dialog"],.x-message-box')].filter(visible);
 if(boxes.length>3)return {status:'refused',reason:'dialog_inventory_exceeded'};
 const dialogs=boxes.map(box=>{
  const native=globalThis.Ext?.getCmp(box.id),buttons=[...box.querySelectorAll('[role="button"],a.x-btn,button')].filter(visible);
  if(buttons.length>8)throw Error('Bounded union dialog buttons required');
  return {data_tid:box.getAttribute('data-tid'),id:box.id,text:box.innerText.slice(0,2000),
   native_class:native?.el?.dom===box?native.$className:null,native_front:globalThis.Ext?.WindowManager?.front===native,
   data_tids:[...box.querySelectorAll('[data-tid]')].slice(0,64).map(e=>({data_tid:e.getAttribute('data-tid'),text:e.innerText?.slice(0,500)??''})),
   buttons:buttons.map(e=>({id:e.id,data_tid:e.getAttribute('data-tid'),text:e.innerText.trim().slice(0,200),disabled:e.disabled===true||!!e.closest('.x-item-disabled')}))};
 });
 return {status:'observed',read_only:true,dialogs};
}
export function makeVariablesColumnUnionContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readVariablesColumnUnionContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readVariablesColumnUnionBrowser.toString()})`;
}
export async function readVariablesColumnUnionContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readVariablesColumnUnionBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'variables_union_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'variables_union_owner_changed'};
 return {...result,node_context:after};
}
// Discovery: this wizard's local grid may still be loading when its native
// automatic mapping is ready. Never infer an empty result from that grid.
export function readVariablesColumnUnionBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;DerivedVariablesMappingEngineOutputPortWizard';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base),root=roots[0],buttons=exact(base+';btnAutoSyncThroughColumns');
 if(roots.length!==1||!root.checkVisibility({checkVisibilityCSS:true})||buttons.length!==1||!root.contains(buttons[0]))return fail('variables_union_mapping_root');
 const button=globalThis.Ext?.getCmp(buttons[0].id);
 if(button?.el?.dom!==buttons[0]||typeof button.pressed!=='boolean')return fail('variables_union_autosync');
 return {verified:true,mode:'append_variables',mapping:button.pressed?'automatic':'custom',settings_applied:false};
}
