import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightFilterSource} from '../lib/filter-node.mjs';

const ref={document_id:'doc',workflow_id:'flow',node_id:'source'};
function fixture({existing=false,type='variables.user',complete=true,finish='execute'}={}){
 const request={document_id:'doc',workflow_ref:{workflow_id:'flow'},target:existing?{kind:'existing',ref:{...ref,node_id:'filter'}}:{kind:'new'},
  variable_inputs:existing?[]:[{source:ref,output:type==='variables.user'?4:0,input:0,kind:'control'}],parameters:{},finish};
 const graph={complete,document_id:'doc',workflow_ref:request.workflow_ref,nodes:[{ref,type}],links:existing?[{source:'source',target:'filter',kind:'control',input:0,output:4}]:[]};
 let reads=0;
 return {run:()=>preflightFilterSource({operation:{parameters:request,nodeTargetAdapter:{observe:async()=>{reads++;return graph;}}}}, {deadline:1000},{}),reads:()=>reads};
}
for(const existing of [false,true])test('builtin filter source refuses before mutations, including saved bindings '+existing,async()=>{
 const f=fixture({existing});await assert.rejects(f.run(),e=>{
  assert.match(e.message,/Builtin Scenario variables output 4 is inactive/);
  assert.doesNotMatch(e.message,/Filter variable type or NULL differs/);
  assert.deepEqual(e.nodePhaseRefusal,{phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});return true;
 });assert.equal(f.reads(),1);
});
for(const type of ['variables.from_table','variables.calculator'])test('executed variable source is admitted '+type,async()=>{
 const f=fixture({type});assert.equal((await f.run()).verified,true);assert.equal(f.reads(),1);
});
test('incomplete graph refuses before interpreting source identity',async()=>{
 await assert.rejects(fixture({complete:false}).run(),/Complete filter control source graph required/);
});
test('Close retains disposal path without inspecting or executing builtin',async()=>{
 const f=fixture({finish:'close'});assert.equal((await f.run()).verified,true);assert.equal(f.reads(),0);
});
