import {FILTER_OPERATORS,resolveFilterConditions,filterGroupsFromNative,validateFilterConditions} from './filter-parameters.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameField=(a,b)=>a?.kind===b?.kind&&(a?.kind==='row_number'||a?.kind==='input_field'&&a.name===b.name);
const centered=e=>e.interaction?.state==='point_observed'&&Math.abs(e.interaction.point.y-e.bounding_box.y-e.bounding_box.height/2)<0.75;
const date=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&v.length===19?v+'.000':v;
const literal=(a,b,type)=>type==='datetime'?date(a)===date(b):a===b;
export function filterConditionMatches(actual,wanted,code=FILTER_OPERATORS[wanted.operator]?.code){
 if(actual?.kind!=='condition'||!sameField(actual.field,wanted.field)||actual.type!==wanted.type||actual.operator_code!==code)return false;
 const arity=FILTER_OPERATORS[wanted.operator]?.arity??1;
 if(wanted.type==='string'&&arity!==0&&actual.case_sensitive!==wanted.case_sensitive)return false;
 if(arity===0)return true;
 if(arity===2)return literal(actual.lower,wanted.lower,wanted.type)&&literal(actual.upper,wanted.upper,wanted.type);
 if(arity==='list')return actual.values?.length===wanted.values.length&&actual.values.every((v,i)=>literal(v,wanted.values[i],wanted.type));
 return literal(actual.value,wanted.value,wanted.type);
}
export function filterInputText(value,type,decimalSeparator='.',datetimeCombo=false,datetimeFormat){
 if(type==='datetime'){
  const [d,t]=value.split('T');
  if(datetimeFormat?.kind==='iso_local'){
   need(['second','millisecond'].includes(datetimeFormat.precision)&&(datetimeFormat.precision==='millisecond'||!t.includes('.')||t.endsWith('.000')),'Native datetime property editor supports whole seconds; discrete datetime fields and list editors support milliseconds');
   return value;
  }
  if(datetimeCombo&&datetimeFormat){
   const f=datetimeFormat;
   need([f.day_pos,f.month_pos,f.year_pos].sort().every((v,i)=>v===i+1)
    &&['.','/','-'].includes(f.date_separator)&&[' ', ', ', '\u00a0', ',\u00a0'].includes(f.time_prefix)
    &&f.time_separator===':'&&['.',','].includes(f.millisecond_separator),'Observed datetime format required');
   const [year,month,day]=d.split('-'),parts=[];
   parts[f.year_pos-1]=year;parts[f.month_pos-1]=month;parts[f.day_pos-1]=day;
   return parts.join(f.date_separator)+f.time_prefix+t.replace('.',f.millisecond_separator);
  }
  return d.split('-').reverse().join('.')+(datetimeCombo?', ':' ')+t;
 }
 if(type==='real'){need(['.',','].includes(decimalSeparator),'Observed numeric separator required');return String(value).replace('.',decimalSeparator);}
 return String(value);
}

// Complete replacement with observed, identity-bound gestures. A lost reply
// escapes through the common receipt/reconciliation mechanism; never re-add.
export async function configureFilter(channel,parameters){
 const ready=s=>s.wizard?.stage==='row_filter'&&s.node_filter?.verified===true;
 const observe=(condition,predicate=()=>true)=>channel.observe({condition,readFilter:true,ready:s=>ready(s)&&predicate(s)});
 let s=await observe('complete filter baseline');
 const baseline=s.node_filter;
 if(parameters.groups===undefined){
  need(Object.keys(parameters).length===0&&!baseline.dialogs.length&&!baseline.editor,'Saved filter must be settled before reuse');
  const groups=filterGroupsFromNative(baseline);
  return {verified:true,cleanup_complete:true,effect_possible:false,baseline,configuration:baseline,groups,preserved:true};
 }
 validateFilterConditions(parameters);
 const groups=resolveFilterConditions(parameters,baseline.input_fields),expected=[];
 for(const c of groups.flat())if(c.type==='datetime'){
  const arity=FILTER_OPERATORS[c.operator]?.arity??1,values=arity===1?[c.value]:arity===2?[c.lower,c.upper]:[];
  if(values.some(v=>v.length>19&&!v.endsWith('.000'))){
   const field=baseline.input_fields.find(f=>f.name===c.field.name);
   need(field?.data_kind==='Дискретный','Datetime scalar/range milliseconds require an observed discrete input field; the continuous native editor supports whole seconds');
  }
 }
 need(!baseline.dialogs.length,'Close an existing filter value dialog before replacing conditions');
 const one=(s,predicate,message)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,message);return es[0];};
 const action=async(condition,s,resolve,identity=()=>s.prepared_node_context)=>channel.perform({condition,initialObservation:s,ready,identity,resolve});
 const click=async(condition,s,predicate,identity)=>action(condition,s,s=>({verb:'click',ref:one(s,e=>predicate(e)&&e.allowed_actions.includes('click'),condition+' unavailable').ref}),identity);
 const button=key=>e=>e.tid===s.wizard.root_tid+';FilterDataWizard;FilterDataPanel;'+key;
 const row=s=>s.node_filter.rows.at(-1);
 const sameSchema=s=>need(same(s.node_filter.input_fields,baseline.input_fields),'Filter input schema changed during configuration');
 for(let attempt=0;s.node_filter.editor&&attempt<3;attempt++){
  const id=s.node_filter.editor.record_id;
  const controls=s.ui.elements.filter(e=>e.filter_cell?.record_id===id&&e.allowed_actions.includes('press'));
  const control=controls.find(e=>e.filter_cell.part==='option')??controls.find(e=>e.filter_cell.part==='editor'&&(e.signature.tag==='input'||e.tid?.endsWith(';BooleanPropEdit;ValueControl')))??s.ui.elements.find(e=>s.node_filter.editor.field==='CaseSensitive'&&e.tid?.endsWith(';FilterDataPanel;BooleanPropEdit;ValueControl;DisplayEl')&&e.allowed_actions.includes('press'));
  need(control,'Filter editor input unavailable');
  await action('close inherited filter cell editor',s,()=>({verb:'press',ref:control.ref,key:'Escape'}));
  s=await observe('inherited filter editor reconciled');
 }
 need(!s.node_filter.editor,'Filter inherited editor remains open');
 while(s.node_filter.rows.length){
  sameSchema(s);const target=row(s),before=s.node_filter.rows.map(r=>r.record_id);
  for(let attempt=0;!s.ui.elements.some(e=>e.tid===target.cells?.delete&&e.allowed_actions.includes('click')&&centered(e));attempt++){
   need(attempt<32,'Final filter row cannot be revealed');
   const visible=s.ui.elements.filter(e=>e.filter_cell?.part==='Field'&&e.scroll&&e.allowed_actions.includes('scroll'))
    .sort((a,b)=>a.filter_cell.index-b.filter_cell.index);
   need(visible.length,'Visible filter row scroll anchor unavailable');
   const anchor=visible[Math.floor(visible.length/2)],scroll=anchor.scroll;
   const direction=target.index>anchor.filter_cell.index?1:-1;
   await action('reveal exact final filter row',s,()=>({verb:'scroll',ref:anchor.ref,delta_y:direction*400}),()=>({record_id:target.record_id,scroll_owner:scroll.ref}));
   s=await observe('filter rows scrolled');sameSchema(s);
   need(same(s.node_filter.rows.map(r=>r.record_id),before),'Filter inventory changed while revealing final row');
   const after=s.ui.elements.find(e=>e.scroll?.ref===scroll.ref)?.scroll;
   need(after&&direction*(after.top-scroll.top)>0,'Filter row scroll made no progress');
  }
  await click('remove exact final filter row',s,e=>e.tid===target.cells?.delete,()=>({record_id:target.record_id}));
  s=await observe('filter row deletion applied',s=>!s.node_filter.rows.some(r=>r.record_id===target.record_id));
  need(same(s.node_filter.rows.map(r=>r.record_id),before.slice(0,-1)),'Filter deletion changed other conditions');
 }
 for(const [groupIndex,group] of groups.entries()){
  if(groupIndex){
   const count=s.node_filter.rows.length;
   await click('append OR separator',s,button('btnAddOR'));
   s=await observe('OR separator appended',s=>s.node_filter.rows.length===count+1&&row(s).kind==='or');
   expected.push({kind:'or',record_id:row(s).record_id});
  }
  for(const wanted of group){
   sameSchema(s);const count=s.node_filter.rows.length;
   await click('append one filter condition',s,button('btnAdd'));
   s=await observe('new condition editor ready',s=>s.node_filter.rows.length===count+1&&row(s).kind==='condition'&&s.node_filter.editor?.record_id===row(s).record_id);
   const id=row(s).record_id,identity=()=>({record_id:id});
   const current=s=>{const matches=s.node_filter.rows.filter(r=>r.record_id===id);need(matches.length===1,'Filter condition identity disappeared');return matches[0];};
   const picker=e=>e.filter_cell?.record_id===id&&e.filter_cell.part==='editor'&&e.tid?.endsWith(';trg_picker');
   await click('open exact filter field choices',s,picker,identity);
   const fieldName=wanted.field.kind==='row_number'?'':wanted.field.name;
   const fieldOption=e=>e.filter_cell?.record_id===id&&e.filter_cell.part==='option'&&e.filter_cell.field==='Name';
   s=await observe('filter input field choices',s=>s.node_filter.editor?.record_id===id&&s.node_filter.editor.field==='Name'&&s.ui.elements.some(fieldOption));
   const fieldIndex=value=>{if(value==='')return -1;const index=baseline.input_fields.findIndex(f=>f.name===value);need(index>=0,'Unknown native filter field option');return index;};
   const wantedIndex=fieldIndex(fieldName),beforeFields=JSON.stringify(s.node_filter.rows);
   for(let reveal=0;!s.ui.elements.some(e=>fieldOption(e)&&e.filter_cell.value===fieldName&&centered(e));reveal++){
    need(reveal<130,'Filter input field cannot be revealed');sameSchema(s);
    const visible=s.ui.elements.filter(e=>fieldOption(e)&&centered(e)&&e.scroll&&e.allowed_actions.includes('scroll'));
    need(visible.length,'Visible filter input field scroll anchor unavailable');
    const indices=visible.map(e=>fieldIndex(e.filter_cell.value));
    const direction=wantedIndex<Math.min(...indices)?-1:wantedIndex>Math.max(...indices)?1:0;
    need(direction!==0,'Filter input field is obscured');
    const anchor=visible[Math.floor(visible.length/2)],scroll=anchor.scroll;
    const delta=direction*Math.min(800,Math.max(24,Math.abs(wantedIndex-fieldIndex(anchor.filter_cell.value))*anchor.bounding_box.height));
    await action('reveal exact filter input field',s,()=>({verb:'scroll',ref:anchor.ref,delta_y:delta}),()=>({record_id:id,scroll_owner:scroll.ref}));
    s=await observe('filter input field list scrolled',s=>s.node_filter.editor?.record_id===id&&s.node_filter.editor.field==='Name');sameSchema(s);
    need(JSON.stringify(s.node_filter.rows)===beforeFields,'Filter conditions changed while revealing field');
    const after=s.ui.elements.find(e=>fieldOption(e)&&e.scroll?.ref===scroll.ref)?.scroll;
    need(after&&direction*(after.top-scroll.top)>0,'Filter input field scroll made no progress');
   }
   await click('select exact filter input field',s,e=>e.filter_cell?.record_id===id&&e.filter_cell.part==='option'&&e.filter_cell.value===fieldName,identity);
   s=await observe('field selection committed',s=>sameField(current(s).field,wanted.field)&&current(s).type===wanted.type&&s.node_filter.editor?.field==='RelationType');
   await click('open filter operator choices',s,picker,identity);
   const operator=FILTER_OPERATORS[wanted.operator],label=operator.label??wanted.operator;
   s=await observe('compatible native filter operator',s=>s.ui.elements.some(e=>e.filter_cell?.record_id===id&&e.filter_cell.part==='option'&&e.filter_cell.label===label));
   const operatorOption=e=>e.filter_cell?.record_id===id&&e.filter_cell.part==='option'&&e.filter_cell.label===label;
   let option=one(s,operatorOption,'Native filter operator unavailable');
   for(let reveal=0;!centered(option)&&reveal<4;reveal++){
    const scroll=option.scroll;
    need(scroll&&scroll.max_top>0,'Filter operator has no observed scroll owner');
    const anchor=s.ui.elements.find(e=>e.filter_cell?.record_id===id&&e.filter_cell.part==='option'&&e.scroll?.ref===scroll.ref&&centered(e)&&e.allowed_actions.includes('scroll'));
    need(anchor,'Visible filter operator scroll anchor unavailable');
    const delta=Math.max(-240,Math.min(240,option.bounding_box.y-anchor.bounding_box.y));
    need(delta!==0,'Filter operator scroll did not progress');
    await action('reveal exact filter operator',s,()=>({verb:'scroll',ref:anchor.ref,delta_y:delta}),()=>({record_id:id,scroll_owner:scroll.ref}));
    s=await observe('filter operator list scrolled',s=>s.ui.elements.some(e=>operatorOption(e)&&e.scroll?.ref===scroll.ref&&e.scroll.top!==scroll.top));
    option=one(s,operatorOption,'Native filter operator disappeared');
   }
   need(centered(option),'Filter operator remains clipped');
   const code=option.filter_cell.value;need(Number.isInteger(code)&&(operator.code===undefined||operator.code===code),'Filter operator identity differs');
   await click('select filter operator',s,e=>e.ref===option.ref,identity);
   s=await observe('filter operator committed',s=>current(s).operator_code===code);
   const arity=operator.arity??1;
   const typedText=(s,value,predicate)=>{
    const input=one(s,e=>predicate(e)&&e.allowed_actions.includes('fill'),'Typed filter input unavailable');
    const formats=s.node_filter.numeric_inputs?.filter(f=>f.anchor_tid===input.identity.anchor_tid)??[];
    need(formats.length<=1,'Ambiguous filter input numeric format');
    const combo=input.identity.anchor_tid?.endsWith(';cbx');
    const dates=s.node_filter.datetime_inputs?.filter(f=>f.anchor_tid===input.identity.anchor_tid)??[];
    if(wanted.type==='datetime')need(dates.length===1,'Unique bound datetime format required');
    return filterInputText(value,wanted.type,formats[0]?.decimal_separator??s.node_filter.decimal_separator,combo,dates[0]?.format);
   };
   const inputAction=async(value,predicate)=>{
    s=await observe('bound typed filter input',s=>s.ui.elements.some(e=>predicate(e)&&e.allowed_actions.includes('fill')));
    const text=typedText(s,value,predicate);
    await action('fill typed filter value',s,s=>({verb:'fill',ref:one(s,e=>predicate(e)&&e.allowed_actions.includes('fill'),'Typed filter input unavailable').ref,text}),identity);
    s=await observe('filter input text applied',s=>s.ui.elements.some(e=>predicate(e)&&e.value===text));
    await action('commit typed filter value',s,s=>({verb:'press',ref:one(s,e=>predicate(e)&&e.allowed_actions.includes('press'),'Typed filter commit unavailable').ref,key:'Tab'}),identity);
    s=await observe('typed filter input committed');
   };
   if(arity===2||arity==='list'){
    s=await observe('filter value dialog trigger',s=>s.ui.elements.some(e=>e.tid?.endsWith(';PropTriggerEditor;pickerfield;trg_picker')&&e.allowed_actions.includes('click')));
    await click('open bound filter value dialog',s,e=>e.tid?.endsWith(';PropTriggerEditor;pickerfield;trg_picker'),identity);
    const kind=arity===2?'range':'list';
    s=await observe('filter value dialog owned by condition',s=>s.node_filter.dialogs.length===1&&s.node_filter.dialogs[0].kind===kind&&s.node_filter.dialogs[0].record_id===id);
    const root=s.node_filter.dialogs[0].root_tid;
    if(arity===2){
     for(const [key,value] of [['Min',wanted.lower],['Max',wanted.upper]])await inputAction(value,e=>e.signature.tag==='input'&&e.identity.anchor_tid?.startsWith(root+';BetweenValuesEditor;edt'+key+'Value;ValueContainer;'));
    }else{
     for(const value of wanted.values){
      await click('append one list value',s,e=>e.tid===root+';ValueListEditor;btnAdd',identity);
      const input=e=>e.signature.tag==='input'&&e.identity.anchor_tid?.includes(';VariantFieldEditor;')&&e.identity.anchor_tid.startsWith(root+';');
      s=await observe('new list value editor',s=>s.ui.elements.some(e=>input(e)&&e.allowed_actions.includes('fill')));
      const text=typedText(s,value,input);
      await action('fill list literal',s,s=>({verb:'fill',ref:one(s,e=>input(e)&&e.allowed_actions.includes('fill'),'List input unavailable').ref,text}),identity);
      s=await observe('list input filled');
      await action('commit one list value',s,s=>({verb:'press',ref:one(s,e=>input(e)&&e.allowed_actions.includes('press'),'List input unavailable').ref,key:'Enter'}),identity);
      s=await observe('list value editor closed',s=>!s.ui.elements.some(e=>input(e)&&e.allowed_actions.includes('fill')));
     }
    }
    await click('apply filter value dialog once',s,e=>e.tid===root+';btnApply',identity);
    s=await observe('filter value dialog committed',s=>s.node_filter.dialogs.length===0&&filterConditionMatches({...current(s),case_sensitive:wanted.case_sensitive},wanted,code));
   }else if(arity===1){
    const input=e=>e.signature.tag==='input'&&e.identity.anchor_tid?.includes(';FilterDataPanel;VariantPropEdit;ValueContainer;');
    await inputAction(wanted.value,input);
    s=await observe('scalar filter value committed',s=>literal(current(s).value,wanted.value,wanted.type));
   }
   if(wanted.type==='string'&&arity!==0&&(current(s).case_sensitive!==wanted.case_sensitive||s.node_filter.editor?.field==='CaseSensitive')){
    // Committing a string value with Tab already opens this row's case editor.
    if(s.node_filter.editor?.record_id!==id||s.node_filter.editor.field!=='CaseSensitive')
     await click('set explicit filter case policy',s,e=>e.tid===current(s).cells.case_sensitive,identity);
    const checkbox=e=>e.tid?.endsWith(';FilterDataPanel;BooleanPropEdit;ValueControl;DisplayEl');
    s=await observe('case policy editor open',s=>s.node_filter.editor?.record_id===id&&s.node_filter.editor.field==='CaseSensitive'&&s.ui.elements.some(e=>checkbox(e)&&e.check_state));
    const box=one(s,checkbox,'Case checkbox unavailable');
    if(box.check_state.checked!==wanted.case_sensitive){
     await action('toggle bound case checkbox',s,s=>({verb:'press',ref:one(s,e=>e.tid?.endsWith(';BooleanPropEdit;ValueControl')&&e.filter_cell?.record_id===id&&e.allowed_actions.includes('press'),'Case checkbox owner unavailable').ref,key:'Space'}),identity);
     s=await observe('case checkbox selected',s=>s.ui.elements.some(e=>checkbox(e)&&e.check_state?.checked===wanted.case_sensitive));
    }
    await action('commit case editor',s,s=>({verb:'press',ref:one(s,e=>e.tid?.endsWith(';BooleanPropEdit;ValueControl')&&e.filter_cell?.record_id===id&&e.allowed_actions.includes('press'),'Case commit unavailable').ref,key:'Tab'}),identity);
    s=await observe('case policy committed',s=>current(s).case_sensitive===wanted.case_sensitive);
   }
   need(filterConditionMatches(current(s),wanted,code),'Filter condition readback differs');
   expected.push({kind:'condition',record_id:id,wanted,code});
   for(const [i,e] of expected.entries())need(e.kind==='or'?s.node_filter.rows[i]?.kind==='or'&&s.node_filter.rows[i].record_id===e.record_id
    :s.node_filter.rows[i]?.record_id===e.record_id&&filterConditionMatches(s.node_filter.rows[i],e.wanted,e.code),'Earlier filter condition changed');
  }
 }
 sameSchema(s);need(s.node_filter.rows.length===expected.length,'Unexpected final filter rows');
 return {verified:true,cleanup_complete:true,effect_possible:true,baseline_configuration:baseline,configuration:s.node_filter,groups,
  preservation:{input_schema:true},settings_applied:false};
}
