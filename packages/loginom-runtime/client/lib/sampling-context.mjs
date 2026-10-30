import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeSamplingContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readSamplingContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readSamplingBrowser.toString()})`;}
export async function readSamplingContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readSamplingBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'sampling_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'sampling_node_changed'};
 return {...result,node_context:after};
}
// Only local cached grid records and their rendered cells. Never call an engine
// proxy, change a store, or infer a group from its current row position.
export function readSamplingBrowser(prefix){
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const roots=['SamplingComponentWizard','PartitionComponentWizard'].flatMap(kind=>exact(prefix+';WizrdMCF;'+kind).filter(e=>e.checkVisibility({checkVisibilityCSS:true})).map(root=>({kind,root})));
 const fail=(reason,details)=>({verified:false,reason,...(details?{details}:{})});
 if(roots.length!==1)return fail('sampling_root');
 const {kind,root}=roots[0],base=prefix+';WizrdMCF;'+kind+';';
 const component=tid=>{const es=exact(tid),c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]&&root.contains(es[0])?c:null;};
 const method=component(base+'pedSamplingMethod;ValueControl');
 if(!method||typeof method.getRawValue!=='function')return fail('sampling_method');
 const readGrid=suffix=>{
  const es=[...document.querySelectorAll('[data-tid$='+JSON.stringify(';'+suffix)+']')].filter(e=>root.contains(e));
  const element=es.length===1?es[0]:null,grid=element&&globalThis.Ext?.getCmp?.(element.id);
  const store=grid?.el?.dom===element?grid.getStore?.():null,data=store?.getData?.(),items=data?.items,source=data?.getSource?.()?.items;
  const details={suffix,matches:es.length,grid_tid:element?.getAttribute('data-tid')??null,component_class:grid?.$className??null,store_class:store?.$className??null,count:store?.getCount?.()??null};
  if(!element||grid?.el?.dom!==element)return {verified:false,...details};
  if(store?.$className!=='Ext.data.Store'||store.isLoading?.()||store.isBufferedStore||!Array.isArray(items)||items.length>4||store.getCount?.()!==items.length||source&&(source.length!==items.length||source.some(r=>!items.includes(r))))return {verified:false,...details};
  const selected=grid.getSelectionModel?.().getSelection?.();
  if(!Array.isArray(selected)||selected.some(r=>!items.includes(r)))return {verified:false,...details,selection:false};
  const rows=items.map(r=>{
   const elements=[...grid.el.dom.querySelectorAll('[data-recordid]')].filter(e=>e.getAttribute('data-recordid')===String(r.internalId));
   const primitive=Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(r.data??{})).filter(([,d])=>Object.hasOwn(d,'value')&&(d.value===null||['string','number','boolean'].includes(typeof d.value))).map(([k,d])=>[k,d.value]));
   return {record_id:String(r.internalId),values:primitive,text:elements.map(e=>e.textContent.trim()).join(' '),tids:[...new Set(elements.flatMap(e=>[...e.querySelectorAll('[data-tid]')].map(e=>e.getAttribute('data-tid'))))],selected:selected.includes(r)};
  });
  return {verified:true,rows,base:details.grid_tid.slice(0,details.grid_tid.lastIndexOf(';'))};
 };
 const sizeGrid=readGrid('SizeGridForm;grdDataSet'),sequenceGrid=readGrid('SequenceMethodForm;grdSequence');
 if(!sizeGrid.verified||!sequenceGrid.verified)return fail('sampling_grid',{sizes:sizeGrid,sequence:sequenceGrid,
  grid_tids:[...document.querySelectorAll('[data-tid]')].filter(e=>root.contains(e)&&/SizeGridForm|SequenceMethodForm/.test(e.getAttribute('data-tid'))).slice(0,40).map(e=>e.getAttribute('data-tid'))});
 const sizes=sizeGrid.rows,sequence=sequenceGrid.rows;
 const partition=kind==='PartitionComponentWizard';
 if(sizes.length<(partition?2:1)||sizes.length>(partition?3:2))return fail('sampling_size_count');
 const units=Array.from({length:partition?2:1},(_,index)=>{
  const cells=exact(sizeGrid.base+';colSizeType_'+index).filter(e=>root.contains(e)&&e.querySelectorAll('img[role=button]').length===1);
  if(cells.length!==1)return null;
  const icon=cells[0].querySelector('img[role=button]');
  const row=cells[0].closest('[data-recordid]');if(!row)return null;
  return {index,record_id:row.getAttribute('data-recordid'),tid:cells[0].getAttribute('data-tid'),text:cells[0].textContent.trim(),title:icon.getAttribute('title')??'',tooltip:icon.getAttribute('data-qtip')??'',class_name:icon.getAttribute('class')??''};
 });
 if(units.some(u=>u===null))return fail('sampling_size_units');
 if(sequence.length!==(partition?3:2))return fail('sampling_group_count');
 return {verified:true,inventory_complete:true,kind:partition?'data_partition':'sampling',base,sizes_base:sizeGrid.base,sequence_base:sequenceGrid.base,method:method.getRawValue(),sizes,units,sequence,settings_applied:false};
}
