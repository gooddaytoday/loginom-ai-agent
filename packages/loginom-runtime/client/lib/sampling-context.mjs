import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeSamplingContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readSamplingContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readSamplingBrowser.toString()})`;}
export async function readSamplingContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readSamplingBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'sampling_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'sampling_node_changed'};
 return {...result,node_context:after};
}
// Only local cached grid records and rendered controls in the owned wizard.
// The sequence form is created by the ordinary method-selection UI gesture.
export function readSamplingBrowser(prefix){
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const roots=['SamplingComponentWizard','PartitionComponentWizard'].flatMap(kind=>exact(prefix+';WizrdMCF;'+kind).filter(e=>e.checkVisibility({checkVisibilityCSS:true})).map(root=>({kind,root})));
 const fail=(reason,details)=>({verified:false,reason,...(details?{details}:{})});
 if(roots.length!==1)return fail('sampling_root');
 const {kind,root}=roots[0],base=prefix+';WizrdMCF;'+kind+';',shells=exact(prefix+';WizrdMCF');
 if(shells.length!==1||!shells[0].contains(root))return fail('sampling_shell');
 const shell=shells[0];
 const component=tid=>{const es=exact(tid),c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]&&shell.contains(es[0])?c:null;};
 const methodControl=component(base+'pedSamplingMethod;ValueControl');
 if(!methodControl||typeof methodControl.getRawValue!=='function')return fail('sampling_method');
 const method=methodControl.getRawValue();
 if(typeof method!=='string'||!method)return fail('sampling_method_value');
 const readGrid=(suffix,limit=4)=>{
  const es=[...document.querySelectorAll('[data-tid$='+JSON.stringify(';'+suffix)+']')].filter(e=>shell.contains(e)&&e.checkVisibility({checkVisibilityCSS:true}));
  const element=es.length===1?es[0]:null,grid=element&&globalThis.Ext?.getCmp?.(element.id);
  const store=grid?.el?.dom===element?grid.getStore?.():null,data=store?.getData?.(),items=data?.items,source=data?.getSource?.()?.items;
  const chained=store?.$className==='Ext.data.ChainedStore'&&['StratifiedMethodForm;grdStratifiedGrid','BiasedMethodForm;grdBiasedColumns'].includes(suffix);
  const parent=chained?store.getSource?.():null,parentItems=parent?.getData?.()?.items;
  const details={suffix,matches:es.length,grid_tid:element?.getAttribute('data-tid')??null,component_class:grid?.$className??null,store_class:store?.$className??null,count:store?.getCount?.()??null};
  if(!element||grid?.el?.dom!==element)return {verified:false,...details};
  if(!chained&&store?.$className!=='Ext.data.Store'||store.isLoading?.()||store.isBufferedStore||!Array.isArray(items)||items.length>limit||store.getCount?.()!==items.length)return {verified:false,...details};
  if(chained){
   // Native field grids chain/filter the cached input-column inventory.
   // Admit only a complete, idle local parent and its exact record objects.
   if(parent?.$className!=='Ext.data.Store'||parent.isLoading?.()||parent.isBufferedStore||parent.getRemoteFilter?.()===true||parent.getRemoteSort?.()===true
    ||!Array.isArray(parentItems)||parentItems.length>128||parent.getCount?.()!==parentItems.length||new Set(parentItems).size!==parentItems.length
    ||items.some(r=>!parentItems.includes(r))||source&&(!Array.isArray(source)||source.some(r=>!parentItems.includes(r))||items.some(r=>!source.includes(r))))return {verified:false,...details};
  }else if(source&&(source.length!==items.length||source.some(r=>!items.includes(r))))return {verified:false,...details};
  const selected=grid.getSelectionModel?.().getSelection?.();
  if(!Array.isArray(selected)||selected.some(r=>!items.includes(r)))return {verified:false,...details,selection:false};
  const rows=items.map(r=>{
   const elements=[...grid.el.dom.querySelectorAll('[data-recordid]')].filter(e=>e.getAttribute('data-recordid')===String(r.internalId));
   const primitive=Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(r.data??{})).filter(([,d])=>Object.hasOwn(d,'value')&&(d.value===null||['string','number','boolean'].includes(typeof d.value))).map(([k,d])=>[k,d.value]));
   return {record_id:String(r.internalId),values:primitive,text:elements.map(e=>e.textContent.trim()).join(' '),tids:[...new Set(elements.flatMap(e=>[...e.querySelectorAll('[data-tid]')].map(e=>e.getAttribute('data-tid'))))],selected:selected.includes(r)};
  });
  if(new Set(rows.map(r=>r.record_id)).size!==rows.length)return {verified:false,...details,duplicate_records:true};
  return {verified:true,rows,base:details.grid_tid.slice(0,details.grid_tid.lastIndexOf(';'))};
 };
 const sizeGrid=readGrid('SizeGridForm;grdDataSet'),sequenceGrid=method==='Последовательный'?readGrid('SequenceMethodForm;grdSequence'):null;
 if(!sizeGrid.verified||sequenceGrid&&!sequenceGrid.verified)return fail('sampling_grid',{sizes:sizeGrid,sequence:sequenceGrid,method});
 const sizes=sizeGrid.rows,sequence=sequenceGrid?.rows??[],partition=kind==='PartitionComponentWizard';
 if(sizes.length<(partition?2:1)||sizes.length>(partition?3:2))return fail('sampling_size_count');
 const units=Array.from({length:partition?2:1},(_,index)=>{
  const cells=exact(sizeGrid.base+';colSizeType_'+index).filter(e=>shell.contains(e)&&e.querySelectorAll('img[role=button]').length===1);
  if(cells.length!==1)return null;
  const icon=cells[0].querySelector('img[role=button]'),row=cells[0].closest('[data-recordid]');if(!row)return null;
  // Partition's summary repeats colSizeType_1. Reuse the reference already
  // assigned by workspace.observe to this exact row's image; never allocate
  // one here or infer it from the ambiguous cell's identity anchor.
  const observed=globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')],iconRef=observed?.document===document?observed.ids?.get(icon):null;
  if(typeof iconRef!=='string'||observed.refs?.get(iconRef)?.deref()!==icon)return null;
  const controls=role=>[...row.querySelectorAll('[data-tid]')].filter(e=>new RegExp(';col'+role+'Size;FloatPropEdit(?:-[0-9]+)?;PropContainer;ValueContainer;ValueControl$').test(e.getAttribute('data-tid')??''));
  const absolute=controls('Absolute'),relative=controls('Relative');
  if(absolute.length!==1||relative.length!==1)return null;
  const ac=component(absolute[0].getAttribute('data-tid')),rc=component(relative[0].getAttribute('data-tid'));
  if(!ac||!rc||typeof ac.getValue!=='function'||typeof ac.isDisabled!=='function'||typeof rc.isDisabled!=='function')return null;
  const value=ac.getValue(),absoluteSize=typeof value==='number'?value:typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;
  const ad=ac.isDisabled(),rd=rc.isDisabled();
  if(!Number.isSafeInteger(absoluteSize)||absoluteSize<0||typeof ad!=='boolean'||typeof rd!=='boolean'||ad===rd)return null;
  return {index,record_id:row.getAttribute('data-recordid'),tid:cells[0].getAttribute('data-tid'),icon_ref:iconRef,absolute_size:absoluteSize,absolute_control_tid:absolute[0].getAttribute('data-tid'),unit:ad?'percent':'rows',
   text:cells[0].textContent.trim(),title:icon.getAttribute('title')??'',tooltip:icon.getAttribute('data-qtip')??'',class_name:icon.getAttribute('class')??''};
 });
 if(units.some(u=>u===null))return fail('sampling_size_units',{size_rows:sizes});
 if(sequenceGrid&&sequence.length!==(partition?3:2))return fail('sampling_group_count');
 const priority=exact(base+'cntTestPriority;cnt;chb;InputEl');
 const testPriority=priority.length===1&&typeof priority[0].checked==='boolean'?priority[0].checked:null;
 const seedControl=component(base+'RandSeedEdit;edtRandSeed;ValueControl');
 const rawSeed=seedControl?.getValue?.(),seed=(typeof rawSeed==='number'||typeof rawSeed==='string'&&/^\d+$/.test(rawSeed))&&Number.isSafeInteger(Number(rawSeed))?Number(rawSeed):null;
 const strata=method==='Стратифицированный'?readGrid('StratifiedMethodForm;grdStratifiedGrid',128):null;
 const biasFields=method==='Отбор со смещением'?readGrid('BiasedMethodForm;grdBiasedColumns',128):null;
 const bias=method==='Отбор со смещением'?readGrid('BiasedMethodForm;grdBiased',128):null;
 for(const grid of [strata,biasFields].filter(g=>g?.verified))for(const row of grid.rows){
  const names=row.tids.filter(t=>t.startsWith(grid.base+';colDisplayName_'));
  if(names.length!==1)return fail('sampling_field_identity');
  row.values.Name=names[0].slice((grid.base+';colDisplayName_').length);
  if(grid===strata){
   const flags=exact(grid.base+';grdStratifiedGrid;headercontainer;UsageFlag_'+row.values.Name);
   const images=flags.length===1?flags[0].querySelectorAll('img.x-grid-checkcolumn'):[];
   if(images.length!==1)return fail('sampling_strata_flag');
   row.values.UsageFlag=images[0].classList.contains('x-grid-checkcolumn-checked');
  }
 }
 if(bias?.verified)for(const row of bias.rows){
  const values=row.tids.filter(t=>t.startsWith(bias.base+';colBiasedValue_'));
  const factorColumn=component(bias.base+';colBiasedFactor');
  if(values.length!==1||typeof factorColumn?.dataIndex!=='string'||typeof row.values[factorColumn.dataIndex]!=='number')return fail('sampling_bias_category');
  const cells=exact(values[0]);if(cells.length!==1)return fail('sampling_bias_value');
  row.values.Value=cells[0].textContent;row.values.Factor=row.values[factorColumn.dataIndex];
 }
 if(strata&&!strata.verified||biasFields&&!biasFields.verified||bias&&!bias.verified)return fail('sampling_method_grid',{strata,biasFields,bias});
 return {verified:true,inventory_complete:true,seed,test_priority:testPriority,strata,bias_fields:biasFields,bias,kind:partition?'data_partition':'sampling',base,sizes_base:sizeGrid.base,sequence_base:sequenceGrid?.base??null,sequence_materialized:!!sequenceGrid,method,sizes,units,sequence,settings_applied:false};
}
