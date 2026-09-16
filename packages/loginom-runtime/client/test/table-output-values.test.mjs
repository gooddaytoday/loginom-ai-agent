import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeTableOutput} from '../lib/table-output-values.mjs';
function fixture(types=['integer','real','string']) {
 const table={view_guid:'v',port_guid:'p',table_tid:'t'};
 const columns=types.map((type,index)=>({index,type,name:'F'+index,label:'F'+index})),fields=columns.map(c=>({index:c.index,key:c.name,type:c.type}));
 const formatProof={table,dialog_readback_verified:true,fields,numeric_formats:fields.filter(f=>['integer','real'].includes(f.type)).map(f=>{
  const mask=f.type==='integer'?'0':'0.################E+00';return {...f,mask,verified_format:{...f,mask}};})};
 const readSettings={table,settings_applied:true,filter_enabled:false,null_display:true,type_icons:true};
 const expectedColumns=columns.map(c=>({...c,data_kind:'Дискретный'}));
 const output={table,columns,column_total:columns.length,row_total:1,schema_id:'schema',sample_complete:true,rows:[{index:0,cells:types.map((type,column)=>({column,is_null:false,text:type==='integer'?'9223372036854775807':type==='real'?'1,2345678901234567E+00':'text'}))}]};
 return {output,options:{formatProof,readSettings,expectedColumns,requireExactNumbers:true}};
}
test('typed output preserves large integers and explicit real decimal representation',()=>{
 const f=fixture(),r=decodeTableOutput(f.output,f.options);
 assert.equal(r.sample[0][0].value,'9223372036854775807');assert.equal(r.sample[0][1].value,1.2345678901234567);
 assert.equal(r.sample[0][1].decimal,'1.2345678901234567E+00');assert.equal(r.precision.numbers_verified,true);
});
test('typed output keeps Null and empty text distinct',()=>{
 const f=fixture(['string','string']);f.output.rows[0].cells=[{column:0,is_null:true,text:null},{column:1,is_null:false,text:''}];
 const r=decodeTableOutput(f.output,f.options);assert.equal(r.sample[0][0].value,null);assert.equal(r.sample[0][1].value,'');
});
for(const [name,change] of Object.entries({foreign_table:f=>f.options.formatProof.table={view_guid:'other'},missing_format:f=>f.options.formatProof.numeric_formats=[],
 foreign_format_field:f=>f.options.formatProof.numeric_formats[0].verified_format.index=3,filter:f=>f.options.readSettings.filter_enabled=true,
 reordered:f=>f.output.columns.reverse(),count:f=>f.output.column_total++,rounded:f=>f.output.rows[0].cells[1].text='1,23',underflow:f=>f.output.rows[0].cells[1].text='1E-999',
 overflow:f=>f.output.rows[0].cells[1].text='1E+999',integer_separator:f=>f.output.rows[0].cells[0].text='9 000'}))
 test('typed output refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>decodeTableOutput(f.output,f.options));});
test('non-exact numeric request returns an explicit precision limitation instead of a rounded value',()=>{
 const f=fixture();f.options.requireExactNumbers=false;f.output.rows[0].cells[1].text='1,23';const r=decodeTableOutput(f.output,f.options);
 assert.equal(r.precision.numbers_verified,false);assert.equal(r.sample[0][1].value,undefined);assert.equal(r.sample[0][1].display_text,'1,23');
});
test('ordinary display reading needs no format mutation and never claims numeric precision',()=>{
 const f=fixture();f.options.requireExactNumbers=false;f.options.formatProof=null;
 const r=decodeTableOutput(f.output,f.options);
 assert.equal(r.precision.numbers_verified,false);assert.equal(r.sample[0][0].value,undefined);
 assert.equal(r.sample[0][1].display_text,'1,2345678901234567E+00');
 assert.equal(r.sample[0][2].value,'text');
 f.options.requireExactNumbers=true;assert.throws(()=>decodeTableOutput(f.output,f.options));
});
test('unverified datetime and boolean formats retain type and display limitations',()=>{
 const f=fixture(['datetime','boolean']);const r=decodeTableOutput(f.output,f.options);
 assert.deepEqual(r.precision.limitations,['datetime_display_precision','boolean_display_precision']);assert.equal(r.sample[0][0].value,undefined);
});
test('zero rows keeps schema and total rather than fabricating a sample',()=>{
 const f=fixture();f.output.rows=[];f.output.row_total=0;const r=decodeTableOutput(f.output,f.options);assert.deepEqual(r.sample,[]);assert.equal(r.row_count,0);assert.equal(r.schema.length,3);
});

test('native Boolean labels preserve true, false and Null without coercing arbitrary text',()=>{
 const f=fixture(['boolean','boolean','boolean','boolean']);
 f.output.rows[0].cells=['Истина','Ложь',null,'false'].map((text,column)=>({column,is_null:text===null,text}));
 const r=decodeTableOutput(f.output,f.options);
 assert.deepEqual(r.sample[0].map(c=>c.value),[true,false,null,undefined]);
 assert.equal(r.sample[0][1].precision,'exact_boolean');assert.equal(r.sample[0][3].precision,'unverified');
 assert.deepEqual(r.precision.limitations,['boolean_display_precision']);
});

test('verified datetime mask retains milliseconds and civil time without inventing a timezone',()=>{
 const f=fixture(['datetime']);const mask='yyyy-mm-dd hh:nn:ss.zzz';
 f.options.formatProof.datetime_formats=[{index:0,key:'F0',type:'datetime',mask,verified_format:{index:0,key:'F0',type:'datetime',mask}}];
 for(const text of ['2024-02-29 23:59:58.123','2000-01-01 00:00:00.001']) {
  f.output.rows[0].cells[0].text=text;const value=decodeTableOutput(f.output,f.options).sample[0][0];
  assert.equal(value.value,text.replace(' ','T'));assert.equal(value.timezone,'unspecified');assert.equal(value.precision,'millisecond');
 }
 for(const text of ['2023-02-29 00:00:00.000','2024-04-31 00:00:00.000','2024-02-29 24:00:00.000','0000-01-01 00:00:00.000','2024-02-29 00:00:00','2024-02-29 00:00:00.123Z']){
  f.output.rows[0].cells[0].text=text;assert.equal(decodeTableOutput(f.output,f.options).sample[0][0].value,undefined,text);
 }
 f.output.rows[0].cells[0].text='2024-02-29 00:00:00.001';f.options.formatProof.datetime_formats[0].verified_format.key='foreign';
 assert.equal(decodeTableOutput(f.output,f.options).sample[0][0].value,undefined);
});

test('sole numeric column requires committed format when selected-field readback is pending',()=>{
 const f=fixture(['real']);f.options.formatProof.dialog_readback_verified=false;f.options.formatProof.format_application_pending=true;
 assert.throws(()=>decodeTableOutput(f.output,f.options));
 f.output.applied_format={verified:true,table:f.output.table,source:'applied_table_format_ui_cache',result:'ok',modal_tid:'t;ModalWindow_BrowseFormat',fields:[{index:0,key:'F0',type:'real',mask:'0.################E+00'}]};
 assert.equal(decodeTableOutput(f.output,f.options).sample[0][0].value,1.2345678901234567);
 for(const change of [p=>p.result='cancel',p=>p.table={view_guid:'foreign'},p=>p.fields[0].mask='0.00',p=>p.fields[0].key='other',p=>p.modal_tid='foreign',p=>p.fields.push({...p.fields[0]})]) {
  const altered=structuredClone(f);change(altered.output.applied_format);assert.throws(()=>decodeTableOutput(altered.output,altered.options));
 }
});

test('variant display never proves a native numeric subtype or exact value',()=>{
 for(const text of ['1','1.0','true','9223372036854775807']){const f=fixture(['variant']);f.output.rows[0].cells[0].text=text;
 assert.throws(()=>decodeTableOutput(f.output,f.options),/native subtype/);
 f.options.requireExactNumbers=false;const r=decodeTableOutput(f.output,f.options);assert.equal(r.precision.numbers_verified,false);assert.deepEqual(r.precision.limitations,['variant_display_precision']);assert.equal(r.sample[0][0].value,undefined);assert.equal(r.sample[0][0].type,'variant');}
 const empty=fixture(['variant']);empty.output.rows=[];empty.output.row_total=0;assert.equal(decodeTableOutput(empty.output,empty.options).sample.length,0);
});
