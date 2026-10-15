import test from 'node:test';
import assert from 'node:assert/strict';
import {configureGrouping} from '../lib/grouping-procedure.mjs';
import {validateGroupingParameters} from '../lib/grouping-parameters.mjs';
const field=name=>({kind:'input_field',name});
const measure=(name,fn)=>({field:field(name),function:fn,name:name+'_'+fn,label:name+' '+fn});
const request={target:{kind:'existing'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'};
const aggregations=['sum','count','min','max','average','median','mode','standard_deviation','unique_count','null_count','first','last','only','concat'];

// External native-state double; production configureGrouping performs every
// role/order/factor action and checks all its readbacks against these snapshots.
function channelFixture({amountFunctions=2}={}){
 const records=[['Region','string',6,0,0],['Product','string',6,1,0],['Amount','real',7,0,amountFunctions],['Quantity','integer',7,1,1],['Text','string',0,-1,0]]
  .map(([name,type,disposition,order,functions],i)=>({name,type,disposition,order,functions,label:name,record_id:'r'+i,concat:{separator:',',unique:false}}));
 const options={sort_result:true,cache:false},actions=[];let selected=null,editor=null;
 const section=d=>records.filter(f=>f.disposition===d).sort((a,b)=>a.order-b.order);
 const snapshot=()=>({wizard:{stage:'grouping',root_tid:'root',...(editor?{factor_editor:{status:'rendered_factor_options',selected_field:{field_key:editor.name},options:aggregations.map((aggregation,i)=>({aggregation,checked:(editor.mask&(1<<i))!==0,enabled:true,display_ref:'option:'+i}))}}:{})},
  node_grouping:{verified:true,input_fields:structuredClone(records),keys:structuredClone(section(6)),measures:structuredClone(section(7)),selected_records:selected?[selected.record_id]:[],options:structuredClone(options)},
  ui:{elements:[...records.map(f=>({ref:'field:'+f.name,tid:f.name,grouping_field:{field_key:f.name,role:f.disposition===6?'group':f.disposition===7?'measure':'available'},allowed_actions:['click','press','double_click']})),
   ...[';GroupDataWizard;frmMoveButtons;btnMove0',';GroupDataWizard;frmMoveButtons;btnMove1',';GroupDataWizard;btnUp',';FactorEditDialog;btnApply'].map(s=>({ref:s,tid:'root'+s,allowed_actions:['click']}))]}});
 const channel={observe:async spec=>{const s=snapshot();assert.equal(spec.ready(s),true,spec.condition);return s;},perform:async spec=>{
  const s=snapshot();assert.equal(spec.ready(s),true,spec.condition);assert.ok(spec.identity(s));const a=spec.resolve(s);actions.push(a);
  if(a.ref.startsWith('field:')){
   const f=records.find(f=>'field:'+f.name===a.ref);assert.ok(f);
   if(a.verb==='click')selected=f;
   else if(a.verb==='double_click'){assert.equal(selected,f);editor={name:f.name,mask:f.functions};}
   else if(a.verb==='press'){assert.equal(a.key,'Delete');const old=f.disposition;f.disposition=0;f.order=-1;section(old).forEach((f,i)=>f.order=i);}
   else assert.fail('unexpected field action');
  }else if(a.ref.startsWith('option:')){assert.equal(a.verb,'set_checked');const bit=1<<Number(a.ref.slice(7));editor.mask=a.checked?editor.mask|bit:editor.mask&~bit;}
  else if(a.ref.includes('btnMove')){const d=a.ref.endsWith('0')?6:7;selected.order=section(d).length;selected.disposition=d;if(d===7)selected.functions=2|1024;}
  else if(a.ref.endsWith('btnUp')){const above=section(selected.disposition).find(f=>f.order===selected.order-1);assert.ok(above);above.order++;selected.order--;}
  else if(a.ref.endsWith('btnApply')){assert.equal(editor.name,selected.name);selected.functions=editor.mask;editor=null;}
  else assert.fail('unexpected action');return snapshot();
 }};
 return {channel,actions,records,options};
}
const run=(fixture,p)=>{validateGroupingParameters(p,'aggregate',request);return configureGrouping(fixture.channel,p);};

test('complete ordered grouping configuration replaces roles and removes default extra functions',async()=>{
 const f=channelFixture(),p={group_by:[field('Product'),field('Region')],measures:[measure('Text','count'),...['sum','count','avg','min','max'].map(fn=>measure('Amount',fn)),measure('Quantity','sum')]};
 const result=await run(f,p);
 assert.deepEqual(result.configuration.keys.map(x=>x.name),['Product','Region']);
 assert.deepEqual(result.configuration.measures.map(x=>[x.name,x.functions]),[['Text',2],['Amount',31],['Quantity',1]]);
 assert.deepEqual(result.requested_output,p.measures.map(m=>({field:m.field.name,function:m.function,name:m.name,label:m.label})));
 assert.deepEqual(result.configuration.options,f.options);
 assert.ok(f.actions.some(a=>a.verb==='set_checked'&&a.checked===false&&a.ref==='option:10'),'default first must be disabled');
});

test('sum to average enables average and preserves Quantity, options and input identity',async()=>{
 const f=channelFixture({amountFunctions:1}),original=structuredClone(f.records),p={group_by:[field('Region'),field('Product')],measures:[measure('Amount','avg'),measure('Quantity','sum')]};
 const result=await run(f,p);
 assert.deepEqual(result.configuration.measures.map(x=>[x.name,x.functions]),[['Amount',16],['Quantity',1]]);
 assert.deepEqual(result.configuration.input_fields.map(({disposition,order,functions,...x})=>x),original.map(({disposition,order,functions,...x})=>x));
 assert.ok(f.actions.filter(a=>a.verb==='double_click').every(a=>a.ref==='field:Amount'));
 assert.deepEqual(result.configuration.options,f.options);
 assert.ok(f.actions.some(a=>a.ref==='option:4'&&a.checked===true));
 assert.ok(f.actions.some(a=>a.ref==='option:0'&&a.checked===false));
});

for(const [fn,bit,index] of [['sum',1,0],['count',2,1],['avg',16,4],['min',4,2],['max',8,3]]){
 test(`enables initially absent ${fn} and removes the previous function`,async()=>{
  const f=channelFixture({amountFunctions:fn==='count'?1:2});
  const result=await run(f,{group_by:[field('Region'),field('Product')],measures:[measure('Amount',fn),measure('Quantity','sum')]});
  assert.deepEqual(result.configuration.measures.map(x=>[x.name,x.functions]),[['Amount',bit],['Quantity',1]]);
  assert.ok(f.actions.some(a=>a.verb==='set_checked'&&a.ref===`option:${index}`&&a.checked===true));
  assert.deepEqual(result.configuration.options,f.options);
 });
}

test('invalid field/function pairs, output names and key-as-measure refuse before mutation',async()=>{
 for(const change of [p=>p.measures.push({...p.measures[0],name:'Another'}),p=>p.measures[1].name=p.measures[0].name,p=>p.measures[0].field=field('Region')]){
  const f=channelFixture(),p={group_by:[field('Region')],measures:[measure('Amount','sum'),measure('Quantity','sum')]};change(p);
  await assert.rejects(async()=>run(f,p));assert.deepEqual(f.actions,[]);
 }
});

test('string sum and average refuse on observed source type before any gesture',async()=>{
 for(const fn of ['sum','avg']){const f=channelFixture();await assert.rejects(run(f,{group_by:[field('Region')],measures:[measure('Text',fn)]}),/incompatible/);assert.deepEqual(f.actions,[]);}
});

test('preservation request leaves keys, facts and functions unchanged without gestures',async()=>{
 const f=channelFixture(),result=await run(f,{});assert.equal(result.preservation.unchanged,true);assert.deepEqual(f.actions,[]);
});
