import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCalculatorInlineSync} from '../lib/calculator-inline-mapping.mjs';
test('conditional sync retains custom output and exclusions while appending one requested field',()=>{
 const a={record_id:'s1',name:'Old',label:'Old',type:'real'},b={record_id:'s2',name:'New',label:'New',type:'real'};
 const field={record_id:'r1',field_id:'0',index:0,group_index:0,source:a,name:'Custom',label:'Same',type:'real',excluded:false};
 const before={source_fields:[a,b],autosync:false,target_fields:[field]};
 const after={...before,target_fields:[{...field,record_id:'r2'},{record_id:'r3',field_id:'1',index:1,group_index:1,source:b,name:'New',label:'New',type:'real',excluded:false}]};
 assert.equal(verifyCalculatorInlineSync(before,after,[b]),true);
 for(const change of [v=>v.autosync=true,v=>v.target_fields[0].label='Changed',v=>v.target_fields[0].field_id='9',v=>v.target_fields[1].source=a,v=>v.target_fields.push({...v.target_fields[1]})]){
  const altered=structuredClone(after);change(altered);assert.throws(()=>verifyCalculatorInlineSync(before,altered,[b]));
 }
});
