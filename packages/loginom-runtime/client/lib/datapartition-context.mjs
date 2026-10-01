import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeDataPartitionContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readDataPartitionContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readDataPartitionBrowser.toString()})`;
}

export async function readDataPartitionContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readDataPartitionBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'data_partition_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'data_partition_node_changed'};
 return {...result,node_context:after};
}

// Only complete local UI stores and rendered controls are observed. Reading
// settings does not establish execution freshness or server sampling semantics.
export function readDataPartitionBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;PartitionComponentWizard;';
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const roots=exact(base.slice(0,-1));
 if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('data_partition_root');
 const cmp=key=>{
  const es=exact(base+key);
  if(es.length!==1||!roots[0].contains(es[0]))return null;
  const c=globalThis.Ext?.getCmp?.(es[0].id);
  return c?.el?.dom===es[0]?c:null;
 };
 const records=(grid,completeSource=false)=>{
  const chain=grid?.getStore?.();
  const store=completeSource&&chain?.$className==='Ext.data.ChainedStore'?chain.getSource?.():chain;
  const data=store?.getData?.(),rs=data?.items,source=data?.getSource?.()?.items;
  if(completeSource&&chain!==store&&(chain.isLoading?.()||chain.getData?.()?.items?.some(r=>!rs?.includes(r))))return null;
  if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||!Array.isArray(rs)||rs.length>1000
   ||store.getCount?.()!==rs.length||source&&(source.length!==rs.length||source.some(r=>!rs.includes(r)))
   ||rs.some(r=>!r?.isModel||!r.internalId)||new Set(rs.map(r=>String(r.internalId))).size!==rs.length)return null;
  return rs;
 };
 const method=cmp('pedSamplingMethod;ValueControl')?.getValue?.(),modes=['random','uniform','stratified','sequential','biased'];
 if(!Number.isInteger(method)||!modes[method])return fail('data_partition_method');
 const sizes=form=>{
  const rs=records(cmp(form+';grdDataSet'));
  if(!rs||rs.length!==2)return null;
  const result=rs.map((r,index)=>{
   const d=r.data,editor=d.SamplingType===0?d.AbsoluteEditor:d.SamplingType===1?d.RelativeEditor:null;
   const value=editor?.Controller?.Items?.ValueControl?.getValue?.();
   const owner=editor?.el?.dom,tid=owner?.getAttribute('data-tid');
   const expected='Partition.'+(index===0?'Teach':'Test')+(form==='SizeGridForm'?'DataSetSize':'GroupSize');
   if(d.SizePath!==expected||!editor||!owner||!roots[0].contains(owner)||!tid||!Number.isFinite(value)||value<0)return null;
   return {role:index===0?'training':'test',record_id:String(r.internalId),size_path:d.SizePath,
    unit:d.SamplingType===0?'rows':'percent',value,editor_tid:tid,enabled:!editor.isDisabled?.()};
  });
  return result.some(r=>!r)?null:result;
 };
 const dataSets=sizes('SizeGridForm');
 if(!dataSets)return fail('data_partition_sizes');
 const priority=cmp('cntTestPriority;cnt;chb')?.getValue?.(),position=cmp('pedTestPriorityPosition;ValueControl')?.getValue?.();
 const seed=cmp('RandSeedEdit;edtRandSeed;ValueControl')?.getValue?.();
 if(typeof priority!=='boolean'||![0,1,2].includes(position)||typeof seed!=='string'||seed.length>32
  ||seed!==''&&(!/^[1-9][0-9]*$/.test(seed)||!Number.isSafeInteger(Number(seed))))return fail('data_partition_options');
 const parameters={training:{unit:dataSets[0].unit,value:dataSets[0].value},test:{unit:dataSets[1].unit,value:dataSets[1].value},
  priority:priority?'test':'training',test_position:['algorithm','start','end'][position],seed:seed===''?{policy:'always_random'}:{policy:'fixed',value:Number(seed)}};
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},kinds={1:'Непрерывный',2:'Дискретный'};
 let inputFields=[],methodRows=[],groups=null,selectedRecords=[],biasEditor=null;
 if(method===1){
  groups=sizes('RandomUniformMethodForm;SizeGridForm');
  if(!groups)return fail('data_partition_groups');
  parameters.uniform={training:{unit:groups[0].unit,value:groups[0].value},test:{unit:groups[1].unit,value:groups[1].value}};
 }
 if(method===2||method===4){
  const rs=records(cmp(method===2?'StratifiedMethodForm;grdStratifiedGrid':'BiasedMethodForm;grdBiasedColumns'),true);
  if(!rs)return fail('data_partition_fields');
  inputFields=rs.map(r=>{const d=r.data;return {record_id:String(r.internalId),index:d.Index,name:d.Name,label:d.DisplayName,type:types[d.DataType],data_kind:kinds[d.DataKind],usage:d.UsageType,used:d.UsageFlag};});
  if(inputFields.some(f=>typeof f.name!=='string'||!f.name||typeof f.label!=='string'||!f.type||!f.data_kind||typeof f.used!=='boolean')
   ||new Set(inputFields.map(f=>f.name)).size!==inputFields.length)return fail('data_partition_field_identity');
  if(method===2){
   const complete=cmp('StratifiedMethodForm;pedCompleteUniqueValues;ValueControl')?.getValue?.();
   if(typeof complete!=='boolean')return fail('data_partition_complete_unique');
   parameters.stratified={fields:inputFields.filter(f=>f.used).map(f=>f.name),complete_unique_values:complete};
  }
 }
 if(method===3){
  const grid=cmp('SequenceMethodForm;grdSequence'),rs=records(grid);
  const selected=grid?.getSelectionModel?.().getSelection?.();
  if(!Array.isArray(selected)||selected.some(r=>!rs?.includes(r)))return fail('data_partition_sequence_selection');
  selectedRecords=selected.map(r=>String(r.internalId));
  if(!rs||rs.length!==3||new Set(rs.map(r=>r.data.PartitionType)).size!==3||rs.some(r=>![0,1,2].includes(r.data.PartitionType)))return fail('data_partition_sequence');
  methodRows=rs.map(r=>({record_id:String(r.internalId),role:['training','test','unused'][r.data.PartitionType],order:r.data.SequenceOrder,count:r.data.SamplingCount,percent:r.data.SamplingPercent}));
  parameters.sequential={order:methodRows.map(r=>r.role)};
 }
 if(method===4){
  const grid=cmp('BiasedMethodForm;grdBiased'),rs=records(grid);
  if(!rs)return fail('data_partition_bias_inventory');
  methodRows=rs.map(r=>({record_id:String(r.internalId),index:r.data.Index,value:r.data.Value,factor:r.data.Factor,count:r.data.Count,source_count:r.data.RefCount}));
  if(methodRows.some(r=>!Number.isFinite(r.factor)||r.factor<0||!Number.isSafeInteger(r.count)||r.count<0||!Number.isSafeInteger(r.source_count)||r.source_count<0))return fail('data_partition_bias_values');
  const plugin=grid.editingPlugin,context=plugin?.context;
  if(plugin?.editing===true){
   if(context?.grid!==grid||!rs.includes(context.record)||!['Factor','Count'].includes(context.field))return fail('data_partition_bias_editor');
   biasEditor={record_id:String(context.record.internalId),property:context.field==='Factor'?'factor':'count'};
  }
  const selected=inputFields.filter(f=>f.usage===3);
  if(selected.length>1)return fail('data_partition_bias_field');
  const chosen=selected[0];
  if(chosen){
   const typed=value=>value===null?{type:chosen.type,is_null:true,value:null}
    :chosen.type==='string'&&typeof value==='string'||chosen.type==='boolean'&&typeof value==='boolean'||chosen.type==='real'&&Number.isFinite(value)
     ?{type:chosen.type,is_null:false,value}
     :chosen.type==='integer'&&Number.isSafeInteger(value)?{type:'integer',is_null:false,value:String(value)}:null;
   const adjustments=methodRows.map(r=>({value:typed(r.value),factor:r.factor}));
   if(adjustments.every(r=>r.value))parameters.biased={field:chosen.name,adjustments};
  }
 }
 return {verified:true,inventory_complete:true,state_source:'cached_data_partition_ui',mode:modes[method],parameters,input_fields:inputFields,
  size_rows:dataSets,group_rows:groups,method_rows:methodRows,selected_records:selectedRecords,bias_editor:biasEditor,settings_applied:false};
}
