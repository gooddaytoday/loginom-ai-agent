import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {configureVariablesCalculator} from '../lib/variables-calculator-procedure.mjs';
import {resolveVariablesCalculatorPatch} from '../lib/variables-calculator-parameters.mjs';
function fixture({drift=false,ownerDrift=false,baselineDrift=false,formula='120'}={}) {
 const expressions=[{index:0,record_id:'r0',expression_id:'0',name:'limit',label:'Лимит',type:'integer',formula:'100',description:'',intermediate:false,selected:true},
  {index:1,record_id:'r1',expression_id:'1',name:'missing',label:'Нет значения',type:'integer',formula:'NULL',description:'keep',intermediate:false,selected:false}];
 const parameters={expressions:[{target:{kind:'existing',name:'limit'},formula}]};
 const owner={verified:true,surface:'wizard',document_id:'doc',workflow_id:'wf',node_id:'node'};
 const inventory=()=>structuredClone({verified:true,inventory_complete:true,mode:'expression',expressions,node_context:owner});
 const plan=resolveVariablesCalculatorPatch(parameters,inventory());
 if(baselineDrift)expressions[1].description='changed';
 const actions=[];let reads=0;
 const page={locator:selector=>({scrollIntoViewIfNeeded:async()=>actions.push(['scroll',selector])}),
  evaluate:async(_fn,arg)=>{actions.push(['inspect',arg.mode]);return {x:1,y:1};},
  mouse:{click:async()=>actions.push(['click'])},
  keyboard:{press:async key=>actions.push(['press',key]),insertText:async text=>{actions.push(['insert',text]);expressions[0].formula=text;if(drift)expressions[1].formula='0';}}};
 const readNode=async()=>({...owner,...(ownerDrift&&++reads>2?{node_id:'foreign'}:{})});
 const readContext=async()=>inventory();
 const task={deadline:Date.now()+10000,binding:{document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{node_id:'node'}},plan};
 const context=vm.createContext({page,task,readNode,readContext,readBrowser:()=>{}});
 return {actions,expressions,task,run:()=>vm.runInContext('('+configureVariablesCalculator.toString()+')(page,task,readNode,readContext,readBrowser)',context)};
}
test('serialized writer patches one formula through UI and preserves NULL, description and identities',async()=>{
 const f=fixture(),result=await f.run();assert.equal(result.status,'SUCCEEDED');
 assert.equal(result.settings_applied,false);assert.equal(result.configuration.expressions[0].formula,'120');
 assert.equal(result.configuration.expressions[1].formula,'NULL');assert.equal(result.configuration.expressions[1].description,'keep');
 assert.deepEqual(f.actions.filter(a=>['insert','press'].includes(a[0])),[['press','ControlOrMeta+A'],['press','Backspace'],['insert','120']]);
});
test('a stale baseline and an expired deadline refuse with no gestures',async()=>{
 for(const f of [fixture({baselineDrift:true}),fixture()]) {
  if(!f.actions.length&&!f.expressions[1].description.includes('changed'))f.task.deadline=Date.now()-1;
  const result=await f.run();assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);assert.equal(result.cleanup_complete,true);
  assert.ok(!f.actions.some(a=>['click','insert','press'].includes(a[0])));
 }
});
test('owner drift refuses before writing a formula',async()=>{
 const f=fixture({ownerDrift:true}),result=await f.run();assert.equal(result.status,'AMBIGUOUS');
 assert.equal(result.cleanup_complete,false);assert.match(result.error,/owner changed/);
 assert.ok(!f.actions.some(a=>a[0]==='insert'));
});
test('native readback catches collateral formula changes and retains unresolved effect',async()=>{
 const f=fixture({drift:true}),result=await f.run();assert.equal(result.status,'AMBIGUOUS');assert.equal(result.effect_possible,true);
 assert.equal(result.cleanup_complete,false);assert.match(result.error,/complete calculator differs/);
});
test('an unchanged expression performs no UI gestures',async()=>{
 const f=fixture({formula:'100'}),result=await f.run();assert.equal(result.status,'SUCCEEDED');assert.equal(result.effect_possible,false);assert.deepEqual(f.actions,[]);
});
