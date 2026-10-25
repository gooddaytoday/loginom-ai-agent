import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseExpectedOutputs,matchExpectedOutputs,matchesExpectedOutput} from '../expected-outputs.mjs';

const fixture=name=>JSON.parse(readFileSync(new URL('../../../docs/testing/loginom-ai-agent/stability-2026-10-20/'+name+'/expected-demo.json',import.meta.url)));
function actual(want,types={},names={}){
 const columns=want.columns.map(c=>({name:names[c.name]??c.name,label:names[c.name]??c.name,type:types[c.name]??c.type}));
 const sample=want.rows.map(row=>want.columns.map((c,i)=>({type:columns[i].type,is_null:false,
  value:columns[i].type==='integer'?String(row[c.name]):row[c.name]})));
 return {node:{node_id:'output'},type:'transform.group_data',output_port:0,
  data:{schema:columns,row_count:sample.length,sample_complete:true,precision:{numbers_verified:true},sample}};
}
function check(a,want,pass=true){
 const options={exportInput:{node:{ref:{node_id:'output'}},output_port:0}};
 if(pass)assert.equal(matchExpectedOutputs([a],[want],options).length,1);
 else assert.throws(()=>matchExpectedOutputs([a],[want],options));
}
for(const [name,types] of [['n13',{Sep:'real',Oct:'real',Nov:'real'}],['n18',{TotalUnits:'real'}],
 ['n20',{Hours:'integer',Distance:'integer'}]])test(name+' permits observed numeric types but preserves values, names and order',()=>{
 const expected=fixture(name),want=parseExpectedOutputs(expected).outputs[0],a=actual(want,types);
 check(a,want);
 for(const change of [b=>b.data.sample[0].at(-1).value=999,b=>b.data.sample.reverse(),
  b=>b.data.schema[0].name='Renamed',b=>b.data.schema.pop(),b=>b.data.row_count++,
  b=>b.data.precision.numbers_verified=false,b=>b.data.sample_complete=false,
  b=>{const i=want.columns.findIndex(c=>c.types);b.data.sample[0][i].value=NaN;},
  b=>{const i=want.columns.findIndex(c=>c.types);b.data.schema[i].type='string';b.data.sample[0][i].type='string';}]){
  const bad=structuredClone(a);change(bad);check(bad,want,false);
 }
 const strict=structuredClone(want);strict.columns.forEach(c=>delete c.types);check(a,strict,false);
});
test('n19 accepts integer group identifiers only with the correct complete partition',()=>{
 const want=parseExpectedOutputs(fixture('n19')).outputs[0],a=actual(want,{Group:'integer'});
 const group=want.columns.findIndex(c=>c.name==='Group'),labels=new Map([['small','42'],['medium','7'],['large','99']]);
 a.data.sample.forEach((row,i)=>{row[group].value=labels.get(want.rows[i].Group);});a.data.sample.reverse();
 check(a,want);
 for(const change of [b=>b.data.sample.forEach(r=>{r[group].value='1';}),
  b=>{b.data.sample[0][group].value=b.data.sample.at(-1)[group].value;},
  b=>{b.data.sample[0][group].value='101';},b=>{b.data.sample[0][1].value+=1;},
  b=>b.data.sample.pop(),b=>{b.data.sample[0][group].is_null=true;b.data.sample[0][group].value=null;}]){
  const bad=structuredClone(a);change(bad);check(bad,want,false);
 }
 const strict=structuredClone(want);strict.columns.forEach(c=>{delete c.types;delete c.category_labels_any;});check(a,strict,false);
});
test('p22 binds freely named columns by their complete values, preserving class/count/revenue association',()=>{
 const want=parseExpectedOutputs(fixture('p22')).outputs[0],a=actual(want,{}, {ABCClass:'ABC',Products:'ProductCount',Revenue:'Выручка'});
 a.data.schema.reverse();a.data.sample.forEach(r=>r.reverse());a.data.sample.reverse();check(a,want);
 for(const change of [b=>b.data.sample[0][0].value=5001,b=>{const r=b.data.sample;[r[0][1],r[1][1]]=[r[1][1],r[0][1]];},
  b=>b.data.schema.pop(),b=>b.data.schema.push({name:'Extra',label:'Extra',type:'string'}),
  b=>b.data.schema[0].name=b.data.schema[1].name,b=>b.data.sample.pop(),
  b=>{b.data.sample[0][1].is_null=true;b.data.sample[0][1].value=null;}]){
  const bad=structuredClone(a);change(bad);check(bad,want,false);
 }
 const strict=structuredClone(want);strict.columns.forEach(c=>{delete c.name_any;delete c.label_any;});check(a,strict,false);
});

test('relaxations validate explicit types and boolean flags without admitting unrelated conversions',()=>{
 for(const types of [null,true,'any',[],['integer','integer'],['integer','string'],['variant','integer'],['real']]){
  const e=fixture('n13');e.outputs[0].columns[1].types=types;assert.throws(()=>parseExpectedOutputs(e));
 }
 for(const flag of ['name_any','category_labels_any'])for(const value of ['true',1,null]){
  const e=fixture('n13');e.outputs[0].columns[1][flag]=value;assert.throws(()=>parseExpectedOutputs(e));
 }
 const mixed=fixture('n19');mixed.outputs[0].columns.at(-1).name_any=true;assert.throws(()=>parseExpectedOutputs(mixed));
});

test('numeric compatibility preserves finite values, integer meaning, precision and schema-to-cell identity',()=>{
 const want=parseExpectedOutputs(fixture('n13')).outputs[0],a=actual(want,{Sep:'real',Oct:'real',Nov:'real'});
 for(const change of [b=>b.data.sample[0][1].value+=.5,b=>b.data.sample[0][1].value=Infinity,
  b=>b.data.sample[0][1].type='integer',b=>{b.data.sample[0][1].is_null=true;b.data.sample[0][1].value=null;}]){
  const bad=structuredClone(a);change(bad);check(bad,want,false);
 }
 // Variant subtype conversion keeps the original exact-native representation.
 const v={columns:[{name:'V',type:'variant',label:'V'}],rows:[{V:{cell_type:'integer',value:7}}]};
 const d={schema:v.columns,row_count:1,sample_complete:true,precision:{numbers_verified:true},
  sample:[[{type:'variant',cell_type:'integer',is_null:false,value:'7',precision:'exact_native',native:{tag:20}}]]};
 assert.equal(matchesExpectedOutput(d,v),true);d.sample[0][0].native.tag=5;assert.equal(matchesExpectedOutput(d,v),false);
 const native={columns:[{name:'V',label:'V',type:'integer',types:['integer','real']}],rows:[{V:{value:7}}]};
 const wrongTag=structuredClone(d);wrongTag.schema=[{name:'V',label:'V',type:'real'}];
 wrongTag.sample[0][0]={type:'real',cell_type:'integer',is_null:false,value:'7',precision:'exact_native',native:{tag:20}};
 assert.equal(matchesExpectedOutput(wrongTag,native),false,'native byte/subtype expectations cannot use numeric aliases');
});

test('arbitrary group strings retain the same bijection, while cell type and column names remain bound',()=>{
 const want=parseExpectedOutputs(fixture('n19')).outputs[0],a=actual(want),index=3;
 a.data.sample.forEach((r,i)=>{r[index].value={small:'S',medium:'M',large:'L'}[want.rows[i].Group];});check(a,want);
 const mixed=structuredClone(a);mixed.data.sample[0][index].type='integer';mixed.data.sample[0][index].value='1';check(mixed,want,false);
 const renamed=structuredClone(a);renamed.data.schema[index].name='Cluster';check(renamed,want,false);
 const real=actual(want,{Group:'real'});real.data.sample.forEach((r,i)=>{r[index].value={small:1.5,medium:2.5,large:3.5}[want.rows[i].Group];});check(real,want);
});

test('name_any refuses ambiguous semantic bindings and honours ordered CSV headers',()=>{
 const want=parseExpectedOutputs(fixture('p22')).outputs[0],a=actual(want,{}, {ABCClass:'ABC',Products:'ProductCount',Revenue:'Income'});
 const exact={...want,column_order:'exact'},exportInput={node:{ref:{node_id:'output'}},output_port:0};
 a.data.schema.reverse();a.data.sample.forEach(r=>r.reverse());
 const exportCsv={header:'names',columns:['ABC','ProductCount','Income']};
 assert.equal(matchExpectedOutputs([a],[exact],{exportInput,exportCsv}).length,1);
 assert.throws(()=>matchExpectedOutputs([a],[exact],{exportInput,exportCsv:{...exportCsv,columns:['ABC','Income','ProductCount']}}));
 const ambiguous={...want,columns:[{name:'x',type:'integer',name_any:true,label_any:true},{name:'y',type:'integer',name_any:true,label_any:true}],rows:[{x:1,y:1}]};
 const b=actual(ambiguous);check(b,ambiguous,false);
});

test('unprescribed native types also preserve numeric source columns and exact product counts',()=>{
 for(const name of ['n18','n19','n20','p22']){
  const want=parseExpectedOutputs(fixture(name)).outputs[0];
  const types=Object.fromEntries(want.columns.filter(c=>c.type==='integer').map(c=>[c.name,'real']));
  const a=actual(want,types);check(a,want);
  const i=want.columns.findIndex(c=>c.type==='integer');const bad=structuredClone(a);bad.data.sample[0][i].value+=.5;check(bad,want,false);
 }
 const want=parseExpectedOutputs(fixture('p22')).outputs[0];check(actual(want,{Products:'real',Revenue:'integer'}),want);
});
