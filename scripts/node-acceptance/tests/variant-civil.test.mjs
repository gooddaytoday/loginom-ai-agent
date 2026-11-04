import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExpectedOutputs,matchExpectedOutputs} from '../expected-outputs.mjs';

function fixture(){
 const column={name:'Value',label:'Значение',type:'variant'};
 const date={type:'variant',cell_type:'datetime',is_null:false,value:'2026-01-02T03:04:05.006',decimal:'46024.12783571759',
  precision:'exact_native',representation:'local_datetime',timezone:'Europe/Moscow',
  native:{tag:7,encoding:'oadate-binary64-le',bytes_le:'4aee3a170479e640',bits:64,temporal_profile:'loginom-7.4.2-native-oadate',semantic_scope:'browser_civil_time',civil_time_verified:true,epoch_verified:true}};
 const output={output_node_type:'variables.to_table',output_port:0,ordered:true,columns:[column],rows:[{Value:{cell_type:'datetime',value:'2026-01-02T03:04:05.006'}}]};
 const actual={node:{node_id:'n'},type:'variables.to_table',output_port:0,execution:{execution_id:'e'},
  data:{schema:[column],row_count:1,sample_complete:true,precision:{numbers_verified:true},sample:[[date]]}};
 return {date,output,actual};
}
test('existing cold matcher accepts approved typed Variant civil datetime with exact milliseconds',()=>{
 const f=fixture();
 const parsed=parseExpectedOutputs({package_path:'/test/rows.lgp',nodes:[{type:'variables.to_table'}],outputs:[f.output]});
 assert.equal(matchExpectedOutputs([f.actual],parsed.outputs).length,1);
 for(const timezone of ['UTC','Europe/Moscow']){f.date.timezone=timezone;assert.equal(matchExpectedOutputs([f.actual],[f.output]).length,1);}
});
for(const [name,change] of [
 ['millisecond',c=>c.value='2026-01-02T03:04:05.000'],['timezone omitted',c=>delete c.timezone],
 ['unverified civil',c=>c.native.civil_time_verified=false],['wrong subtype',c=>c.cell_type='string'],
 ['wrong tag',c=>c.native.tag=8],['serial differs from bytes',c=>c.decimal='46024'],
 ['invalid bytes',c=>c.native.bytes_le='bad'],['NULL substituted',c=>{c.is_null=true;c.value=null;}],
])test('typed Variant cold refuses '+name,()=>{
 const f=fixture();change(f.date);assert.throws(()=>matchExpectedOutputs([f.actual],[f.output]));
});
test('legacy byte-only datetime matching preserves its prior envelope',()=>{
 const f=fixture();Object.assign(f.date,{value:'4aee3a170479e640',representation:'native_oadate_binary64_le',timezone:'unspecified'});
 Object.assign(f.date.native,{semantic_scope:'native_serial_only',civil_time_verified:false,epoch_verified:false});
 f.output.rows[0].Value={cell_type:'datetime',bytes_le:'4aee3a170479e640'};
 assert.equal(matchExpectedOutputs([f.actual],[f.output]).length,1);
 f.output.rows[0].Value={cell_type:'datetime',value:'2026-01-02T03:04:05.006'};
 assert.throws(()=>matchExpectedOutputs([f.actual],[f.output]));
});
