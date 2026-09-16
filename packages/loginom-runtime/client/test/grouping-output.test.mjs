import test from 'node:test';
import assert from 'node:assert/strict';
import {groupingOutputDefinitions,resolveGroupingOutput} from '../lib/grouping-output.mjs';
const configuration={keys:[{name:'Group',label:'Группа',type:'string'}],measures:[{name:'Amount',label:'Сумма',type:'real',functions:18},{name:'Other',label:'Сумма',type:'real',functions:9}]};
const parameters={group_by:[{kind:'input_field',name:'Group'}],measures:[
 {field:{kind:'input_field',name:'Amount'},function:'avg',name:'Average',label:'Среднее'},
 {field:{kind:'input_field',name:'Other'},function:'max',name:'Maximum',label:'Максимум'},
 {field:{kind:'input_field',name:'Amount'},function:'count',name:'Rows',label:'Строки'},
 {field:{kind:'input_field',name:'Other'},function:'sum',name:'Total',label:'Итого'}]};
function native(linked=true){
 const sources=groupingOutputDefinitions(configuration).map((f,i)=>({...f,record_id:'s'+i,field_id:String(i),index:i}));
 return {verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_fields:linked?sources:[],
 target_fields:sources.map((s,i)=>({...s,record_id:'t'+i,inherited:false,excluded:false,source:linked?s:null,...(linked?{name:'Custom'+i,label:'Одинаковая метка'}:{})}))};
}
test('full grouping layout follows requested functions, not generated order or duplicate labels',()=>{
 const result=resolveGroupingOutput(configuration,parameters,native());
 assert.deepEqual(result.fields.map(f=>[f.current.record_id,f.name,f.current.type]),[['t0','Group','string'],['t2','Average','real'],['t4','Maximum','real'],['t1','Rows','integer'],['t3','Total','real']]);
});
test('existing custom output names resolve only through exact native source links',()=>{
 const n=native(true),r=resolveGroupingOutput(configuration,parameters,n);
 assert.deepEqual(r.fields.map(f=>f.source.record_id),['s0','s2','s4','s1','s3']);
 n.target_fields[2].source=n.source_fields[1];
 assert.throws(()=>resolveGroupingOutput(configuration,parameters,n),/identity differs/);
});
test('mismatched aggregate types and incomplete native sources cannot authorize output edits',()=>{
 for(const mutate of [n=>{n.target_fields[1].type='real';},n=>n.source_fields.pop(),n=>{n.target_fields[3].inherited=true;}]){
  const n=native(true);mutate(n);assert.throws(()=>resolveGroupingOutput(configuration,parameters,n));
 }
});
test('explicit output layout renames and reorders the configured namespace',()=>{
 const mapping={fields:['Total','Group','Rows','Maximum','Average'].map(name=>({source:{kind:'configured_field',name},name:'Final'+name}))};
 assert.deepEqual(resolveGroupingOutput(configuration,parameters,native(true),mapping).fields.map(f=>f.name),['FinalTotal','FinalGroup','FinalRows','FinalMaximum','FinalAverage']);
 mapping.fields[1].name='FinalTotal';assert.throws(()=>resolveGroupingOutput(configuration,parameters,native(true),mapping),/conflict/);
});

test('single string count resolves suffixed native source through its exact link',()=>{
 const c={keys:[{name:'Group',label:'Group',type:'string'}],measures:[{name:'Text',label:'Text',type:'string',functions:2}]};
 const p={group_by:[{kind:'input_field',name:'Group'}],measures:[{field:{kind:'input_field',name:'Text'},function:'count',name:'TextCount',label:'Count'}]};
 const sources=[{record_id:'s0',name:'Group',label:'Group',type:'string'},{record_id:'s1',name:'Text_Count',label:'Text|Количество',type:'integer'}];
 const n={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_fields:sources,target_fields:sources.map((s,i)=>({...s,record_id:'t'+i,name:i?'Text':'Group',source:s,inherited:false,excluded:false}))};
 assert.equal(resolveGroupingOutput(c,p,n).fields[1].source.name,'Text_Count');
 n.source_fields[1].name='Unrelated_Count';assert.throws(()=>resolveGroupingOutput(c,p,n),/source differs/);
});
