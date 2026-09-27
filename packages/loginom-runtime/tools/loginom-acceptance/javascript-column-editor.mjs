import {createHash} from 'node:crypto';
import {withJavascriptWizardMasks} from './javascript-wizard-masks.mjs';
// Serialized, read-only UI/cache observer. Held references belong to this
// operator only. No server proxy property, form method or store mutation is used.
export const observeJavascriptColumnEditor=withJavascriptWizardMasks(function observeJavascriptColumnEditor({context,held,phase='capture',expectedCount,target,kind='click',option,readField,readHelper=false}) {
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
  const counts={...cacheCounts,baseline_count:held.baseline.length,added_count:added.length,editor_count:editors.length};
  if(phase==='baseline')return result(!added.length&&!editors.length?'prepared':'refused','baseline_recheck',counts);
  if(phase==='cancelled'||phase==='applied'){
    if(editors.length)return result('pending','editor_still_visible',counts);
    if(phase==='cancelled'){
      checks.record_removed=added.length===0;checks.proxy_total_matches=totalCount===records.length;
      // Exact Ext source: remove changes the local collection; successful
      // destroy clears removed. totalCount remains the last proxy-load total.
      const removed=dense(value(store,'removed'),64);
      checks.removals_synced=!!removed&&removed.length===0;
      checks.records_clean=records.every(record=>value(record,'dirty')!==true&&value(record,'phantom')!==true&&value(record,'dropped')!==true);
      return result(checks.record_removed&&checks.removals_synced&&checks.records_clean?'settled':'pending','cancel_settlement',
        {...counts,removed_count:removed?.length??null});
    }
    checks.applied=!!held.editor&&added.length===1&&added[0]===held.editor.record
      &&value(held.editor.form,'ModalResultOk')===true&&store.getTotalCount()===records.length;
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
  if(!held.editor)held.editor={record,element,control,form,controls,inputs,base:editorBase};
  if(target){
    const field=controls[target],input=kind==='fill'?inputs[target]:kind==='option'?option:dom(field);
    const picker=kind==='option'?dom(value(field,'picker')):null;
    checks.option_owner=kind!=='option'||!!option&&!!picker&&option.closest('.x-boundlist')===picker&&picker.contains(option)&&option.classList.contains('x-boundlist-item');
    const rect=input?.getBoundingClientRect(),x=rect?rect.x+rect.width/2:-1,y=rect?rect.y+rect.height/2:-1;
    const hit=rect?document.elementFromPoint(x,y):null;
    checks.target_enabled=!!field&&field.disabled!==true&&!!input&&input.disabled!==true
      &&(kind!=='fill'||input.readOnly!==true&&['INPUT','TEXTAREA'].includes(input.tagName));
    checks.target_visible=!!input&&visible(input)&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight;
    checks.target_hit=!!hit&&!!input&&(hit===input||input.contains(hit));
    if(!checks.option_owner||!checks.target_enabled||!checks.target_visible||!checks.target_hit)return result('refused','control_not_interactive',{...counts,target,kind});
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
  return result('ready',null,{...counts,base:editorBase,...(helperSource?{helper_source:helperSource}:{}),...(fieldReadback?{field_readback:fieldReadback}:{})});
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

export async function verifyJavascriptColumnEditor({page,state,record,deadline,target,kind='click',option}) {
  if(Date.now()>=deadline)throw Error('Column editor original deadline expired');
  const snapshot=await page.evaluate(observeJavascriptColumnEditor,{held:state.pending.held,phase:'editing',target,kind,option});
  if(snapshot.status!=='ready'){await record({phase:'column_editor_effect_refused',snapshot});throw Error('Column editor changed before effect');}
  return snapshot;
}

export async function settleJavascriptColumnEditor({page,state,record,deadline,phase}) {
  const pending=state.pending;
  const snapshot=await waitJavascriptColumnEditor({page,pending,phase,deadline,record});
  await record({phase:'column_editor_closed',stage:phase,snapshot});
  await pending.held.dispose();state.pending=null;
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
    const snapshot=await waitJavascriptColumnEditor({page,pending,phase:'editing',deadline,record});
    pending.cancelDispatched=true;
    await record({phase:'column_editor_cancel_dispatch',snapshot});
    await verifyJavascriptColumnEditor({page,state,record,deadline,target:'btnCancel'});
    await page.locator('[data-tid='+JSON.stringify(snapshot.base+';btnCancel')+']').filter({visible:true}).click({timeout:Math.max(1,deadline-Date.now())});
    await settleJavascriptColumnEditor({page,state,record,deadline,phase:'cancelled'});
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
