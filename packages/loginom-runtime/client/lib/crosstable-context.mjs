import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeCrossTableContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readCrossTableContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readCrossTableBrowser.toString()})`;}
export async function readCrossTableContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readCrossTableBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'crosstable_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'crosstable_owner_changed'};
 return {...result,node_context:after};
}
export function readCrossTableBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;CrossTabWizard;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const root=exact(base.slice(0,-1));if(root.length!==1||!root[0].checkVisibility())return fail('crosstable_root');
 const component=t=>{const es=exact(t),c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const grids=['grdDataFields','grdUsedFields'].map(k=>component(base+k));
 if(grids.some(c=>!c||!root[0].contains(c.el.dom)))return fail('crosstable_grids');
 const chains=grids.map(c=>c.getStore?.()),sources=chains.map(s=>s?.getSource?.());
 if(chains.some(s=>s?.$className!=='Ext.data.ChainedStore'||s.isLoading?.()||s.isBufferedStore)
  ||sources[0]!==sources[1])return fail('crosstable_chains');
 const store=sources[0],records=store?.getData?.()?.items;
 if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()
  ||!Array.isArray(records)||records.length>1004||store.getCount?.()!==records.length)return fail('crosstable_inventory');
 const original=store.getData?.()?.getSource?.()?.items;
 if(original&&(original.length!==records.length||original.some(r=>!records.includes(r))))return fail('crosstable_filtered_inventory');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},fields=[],ids=new Set(),indices=new Set(),service=[];
 for(const r of records){const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id))return fail('crosstable_record_identity');ids.add(id);
  if(d?.DataType===0&&d.DisplayName===''&&[1,2,3].includes(d.Disposition)){service.push({record_id:id,placeholder:true});continue;}
  if(!types[d?.DataType]||typeof d.DisplayName!=='string'||d.DisplayName.length>256
   ||![0,1,2].includes(d.DataKind)||![0,1,2,3].includes(d.Disposition)||typeof d.IsCountCase!=='boolean'
   ||!Number.isSafeInteger(d.Index)||d.Index<0||indices.has(d.Index)||!Number.isSafeInteger(d.Order)
   ||d.Order<0&&(d.Disposition!==0||d.Order!==-1)
   ||!Number.isSafeInteger(d.GroupFunctions)||d.GroupFunctions<0||d.GroupFunctions>2047
   ||!Number.isSafeInteger(d.AvailableAggregationTypes)||d.AvailableAggregationTypes<0||d.AvailableAggregationTypes>2047
   ||typeof d.NullGroup!=='boolean'||typeof d.OtherGroup!=='boolean'
   ||!Number.isSafeInteger(d.SlidingUniqueValuesMinCount)||d.SlidingUniqueValuesMinCount<0)return fail('crosstable_input_record');
  indices.add(d.Index);
  const f={record_id:id,index:d.Index,label:d.DisplayName,type:types[d.DataType],data_kind:['Неопределенное','Непрерывный','Дискретный'][d.DataKind],
   disposition:d.Disposition,order:d.Order,functions:d.GroupFunctions,available_functions:d.AvailableAggregationTypes,
   include_null:d.NullGroup,include_other:d.OtherGroup,min_values:d.SlidingUniqueValuesMinCount};
  if(d.IsCountCase)service.push({...f,count:true});else fields.push(f);
 }
 if(fields.length>1000||new Set(fields.map(f=>f.label)).size!==fields.length)return fail('crosstable_ambiguous_labels');
 for(const role of [1,2,3])if(fields.filter(f=>f.disposition===role).sort((a,b)=>a.order-b.order).some((f,i)=>f.order!==i))return fail('crosstable_role_order');
 const selected=grids.map(c=>c.getSelectionModel?.().getSelection?.());
 if(selected.some(xs=>!Array.isArray(xs)||xs.some(r=>!records.includes(r))))return fail('crosstable_selection');
 const options={};
 for(const key of ['pedDisplayNameSeparator','pedSlidingUniqueValues','pedSlidingUniqueValuesLimit','pedUniqueValueNames']){
  const value=component(base+key+';ValueControl'),variable=component(base+key+';VariableControl'),button=component(base+key+';SwitchButton');
  if(!value||!variable||!button||button.pressed===true||variable.getValue?.()!=null||!value.isVisible?.(true))return fail('crosstable_variable_binding');
  options[key]={value:value.getValue?.(),variable:null,switch_pressed:false,disabled:value.isDisabled?.()===true};
 }
 if(typeof options.pedDisplayNameSeparator.value!=='string'||typeof options.pedSlidingUniqueValues.value!=='boolean'
  ||typeof options.pedUniqueValueNames.value!=='boolean'||!Number.isSafeInteger(options.pedSlidingUniqueValuesLimit.value)
  ||options.pedSlidingUniqueValuesLimit.value<0)return fail('crosstable_options');
 const dialogs=[];
 for(const name of ['ColumnEditDialog','FactorEditDialog']){
  const t=prefix+';WizrdMCF;'+name,es=exact(t),c=es.length===1&&component(t);
  if(!c?.isVisible?.(true))continue;
  const controls=[];
  for(const e of es[0].querySelectorAll('[data-tid]')){const x=globalThis.Ext?.getCmp?.(e.id),tid=e.getAttribute('data-tid');
   if(x?.el?.dom!==e||!x.isVisible?.(true)||typeof x.getValue!=='function')continue;
   const value=x.getValue();if(!['string','boolean','number'].includes(typeof value))continue;
   controls.push({tid,value,disabled:x.isDisabled?.()===true});
  }
  dialogs.push({name,tid:t,controls});
 }
 return {verified:true,inventory_complete:true,state_source:'cached_crosstable_source_store',input_fields:fields,
  service_fields:service,selected_available:selected[0].map(r=>String(r.internalId)),selected_used:selected[1].map(r=>String(r.internalId)),
  options,dialogs,settings_applied:false};
}
