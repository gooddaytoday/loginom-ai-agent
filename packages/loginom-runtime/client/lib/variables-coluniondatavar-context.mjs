import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
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
