import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGeneratedCollapseMapping} from '../static-source-proof.mjs';
test('generated Collapse definition requires complete native canonical schema without mapping or exclusion',()=>{
 const schema=[{name:'Key',label:'Key',type:'string'},{name:'Values',label:'Значения',type:'variant'}];
 const mapping={verified:true,inventory_complete:true,source_fields:[],target_fields:schema.map(f=>({...f,source:null,inherited:false,excluded:false}))};
 assert.equal(verifyGeneratedCollapseMapping(mapping,schema),true);
 for(const mutate of [m=>m.verified=false,m=>m.inventory_complete=false,m=>m.source_fields.push({record_id:'other'}),
  m=>m.target_fields.pop(),m=>m.target_fields.reverse(),m=>m.target_fields[1].name='Other',
  m=>m.target_fields[1].label='Other',m=>m.target_fields[1].type='string',m=>m.target_fields[1].excluded=true,
  m=>m.target_fields[1].inherited=true,m=>m.target_fields[1].source={record_id:'other'}]){
  const bad=structuredClone(mapping);mutate(bad);assert.throws(()=>verifyGeneratedCollapseMapping(bad,schema));
 }
});
