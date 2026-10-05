import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {configureLocalVariables} from '../lib/crosstable-variables.mjs';

function fixture({requested=[],drift=false}={}){
 const values=[{id:0,name:'Limit',label:'Limit',type:4,value:0,is_null:false},
  {id:1,name:'Other',label:'Other',type:5,value:'keep',is_null:false}];
 const calls=[];
 const locator=selector=>({locator:s=>locator(selector+' '+s),count:async()=>1,waitFor:async()=>{},
  fill:async()=>{},press:async()=>{},click:async()=>{
   calls.push(selector);
   if(selector.includes('btnApply')){values[0].value=1;if(drift)values[1].value='changed';}
  }});
 const page={locator,mouse:{click:async()=>{}},waitForFunction:async()=>{},waitForTimeout:async()=>{},
  evaluate:async(_fn,{mode})=>{
   if(['inventory','retain'].includes(mode))return values;
   if(mode==='graph')return {visible:true};
   return {x:1,y:1};
  }};
 const binding={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF'},node:{node_id:'pivot'}};
 const task={binding,operation_id:'vars',deadline:Date.now()+10000,variables:requested};
 const readNode=async()=>({verified:true,surface:'graph',node_id:'pivot',locked:false});
 const openPort=async(_page,options)=>{assert.equal(options.operation_id,'vars:port');assert.equal(options.kind,'control');return {status:'SUCCEEDED',effect_possible:true};};
 const context=vm.createContext({page,task,readNode,openPort});
 assert.equal(vm.runInContext('typeof structuredClone',context),'undefined');
 return {calls,run:()=>vm.runInContext('('+configureLocalVariables.toString()+')(page,task,readNode,openPort)',context)};
}
test('serialized local variable helper reads and discards unchanged inventory without Node globals',async()=>{
 const result=await fixture().run();assert.equal(result.status,'SUCCEEDED');
 assert.equal(result.draft_discarded,true);assert.equal(result.settings_applied,false);assert.equal(result.settings_changed,false);
 assert.deepEqual(Array.from(result.variables,v=>[v.name,v.value]),[['Limit',0],['Other','keep']]);
});
test('serialized local variable helper preserves unrelated values while editing a requested default',async()=>{
 const f=fixture({requested:[{name:'Limit',type:'integer',value:1}]}),result=await f.run();
 assert.equal(result.status,'SUCCEEDED');assert.equal(result.settings_changed,true);
 assert.deepEqual(Array.from(result.changed),['Limit']);assert.equal(result.variables[1].value,'keep');
 assert.equal(f.calls.filter(s=>s.includes('btnApply')).length,1);
});
test('serialized local variable helper retains its original snapshot and refuses collateral drift',async()=>{
 const result=await fixture({requested:[{name:'Limit',type:'integer',value:1}],drift:true}).run();
 assert.equal(result.status,'AMBIGUOUS');assert.equal(result.cleanup_complete,false);
 assert.match(result.error,/Unrequested variable changed/);
});
