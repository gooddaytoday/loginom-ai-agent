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
test('reform orders dependent renames and refuses cycles without inventing names',()=>{
 const r=resolveReformChanges({changes:[{field:field('A'),name:'B'},{field:field('B'),name:'D'}]},baseline());
 assert.deepEqual(r.changes.map(c=>c.original.name),['B','A']);assert.deepEqual(r.fields.map(f=>f.name),['B','D','C']);
 assert.throws(()=>resolveReformChanges({changes:[{field:field('A'),name:'B'},{field:field('B'),name:'A'}]},baseline()),/Cyclic/);
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
