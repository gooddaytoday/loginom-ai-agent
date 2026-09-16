import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
import {verifyNodeTargetEffect} from '../lib/node-target.mjs';

function fixture({budget=180000,bend=true,duplicate=false,wrongSelection=false,contextLost=false}={}) {
  const start=Date.now();let clock=start,clicked=0,deleted=0,contextChecks=0;
  const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1'}};
  const edge={source:'source',output:0,target:'target',input:0};
  const graph={complete:true,document_id:'doc',workflow_ref:request.workflow_ref,dom_epoch:1,interaction_ready:true,
    nodes:['source','target'].map(id=>({ref:{document_id:'doc',workflow_id:'wf',node_id:id},label:id})),links:[edge],foreign_links:[]};
  const tid='MF;TF-1;Graph;source|Output_Data-0|target|Input_Data-0';
  const page={
    evaluate:async(fn,arg)=>{
      if(arg?.types)return structuredClone(graph);
      if(arg?.epoch){contextChecks++;if(contextLost&&clicked)throw Error('Node target document/workflow/DOM epoch changed');return;}
      if(typeof arg==='string' && ['source','target'].includes(arg))return 'MF;TF-1;Graph;'+arg;
      if(arg===tid)return true;
      if(arg===undefined && fn.toString().includes('getSelectionCells'))return [{edge:true,tid:wrongSelection?'another-link':tid}];
      throw Error('Unexpected evaluate: '+fn);
    },
    locator:selector=>({
      count:async()=>selector.includes('TargetBend')&&duplicate?2:1,
      isVisible:async()=>selector.includes('TargetBend')?bend:true,
      isEnabled:async()=>true,
      evaluate:async()=>({x:100,y:100}),
      waitFor:async()=>{},
      textContent:async()=> 'Удалить выделенную связь?',
      click:async()=>{if(selector.includes('msgbox;tlb;yes')){deleted++;graph.links=[];}},
    }),
    mouse:{click:async()=>{clicked++;},move:async()=>{}},
    waitForTimeout:async ms=>{clock+=ms;},
  };
  class Clock extends Date {static now(){return clock;}}
  const adapter=createNodeTargetBrowserAdapter({origin:'http://example.test',build:'7.4.2',execute:code=>vm.runInNewContext('('+code+')',{Date:Clock})(page)});
  return {adapter,request,edge,graph,page,start,deadline:start+budget,stats:()=>({clicked,deleted,contextChecks,elapsed:clock-start})};
}
async function run(options) {
  const f=fixture(options);const before=await f.adapter.observe(f.request,f.deadline);
  const effect={id:'remove',kind:'remove_link',parameters:{edge:f.edge},before};
  return {...f,effect,receipt:await f.adapter.mutate(effect,f.deadline)};
}
for(const budget of [2000,180000])test('missing selection returns an ambiguous receipt before transport deadline: '+budget,async()=>{
  const f=await run({budget,bend:false});
  assert.equal(f.receipt.status,'AMBIGUOUS');assert.equal(f.receipt.effect_possible,true);assert.equal(f.receipt.cleanup_complete,true);
  assert.match(f.receipt.error,/Readiness timeout: owned_link_selection_visible/);
  assert.equal(f.stats().elapsed,Math.min(15000,budget-1000));
  assert.equal(f.stats().clicked,1);assert.equal(f.stats().deleted,0);assert.ok(f.stats().contextChecks>1);
  const recovered=await f.adapter.reconcile(f.effect,f.graph,f.deadline);
  assert.equal(recovered.verified,true);assert.equal(recovered.cleanup_complete,true);
  assert.equal(verifyNodeTargetEffect(f.effect,f.graph),null,'a completed ambiguous receipt is not deletion proof');
  assert.equal(f.stats().clicked,1,'reconciliation must not replay the click');
});
test('insufficient selection budget refuses the primitive before its click',async()=>{
  const f=await run({budget:1000});assert.equal(f.receipt.status,'NOT_APPLIED');assert.equal(f.receipt.effect_possible,false);
  assert.equal(f.stats().clicked,0);assert.equal(f.stats().deleted,0);
});
test('selection wait detects a changed prepared context',async()=>{
  const f=await run({bend:false,contextLost:true});assert.equal(f.receipt.status,'AMBIGUOUS');
  assert.match(f.receipt.error,/document\/workflow\/DOM epoch changed/);assert.equal(f.stats().deleted,0);assert.equal(f.stats().elapsed,0);
});
test('duplicate bend identity cannot authorize deletion',async()=>{
  const f=await run({duplicate:true});assert.equal(f.receipt.status,'AMBIGUOUS');assert.equal(f.stats().deleted,0);
});
test('visible bend cannot authorize deleting another selected object',async()=>{
  const f=await run({wrongSelection:true});assert.equal(f.receipt.status,'AMBIGUOUS');
  assert.match(f.receipt.error,/selection includes another object/);assert.equal(f.stats().deleted,0);
});
test('unique selected owned link deletes once and passes full graph verification',async()=>{
  const f=await run({});assert.equal(f.receipt.status,'SUCCEEDED');assert.equal(f.receipt.cleanup_complete,true);
  assert.equal(f.stats().clicked,1);assert.equal(f.stats().deleted,1);assert.ok(verifyNodeTargetEffect(f.effect,f.graph));
});
