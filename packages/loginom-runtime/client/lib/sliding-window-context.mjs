import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeSlidingWindowContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readSlidingWindowContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readSlidingWindowBrowser.toString()})`;}
export async function readSlidingWindowContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readSlidingWindowBrowser){
 const before=await readNode(page,binding);if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'sliding_window_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'sliding_window_node_changed'};
 return {...result,node_context:after};
}
export function readSlidingWindowBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;SlidingWindowWizard;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base.slice(0,-1)),root=roots[0];
 if(roots.length!==1||!root.checkVisibility({checkVisibilityCSS:true}))return fail('sliding_window_root');
 const component=key=>{const es=exact(base+key),e=es[0],c=es.length===1&&globalThis.Ext?.getCmp?.(e.id);return c?.el?.dom===e&&root.contains(e)?c:null;};
 const grid=component('grdColumns'),store=grid?.getStore?.(),data=store?.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
 if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||!Array.isArray(records)||records.length>1000||store.getCount?.()!==records.length
  ||source&&(source.length!==records.length||source.some(r=>!records.includes(r))))return fail('sliding_window_inventory');
 const history=component('grdColumns;colHistory')?.dataIndex??component('colHistory')?.dataIndex;
 const horizon=component('grdColumns;colForecast')?.dataIndex??component('colForecast')?.dataIndex;
 if(typeof history!=='string'||typeof horizon!=='string'||history===horizon)return fail('sliding_window_columns');
 const names=new Set(),ids=new Set(),types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string'},fields=[];
 for(const [index,r] of records.entries()){
  const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||typeof d?.Name!=='string'||!d.Name||names.has(d.Name)||typeof d.DisplayName!=='string'||!types[d.DataType]
   ||![d[history],d[horizon]].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=134217727))return fail('sliding_window_record');
  ids.add(id);names.add(d.Name);fields.push({index,record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType],history:d[history],horizon:d[horizon]});
 }
 const policy=component('pedIncompleteRecordsProcessing;ValueControl'),inputs=exact(base+'pedIncompleteRecordsProcessing;ValueControl').flatMap(e=>[...e.querySelectorAll('input')]);
 const labels={'Оставлять неполные записи':'keep_incomplete','Удалять добавленные неполные записи':'drop_added','Удалять все неполные записи':'drop_all_incomplete'};
 const sw=component('pedIncompleteRecordsProcessing;SwitchButton');
 if(!policy||inputs.length!==1||!Object.hasOwn(labels,inputs[0].value)||sw?.pressed!==false)return fail('sliding_window_policy');
 return {verified:true,inventory_complete:true,state_source:'cached_sliding_window_store',fields,incomplete_records:labels[inputs[0].value],settings_applied:false};
}
