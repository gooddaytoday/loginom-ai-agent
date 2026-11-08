import test from 'node:test';
import assert from 'node:assert/strict';
import {configureGrouping} from '../lib/grouping-procedure.mjs';
import {validateUiAction} from '../lib/workspace-ui.mjs';

function fixture(fn,bit){
 const concat={separator:',',wrapper:'',unique:false,sort:false,direction:0};
 const input_fields=[{record_id:'key',name:'Region',label:'Region',type:'string',disposition:6,order:0,functions:0,concat:{...concat}},
  {record_id:'amount',name:'Amount',label:'Amount',type:'integer',disposition:7,order:0,functions:18,concat:{...concat}}];
 const native={verified:true,input_fields,keys:input_fields.slice(0,1),measures:input_fields.slice(1),selected_records:['amount'],options:{cache:true,sort:false}};
 const names=['sum','count','min','max','average','median','mode','standard_deviation','unique_count','null_count','first','last','only','concat'];
 let editor=null;const actions=[];
 const combos={separator:{tid:'W;FactorEditDialog;cntCheckboxes;fs;cbxConcatSeparator',editable:true,choices:[{value:',',label:'Запятая (,)'}]},
  wrapper:{tid:'W;FactorEditDialog;cntCheckboxes;fs;cbxConcatWrapper',editable:false,choices:[{value:'',label:'Без ограничителя строк'},{value:'"',label:'Двойная кавычка'},{value:"'",label:'Одинарная кавычка'}]},
  order:{tid:'W;FactorEditDialog;cntCheckboxes;fs;fc;cbxConcatSort',editable:false,choices:[{value:0,label:'Без сортировки'},{value:1,label:'По возрастанию'},{value:2,label:'По убыванию'}]}};
 const comboValue=key=>key==='order'?editor.concat.sort?editor.concat.direction+1:0:editor.concat[key];
 const state=()=>({wizard:{stage:'grouping',root_tid:'W',factor_editor:editor?{status:'rendered_factor_options',selected_field:{field_key:'Amount'},
  options:names.map((aggregation,i)=>({aggregation,checked:(editor.mask&(1<<i))!==0,enabled:true,display_ref:'bit'+i}))}:undefined},
  node_grouping:{...structuredClone(native),...(editor?{factor_concat:Object.fromEntries(Object.entries(combos).map(([key,c])=>[key,{...c,value:comboValue(key)}]))}:{})},ui:{elements:[{ref:'key',grouping_field:{field_key:'Region',role:'group'},allowed_actions:['click']},{ref:'amount',grouping_field:{field_key:'Amount',role:'measure'},allowed_actions:['click','double_click']},
   ...Object.entries(combos).map(([key,c])=>({ref:key,identity:{anchor_tid:c.tid},role:'combobox',allowed_actions:['fill','press']})),
   {ref:'unique',tid:'W;FactorEditDialog;cntCheckboxes;fs;fc;chkConcatUniqueOnly;DisplayEl',check_state:{checked:editor?.concat.unique},allowed_actions:['set_checked']},
   {ref:'apply',tid:'W;FactorEditDialog;btnApply',allowed_actions:['click']}]}});
 const channel={async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},async perform(o){
  const s=state();assert.ok(o.ready(s),o.condition);const action=o.resolve(s);validateUiAction({...action,ref:'ui-fixture'});actions.push(action);
  if(action.verb==='click'&&['key','amount'].includes(action.ref))native.selected_records=[action.ref];
  else if(action.verb==='double_click')editor={mask:input_fields[1].functions,concat:structuredClone(input_fields[1].concat),index:0};
  else if(action.verb==='fill')editor.concat[action.ref]=action.text;
  else if(action.verb==='press'){
   if(action.key==='Home')editor.index=0;
   if(action.key==='ArrowDown')editor.index++;
   if(action.key==='Enter'){
    const value=combos[action.ref].choices[editor.index].value;
    if(action.ref==='order'){editor.concat.sort=value!==0;editor.concat.direction=value===2?1:0;}
    else editor.concat[action.ref]=value;
   }
  }
  else if(action.ref==='unique')editor.concat.unique=action.checked;
  else if(action.verb==='set_checked'){
   const flag=1<<Number(action.ref.slice(3));editor.mask=action.checked?editor.mask|flag:editor.mask&~flag;
  }else if(action.ref==='apply'){
   input_fields[1].functions=editor.mask;input_fields[1].concat=editor.concat;editor=null;
   channel.afterApply?.(native);
  }else assert.fail('unexpected action '+JSON.stringify(action));
 }};
 return {channel,native,actions,parameters:{group_by:[{kind:'input_field',name:'Region'}],measures:[{field:{kind:'input_field',name:'Amount'},function:fn,name:'Metric',label:'Metric'}]},bit};
}
for(const [fn,bit] of [['first',1024],['last',2048],['only',4096]]){
 test(`Grouping ${fn} sets exactly its native mask and preserves unrelated settings`,async()=>{
  const f=fixture(fn,bit),before=structuredClone(f.native);
  const result=await configureGrouping(f.channel,f.parameters);
  assert.equal(result.verified,true);assert.equal(f.native.measures[0].functions,bit);
  assert.deepEqual(f.native.options,before.options);
  assert.deepEqual(f.native.input_fields.map(f=>f.concat),before.input_fields.map(f=>f.concat));
  assert.equal(f.actions.filter(a=>a.ref==='apply').length,1);
  const calls=f.actions.filter(a=>a.verb==='double_click').length;
  await configureGrouping(f.channel,f.parameters);
  assert.equal(f.actions.filter(a=>a.verb==='double_click').length,calls,'an unchanged mask needs no editor');
 });
}
test('Grouping refuses a native factor mask that did not apply',async()=>{
 const f=fixture('first',1024);f.channel.afterApply=n=>n.measures[0].functions=2;
 await assert.rejects(configureGrouping(f.channel,f.parameters),/bitset differs/);
});
test('Grouping concat changes options even when the mask is unchanged, then preserves them without mutation',async()=>{
 const f=fixture('concat',8192);
 f.native.measures[0].functions=8192;
 f.parameters.measures[0].concat={separator:'|',wrapper:'"',unique:true,order:'DESC'};
 const key=structuredClone(f.native.keys[0]);
 const result=await configureGrouping(f.channel,f.parameters);
 assert.equal(result.preservation.concat_options,false);
 assert.deepEqual(f.native.measures[0].concat,{separator:'|',wrapper:'"',unique:true,sort:true,direction:1});
 assert.deepEqual(f.native.keys[0],key);
 for(const order of ['ASC','none']){
  f.parameters.measures[0].concat.order=order;
  await configureGrouping(f.channel,f.parameters);
  assert.equal(f.native.measures[0].concat.sort,order!=='none');
  if(order==='ASC')assert.equal(f.native.measures[0].concat.direction,0);
 }
 const calls=f.actions.filter(a=>a.verb==='double_click').length;
 await configureGrouping(f.channel,f.parameters);
 await configureGrouping(f.channel,{});
 assert.equal(f.actions.filter(a=>a.verb==='double_click').length,calls);
});
test('Grouping concat refuses incorrect native settings after Apply',async()=>{
 const f=fixture('concat',8192);f.parameters.measures[0].concat={separator:'|',wrapper:'',unique:false,order:'none'};
 f.channel.afterApply=n=>n.measures[0].concat.separator=',';
 await assert.rejects(configureGrouping(f.channel,f.parameters),/concat settings differ/);
});
