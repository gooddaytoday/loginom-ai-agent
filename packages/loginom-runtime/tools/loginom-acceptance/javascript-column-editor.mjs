import {createHash} from 'node:crypto';
import {withJavascriptWizardMasks} from './javascript-wizard-masks.mjs';
// Serialized, read-only UI/cache observer. Held references belong to this
// operator only. No server proxy property, form method or store mutation is used.
export const observeJavascriptColumnEditor=withJavascriptWizardMasks(function observeJavascriptColumnEditor({context,held,phase='capture',expectedCount,target,kind='click',option,readField,readHelper=false,readPicker=false,readDeclaredControls=false,readUsagePicker=false,usageAction=null,expectedUsage=4,expectedUsageLabel='Выходное',expectedType,expectedLabel}) {
  const c=held?.context??context,checks={};
  const finish=(status,reason,extra={})=>({status,reason,checks,...extra});
  const result=(status,reason,extra={})=>phase==='capture'?{snapshot:finish(status,reason,extra)}:finish(status,reason,extra);
  const value=(object,key)=>object&&Object.getOwnPropertyDescriptor(object,key)?.value;
  const dom=control=>value(value(control,'el'),'dom');
  const dense=(array,cap)=>{
    if(!Array.isArray(array)||array.length>cap)return null;
    const items=[];
    for(let i=0;i<array.length;i++){const item=value(array,String(i));if(!item||typeof item!=='object')return null;items.push(item);}
    return new Set(items).size===items.length?items:null;
  };
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0
    &&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
  const app=globalThis.bg?.app,main=app?.Application?.FInstance?.FMainForm,tab=main?.Items?.Workspace?.getActiveTab?.();
  const connection=main?.FMapTree?.FServerConnection,model=tab?.Controller?.FController;
  checks.connection=connection?.Connected===true&&connection.UserName===c.account&&app?.Version===c.build;
  checks.owner=tab===c.binding.tab&&tab?.Controller?.Node?.data?.node===c.native&&model?.FModelNode===c.binding.nodeData
    &&dom(value(model,'FView'))===c.root&&visible(c.root);
  if(!checks.connection||!checks.owner)return result('refused','connection_or_wizard_changed');
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const pageTid=c.prefix+';WizrdMCF;JavaScriptColumnsWizard',pages=exact(pageTid),page=pages.length===1?pages[0]:null;
  const pageView=page&&globalThis.Ext?.getCmp?.(page.id);
  checks.page=!!page&&visible(page)&&c.root.contains(page)&&dom(pageView)===page;
  const grids=exact(pageTid+';grdTargetColumns;tbl'),grid=grids.length===1?grids[0]:null;
  const view=grid&&globalThis.Ext?.getCmp?.(grid.id),store=view?.getStore?.();
  checks.grid=!!grid&&!!page&&page.contains(grid)&&dom(view)===grid;
  checks.store=store?.$className==='Ext.data.Store'&&!store.isBufferedStore;
  if(!checks.page||!checks.grid||!checks.store)return result('refused','page_or_store_unconfirmed');
  const localItems=dense(value(value(model,'FWizardItems'),'FItems'),32),matches=[];
  checks.wizard_items=!!localItems;
  for(const item of localItems??[]){
    const localPages=dense(value(item,'FPages'),32);
    if(!localPages){checks.wizard_items=false;break;}
    if(localPages.includes(pageView))matches.push(item);
  }
  const vendor=matches.length===1?value(matches[0],'FWizard'):null;
  checks.vendor=checks.wizard_items&&!!vendor&&value(vendor,'FWizardForm')===model;
  checks.vendor_store=!!vendor&&value(vendor,'FTargetStore')===store;
  if(!checks.vendor||!checks.vendor_store)return result('refused','column_page_vendor_unconfirmed');
  if(held){
    checks.original=document===held.document&&connection===held.connection&&model===held.model&&page===held.page&&pageView===held.pageView
      &&grid===held.grid&&view===held.view&&store===held.store&&vendor===held.vendor;
    if(!checks.original)return result('refused','original_page_store_changed');
  }
  const data=store.getData?.(),records=dense(data?.items,64),source=data?.getSource?.()?.items;
  checks.cache=!!records&&store.getCount()===records.length
    &&(!source||(!!dense(source,64)&&source.length===records.length&&source.every(r=>records.includes(r))));
  const totalCount=store.getTotalCount(),cacheCounts={record_count:records?.length??null,loaded_count:store.getCount(),proxy_total_count:totalCount,source_count:Array.isArray(source)?source.length:null};
  const busy=store.isLoading?.()===true;
  if(busy)return result(held?'pending':'refused','store_loading',cacheCounts);
  if(!checks.cache)return result('refused','filtered_or_incomplete_cache',cacheCounts);
  // Ext defaults are false until the instance gets an own flag. Accessors or
  // non-booleans are unknown, never evidence that a write has completed.
  const flag=(object,key)=>{
    const descriptor=Object.getOwnPropertyDescriptor(object,key);
    return !descriptor?false:Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='boolean'?descriptor.value:null;
  };
  const removed=dense(value(store,'removed'),64);
  const writeState={is_syncing:flag(store,'isSyncing'),needs_sync:flag(store,'needsSync'),removed_count:removed?.length??null,
    dirty_count:0,phantom_count:0,dropped_count:0,unknown_flags:0};
  for(const record of records)for(const key of ['dirty','phantom','dropped']){
    const current=flag(record,key);if(current===null)writeState.unknown_flags++;else if(current)writeState[key+'_count']++;
  }
  checks.writes_clean=writeState.is_syncing===false&&writeState.needs_sync===false&&writeState.removed_count===0
    &&writeState.dirty_count===0&&writeState.phantom_count===0&&writeState.dropped_count===0&&writeState.unknown_flags===0;
  const recordFields=record=>{
    const cache=value(record,'data');if(!record.isModel||!cache)return null;
    const descriptors=Object.entries(Object.getOwnPropertyDescriptors(cache));
    if(descriptors.length>64||descriptors.some(([,d])=>!Object.hasOwn(d,'value')))return null;
    return {record,cache,fields:descriptors.map(([key,d])=>[key,d.value])};
  };
  const editorCandidates=[...exact(c.prefix+';WizrdMCF;EditColumnDefForm'),...exact('EditColumnDefForm')];
  const editors=editorCandidates.filter(visible),editorBase=editors.length===1?editors[0].getAttribute('data-tid'):null;
  const dialogs=[...document.querySelectorAll('[role="dialog"],.x-message-box')].filter(visible);
  checks.dialogs=dialogs.every(e=>e===c.root||editors.includes(e));
  if(!checks.dialogs||editors.length>1)return result('refused','foreign_or_ambiguous_dialog',{editor_count:editors.length});
  const masks=[...document.querySelectorAll(phase==='editing'?'.bg-mask-message,.x-mask-msg':'.x-mask,.bg-mask-message,.x-mask-msg')].filter(visible);
  const {maskObservations}=classifyJavascriptWizardMasks({prefix:c.prefix,root:c.root,model,binding:c.binding,pages:[page],overlays:masks});
  const blockers=maskObservations.filter(entry=>!entry.disabled_delete_mask);
  checks.quiet=blockers.length===0;
  if(!checks.quiet)return result(phase==='capture'?'refused':'pending','ui_busy',{mask_count:masks.length,blocker_count:blockers.length});
  if(phase==='capture'){
    if(!checks.writes_clean)return result('refused','baseline_write_pending',{...cacheCounts,write_state:writeState});
    const baseline=records.map(recordFields);
    checks.baseline=records.length===expectedCount&&baseline.every(Boolean)&&store.getTotalCount()===records.length;
    if(!checks.baseline||editors.length)return result('refused','baseline_unconfirmed');
    return {context:c,document,connection,model,page,pageView,grid,view,store,vendor,baseline,
      snapshot:finish('prepared',null,{baseline_count:baseline.length,editor_count:0})};
  }
  checks.baseline=held.baseline.every((entry,index)=>records[index]===entry.record&&value(entry.record,'data')===entry.cache
    &&(()=>{const current=recordFields(entry.record);return !!current&&current.fields.length===entry.fields.length
      &&entry.fields.every(([key,val])=>Object.hasOwn(entry.cache,key)&&Object.is(value(entry.cache,key),val));})());
  if(!checks.baseline)return result('refused','baseline_records_changed');
  const added=records.filter(record=>!held.baseline.some(entry=>entry.record===record));
  if(added.length>1||records.length!==held.baseline.length+added.length)return result('refused','unexpected_record_delta');
  const counts={...cacheCounts,write_state:writeState,baseline_count:held.baseline.length,added_count:added.length,editor_count:editors.length};
  if(phase==='baseline')return result(!added.length&&!editors.length&&checks.writes_clean?'prepared':'refused','baseline_recheck',counts);
  if(phase==='cancelled'||phase==='applied'){
    if(editors.length)return result('pending','editor_still_visible',counts);
    if(phase==='cancelled'){
      checks.record_removed=added.length===0;checks.proxy_total_matches=totalCount===records.length;
      // Exact Ext source: remove changes the local collection; successful
      // destroy clears removed. totalCount remains the last proxy-load total.
      checks.removals_synced=!!removed&&removed.length===0;
      checks.records_clean=writeState.dirty_count===0&&writeState.phantom_count===0&&writeState.dropped_count===0&&writeState.unknown_flags===0;
      return result(checks.record_removed&&checks.removals_synced&&checks.records_clean&&checks.writes_clean?'settled':'pending','cancel_settlement',
        {...counts,removed_count:removed?.length??null});
    }
    checks.applied=!!held.editor&&added.length===1&&added[0]===held.editor.record
      &&value(held.editor.form,'ModalResultOk')===true&&store.getTotalCount()===records.length
      &&value(added[0],'data')===held.editor.cache&&!!recordFields(added[0])&&checks.writes_clean;
    return result(checks.applied?'settled':'pending','apply_settlement',counts);
  }
  if(!added.length||!editors.length)return result('pending','await_added_record_and_editor',counts);
  const record=added[0],element=editors[0],control=globalThis.Ext?.getCmp?.(element.id),form=value(control,'Controller');
  checks.record=!!recordFields(record)&&value(record,'store')===store&&store.getTotalCount()===records.length;
  checks.form=dom(control)===element&&value(form,'FView')===control&&value(form,'FAddMode')===true&&value(form,'ModalResultOk')===false;
  const formRecords=dense(value(form,'Records'),1);
  checks.form_record=!!formRecords&&formRecords.length===1&&formRecords[0]===record;
  const items=value(form,'FItems'),controls={},inputs={};
  checks.controls=true;
  for(const name of ['edtName','edtDisplayName','cbxDataType','btnApply','btnCancel']){
    const elements=exact(editorBase+';'+name),field=elements.length===1?elements[0]:null,fieldControl=value(items,name);
    if(!field||!visible(field)||!element.contains(field)||dom(fieldControl)!==field||fieldControl.disabled===true||globalThis.Ext?.getCmp?.(field.id)!==fieldControl){checks.controls=false;break;}
    controls[name]=fieldControl;
    if(name==='edtName'||name==='edtDisplayName'){
      const input=value(value(fieldControl,'inputEl'),'dom');
      if(!input||!field.contains(input)||!visible(input)){checks.controls=false;break;}
      inputs[name]=input;
    }
  }
  if(form&&(!checks.form||!checks.form_record))return result('refused','foreign_editor_record',counts);
  if(!checks.record||!checks.form||!checks.form_record||!checks.controls)return result('pending','editor_binding_incomplete',counts);
  if(held.editor){
    checks.original_editor=held.editor.record===record&&held.editor.element===element&&held.editor.control===control&&held.editor.form===form
      &&Object.entries(controls).every(([name,field])=>held.editor.controls[name]===field)
      &&Object.entries(inputs).every(([name,input])=>held.editor.inputs[name]===input);
    if(!checks.original_editor)return result('refused','original_editor_changed',counts);
  }
  // Retain only proven native identities in the operator-owned holder.
  if(!held.editor)held.editor={record,cache:value(record,'data'),element,control,form,controls,inputs,base:editorBase};
  let pickerSnapshot;
  if(readPicker||target==='cbxDataType'&&(kind==='trigger'||kind==='trigger-close'||kind==='option')){
    const combo=controls.cbxDataType,triggers=dense(value(combo,'orderedTriggers'),8);
    const matches=(triggers??[]).filter(trigger=>value(trigger,'id')==='picker');
    const trigger=matches.length===1?matches[0]:null,triggerDom=dom(trigger),wrap=value(value(combo,'triggerWrap'),'dom');
    const triggerTid=editorBase+';cbxDataType;trg_picker',triggerElements=exact(triggerTid);
    const triggerChecks={inventory:!!triggers,unique:matches.length===1,field:value(trigger,'field')===combo,
      dom:!!triggerDom,wrap:!!wrap&&dom(combo).contains(wrap)&&!!triggerDom&&wrap.contains(triggerDom),
      tid:triggerElements.length===1&&triggerElements[0]===triggerDom,visible_flag:value(trigger,'hidden')!==true,
      alive:value(trigger,'isDestroyed')!==true,rendered:value(trigger,'rendered')===true,nonrepeating:value(trigger,'repeatClick')!==true};
    const triggerDiagnostic={checks:triggerChecks,inventory_count:triggers?.length??null,match_count:matches.length,tid_count:triggerElements.length};
    checks.trigger=Object.values(triggerChecks).every(Boolean);
    if(!checks.trigger)return result('refused','type_trigger_unconfirmed',{...counts,trigger:triggerDiagnostic});
    if(held.editor.typeTrigger&&(held.editor.typeTrigger.trigger!==trigger||held.editor.typeTrigger.dom!==triggerDom))
      return result('refused','type_trigger_changed',{...counts,trigger:triggerDiagnostic});
    if(!held.editor.typeTrigger)held.editor.typeTrigger={trigger,dom:triggerDom};
    const picker=value(combo,'picker'),pickerDom=dom(picker),expanded=value(combo,'isExpanded')===true;
    const pickerStore=value(picker,'store'),comboStore=value(combo,'store');
    const pickerRecords=pickerStore?dense(pickerStore.getData?.()?.items,64):null;
    // Only these two scalar config names may inherit. Never invoke accessors
    // and never use this lookup for native ownership or cache identities.
    const configField=key=>{
      let object=combo;
      for(let depth=0;object&&depth<16;depth++,object=Object.getPrototypeOf(object)){
        const descriptor=Object.getOwnPropertyDescriptor(object,key);
        if(!descriptor)continue;
        if(!Object.hasOwn(descriptor,'value'))return {status:'accessor',depth};
        return typeof descriptor.value==='string'&&descriptor.value.length>0&&descriptor.value.length<=64
          ?{status:'data',depth,value:descriptor.value}:{status:'unsupported',depth};
      }
      return {status:object?'depth_limit':'missing'};
    };
    const valueConfig=configField('valueField'),displayConfig=configField('displayField'),valueField=valueConfig.value,displayField=displayConfig.value;
    const pickerChecks={present:!!picker,dom:!!pickerDom,backref:value(picker,'pickerField')===combo,
      ext:!!pickerDom&&globalThis.Ext?.getCmp?.(pickerDom.id)===picker,store:!!pickerStore&&pickerStore===comboStore,
      data_source:!!pickerStore&&value(picker,'dataSource')===pickerStore,
      original_picker:!held.editor.typePicker||held.editor.typePicker===picker,original_store:!held.editor.typeStore||held.editor.typeStore===pickerStore,
      original_dom:!held.editor.typePickerDom||held.editor.typePickerDom===pickerDom};
    checks.picker_owner=Object.values(pickerChecks).every(Boolean);
    const shown=visible(pickerDom);
    if(picker&&(!pickerChecks.backref||!pickerChecks.store||!pickerChecks.data_source||pickerDom&&!pickerChecks.ext
      ||held.editor.typePicker&&held.editor.typePicker!==picker||held.editor.typeStore&&held.editor.typeStore!==pickerStore
      ||held.editor.typePickerDom&&held.editor.typePickerDom!==pickerDom))
      return result('refused','type_picker_owner_changed',{...counts,trigger:triggerDiagnostic,picker_checks:pickerChecks,value_config:valueConfig,display_config:displayConfig});
    if(picker&&!held.editor.typePicker){held.editor.typePicker=picker;held.editor.typeStore=pickerStore;}
    if(pickerDom&&!held.editor.typePickerDom)held.editor.typePickerDom=pickerDom;
    const options=checks.picker_owner?[...pickerDom.querySelectorAll('.x-boundlist-item')]:[];
    const typed=options.length<=64&&pickerRecords&&typeof valueField==='string'&&typeof displayField==='string'?options.filter(item=>{
      const recs=pickerRecords.filter(rec=>String(value(rec,'internalId'))===item.getAttribute('data-recordId'));
      const cache=recs.length===1?value(recs[0],'data'):null;
      return item.getAttribute('data-boundView')===pickerDom.id&&cache&&recs[0].isModel===true&&value(cache,valueField)===expectedType
        &&value(cache,displayField)===expectedLabel&&item.textContent?.trim()===expectedLabel&&visible(item);
    }):[];
    const pickerLoading=pickerStore?.isLoading?.()===true;
    pickerSnapshot={expanded,picker_loading:pickerLoading,picker_visible:shown,picker_owned:checks.picker_owner,trigger_tid:triggerTid,trigger:triggerDiagnostic,
      checks:pickerChecks,value_config:valueConfig,display_config:displayConfig,
      record_count:pickerRecords?.length??null,option_count:options.length,typed_option_count:typed.length,
      expected_type:expectedType??null,expected_label:expectedLabel??null};
    if(typed.length===1){
      const item=typed[0],nativeRecord=pickerRecords.find(rec=>String(value(rec,'internalId'))===item.getAttribute('data-recordId'));
      const previous=held.editor.typeOption;
      if(previous&&(previous.item!==item||previous.record!==nativeRecord||previous.cache!==value(nativeRecord,'data')))
        return result('refused','type_option_changed',{...counts,picker:pickerSnapshot});
      if(!previous)held.editor.typeOption={item,record:nativeRecord,cache:value(nativeRecord,'data')};
    }
    if(kind==='trigger-close'&&(!expanded||!shown||!checks.picker_owner))return result('refused','type_picker_not_open',{...counts,picker:pickerSnapshot});
    if(kind==='trigger'&&(expanded||shown))return result('refused','type_picker_already_open',{...counts,picker:pickerSnapshot});
    if(kind==='option'&&(!expanded||!shown||typed.length!==1||typed[0]!==option))
      return result('refused','type_option_unconfirmed',{...counts,picker:pickerSnapshot});
    if(readPicker==='state'&&(expanded!==shown||expanded&&!checks.picker_owner||pickerLoading))return result('pending','type_picker_transition',{...counts,picker:pickerSnapshot});
    if(readPicker==='collapsed'&&(expanded||shown||pickerLoading))return result('pending','type_picker_collapsing',{...counts,picker:pickerSnapshot});
    if(readPicker===true&&(!expanded||!shown||typed.length!==1||pickerLoading))return result('pending','type_picker_opening',{...counts,picker:pickerSnapshot});
  }
  if(target){
    const field=controls[target],input=kind==='fill'?inputs[target]:(kind==='trigger'||kind==='trigger-close')?held.editor.typeTrigger?.dom:kind==='option'?option:dom(field);
    const picker=kind==='option'?dom(value(field,'picker')):null;
    checks.option_owner=kind!=='option'||!!option&&!!picker&&option.closest('.x-boundlist')===picker&&picker.contains(option)&&option.classList.contains('x-boundlist-item');
    const rect=input?.getBoundingClientRect(),x=rect?rect.x+rect.width/2:-1,y=rect?rect.y+rect.height/2:-1;
    const hit=rect?document.elementFromPoint(x,y):null;
    checks.target_enabled=!!field&&field.disabled!==true&&!!input&&input.disabled!==true&&(!['trigger','trigger-close'].includes(kind)||field.readOnly!==true)
      &&(kind!=='fill'||input.readOnly!==true&&['INPUT','TEXTAREA'].includes(input.tagName));
    checks.target_visible=!!input&&visible(input)&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight;
    checks.target_hit=!!hit&&!!input&&(hit===input||input.contains(hit));
    if(!checks.option_owner||!checks.target_enabled||!checks.target_visible||!checks.target_hit)return result('refused','control_not_interactive',{...counts,target,kind,...(pickerSnapshot?{picker:pickerSnapshot}:{})});
  }
  let helperSource;
  if(readHelper){
    const helper=value(value(value(globalThis,'bg'),'ext'),'AssociateDisplaynameWithName');
    helperSource={status:'unavailable'};
    if(typeof helper==='function'){
      const source=Function.prototype.toString.call(helper),bytes=new TextEncoder().encode(source).length;
      helperSource=bytes>16384?{status:'oversized',bytes}:source.includes('[native code]')?{status:'unsupported',bytes}:{status:'available',bytes,source};
    }else if(helper!==undefined)helperSource={status:'unsupported'};
  }
  let fieldReadback;
  if(readField){
    if(!['edtName','edtDisplayName'].includes(readField))return result('refused','unsupported_field_readback',counts);
    const input=inputs[readField],field=controls[readField],cached=value(field,'value'),inputValue=input.value,placeholder=input.getAttribute('placeholder')??'';
    // Ext field readers can change caches and input DOM. Inspect own data
    // descriptors only; unknown association/placeholder semantics stay unproven.
    const raw=value(field,'rawValue');
    if([inputValue,cached,raw,placeholder].some(text=>typeof text==='string'&&text.length>256)||typeof inputValue!=='string')
      return result('refused','field_readback_bound',counts);
    fieldReadback={field:readField,input_value:inputValue,native_value:typeof cached==='string'?cached:null,
      native_value_available:typeof cached==='string',native_raw_value:typeof raw==='string'?raw:null,
      native_raw_value_available:typeof raw==='string',placeholder};

  }
  let declaredControls;
  if(readDeclaredControls||readUsagePicker){
    declaredControls={};
    for(const name of ['cbxDataKind','cbxUsageType']){
      const elements=exact(editorBase+';'+name),field=elements.length===1?elements[0]:null,combo=value(items,name);
      if(!field||!visible(field)||!element.contains(field)||dom(combo)!==field
        ||globalThis.Ext?.getCmp?.(field.id)!==combo)return result('refused','declared_control_owner_unconfirmed',{...counts,name});
      const store=value(combo,'store'),records=store?dense(store.getData?.()?.items,64):null;
      if(!records||records.length<1||store.isLoading?.()===true)return result('refused','declared_control_options_unavailable',{...counts,name});
      const options=records.map(record=>{
        const data=value(record,'data'),descriptors=data&&Object.entries(Object.getOwnPropertyDescriptors(data));
        if(record.isModel!==true||!descriptors||descriptors.length>16||descriptors.some(([,d])=>!Object.hasOwn(d,'value')))
          return null;
        return Object.fromEntries(descriptors.filter(([,d])=>['string','number','boolean'].includes(typeof d.value)
          &&(typeof d.value!=='string'||d.value.length<=120)).map(([key,d])=>[key,d.value]));
      });
      if(options.some(entry=>entry===null))return result('refused','declared_control_option_cache_unconfirmed',{...counts,name});
      const cached=value(combo,'value');
      declaredControls[name]={tid:editorBase+';'+name,disabled:combo.disabled===true,
        cached_value:Number.isInteger(cached)?cached:null,options};
      if(name==='cbxUsageType'){
        const triggers=dense(value(combo,'orderedTriggers'),8),pickers=(triggers??[]).filter(trigger=>value(trigger,'id')==='picker');
        const trigger=pickers.length===1?pickers[0]:null,triggerDom=dom(trigger),wrap=value(value(combo,'triggerWrap'),'dom');
        const triggerTid=editorBase+';cbxUsageType;trg_picker';
        declaredControls[name].trigger={tid:triggerDom?.getAttribute('data-tid')??null,
          expected_tid:triggerTid,inventory_count:triggers?.length??null,picker_count:pickers.length,
          bound:!!triggerDom&&value(trigger,'field')===combo&&!!wrap&&field.contains(wrap)&&wrap.contains(triggerDom)
            &&exact(triggerTid).length===1&&exact(triggerTid)[0]===triggerDom,
          visible:visible(triggerDom),rendered:value(trigger,'rendered')===true,
          repeat_click:value(trigger,'repeatClick')===true,disabled:combo.disabled===true};
      }
    }
  }
  let usagePickerSnapshot;
  if(readUsagePicker){
    const combo=value(items,'cbxUsageType'),trigger=declaredControls?.cbxUsageType?.trigger;
    if(!trigger?.bound||!trigger.visible||!trigger.rendered||trigger.disabled||trigger.repeat_click)
      return result('refused','usage_trigger_unconfirmed',{...counts,trigger:trigger??null});
    const triggerDom=exact(trigger.tid)[0],picker=value(combo,'picker'),pickerDom=dom(picker);
    const expanded=value(combo,'isExpanded')===true,shown=visible(pickerDom),pickerStore=value(picker,'store'),comboStore=value(combo,'store');
    const ownerChecks={picker_exists:!!picker,dom_exists:!!pickerDom,
      field_matches:!!picker&&value(picker,'pickerField')===combo,
      component_matches:!!pickerDom&&globalThis.Ext?.getCmp?.(pickerDom.id)===picker,
      store_matches:!!picker&&pickerStore===comboStore,
      data_source_matches:!!picker&&value(picker,'dataSource')===pickerStore,
      held_picker_matches:!held.editor.usagePicker||held.editor.usagePicker===picker,
      held_store_matches:!held.editor.usageStore||held.editor.usageStore===pickerStore,
      held_dom_matches:!held.editor.usagePickerDom||held.editor.usagePickerDom===pickerDom};
    const owner=ownerChecks.picker_exists&&ownerChecks.dom_exists&&ownerChecks.field_matches
      &&ownerChecks.component_matches&&ownerChecks.store_matches&&ownerChecks.data_source_matches;
    if(picker&&(!owner||held.editor.usagePicker&&held.editor.usagePicker!==picker
      ||held.editor.usageStore&&held.editor.usageStore!==pickerStore
      ||held.editor.usagePickerDom&&held.editor.usagePickerDom!==pickerDom))
      return result('refused','usage_picker_owner_changed',{...counts,expanded,shown,owner,owner_checks:ownerChecks});
    if(picker&&!held.editor.usagePicker){held.editor.usagePicker=picker;held.editor.usageStore=pickerStore;held.editor.usagePickerDom=pickerDom;}
    const records=owner?dense(pickerStore.getData?.()?.items,64):null;
    const options=owner?[...pickerDom.querySelectorAll('.x-boundlist-item')]:[];
    const visibleOptions=options.length<=64&&records?options.filter(item=>{
      const candidates=records.filter(rec=>String(value(rec,'internalId'))===item.getAttribute('data-recordId'));
      const data=candidates.length===1?value(candidates[0],'data'):null;
      return item.getAttribute('data-boundView')===pickerDom.id&&candidates[0]?.isModel===true
        &&typeof value(data,'Value')==='number'&&typeof value(data,'DisplayText')==='string'
        &&item.textContent?.trim()===value(data,'DisplayText')&&visible(item);
    }):[];
    const matched=visibleOptions.filter(item=>{
      const record=records.find(rec=>String(value(rec,'internalId'))===item.getAttribute('data-recordId'));
      return value(value(record,'data'),'Value')===expectedUsage&&value(value(record,'data'),'DisplayText')===expectedUsageLabel;
    });
    usagePickerSnapshot={expanded,visible:shown,owner,trigger_tid:trigger.tid,record_count:records?.length??null,
      option_count:options.length,verified_option_count:visibleOptions.length,expected_match_count:matched.length,
      expected_usage:expectedUsage,expected_label:expectedUsageLabel};
    if(usageAction){
      const rect=triggerDom.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2,hit=document.elementFromPoint(x,y);
      const interactive=!combo.readOnly&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight
        &&!!hit&&(hit===triggerDom||triggerDom.contains(hit));
      if(!interactive||usageAction==='open'&&(expanded||shown)||usageAction==='close'&&(!expanded||!shown||!owner)
        ||!['open','close'].includes(usageAction))return result('refused','usage_trigger_not_interactive',{...counts,usage_picker:usagePickerSnapshot});
    }
    if(readUsagePicker==='state'&&(expanded!==shown||expanded&&!owner||pickerStore?.isLoading?.()===true))
      return result('pending','usage_picker_transition',{...counts,usage_picker:usagePickerSnapshot});
    if(readUsagePicker==='collapsed'&&(expanded||shown||pickerStore?.isLoading?.()===true))
      return result('pending','usage_picker_collapsing',{...counts,usage_picker:usagePickerSnapshot});
    if(readUsagePicker===true&&(!expanded||!shown||!owner||records?.length!==7||options.length!==7
      ||visibleOptions.length!==7||matched.length!==1||pickerStore?.isLoading?.()===true))
      return result('pending','usage_picker_opening',{...counts,usage_picker:usagePickerSnapshot});
  }
  return result('ready',null,{...counts,base:editorBase,...(pickerSnapshot?{picker:pickerSnapshot}:{}),...(usagePickerSnapshot?{usage_picker:usagePickerSnapshot}:{}),...(helperSource?{helper_source:helperSource}:{}),...(fieldReadback?{field_readback:fieldReadback}:{}),...(declaredControls?{declared_controls:declaredControls}:{})});
});

export async function waitJavascriptColumnEditor({page,pending,phase,deadline,record}) {
  let fingerprint,count=0,last;
  while(Date.now()<deadline){
    last=await page.evaluate(observeJavascriptColumnEditor,{held:pending.held,phase});
    const next=JSON.stringify(last);
    if(next!==fingerprint&&count<12){fingerprint=next;count++;await record({phase:'column_editor_changed',observation:count,stage:phase,snapshot:last});}
    if(last.status==='refused')break;
    if(last.status===(phase==='applied'||phase==='cancelled'?'settled':'ready'))return last;
    await page.waitForTimeout(Math.min(200,Math.max(1,deadline-Date.now())));
  }
  await record({phase:'column_editor_refused',stage:phase,snapshot:last??null,deadline_expired:Date.now()>=deadline});
  throw Error('Column editor settlement unconfirmed: '+(last?.reason??'deadline'));
}

export async function openJavascriptColumnEditor({page,context,index,state,once,record,deadline,add}) {
  if(state.pending)throw Error('Prior column editor unresolved; do not replay Add');
  const held=await page.evaluateHandle(observeJavascriptColumnEditor,{context,expectedCount:index,phase:'capture'});
  const snapshot=await held.evaluate(h=>h.snapshot);
  if(snapshot.status!=='prepared'){await held.dispose();await record({phase:'column_editor_capture_refused',snapshot});throw Error('Column editor baseline unconfirmed');}
  const pending=state.pending={held,addDispatched:false,applyDispatched:false,cancelDispatched:false};
  await record({phase:'column_editor_prepared',index,snapshot});
  await once('schema-add-'+index,{page_tid:context.prefix+';WizrdMCF;JavaScriptColumnsWizard'},async()=>{
    const before=await page.evaluate(observeJavascriptColumnEditor,{held,phase:'baseline'});
    if(before.status!=='prepared'){await record({phase:'column_editor_pre_add_refused',snapshot:before});throw Error('Column baseline changed before Add');}
    if(Date.now()>=deadline)throw Error('Column Add deadline expired');
    pending.addDispatched=true;await add();
  });
  return waitJavascriptColumnEditor({page,pending,phase:'editing',deadline,record});
}

export async function verifyJavascriptColumnEditor({page,state,record,deadline,target,kind='click',option,expectedType,expectedLabel}) {
  if(Date.now()>=deadline)throw Error('Column editor original deadline expired');
  const snapshot=await page.evaluate(observeJavascriptColumnEditor,{held:state.pending.held,phase:'editing',target,kind,option,expectedType,expectedLabel});
  if(snapshot.status!=='ready'){await record({phase:'column_editor_effect_refused',snapshot});throw Error('Column editor changed before effect');}
  return snapshot;
}

export async function settleJavascriptColumnEditor({page,state,record,deadline,phase}) {
  const pending=state.pending;
  const snapshot=await waitJavascriptColumnEditor({page,pending,phase,deadline:Math.min(deadline,Date.now()+15000),record});
  await record({phase:'column_editor_closed',stage:phase,snapshot});
  await pending.held.dispose();state.pending=null;return snapshot;
}

export async function cleanupJavascriptColumnEditor({page,state,record,deadline}) {
  if(!state.pending)return;
  const pending=state.pending;
  if(pending.cleanupPromise)return pending.cleanupPromise;
  pending.cleanupPromise=(async()=>{
    if(!pending.addDispatched){await pending.held.dispose();state.pending=null;return;}
    if(pending.applyDispatched||pending.cancelDispatched){
      await settleJavascriptColumnEditor({page,state,record,deadline,phase:pending.applyDispatched?'applied':'cancelled'});return;
    }
    await waitJavascriptColumnEditor({page,pending,phase:'editing',deadline,record});
    await closeJavascriptColumnUsagePicker({page,state,record,deadline});
    await closeJavascriptColumnTypePicker({page,state,record,deadline});
    const snapshot=await waitJavascriptColumnEditor({page,pending,phase:'editing',deadline,record});
    pending.cancelDispatched=true;
    await record({phase:'column_editor_cancel_dispatch',snapshot});
    await verifyJavascriptColumnEditor({page,state,record,deadline,target:'btnCancel'});
    await page.locator('[data-tid='+JSON.stringify(snapshot.base+';btnCancel')+']').filter({visible:true}).click({timeout:Math.max(1,deadline-Date.now())});
    return settleJavascriptColumnEditor({page,state,record,deadline,phase:'cancelled'});
  })();
  return pending.cleanupPromise;
}

export function javascriptColumnFieldMatches(field,expected) {
  return field?.native_value_available===true&&field.input_value===expected&&field.native_value===expected&&field.native_raw_value===expected&&field.native_raw_value_available===true;
}

// A readback mismatch never authorizes another write. The original effect can
// only be observed until its bounded deadline or refused with owned-field data.
export async function fillJavascriptColumnField({page,state,record,once,deadline,id,target,expected,fill}) {
  const read=()=>page.evaluate(observeJavascriptColumnEditor,{held:state.pending.held,phase:'editing',readField:target});
  const waitReadback=async({matching,limit})=>{
    let fingerprint,count=0,last;
    while(Date.now()<limit){
      last=await read();
      const key=JSON.stringify(last.field_readback??{status:last.status,reason:last.reason});
      if(key!==fingerprint&&count<8){fingerprint=key;count++;await record({phase:'column_field_readback',effect_id:id,field:target,
        expected,observation:count,stage:matching?'after':'before',snapshot:last});}
      if(last.status==='refused')break;
      const field=last.field_readback;
      if(last.status==='ready'&&field?.native_value_available&&field.input_value===field.native_value
        &&field.native_raw_value===field.input_value&&field.native_raw_value_available===true
        &&(!matching||javascriptColumnFieldMatches(field,expected)))return last;
      await page.waitForTimeout(Math.min(100,Math.max(1,limit-Date.now())));
    }
    await record({phase:'column_field_readback_refused',effect_id:id,field:target,expected,stage:matching?'after':'before',snapshot:last??null});
    throw Error('Column field readback unconfirmed: '+target);
  };
  const before=await waitReadback({matching:false,limit:Math.min(deadline,Date.now()+5000)});
  if(javascriptColumnFieldMatches(before.field_readback,expected)){
    await record({phase:'column_field_fill_skipped',effect_id:id,field:target,expected,snapshot:before});return;
  }
  await once(id,{base:before.base,field:target,expected},async()=>{
    await verifyJavascriptColumnEditor({page,state,record,deadline,target,kind:'fill'});
    await fill(expected);
    await waitReadback({matching:true,limit:Math.min(deadline,Date.now()+5000)});
  });
}


// Private diagnostic only: never invoke the helper or use its body for admission.
export async function recordJavascriptColumnHelperSource({page,state,record}) {
  const snapshot=await page.evaluate(observeJavascriptColumnEditor,{held:state.pending.held,phase:'editing',readHelper:true});
  const diagnostic=snapshot.helper_source??{status:'owner_unconfirmed'};
  await record({phase:'column_helper_source',diagnostic:{...diagnostic,
    ...(diagnostic.status==='available'?{sha256:createHash('sha256').update(diagnostic.source).digest('hex')}:{})}});
}


export async function openJavascriptColumnTypePicker({page,state,record,once,deadline,id,expectedType,expectedLabel,click}) {
  const pending=state.pending;
  if(pending.typeOpening)throw Error('Column type opening already dispatched; do not replay');
  const limit=Math.min(deadline,Date.now()+5000);
  const before=await verifyJavascriptColumnEditor({page,state,record,deadline:limit,target:'cbxDataType',kind:'trigger',expectedType,expectedLabel});
  pending.typeOpening=true;
  await once(id,{trigger_tid:before.picker.trigger_tid,expected_type:expectedType},async()=>{
    await verifyJavascriptColumnEditor({page,state,record,deadline:limit,target:'cbxDataType',kind:'trigger',expectedType,expectedLabel});
    pending.typeOpeningDispatched=true;
    await click(before.picker.trigger_tid,Math.max(1,limit-Date.now()));
    pending.typeOpeningResponseObserved=true;
  });
  let fingerprint,count=0,last;
  while(Date.now()<limit){
    last=await page.evaluate(observeJavascriptColumnEditor,{held:pending.held,phase:'editing',readPicker:true,expectedType,expectedLabel});
    const key=JSON.stringify(last);
    if(key!==fingerprint&&count<8){fingerprint=key;count++;await record({phase:'column_type_opening',observation:count,snapshot:last});}
    if(last.status==='ready'){pending.typeOpeningObserved=true;return last;}
    if(last.status==='refused')break;
    await page.waitForTimeout(Math.min(100,Math.max(1,limit-Date.now())));
  }
  await record({phase:'column_type_opening_refused',snapshot:last??null,deadline_expired:Date.now()>=limit});
  throw Error('Column type picker opening unconfirmed');
}


export async function selectJavascriptColumnTypeOption({page,state,record,once,deadline,id,expectedType,expectedLabel}) {
  const pending=state.pending;
  if(pending.typeSelectAttempted)throw Error('Column type selection already attempted; do not replay');
  const handle=await pending.held.evaluateHandle(h=>h.editor?.typeOption?.item??null);
  try {
    const option=handle.asElement();
    if(!option){await record({phase:'column_type_option_refused',reason:'held_item_unavailable'});throw Error('Proven column type option unavailable');}
    const snapshot=await verifyJavascriptColumnEditor({page,state,record,deadline,target:'cbxDataType',kind:'option',option,expectedType,expectedLabel});
    await record({phase:'column_type_option_bound',snapshot});
    pending.typeSelectAttempted=true;
    await once(id,{expected_type:expectedType,expected_label:expectedLabel},async()=>{
      await verifyJavascriptColumnEditor({page,state,record,deadline,target:'cbxDataType',kind:'option',option,expectedType,expectedLabel});
      await option.click({timeout:Math.max(1,Math.min(5000,deadline-Date.now()))});
    });
  } finally {await handle.dispose();}
}

export async function closeJavascriptColumnTypePicker({page,state,record,deadline}) {
  const pending=state.pending;
  if(!pending.typeOpeningDispatched)return;
  if(pending.applyDispatched)throw Error('Apply dispatched; picker cleanup is not authorized');
  if(pending.pickerClosePromise)return pending.pickerClosePromise;
  pending.pickerClosePromise=(async()=>{
    const limit=Math.min(deadline,Date.now()+5000);
    const wait=async phase=>{
      let fingerprint,count=0,last;
      while(Date.now()<limit){
        last=await page.evaluate(observeJavascriptColumnEditor,{held:pending.held,phase:'editing',readPicker:phase});
        if(phase==='state'&&last.status==='ready'&&!last.picker.expanded&&!pending.typeOpeningResponseObserved&&!pending.typeOpeningObserved)
          last={...last,status:'pending',reason:'lost_type_opening_unconfirmed'};
        const key=JSON.stringify(last);
        if(key!==fingerprint&&count<8){fingerprint=key;count++;await record({phase:'column_type_close_observed',stage:phase,observation:count,snapshot:last});}
        if(last.status==='ready')return last;
        if(last.status==='refused')break;
        await page.waitForTimeout(Math.min(100,Math.max(1,limit-Date.now())));
      }
      await record({phase:'column_type_close_refused',stage:phase,snapshot:last??null,deadline_expired:Date.now()>=limit});
      throw Error('Owned column picker close unconfirmed');
    };
    const before=await wait('state');
    if(!before.picker.expanded&&!before.picker.picker_visible)return;
    const ready=await verifyJavascriptColumnEditor({page,state,record,deadline:limit,target:'cbxDataType',kind:'trigger-close'});
    pending.pickerCloseDispatched=true;
    await record({phase:'column_type_close_dispatch',snapshot:ready});
    await verifyJavascriptColumnEditor({page,state,record,deadline:limit,target:'cbxDataType',kind:'trigger-close'});
    await page.locator('[data-tid='+JSON.stringify(ready.picker.trigger_tid)+']').filter({visible:true}).click({timeout:Math.max(1,limit-Date.now())});
    await wait('collapsed');
  })();
  return pending.pickerClosePromise;
}

export async function openJavascriptColumnUsagePicker({page,state,record,once,deadline,id,click}) {
  const pending=state.pending;
  if(pending.usageOpening)throw Error('Column usage opening already dispatched; do not replay');
  const limit=Math.min(deadline,Date.now()+5000);
  const read=(readUsagePicker,usageAction)=>page.evaluate(observeJavascriptColumnEditor,
    {held:pending.held,phase:'editing',readUsagePicker,usageAction});
  const before=await read('state','open');
  if(before.status!=='ready'){
    await record({phase:'column_usage_preflight_refused',snapshot:before});
    throw Error('Owned column usage trigger unavailable: '+(before.reason??before.status));
  }
  pending.usageOpening=true;
  await once(id,{trigger_tid:before.usage_picker.trigger_tid},async()=>{
    const current=await read('state','open');
    if(current.status!=='ready'){
      await record({phase:'column_usage_dispatch_refused',snapshot:current});
      throw Error('Column usage trigger changed before opening: '+(current.reason??current.status));
    }
    pending.usageOpeningDispatched=true;
    await click(before.usage_picker.trigger_tid,Math.max(1,limit-Date.now()));
    pending.usageOpeningResponseObserved=true;
  });
  let fingerprint,count=0,last;
  while(Date.now()<limit){
    last=await read(true);
    const key=JSON.stringify(last.usage_picker??{status:last.status,reason:last.reason});
    if(key!==fingerprint&&count++<8){fingerprint=key;await record({phase:'column_usage_opening',observation:count,snapshot:last});}
    if(last.status==='ready'){pending.usageOpeningObserved=true;return last;}
    if(last.status==='refused')break;
    await page.waitForTimeout(Math.min(100,Math.max(1,limit-Date.now())));
  }
  await record({phase:'column_usage_opening_refused',snapshot:last??null,deadline_expired:Date.now()>=limit});
  throw Error('Column usage picker opening unconfirmed');
}

export async function closeJavascriptColumnUsagePicker({page,state,record,deadline}) {
  const pending=state.pending;
  if(!pending?.usageOpeningDispatched)return;
  if(pending.applyDispatched)throw Error('Apply dispatched; usage picker cleanup is not authorized');
  if(pending.usageClosePromise)return pending.usageClosePromise;
  pending.usageClosePromise=(async()=>{
    const limit=Math.min(deadline,Date.now()+5000);
    const read=(readUsagePicker,usageAction)=>page.evaluate(observeJavascriptColumnEditor,
      {held:pending.held,phase:'editing',readUsagePicker,usageAction});
    const wait=async phase=>{
      let fingerprint,count=0,last;
      while(Date.now()<limit){
        last=await read(phase);
        if(phase==='state'&&last.status==='ready'&&!last.usage_picker.expanded
          &&!pending.usageOpeningResponseObserved&&!pending.usageOpeningObserved)
          last={...last,status:'pending',reason:'lost_usage_opening_unconfirmed'};
        const key=JSON.stringify(last.usage_picker??{status:last.status,reason:last.reason});
        if(key!==fingerprint&&count++<8){fingerprint=key;await record({phase:'column_usage_close_observed',stage:phase,observation:count,snapshot:last});}
        if(last.status==='ready')return last;
        if(last.status==='refused')break;
        await page.waitForTimeout(Math.min(100,Math.max(1,limit-Date.now())));
      }
      await record({phase:'column_usage_close_refused',stage:phase,snapshot:last??null,deadline_expired:Date.now()>=limit});
      throw Error('Owned column usage picker close unconfirmed');
    };
    const before=await wait('state');
    if(!before.usage_picker.expanded&&!before.usage_picker.visible)return;
    const ready=await read('state','close');
    if(ready.status!=='ready')throw Error('Owned column usage trigger unavailable for close');
    pending.usageCloseDispatched=true;
    await record({phase:'column_usage_close_dispatch',snapshot:ready});
    const current=await read('state','close');
    if(current.status!=='ready')throw Error('Column usage trigger changed before close');
    await page.locator('[data-tid='+JSON.stringify(ready.usage_picker.trigger_tid)+']').filter({visible:true})
      .click({timeout:Math.max(1,limit-Date.now())});
    await wait('collapsed');
  })();
  return pending.usageClosePromise;
}
