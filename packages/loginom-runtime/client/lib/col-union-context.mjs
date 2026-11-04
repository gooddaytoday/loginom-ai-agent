import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeColUnionContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readColUnionContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readColUnionBrowser.toString()})`;
}
export async function readColUnionContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readColUnionBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'col_union_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'col_union_owner_changed'};
 return {...result,node_context:after};
}
// Only local rendered property editors and the complete two-row UI store.
// FEngine and record proxies are never dereferenced.
export function readColUnionBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;ColUnionDataWizard';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base),root=roots[0],ws=exact(prefix+';WizrdMCF');
 if(roots.length!==1||!root.checkVisibility({checkVisibilityCSS:true})||ws.length!==1)return fail('col_union_root');
 const cmp=key=>{const es=exact(base+(key?';'+key:'')),e=es[0],c=es.length===1&&Ext.getCmp(e.id);return c?.el?.dom===e&&root.contains(e)?c:null;};
 const owner=cmp('')?.['@@TestCmpController'],wizard=Ext.getCmp(ws[0].id)?.Controller;
 if(owner?.constructor?.name!=='ColUnionDataWizard'||owner.FWizardForm!==wizard)return fail('col_union_owner');
 const values={};
 for(const key of ['pedRowsPaddingType','pedTailsAlignType']){
  const property=cmp(key)?.Controller,control=cmp(key+';ValueControl'),value=control?.getValue?.();
  if(!property||property.FInitializing||property.FLastViewMode!==0||property.FLastValue!==value||![0,1,2].includes(value))return fail('col_union_property_or_variable');
  const store=control.getStore?.(),rows=store?.getData?.()?.items;
  if(!Array.isArray(rows)||rows.length!==3||store.isLoading?.()||rows.some((r,i)=>r?.data?.Value!==i||typeof r.data.DisplayText!=='string'))return fail('col_union_choices');
  values[key]=value;
 }
 const grid=cmp('grdDataSources'),store=grid?.getStore?.(),data=store?.getData?.(),rows=data?.items,source=data?.getSource?.()?.items;
 if(store?.isBufferedStore||store?.isLoading?.()||store?.getRemoteFilter?.()!==false||store?.getRemoteSort?.()!==false||!Array.isArray(rows)||rows.length!==2||store.getCount?.()!==2
  ||source&&(source.length!==2||source.some((r,i)=>r!==rows[i]))||cmp('grdDataSources;tbl')?.getStore?.()!==store)return fail('col_union_sources');
 const sources=rows.map((r,index)=>({index,record_id:String(r.internalId??''),port_guid:r.data?.Value,label:r.data?.DisplayText}));
 if(sources.some(s=>!s.record_id||typeof s.port_guid!=='string'||!/^[0-9a-f-]{36}$/i.test(s.port_guid)||typeof s.label!=='string')
  ||new Set(sources.map(s=>s.record_id)).size!==2||new Set(sources.map(s=>s.port_guid)).size!==2)return fail('col_union_source_identity');
 const selection=grid.getSelectionModel?.().getSelection?.();
 if(!Array.isArray(selection)||selection.length>1||selection.some(r=>!rows.includes(r)))return fail('col_union_selection');
 const row_count=['minimum','maximum','input'][values.pedTailsAlignType],padding=['null','repeat','last'][values.pedRowsPaddingType];
 const index=sources.findIndex(s=>s.port_guid===owner.FCurDataSourceGuid);
 if(row_count==='input'&&(index<0?selection.length!==0:selection.length!==1||selection[0]!==rows[index]))return fail('col_union_determining_source');
 return {verified:true,inventory_complete:true,state_source:'cached_col_union_editors',sources,
  settings:{row_count,padding,...(row_count==='input'?{determining_input:index<0?null:['main','attached'][index]}:{})},binding_ready:row_count!=='input'||index>=0,settings_applied:false};
}
