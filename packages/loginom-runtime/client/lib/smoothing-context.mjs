import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeSmoothingContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readSmoothingContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readSmoothingBrowser.toString()})`;}
export async function readSmoothingContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readSmoothingBrowser){
 const before=await readNode(page,binding);if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'smoothing_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'smoothing_node_changed'};
 return {...result,node_context:after};
}
// Read only the owned rendered wizard and its complete cached local store.
export function readSmoothingBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;SmoothingWizard;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base.slice(0,-1)),root=roots[0];if(roots.length!==1||!root.checkVisibility({checkVisibilityCSS:true}))return fail('smoothing_root');
 const cmp=k=>{const es=exact(base+k),e=es[0],c=es.length===1&&globalThis.Ext?.getCmp?.(e.id);return c?.el?.dom===e&&root.contains(e)?c:null;};
 const grid=cmp('grdColumnsSettings'),store=grid?.getStore?.(),data=store?.getData?.(),rs=data?.items,source=data?.getSource?.()?.items;
 const projection=Array.isArray(source)?source.filter(r=>[3,4].includes(r?.data?.DataType)&&r.data.DataKind===1):null;
 if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||!Array.isArray(rs)||rs.length>1000||store.getCount?.()!==rs.length
  ||source&&(!projection||source.length>1000||projection.length!==rs.length||projection.some((r,i)=>r!==rs[i])))return fail('smoothing_inventory');
 const fields=[],names=new Set(),ids=new Set(),types={3:'real',4:'integer'};
 for(const [index,r] of rs.entries()){
  const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||typeof d?.Name!=='string'||!d.Name||names.has(d.Name)||typeof d.DisplayName!=='string'||!types[d.DataType]||d.DataKind!==1||typeof d.Usable!=='boolean'||![0,1].includes(d.Algorithm))return fail('smoothing_field');
  names.add(d.Name);ids.add(id);fields.push({index,record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType],data_kind:'Непрерывный',used:d.Usable,algorithm:d.Algorithm});
 }
 const selection=grid.getSelectionModel?.().getSelection?.();
 if(!Array.isArray(selection)||selection.length>1||selection.length===1&&!rs.includes(selection[0]))return fail('smoothing_selection');
 const view=globalThis.Ext?.getCmp?.(root.id),controller=view?.['@@TestCmpController'];
 const wizardRoots=exact(prefix+';WizrdMCF'),wizardView=wizardRoots.length===1?globalThis.Ext?.getCmp?.(wizardRoots[0].id):null;
 if(view?.el?.dom!==root||controller?.constructor?.name!=='SmoothingWizard'||controller.FColumnsStore!==store
  ||controller.FWizardForm?.FView!==wizardView||wizardView?.el?.dom!==wizardRoots[0])return fail('smoothing_owner');
 const queues=Object.getOwnPropertySymbols(wizardView).filter(s=>s.description==='LockQueue');
 if(queues.length!==1||wizardView[queues[0]]?.IsEmpty!==true)return fail('smoothing_binding_pending');
 const selected=selection.length===1?fields[rs.indexOf(selection[0])]:null;
 let settings=null;
 if(selected?.used){
  if(selected.algorithm!==0)return fail('smoothing_wavelet_unsupported');
  for(const key of ['rbLambda','rbPeriod','edtLambda','edtPeriod'])if(cmp(key+';SwitchButton')?.pressed!==false)return fail('smoothing_variable_unsupported');
  const lambda=cmp('edtLambda;ValueControl')?.getValue?.(),period=cmp('edtPeriod;ValueControl')?.getValue?.();
  const lambdaSelected=cmp('rbLambda;ValueControl')?.getValue?.(),periodSelected=cmp('rbPeriod;ValueControl')?.getValue?.();
  if(!Number.isFinite(lambda)||lambda<0.0625||lambda>102659800000000||!Number.isFinite(period)||period<2||period>20000
   ||typeof lambdaSelected!=='boolean'||typeof periodSelected!=='boolean'||lambdaSelected===periodSelected)return fail('smoothing_strength');
  settings={lambda,period,strength:lambdaSelected?'lambda':'period'};
 }
 return {verified:true,inventory_complete:true,state_source:'cached_smoothing_store',fields,selected,settings,binding_ready:true,settings_applied:false};
}
