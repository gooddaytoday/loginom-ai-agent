import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeCrossTableContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readCrossTableContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readCrossTableBrowser.toString()})`;
}

export async function readCrossTableContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readCrossTableBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'cross_table_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'cross_table_node_changed'};
 return {...result,node_context:after};
}

export function readCrossTableBrowser(prefix){
 const fail=reason=>({verified:false,reason});
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const visible=element=>element.checkVisibility({checkVisibilityCSS:true});
 const base=prefix+';WizrdMCF;CrossTabWizard;',roots=exact(base.slice(0,-1));
 if(roots.length!==1||!visible(roots[0]))return fail('cross_table_root');
 const grids=['grdDataFields','grdUsedFields'].map(name=>exact(base+name));
 if(grids.some(items=>items.length!==1||!roots[0].contains(items[0])))return fail('cross_table_grids');
 const components=grids.map(items=>globalThis.Ext?.getCmp?.(items[0].id));
 if(components.some((component,index)=>component?.el?.dom!==grids[index][0]))return fail('cross_table_grid_binding');
 const chains=components.map(component=>component.getStore?.()),sources=chains.map(chain=>chain?.getSource?.());
 if(chains.some(chain=>chain?.$className!=='Ext.data.ChainedStore'||chain.isLoading?.())||sources[0]!==sources[1])return fail('cross_table_source_binding');
 const store=sources[0],data=store?.getData?.(),records=data?.items,unfiltered=data?.getSource?.()?.items;
 if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()
  ||!Array.isArray(records)||records.length>1003||store.getCount?.()!==records.length
  ||unfiltered&&(unfiltered.length!==records.length||unfiltered.some(record=>!records.includes(record))))return fail('cross_table_source_inventory');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},fields=[],ids=new Set(),indexes=new Set();
 for(const record of records){
  const value=record?.data,id=String(record?.internalId??'');
  if(!record?.isModel||!id||ids.has(id)||!Number.isSafeInteger(value?.Disposition)||![0,1,2,3].includes(value.Disposition))return fail('cross_table_record');
  ids.add(id);
  if(value.DataType===0){
   if(value.DisplayName!==''||value.GroupFunctions!==0||![1,2,3].includes(value.Disposition))return fail('cross_table_placeholder');
   continue;
  }
  if(!types[value.DataType]||typeof value.DisplayName!=='string'||value.DisplayName.length>256
   ||!Number.isSafeInteger(value.Index)||value.Index<0||value.Index>1000
   ||!Number.isSafeInteger(value.Order)||value.Order<0
   ||!Number.isSafeInteger(value.GroupFunctions)||value.GroupFunctions<0||value.GroupFunctions>16383
   ||typeof value.IsCountCase!=='boolean'||typeof value.NullGroup!=='boolean'||typeof value.OtherGroup!=='boolean'
   ||!Number.isSafeInteger(value.SlidingUniqueValuesMinCount)||value.SlidingUniqueValuesMinCount<0)return fail('cross_table_field');
  if(!value.IsCountCase){if(indexes.has(value.Index))return fail('cross_table_duplicate_index');indexes.add(value.Index);}
  fields.push({record_id:id,source_index:value.Index,label:value.DisplayName,type:types[value.DataType],
   data_kind:value.DataKind,disposition:value.Disposition,order:value.Order,functions:value.GroupFunctions,
   is_count_case:value.IsCountCase,null_group:value.NullGroup,other_group:value.OtherGroup,
   sliding_min:value.SlidingUniqueValuesMinCount});
 }
 const options={};
 for(const name of ['pedSlidingUniqueValues','pedSlidingUniqueValuesLimit','pedUniqueValueNames','pedDisplayNameSeparator']){
  const items=exact(base+name+';ValueControl'),component=items.length===1&&globalThis.Ext?.getCmp?.(items[0].id);
  if(!component||component.el?.dom!==items[0]||typeof component.getValue!=='function')return fail('cross_table_option');
  options[name]=component.getValue();
 }
 if(typeof options.pedSlidingUniqueValues!=='boolean'||options.pedSlidingUniqueValuesLimit!==null
  &&(!Number.isSafeInteger(options.pedSlidingUniqueValuesLimit)||options.pedSlidingUniqueValuesLimit<0)
  ||typeof options.pedUniqueValueNames!=='boolean'
  ||typeof options.pedDisplayNameSeparator!=='string')return fail('cross_table_option_value');
 const selected=components[1].getSelectionModel?.().getSelection?.(),available=components[0].getSelectionModel?.().getSelection?.();
 if(!Array.isArray(selected)||selected.some(record=>!records.includes(record))
  ||!Array.isArray(available)||available.some(record=>!records.includes(record)))return fail('cross_table_selection');
 const ordered=disposition=>fields.filter(field=>field.disposition===disposition).sort((a,b)=>a.order-b.order);
 const columns=ordered(1),rows=ordered(2),facts=ordered(3);
 if([columns,rows,facts].some(items=>items.some((field,index)=>field.order!==index)))return fail('cross_table_order');
 return {verified:true,inventory_complete:true,state_source:'cached_cross_table_source_store',
  input_fields:fields,columns,rows,facts,selected_records:selected.map(record=>String(record.internalId)),
  selected_available_records:available.map(record=>String(record.internalId)),options};
}
