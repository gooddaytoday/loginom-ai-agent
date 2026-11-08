import test from 'node:test';import assert from 'node:assert/strict';
import {validateReformChanges,resolveReformChanges} from '../lib/reform-parameters.mjs';
const field=name=>({kind:'configured_field',name});
const baseline=()=>({verified:true,inventory_complete:true,fields:['A','B','C'].map((name,index)=>({name,index,record_id:'r'+index,field_id:String(index),label:'Same',type:'string',data_kind:'Дискретный',usage_type:0,caching_method:2,excluded:false}))});
test('reform resolves identical labels by exact name and preserves all unrequested properties',()=>{
 const b=baseline(),p={changes:[{field:field('B'),name:'Price',type:'real',usage:'Показатель'}]},saved=structuredClone({b,p});
 const r=resolveReformChanges(p,b);assert.equal(r.changes[0].original.record_id,'r1');assert.equal(r.fields[1].label,'Same');assert.equal(r.fields[1].caching_method,2);assert.equal(r.fields[1].usage_type,7);
 assert.deepEqual(r.fields[0],b.fields[0]);assert.deepEqual({b,p},saved);
});
test('reform rejects every invalid patch before allowing a partial edit',()=>{
 for(const change of [{field:field('A'),type:'variant'},{field:field('A'),excluded:'yes'},{field:field('A'),name:'bad name'},{field:field('A'),label:'bad\nlabel'},
  {field:{kind:'label',name:'Same'},type:'real'},{field:field('A'),data_kind:'Continuous'},{field:field('A'),usage:'Used'},{field:field('A'),caching:1},{field:field('A')}])assert.throws(()=>validateReformChanges({changes:[change]}));
 assert.throws(()=>validateReformChanges({changes:[{field:field('A'),excluded:true},{field:field('a'),excluded:false}]}));
});
test('reform rejects unknown fields, final collisions, all exclusions and unsupported source types',()=>{
 for(const changes of [[{field:field('missing'),type:'real'}],[{field:field('A'),name:'B'}],['A','B','C'].map(n=>({field:field(n),excluded:true}))])assert.throws(()=>resolveReformChanges({changes},baseline()));
 const b=baseline();b.fields[0].type='variant';assert.throws(()=>resolveReformChanges({changes:[{field:field('A'),type:'real'}]},b));
 assert.equal(resolveReformChanges({changes:[{field:field('A'),label:'Untouched type'}]},b).fields[0].type,'variant');
});
test('reform orders dependent renames and orders dependent renames',()=>{
 const r=resolveReformChanges({changes:[{field:field('A'),name:'B'},{field:field('B'),name:'D'}]},baseline());
 assert.deepEqual(r.changes.map(c=>c.original.name),['B','A']);assert.deepEqual(r.fields.map(f=>f.name),['B','D','C']);
});
test('reform breaks a cyclic swap through one temporary name that is gone from the final fields',()=>{
 const b=baseline(),saved=structuredClone(b);b.fields[0].label='LA';b.fields[1].label='LB';
 const r=resolveReformChanges({changes:[{field:field('A'),name:'B',label:'LB'},{field:field('B'),name:'A',label:'LA',type:'integer'}]},b);
 const steps=r.changes.map(c=>[c.original.record_id,c.original.name,c.wanted.name]);
 assert.equal(steps.length,3);assert.deepEqual(steps.map(s=>s[0]),['r0','r1','r0']);
 const tmp=steps[0][2];assert.ok(!['A','B','C'].includes(tmp)&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(tmp));
 assert.deepEqual(steps,[['r0','A',tmp],['r1','B','A'],['r0',tmp,'B']]);
 assert.equal(r.changes[0].wanted.label,'LA');assert.equal(r.changes[0].wanted.type,'string');
 assert.equal(r.changes[2].wanted.label,'LB');assert.equal(r.changes[1].wanted.type,'integer');
 assert.deepEqual(r.fields.map(f=>[f.name,f.label,f.type]),[['B','LB','string'],['A','LA','integer'],['C','Same','string']]);
 assert.ok(saved.fields.every((f,i)=>f.name===b.fields[i].name));
 // a three-cycle and a temporary name that avoids names already taken
 const c=baseline();c.fields.push({...c.fields[2],name:'_reform_tmp_1',index:3,record_id:'r3',field_id:'3'});
 const three=resolveReformChanges({changes:[{field:field('A'),name:'B'},{field:field('B'),name:'C'},{field:field('C'),name:'A'}]},c);
 assert.equal(three.changes.length,4);assert.deepEqual(three.fields.map(f=>f.name),['B','C','A','_reform_tmp_1']);
 assert.ok(!['A','B','C','_reform_tmp_1'].includes(three.changes[0].wanted.name));
});
test('reform retains excluded fields unless explicitly restored and accepts no-op patch',()=>{
 const b=baseline();b.fields[2].excluded=true;assert.deepEqual(resolveReformChanges({changes:[]},b).fields,b.fields);
 assert.equal(resolveReformChanges({changes:[{field:field('C'),excluded:false}]},b).fields[2].excluded,false);
});

test('conversion refuses an implicit kind change required by string and boolean types',()=>{
 for(const type of ['string','boolean']){
  const b=baseline();b.fields[0].type='real';b.fields[0].data_kind='Непрерывный';
  assert.throws(()=>resolveReformChanges({changes:[{field:field('A'),type}]},b),/request data_kind explicitly/);
  assert.equal(resolveReformChanges({changes:[{field:field('A'),type,data_kind:'Дискретный'}]},b).fields[0].data_kind,'Дискретный');
 }
});
