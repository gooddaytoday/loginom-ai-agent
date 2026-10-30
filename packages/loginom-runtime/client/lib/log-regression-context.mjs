import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeLogRegressionContextCode(binding) {
 validatePreparedNodeContext(binding);
 return `async page=>(${readLogRegressionContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readLogRegressionBrowser.toString()})`;
}

export async function readLogRegressionContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readLogRegressionBrowser) {
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'logregression_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'logregression_node_changed'};
 return {...result,node_context:after};
}

// Observe the complete local collection; never load a proxy or execute a
// conversion. Record IDs survive edits, whereas field names and DOM tids change.
// Input-source correspondence is a separate proof, not inferred from labels.
export function readLogRegressionBrowser(prefix) {
 const exactValue=tid=>{const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')],c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]&&typeof c.getValue==='function'?c:null;};
 const active=tid=>{const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')],e=es[0],b=e?.getBoundingClientRect();return es.length===1&&e.checkVisibility({checkVisibilityCSS:true})&&b.width>0&&b.height>0&&b.x>=0&&b.y>=0&&b.x<innerWidth&&b.y<innerHeight;};
 for(const [kind,card,names] of [
  ['parameters','LogRegressionWizard',['pedAutoMethod','pedRegressionMethod','pedDenormalize','pedUseDetailedSettings','pedShowRefCoeffs','pedEventType','pedEventId','pedUseScoring','pedSetupCalibration']],
  ['details','LogRegressionWizard-1',['pedEpsilon','pedIntercept','pedThreshold']]
 ]){
  const base=prefix+';WizrdMCF;'+card;if(!active(base))continue;
  const values={},switches={};
  for(const name of names){const c=exactValue(base+';'+name+';ValueControl');if(!c)return {verified:false,reason:'logregression_control'};values[name]=c.getValue();const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(base+';'+name+';SwitchButton')+']')];if(es.length>1)return {verified:false,reason:'logregression_switch'};switches[name]=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id)?.pressed===true;}
  if(kind==='parameters'&&(!Number.isInteger(values.pedRegressionMethod)||!['pedAutoMethod','pedDenormalize','pedUseDetailedSettings','pedShowRefCoeffs'].every(k=>typeof values[k]==='boolean')))return {verified:false,reason:'logregression_initializing'};
  if(kind==='details'&&(!(typeof values.pedEpsilon==='number'&&values.pedEpsilon>0)||typeof values.pedIntercept!=='boolean'))return {verified:false,reason:'logregression_initializing'};
  const classes=[];
  if(kind==='parameters'){
   const c=exactValue(base+';pedEventId;ValueControl'),store=c?.getStore?.(),records=store?.getData?.()?.items;
   if(store?.isLoading?.()||!Array.isArray(records)||records.length!==store.getCount?.()||records.length>1000)return {verified:false,reason:'logregression_classes'};
   for(const r of records){const index=r.get(c.valueField),caption=r.get(c.displayField);
    if(!Number.isInteger(index)||index<0||typeof caption!=='string')return {verified:false,reason:'logregression_class_record'};
    const description=r.get('Description'),match=typeof description==='string'&&description.match(/^\((.*)\)$/s);
    if(!match||caption!==String(index))return {verified:false,reason:'logregression_class_description'};
    classes.push({index,label:match[1],option_label:caption+' '+description});
   }
   if(new Set(classes.map(c=>c.index)).size!==classes.length||new Set(classes.map(c=>c.label)).size!==classes.length)return {verified:false,reason:'logregression_class_identity'};
  }
  return {verified:true,kind,values,switches,...(kind==='parameters'?{classes}:{})};
 }
 const partitionBase=prefix+';WizrdMCF;LearnPartitionWizard';
 if(active(partitionBase)){
  const values={},names={train:'SizeGridForm;colRelativeSize;FloatPropEdit;PropContainer;ValueContainer',test:'SizeGridForm;colRelativeSize;FloatPropEdit-1;PropContainer;ValueContainer',sampling:'pedSamplingMethod',validation:'ValidationSettings;pedLearnValidationMethod'};
  for(const [key,path] of Object.entries(names)){const c=exactValue(partitionBase+';'+path+';ValueControl');if(!c||!Number.isFinite(c.getValue()))return {verified:false,reason:'logregression_partition'};values[key]=c.getValue();}
  return {verified:true,kind:'partition',values};
 }

 const normBase=prefix+';WizrdMCF;NormTuneWizard;',normRoots=[...document.querySelectorAll('[data-tid='+JSON.stringify(normBase.slice(0,-1))+']')];
 if(active(normBase.slice(0,-1))){
  const fail=reason=>({verified:false,reason}),exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
  const component=t=>{const es=exact(t),c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
  const grid=component(normBase+'grdNormColumns;tbl'),store=grid?.getStore?.(),records=store?.getData?.()?.items;
  if(store?.$className!=='Ext.data.Store'||store.getProxy?.()?.$className!=='bg.ext.CollectionProxy'||store.isLoading?.()||store.isBufferedStore||!Array.isArray(records)||records.length>1000||store.getCount?.()!==records.length)return fail('logregression_norm_inventory');
  const selected=grid.getSelectionModel?.().getSelection?.();if(!Array.isArray(selected)||selected.some(r=>!records.includes(r)))return fail('logregression_norm_selection');
  const fields=[];for(const r of records){const d=r?.data;if(!r?.isModel||typeof d?.Name!=='string'||![3,4,5].includes(d.DataType)||![3,4].includes(d.UsageType)||!Number.isInteger(d.NormType)||typeof d.Importance!=='number'||typeof d.Irremovable!=='boolean')return fail('logregression_norm_record');
   fields.push({record_id:String(r.internalId),name:d.Name,label:d.DisplayName,type:d.DataType===3?'real':d.DataType===4?'integer':'string',index:d.Index,norm_type:d.NormType,importance:d.Importance,irremovable:d.Irremovable});}
  if(new Set(fields.map(f=>f.name)).size!==fields.length||new Set(fields.map(f=>f.record_id)).size!==fields.length)return fail('logregression_norm_identity');
  const editorBase=prefix+';WizrdMCF;ColumnsEditForm',editors=exact(editorBase).filter(e=>e.checkVisibility({checkVisibilityCSS:true}));let editor=null;
  if(editors.length){const c=component(editorBase)?.Controller,rs=c?.FRecords,choice=component(editorBase+';cbxNormType');
   if(editors.length!==1||c?.FView?.el?.dom!==editors[0]||!Array.isArray(rs)||rs.length===0||rs.length!==selected.length||rs.some(r=>!records.includes(r)||!selected.includes(r))||!Number.isInteger(choice?.getValue?.()))return fail('logregression_norm_editor');
   editor={root_tid:editorBase,record_ids:rs.map(r=>String(r.internalId)),norm_type:choice.getValue()};
  }
  const status=exact(normBase+'txtActivationPortStatus'),input=status.length===1?status[0].querySelector('input'):null;
  return {verified:true,kind:'normalization',inventory_complete:true,fields,selected:selected.map(r=>String(r.internalId)),editor,source_status:typeof input?.value==='string'?input.value:null};
 }

 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;TuneDataSourceInputPortWizard;';
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const roots=exact(base.slice(0,-1)),root=roots[0];
 if(roots.length!==1||!root.checkVisibility({checkVisibilityCSS:true}))return fail('logregression_root');
 if([...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>e.checkVisibility({checkVisibilityCSS:true})))return fail('logregression_mask');
 if(['EditTuneColumnDefForm',prefix+';WizrdMCF;EditTuneColumnDefForm'].some(t=>exact(t).some(e=>e.checkVisibility({checkVisibilityCSS:true}))))return fail('logregression_editor');
 const component=key=>{const es=exact(base+key),e=es[0],c=es.length===1&&globalThis.Ext?.getCmp?.(e.id);return c?.el?.dom===e&&root.contains(e)?c:null;};
 const grid=component('grdTargetColumns'),store=grid?.getStore?.(),proxy=store?.getProxy?.();
 const data=store?.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
 if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()
  ||proxy?.$className!=='bg.ext.CollectionProxy'||!proxy.pendingOperations||Object.keys(proxy.pendingOperations).length
  ||store.currentPage!==1||store.getRemoteFilter?.()!==false||store.getRemoteSort?.()!==false
  ||!Array.isArray(records)||records.length>1000||store.getCount?.()!==records.length||store.getTotalCount?.()!==records.length
  ||source&&(!Array.isArray(source)||source.length!==records.length||new Set(source).size!==records.length||source.some(r=>!records.includes(r))))return fail('logregression_inventory');
 const selection=grid.getSelectionModel?.().getSelection?.();
 if(!Array.isArray(selection)||selection.some(r=>!records.includes(r)))return fail('logregression_selection');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},kinds={0:'Неопределенное',1:'Непрерывный',2:'Дискретный'};
 const ids=new Set(),fieldIds=new Set(),names=new Set(),fields=[];
 for(const [index,r] of records.entries()) {
  const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||!Number.isSafeInteger(d?.ID)||d.ID<0||fieldIds.has(d.ID)||d.Index!==index
   ||typeof d.Name!=='string'||!d.Name||d.Name.length>128||names.has(d.Name.toLowerCase())
   ||typeof d.DisplayName!=='string'||d.DisplayName.length>256||!types[d.DataType]||!kinds[d.DataKind]
   ||![0,3,4].includes(d.UsageType)||d.GroupField!==''||d.Broken!==false||d.ReverseBroken!==false)return fail('logregression_record');
  ids.add(id);fieldIds.add(d.ID);names.add(d.Name.toLowerCase());
  fields.push({index,record_id:id,field_id:String(d.ID),name:d.Name,label:d.DisplayName,type:types[d.DataType],
   data_kind:kinds[d.DataKind],usage_type:d.UsageType,origin_type:d.OriginType,selected:selection.includes(r)});
 }
 return {verified:true,inventory_complete:true,state_source:'cached_logregression_role_store',fields,settings_applied:false,source_identity_verified:false};
}
