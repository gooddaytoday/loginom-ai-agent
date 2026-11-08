import test from 'node:test';
import assert from 'node:assert/strict';
import {configureDateTime} from '../lib/date-time-procedure.mjs';
import {validateDateTimeParameters,resolveDateTimeParameters,DATE_TIME_OPERATIONS} from '../lib/date-time-parameters.mjs';
import {resolveDateTimeOutput} from '../lib/date-time-output.mjs';
import {dateTimeParametersSchema} from '../lib/node-api.mjs';
const flags={DoDateTimeFirst:'first',DoDateTimeLast:'last',DoNumber:'number',DoString:'string'};
const request={target:{kind:'new'},mappings:[]};
const op=(operation,name,format)=>({operation,name,label:name,...(format===undefined?{}:{format})});
const params=(...transformations)=>({fields:[{field:{kind:'input_field',name:'A'},transformations}]});
test('string operations validate: format only on string_custom and required there',()=>{
 validateDateTimeParameters(params(op('string_year','Y'),op('string_date','D'),op('string_time','T'),op('string_custom','U','%Y|%Q|%m|%d|%H|%i|%s|%u')),'calendar',request);
 for(const bad of [op('string_custom','U'),op('string_year','Y','%Y'),op('year','Y','%Y'),op('string_custom','U',''),op('string_custom','U','a\nb'),op('string_custom','U','x'.repeat(129)),op('string_custom','U',7)])
  assert.throws(()=>validateDateTimeParameters(params(bad),'calendar',request),/format|invalid/);
 assert.throws(()=>validateDateTimeParameters(params(op('string_custom','U','%Y'),op('string_custom','V','%m')),'calendar',request),/repeated/);
 assert.equal(Object.keys(DATE_TIME_OPERATIONS).length,22);
 const item=dateTimeParametersSchema.properties.fields.items.properties.transformations.items;
 assert.deepEqual(item.required,['operation','name','label']);assert.ok(item.properties.format);
 assert.ok(['string_year','string_date','string_time','string_custom'].every(o=>item.properties.operation.enum.includes(o)));
});
test('string sources are told apart from the integer year and datetime date by native type',()=>{
 const f=(id,name,label,type)=>({record_id:id,name,label,type,required:true});
 const sources=[f('1','A_Y_1','Дата (Год)','integer'),f('2','A_Y_2','Дата (Год)','string'),f('3','A_D_1','Дата (Дата)','datetime'),f('4','A_D_2','Дата (Дата)','string'),
  f('5','A_T_1','Дата (Время)','string'),f('6','A_U_1','Дата (Свой формат)','string')];
 const native={verified:true,inventory_complete:true,source_identity_verified:true,source_fields:sources,target_fields:sources.map(source=>({source,name:source.name,label:source.label,excluded:false}))};
 const p=params(op('year','Year'),op('string_year','YearText'),op('date','Day'),op('string_date','DayText'),op('string_time','TimeText'),op('string_custom','Stamp','%Y'));
 validateDateTimeParameters(p,'calendar',request);
 assert.deepEqual(resolveDateTimeOutput({input_fields:[{name:'A',label:'Дата',type:'datetime'}]},p,native).map(r=>[r.source.name,r.name]),
  [['A_Y_1','Year'],['A_Y_2','YearText'],['A_D_1','Day'],['A_D_2','DayText'],['A_T_1','TimeText'],['A_U_1','Stamp']]);
 assert.equal(resolveDateTimeParameters(p,[{name:'A',label:'Дата',type:'datetime'}])[0].input.name,'A');
});
function fixture({defaults={},typeDelay=false}={}){
 const names=['A','B'],fields=names.map(name=>({name,label:'Дата',type:'datetime',record_id:name,count:0}));
 const fmt={4:'%Y',16:'%Y-%m-%d',17:'%H:%i:%s',...defaults};
 const matrices=Object.fromEntries(names.map(n=>[n,[...Array.from({length:19},(_,func)=>({func,iso:false})),...[0,1,2,4,5,6,7,8,10,18].map(func=>({func,iso:true}))]
  .map((r,index)=>({...r,index,record_id:n+index,first:false,last:false,number:false,string:false,string_format:r.iso?'':fmt[r.func]??(r.func===18?'':'%?')}))]));
 let selected='A',editor=null,typed='',calls=[];
 const snapshot=()=>({wizard:{stage:'date_time'},node_date_time:{verified:true,inventory_complete:true,fields,selected:fields.find(f=>f.name===selected),matrix:matrices[selected]},
  ui:{elements:[...fields.map(f=>({ref:f.name,allowed_actions:['click'],date_time_cell:{role:'field',field_key:f.name,record_id:f.record_id}})),
   ...matrices[selected].flatMap(r=>[...Object.entries(flags).map(([flag,key])=>({ref:r.record_id+'-'+flag,allowed_actions:['click'],date_time_cell:{role:'flag',record_id:r.record_id,flag,checked:r[key]}})),
    {ref:'fc-'+r.record_id,allowed_actions:['click'],date_time_cell:{role:'format_cell',record_id:r.record_id,func:r.func,iso:r.iso,string_format:r.string_format}}]),
   ...(editor?[{ref:'editor',value:typed,allowed_actions:['click','fill','press'],date_time_cell:{role:'format_editor',record_id:editor,func:18,iso:false}}]:[])]}});
 const channel={observe:async({ready})=>{const s=structuredClone(snapshot());assert.ok(ready(s),'observation ready');return s;},
  perform:async({initialObservation,resolve})=>{
   const a=resolve(initialObservation);calls.push(a);
   if(fields.some(f=>f.name===a.ref)){selected=a.ref;return;}
   if(a.ref.startsWith('fc-')){editor=a.ref.slice(3);typed=matrices[selected].find(r=>r.record_id===editor).string_format;return;}
   if(a.ref==='editor'){
    if(a.verb==='fill'){typed=a.text;return;}
    assert.equal(a.key,'Enter');matrices[selected].find(r=>r.record_id===editor).string_format=typed;editor=null;return;
   }
   const [id,flag]=a.ref.split('-'),row=matrices[selected].find(r=>r.record_id===id);row[flags[flag]]=!row[flags[flag]];
   fields.find(f=>f.name===selected).count+=row[flags[flag]]?1:-1;
  }};
 return {channel,matrices,fields,calls,inputMapping:{verified:true,inventory_complete:true,target_fields:fields}};
}
const row=(f,name,func)=>f.matrices[name].find(r=>r.func===func&&!r.iso);
test('string rows set only their flags; custom row receives the exact typed format; the other field is untouched',async()=>{
 const f=fixture(),before=structuredClone(f.matrices.B);
 const p=params(op('string_year','Y'),op('string_date','D'),op('string_time','T'),op('string_custom','U','%Y-%m-%d %H:%i:%s.%u'));
 const result=await configureDateTime(f.channel,p,{inputMapping:f.inputMapping});
 assert.equal(result.verified,true);
 assert.deepEqual([4,16,17,18].map(n=>[row(f,'A',n).string,row(f,'A',n).string_format]),[[true,'%Y'],[true,'%Y-%m-%d'],[true,'%H:%i:%s'],[true,'%Y-%m-%d %H:%i:%s.%u']]);
 assert.deepEqual(f.matrices.B,before);
 assert.deepEqual(f.calls.filter(a=>a.verb==='fill').map(a=>a.text),['%Y-%m-%d %H:%i:%s.%u']);
 assert.ok(f.calls.every(a=>a.verb!=='press'||a.key==='Enter'));
});
test('custom format is typed per field; DateB gets its own marker format',async()=>{
 const f=fixture();
 const fields=[['A','%Y-%m-%d %H:%i:%s.%u'],['B','%Y|%Q|%m|%d|%H|%i|%s|%u']].map(([name,format])=>({field:{kind:'input_field',name},transformations:[op('string_custom',name+'_U',format)]}));
 await configureDateTime(f.channel,{fields},{inputMapping:f.inputMapping});
 assert.equal(row(f,'A',18).string_format,'%Y-%m-%d %H:%i:%s.%u');assert.equal(row(f,'B',18).string_format,'%Y|%Q|%m|%d|%H|%i|%s|%u');
});
test('an unchanged custom format needs no editor; a different one is retyped',async()=>{
 const f=fixture(),p=params(op('string_custom','U','%Y'));
 await configureDateTime(f.channel,p,{inputMapping:f.inputMapping});
 const first=f.calls.length;await configureDateTime(f.channel,p,{inputMapping:f.inputMapping});
 assert.ok(f.calls.slice(first).every(a=>!['fill','press'].includes(a.verb)&&!a.ref.startsWith('fc-')),'no editor round trip for the same format');
 await configureDateTime(f.channel,params(op('string_custom','U','%m')),{inputMapping:f.inputMapping});
 assert.equal(row(f,'A',18).string_format,'%m');
});
test('a changed native default format refuses before any gesture',async()=>{
 const f=fixture({defaults:{16:'%d.%m.%Y'}}),before=structuredClone(f.matrices);
 await assert.rejects(configureDateTime(f.channel,params(op('string_date','D')),{inputMapping:f.inputMapping}),/native string format differs/);
 assert.deepEqual(f.matrices,before);assert.equal(f.calls.filter(a=>!a.ref.match(/^[AB]$/)).length,0);
});
test('removing the custom operation clears its flag and leaves the typed format as native state',async()=>{
 const f=fixture();await configureDateTime(f.channel,params(op('string_custom','U','%Y')),{inputMapping:f.inputMapping});
 await configureDateTime(f.channel,params(op('year','Y')),{inputMapping:f.inputMapping});
 assert.equal(row(f,'A',18).string,false);assert.equal(row(f,'A',18).string_format,'%Y');assert.equal(row(f,'A',4).number,true);
});
