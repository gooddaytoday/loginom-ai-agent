import test from 'node:test';
import assert from 'node:assert/strict';
import {coldNativeEligible} from '../cold-reader-policy.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'cross'};
const configuration={node_context:node};
const output=(types)=>({verified:true,inventory_complete:true,node_context:{...node,verified:true},port:0,node_id:node.node_id,
 fields:types.map(type=>({type,excluded:false}))});
test('actual small scalar and Variant definitions select native independently of expectations',()=>{
 assert.equal(coldNativeEligible(configuration,output(['string','real','integer','boolean'])),true);
 assert.equal(coldNativeEligible(configuration,output(Array(8).fill('variant'))),true);
});
test('wide and civil DateTime definitions retain formatted reading',()=>{
 assert.equal(coldNativeEligible(configuration,output(Array(9).fill('real'))),false);
 assert.equal(coldNativeEligible(configuration,output(['string','datetime'])),false);
});
test('incomplete, foreign or wrong-port definitions cannot select native',()=>{
 for(const mutate of [o=>o.verified=false,o=>o.inventory_complete=false,o=>o.node_context.node_id='other',
  o=>o.port=1,o=>o.fields=[],o=>o.fields[0].type='unknown']){
  const o=output(['real']);mutate(o);assert.equal(coldNativeEligible(configuration,o),false);
 }
});
