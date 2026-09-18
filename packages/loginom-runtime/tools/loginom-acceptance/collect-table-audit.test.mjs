import test from 'node:test';
import assert from 'node:assert/strict';
import {auditColumnOrder} from './collect_missing_values_table.mjs';

test('audit permits only an explicitly allowed permutation, retaining field identities',()=>{
 const original=[{index:0,name:'a',label:'Amount',type:'real'},{index:1,name:'b',label:'Category',type:'string'}];
 const reordered=[{...original[1],index:0},{...original[0],index:1}];
 assert.equal(auditColumnOrder(original,original).reordered,false);
 assert.throws(()=>auditColumnOrder(reordered,original));
 assert.deepEqual(auditColumnOrder(reordered,original,{allowFieldReordering:true}),{expected:reordered,reordered:true});
 for(const wrong of [[reordered[0],reordered[0]],reordered.slice(1),
  [{...reordered[0],type:'real'},reordered[1]],[{...reordered[0],label:'Other'},reordered[1]],
  [{...reordered[0],index:1},reordered[1]]]){
  assert.throws(()=>auditColumnOrder(wrong,original,{allowFieldReordering:true}));
 }
});
