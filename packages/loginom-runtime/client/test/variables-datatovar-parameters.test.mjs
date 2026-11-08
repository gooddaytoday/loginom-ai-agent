import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateDataToVarParameters,resolveDataToVarParameters,dataToVarParametersSchema,DATA_TO_VAR_FUNCTIONS} from '../lib/variables-datatovar-parameters.mjs';

const fields=[{name:'X',label:'X',type:'integer',record_id:'x'},{name:'Category',label:'X',type:'string',record_id:'c'}];
const specification=(name='X',aggregations=['sum','count','min','max','avg'])=>({fields:[{field:{kind:'input_field',name},aggregations}]});
const request=()=>({target:{kind:'new'},inputs:[{input:0}],variable_inputs:[],mappings:[],read:{ports:[],variable_ports:[0]},finish:'execute'});

test('DataToVar resolves the approved aggregate set without inventing variable names or values',async()=>{
 const p=specification(),r=request();
 assert.equal(validateDataToVarParameters(p,'aggregate',r),p);
 const plan=resolveDataToVarParameters(p,fields);
 assert.equal(plan.fields[0].input.record_id,'x');assert.equal(plan.fields[0].mask,31);
 assert.deepEqual(plan.fields[0].aggregations,['sum','count','min','max','avg']);
 const expected=JSON.parse(await readFile(new URL('../../../../docs/node-development/nodes/variables-datatovar/acceptance/expected.json',import.meta.url)));
 for(const variant of ['initial','updated','null','empty'])assert.deepEqual(expected[variant].variables.map(v=>v.type),['real','integer','integer','integer','real']);
 assert.equal(dataToVarParametersSchema.additionalProperties,false);
 assert.equal(plan.fields[0].output_names,undefined);
});

test('DataToVar rejects invalid requests before graph mutation',()=>{
 for(const [p,mode,change] of [
  [{},'aggregate',()=>{}], [{fields:[]},'aggregate',()=>{}], [specification(),'first_row',()=>{}],
  [specification('X',['sum','sum']),'aggregate',()=>{}], [specification('X',['variance']),'aggregate',()=>{}],
  [specification('X',[]),'aggregate',()=>{}], [specification('bad;tid'),'aggregate',()=>{}],
  [{...specification(),formula:'X'},'aggregate',()=>{}],
  [{fields:[...specification().fields,...specification('x').fields]},'aggregate',()=>{}],
  [specification(),'aggregate',r=>r.inputs=[]], [specification(),'aggregate',r=>r.inputs=[{input:1}]],
  [specification(),'aggregate',r=>r.variable_inputs=[{input:0,kind:'variables'}]],
  [specification(),'aggregate',r=>r.read.ports=[0]], [specification(),'aggregate',r=>r.read.variable_ports=[1]],
  [specification(),'aggregate',r=>r.mappings=[{direction:'output',port:0}]],
  [specification(),'aggregate',r=>{r.finish='close';r.mappings=[{direction:'input',port:0}];}],
 ]){const r=request();change(r);assert.throws(()=>validateDataToVarParameters(p,mode,r));}
 const r=request();r.target.kind='existing';r.inputs=[];
 assert.doesNotThrow(()=>validateDataToVarParameters({},'aggregate',r));
});

test('DataToVar resolves exact technical names and numeric types, with canonical native function order',()=>{
 assert.throws(()=>resolveDataToVarParameters(specification('missing'),fields),/missing/);
 assert.throws(()=>resolveDataToVarParameters(specification('Category'),fields),/does not support sum,avg/);
 assert.throws(()=>resolveDataToVarParameters(specification(),[...fields,{...fields[0],record_id:'other'}]),/unique/);
 assert.throws(()=>resolveDataToVarParameters(specification(),[...fields,{name:'x',type:'real',record_id:'other'}]),/unique/);
 assert.deepEqual(resolveDataToVarParameters(specification('X',['avg','min','sum']),fields).fields[0].aggregations,['sum','min','avg']);
 assert.equal(resolveDataToVarParameters(specification(),[{...fields[0],type:'real'}]).fields[0].input.type,'real');
});

test('DataToVar admits the native per-type function matrix and refuses Variant',()=>{
 const all=Object.keys(DATA_TO_VAR_FUNCTIONS),scalar=['count','min','max','mode','unique_count','null_count','first','last','only'];
 const typed=type=>[{name:'F',label:'F',type,record_id:'f'}];
 assert.equal(resolveDataToVarParameters(specification('F',[...all].reverse()),typed('real')).fields[0].mask,16383);
 assert.deepEqual(resolveDataToVarParameters(specification('F',all),typed('integer')).fields[0].aggregations,all);
 assert.equal(resolveDataToVarParameters(specification('F',[...scalar,'concat']),typed('string')).fields[0].mask,16382&~(1|16|32|128));
 for(const type of ['boolean','datetime']){
  assert.equal(resolveDataToVarParameters(specification('F',scalar),typed(type)).fields[0].mask,8014);
  assert.throws(()=>resolveDataToVarParameters(specification('F',['first','concat']),typed(type)),/does not support concat/);
 }
 for(const a of ['sum','avg','median','standard_deviation'])assert.throws(()=>resolveDataToVarParameters(specification('F',[a]),typed('string')),new RegExp('does not support '+a));
 assert.throws(()=>resolveDataToVarParameters(specification('F',['count']),typed('variant')),/integer, real, string, boolean or datetime/);
 assert.equal(dataToVarParametersSchema.properties.fields.items.properties.aggregations.maxItems,14);
 assert.deepEqual(dataToVarParametersSchema.properties.fields.items.properties.aggregations.items.enum,all);
});
