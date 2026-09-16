import test from 'node:test';import assert from 'node:assert/strict';
import {configureMissingValues} from '../lib/missing-values-procedure.mjs';
function fixture(){
 const fields=[{index:0,record_id:'a',name:'Amount',label:'Same',type:'real',data_kind:'Непрерывный'},{index:1,record_id:'b',name:'Note',label:'Same',type:'string',data_kind:'Дискретный'}];
 const c={verified:true,inventory_complete:true,input_fields:fields,fields:fields.map((f,i)=>({...f,used:true,method:i?'constant':'mean',method_code:i?6:3,value:'old'})),ordered:false,max_nulls_percent:50,editor:null,
  options:{pedOrderedSample:{value:false,switch_pressed:false},pedMaxNullsPercent:{value:50,switch_pressed:false},pedUseQuality:{value:false,switch_pressed:false},'RandSeedEdit;edtRandSeed':{value:'1',switch_pressed:false}}};
 const actions=[],flags={},snapshot=()=>({wizard:{stage:'missing_values',root_tid:'root'},node_missing_values:structuredClone(c),ui:{dialogs:[],elements:c.fields.flatMap(f=>['usage','method'].map(part=>({ref:f.name+':'+part,missing_values_field:{field_key:f.name,part,record_id:f.record_id},allowed_actions:['click','press']})))}});
 const channel={observe:async()=>snapshot(),perform:async spec=>{if(flags.ownerChanged)throw Error('owner changed');const action=spec.resolve(snapshot());actions.push(action);if(!flags.dropGesture&&action.ref.endsWith(':usage')){const f=c.fields.find(f=>action.ref===f.name+':usage');f.used=!f.used;}if(flags.sideEffect)c.input_fields[0].type='integer';}};
 return {c,flags,actions,run:p=>configureMissingValues(channel,p)};
}
test('preserve saved supported methods without rewriting or computing means',async()=>{const f=fixture(),r=await f.run({});assert.deepEqual(f.actions,[]);assert.equal(r.configuration.max_nulls_percent,50);assert.equal(r.configuration.fields[0].method,'mean');});
test('full requested processing set explicitly disables omitted fields',async()=>{const f=fixture(),r=await f.run({ordered:false,max_nulls_percent:50,fields:[{field:{kind:'input_field',name:'Amount'},method:'mean'}]});assert.equal(r.configuration.fields[1].used,false);assert.deepEqual(f.actions,[{verb:'click',ref:'Note:usage'}]);});
test('unsupported saved methods, variables and incompatible types are rejected before gestures',async()=>{
 for(const mutate of [f=>f.c.fields[0].method='median',f=>f.c.options.pedMaxNullsPercent.switch_pressed=true,f=>f.c.options.pedUseQuality.value=true,f=>f.c.ordered=true,f=>f.c.input_fields[0].data_kind='Дискретный']){const f=fixture();mutate(f);await assert.rejects(f.run({}));assert.deepEqual(f.actions,[]);}
});
test('dropped membership edits and unrelated schema mutations cannot produce verified configuration',async()=>{
 for(const flag of ['dropGesture','sideEffect','ownerChanged']){const f=fixture();f.flags[flag]=true;await assert.rejects(f.run({ordered:false,max_nulls_percent:50,fields:[{field:{kind:'input_field',name:'Amount'},method:'mean'}]}));}
});
test('constant dialog uses retained field context after cell editing ends and rejects owner changes',async()=>{
 for(const foreign of [false,true]){
  const f=fixture(),base='root;DataRecoveryWizard;',editorBase=base+'grdColumnsSettings;tbl;celleditor;cbx';let dialog=false;
  const owner={field_name:'Note',record_id:'b',property:'method'},actions=[];
  const snapshot=()=>({wizard:{stage:'missing_values',root_tid:'root'},node_missing_values:structuredClone(f.c),ui:{dialogs:dialog?[{ref:'dialog',title:'Редактирование значения замены для пропусков'}]:[],elements:[
   ...f.c.fields.flatMap(field=>['usage','method','constant'].map(part=>({ref:field.name+':'+part,missing_values_field:{field_key:field.name,part},allowed_actions:['click','press']}))),
   {tid:editorBase+';boundlist;Заменять_заданным_значением',ref:'option',allowed_actions:['click']},
   {ref:'input',signature:{dialog_ref:'dialog'},identity:{anchor_tid:'msgbox;cnt;cnt;txt'},allowed_actions:['fill']},
   {tid:'msgbox;tlb;ok',ref:'okay',allowed_actions:['click']} ]}});
  const channel={observe:async()=>snapshot(),perform:async spec=>{
   const a=spec.resolve(snapshot());actions.push(a);
   if(a.ref==='Note:method'){f.c.editor=owner;f.c.method_context=owner;}
   if(a.ref==='Note:constant'){dialog=true;f.c.editor=null;if(foreign)f.c.method_context={...owner,record_id:'foreign'};}
   if(a.ref==='input')f.c.fields[1].value=a.text;
   if(a.ref==='okay')dialog=false;
  }};
  const request={ordered:false,max_nulls_percent:50,fields:[{field:{kind:'input_field',name:'Amount'},method:'mean'},{field:{kind:'input_field',name:'Note'},method:'constant',value:''}]};
  if(foreign){await assert.rejects(configureMissingValues(channel,request),/owner differs/);assert.ok(!actions.some(a=>a.verb==='fill'));}
  else {const result=await configureMissingValues(channel,request);assert.equal(result.configuration.fields[1].value,'');assert.ok(!actions.some(a=>a.verb==='press'));}
 }
});

test('new mean selection is committed before trusting the cached record',async()=>{
 const f=fixture(),base='root;DataRecoveryWizard;grdColumnsSettings;tbl;celleditor;cbx';
 f.c.fields[0].method=null;f.c.fields[0].method_code=4;let selected=false,committed=false,actions=[];
 const snapshot=()=>({wizard:{stage:'missing_values',root_tid:'root'},node_missing_values:structuredClone(f.c),ui:{dialogs:[],elements:[
  ...f.c.fields.flatMap(field=>['usage','method'].map(part=>({ref:field.name+':'+part,missing_values_field:{field_key:field.name,part},allowed_actions:['click']}))),
  {ref:'mean',tid:base+';boundlist;Заменять_средним',allowed_actions:['click']},
  {ref:'editor',identity:{anchor_tid:base},allowed_actions:['press']}
 ]}});
 const channel={observe:async spec=>{if(committed){f.c.fields[0].method='mean';f.c.fields[0].method_code=3;f.c.editor=null;}const s=snapshot();assert.equal(spec.ready(s),true);return s;},perform:async spec=>{
  const a=spec.resolve(snapshot());actions.push(a);
  if(a.ref==='Amount:method')f.c.editor={field_name:'Amount',record_id:'a',property:'method'};
  if(a.ref==='mean')selected=true; // Loginom keeps the old record until blur.
  if(a.ref==='editor'){assert.equal(selected,true);assert.equal(a.key,'Enter');committed=true;}
  if(a.ref==='Note:usage')f.c.fields[1].used=false;
 }};
 const result=await configureMissingValues(channel,{ordered:false,max_nulls_percent:50,fields:[{field:{kind:'input_field',name:'Amount'},method:'mean'}]});
 assert.equal(result.configuration.fields[0].method,'mean');assert.equal(committed,true);assert.equal(actions.filter(a=>a.verb==='press').length,1);
});
