import {createHash} from 'node:crypto';
// Serialized, read-only UI/cache observer. Held references belong to this
// operator only. No server proxy property, form method or store mutation is used.
import {observeJavascriptColumnEditor} from './javascript-column-context.mjs';

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
      return settleJavascriptColumnEditor({page,state,record,deadline,phase:pending.applyDispatched?'applied':'cancelled'});
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

export async function openJavascriptColumnUsagePicker({page,state,record,once,deadline,id,click,expectedUsage=4,expectedUsageLabel='Выходное'}) {
  const pending=state.pending;
  if(pending.usageOpening)throw Error('Column usage opening already dispatched; do not replay');
  const limit=Math.min(deadline,Date.now()+5000);
  const read=(readUsagePicker,usageAction)=>page.evaluate(observeJavascriptColumnEditor,
    {held:pending.held,phase:'editing',readUsagePicker,usageAction,expectedUsage,expectedUsageLabel});
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

export async function selectJavascriptColumnUsageOption({page,state,record,once,deadline,id,expectedUsage=4,expectedUsageLabel='Выходное'}) {
  const pending=state.pending;
  if(pending.usageSelectAttempted)throw Error('Column usage selection already attempted; do not replay');
  const limit=Math.min(deadline,Date.now()+5000);
  const handle=await pending.held.evaluateHandle(h=>h.editor?.usageOption?.item??null);
  try {
    const option=handle.asElement();
    if(!option){await record({phase:'column_usage_option_refused',reason:'held_item_unavailable'});throw Error('Proven column usage option unavailable');}
    const read=usageAction=>page.evaluate(observeJavascriptColumnEditor,
      {held:pending.held,phase:'editing',readUsagePicker:true,usageAction,option,expectedUsage,expectedUsageLabel});
    const before=await read('select');
    if(before.status!=='ready'){
      await record({phase:'column_usage_option_refused',snapshot:before});
      throw Error('Owned column usage option unavailable: '+(before.reason??before.status));
    }
    pending.usageSelectAttempted=true;
    await once(id,{expected_usage:expectedUsage,expected_label:expectedUsageLabel},async()=>{
      const current=await read('select');
      if(current.status!=='ready'){
        await record({phase:'column_usage_option_dispatch_refused',snapshot:current});
        throw Error('Column usage option changed before selection');
      }
      pending.usageSelectDispatched=true;
      await option.click({timeout:Math.max(1,limit-Date.now())});
    });
    let fingerprint,count=0,last;
    while(Date.now()<limit){
      last=await page.evaluate(observeJavascriptColumnEditor,
        {held:pending.held,phase:'editing',readUsagePicker:'selected',expectedUsage,expectedUsageLabel});
      const key=JSON.stringify(last.usage_picker??{status:last.status,reason:last.reason});
      if(key!==fingerprint&&count++<8){fingerprint=key;await record({phase:'column_usage_selecting',observation:count,snapshot:last});}
      if(last.status==='ready'){pending.usageSelectObserved=true;return last;}
      if(last.status==='refused')break;
      await page.waitForTimeout(Math.min(100,Math.max(1,limit-Date.now())));
    }
    await record({phase:'column_usage_selection_refused',snapshot:last??null,deadline_expired:Date.now()>=limit});
    throw Error('Column usage selection unconfirmed');
  }finally{await handle.dispose();}
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
