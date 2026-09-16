import test from 'node:test';
import assert from 'node:assert/strict';
import {configureDateTime} from '../lib/date-time-procedure.mjs';
const flags={DoDateTimeFirst:'first',DoDateTimeLast:'last',DoNumber:'number',DoString:'string'};
function fixture({loseReply=false,staleCount=false,collateralChange=false}={}){
 const fields=['A','B'].map(name=>({name,label:'Дата',type:'datetime',record_id:name,count:0}));
 const matrices=Object.fromEntries(fields.map(f=>[f.name,[...Array.from({length:19},(_,func)=>({func,iso:false})),...[0,1,2,4,5,6,7,8,10,18].map(func=>({func,iso:true}))].map((r,index)=>({...r,index,record_id:String(index),first:false,last:false,number:false,string:false,string_format:'untouched'}))]));
 matrices.B[0].string=true;fields[1].count=1;let selected='A',clicks=0,observations=0;
 const snapshot=()=>({wizard:{stage:'date_time'},node_date_time:{verified:true,inventory_complete:true,fields,selected:fields.find(f=>f.name===selected),matrix:matrices[selected]},ui:{elements:[...fields.map(f=>({ref:f.name,allowed_actions:['click'],date_time_cell:{role:'field',field_key:f.name,record_id:f.record_id}})),...matrices[selected].flatMap(r=>Object.entries(flags).map(([flag,key])=>({ref:r.record_id+'-'+flag,allowed_actions:['click'],date_time_cell:{role:'flag',record_id:r.record_id,flag,checked:r[key]}})))]}});
 const channel={observe:async({ready})=>{observations++;const s=structuredClone(snapshot());assert.ok(ready(s));return s;},perform:async({initialObservation,resolve})=>{
  const action=resolve(initialObservation);clicks++;
  if(fields.some(f=>f.name===action.ref)){selected=action.ref;return;}
  const [id,flag]=action.ref.split('-'),row=matrices[selected].find(r=>r.record_id===id);row[flags[flag]]=!row[flags[flag]];
  if(!staleCount)fields.find(f=>f.name===selected).count+=row[flags[flag]]?1:-1;
  if(collateralChange)matrices[selected][5].number=true;
  if(loseReply){loseReply=false;throw Error('lost reply after flag');}
 }};
 return {channel,fields,matrices,inputMapping:{verified:true,inventory_complete:true,target_fields:fields},stats:()=>({clicks,observations})};
}
test('field patches change only requested flags and preserve the other date with an equal label',async()=>{
 const f=fixture(),before=structuredClone(f.matrices.B),result=await configureDateTime(f.channel,{fields:[{field:{kind:'input_field',name:'A'},transformations:[{operation:'year',name:'Year',label:'Год'}]}]},{inputMapping:f.inputMapping});
 assert.equal(result.verified,true);assert.equal(f.matrices.A[4].number,true);assert.deepEqual(f.matrices.B,before);assert.equal(result.configuration.field_matrices.length,2);
 assert.ok(f.stats().observations<15,'unchanged cells must not cause individual rereads');
});
test('lost flag reply stops without toggling the already changed value again',async()=>{
 const f=fixture({loseReply:true});
 await assert.rejects(configureDateTime(f.channel,{fields:[{field:{kind:'input_field',name:'A'},transformations:[{operation:'year',name:'Year',label:'Год'}]}]},{inputMapping:f.inputMapping}),/lost reply/);
 assert.equal(f.stats().clicks,1);assert.equal(f.matrices.A[4].number,true);
});
test('an unchanged native counter does not invalidate an exact flag change',async()=>{
 const f=fixture({staleCount:true});
 const result=await configureDateTime(f.channel,{fields:[{field:{kind:'input_field',name:'A'},transformations:[{operation:'year',name:'Year',label:'Год'}]}]},{inputMapping:f.inputMapping});
 assert.equal(result.verified,true);assert.equal(f.fields[0].count,0);assert.equal(f.matrices.A[4].number,true);
});
test('a collateral flag change stops without another mutation',async()=>{
 const f=fixture({collateralChange:true});
 await assert.rejects(configureDateTime(f.channel,{fields:[{field:{kind:'input_field',name:'A'},transformations:[{operation:'year',name:'Year',label:'Год'}]}]},{inputMapping:f.inputMapping}));
 assert.equal(f.stats().clicks,1);
});
test('empty parameters preserve every matrix; explicit empty transformations remove only that field',async()=>{
 const f=fixture(),before=structuredClone(f.matrices);await configureDateTime(f.channel,{}, {inputMapping:f.inputMapping});assert.deepEqual(f.matrices,before);
 await configureDateTime(f.channel,{fields:[{field:{kind:'input_field',name:'B'},transformations:[]}]},{inputMapping:f.inputMapping});assert.equal(f.matrices.B[0].string,false);assert.deepEqual(f.matrices.A,before.A);
});
test('removal preflight sees every original matrix before any flag changes',async()=>{
 const f=fixture(),before=structuredClone(f.matrices);let called=0;
 await configureDateTime(f.channel,{fields:[{field:{kind:'input_field',name:'B'},transformations:[]}]},{inputMapping:f.inputMapping,
  beforeChanges:original=>{called++;assert.deepEqual(Object.fromEntries(original.field_matrices.map(x=>[x.name,x.matrix])),before);assert.deepEqual(f.matrices,before);}});
 assert.equal(called,1);assert.equal(f.matrices.B[0].string,false);
});
test('refused removal ownership leaves every native flag unchanged',async()=>{
 const f=fixture(),before=structuredClone(f.matrices);
 await assert.rejects(configureDateTime(f.channel,{fields:[{field:{kind:'input_field',name:'B'},transformations:[]}]},{inputMapping:f.inputMapping,
  beforeChanges:()=>{throw Error('unowned original output');}}),/unowned original output/);
 assert.deepEqual(f.matrices,before);
});

test('verified continuation skips the applied flag and finishes remaining transformations',async()=>{
 const f=fixture({loseReply:true}),progress={},p={fields:[{field:{kind:'input_field',name:'A'},transformations:[{operation:'year',name:'Year',label:'Год'},{operation:'quarter',name:'Quarter',label:'Квартал'}]}]};
 let preflights=0;
 const options={inputMapping:f.inputMapping,progress,beforeChanges:()=>{preflights++;}};
 await assert.rejects(configureDateTime(f.channel,p,options),/lost reply/);
 assert.equal(progress.pending.cell.func,4);assert.equal(f.matrices.A[4].number,true);
 // Model the exact receipt + full matrix proof produced by inspectConfigure.
 progress.expected.find(x=>x.name==='A').matrix=structuredClone(progress.pending.expected);delete progress.pending;
 const clicks=f.stats().clicks,result=await configureDateTime(f.channel,p,options);
 assert.equal(result.verified,true);assert.equal(preflights,1);
 assert.equal(f.matrices.A[4].number,true);assert.equal(f.matrices.A[5].number,true);
 assert.equal(f.stats().clicks-clicks,2,'one field selection and only one remaining setting click');
 assert.equal(result.before[0].matrix[4].number,false);
});
