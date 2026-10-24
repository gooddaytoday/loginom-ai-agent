import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
import {verifyNodeTargetEffect} from '../lib/node-target.mjs';

function fixture({budget=180000,bend=true,duplicate=false,wrongSelection=false,contextLost=false,inputPort=0,outputPort=0,bindingsFault=null,selectionChange=null,selectionGuidChanged=false,service=false}={}) {
  const start=Date.now();let clock=start,clicked=0,deleted=0,contextChecks=0;
  const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1'}};
  const edge={source:'source',output:0,target:'target',input:0};
  const graph={complete:true,document_id:'doc',workflow_ref:request.workflow_ref,dom_epoch:1,interaction_ready:true,
    nodes:['source','target'].map(id=>({ref:{document_id:'doc',workflow_id:'wf',node_id:id},label:id,dom_epoch:1})),links:[edge],foreign_links:[]};
  const tid=service?'MF;TF-1;Graph;source|Output_Connection-0|target|Input_Connection-0':'MF;TF-1;Graph;source|Output_Data-'+outputPort+'|target|Input_Data-'+inputPort;
  if(service){
    Object.assign(edge,{tid,output:'connection:0',input:'connection:0'});
    graph.links=[];graph.foreign_links=[tid];graph.rest_connection_links=[edge];
    graph.nodes[0].type='bg-vendor-icon-restclientconnection';graph.nodes[0].other_ports=['Output_Connection-0'];
    graph.nodes[1].type='integration.rest_request';graph.nodes[1].other_ports=['Input_Connection-0'];
  }
  const page={
    evaluate:async(fn,arg)=>{
      if(fn.toString().includes('FLinks.FCollection'))return (graph.rest_connection_links??graph.links).map(e=>[selectionGuidChanged&&clicked?'changed':e.guid??'link',e.source,'source-port',e.target,'target-port']);
      if(arg?.types){
        const result=structuredClone(graph);
        if(arg.read_bindings){
          result.native_bindings=[{node_id:'source',label:'source',inputs:[],outputs:[outputPort]},{node_id:'target',label:'target',inputs:[inputPort],outputs:[]}];
          if(bindingsFault==='missing')result.native_bindings.pop();
          if(bindingsFault==='port')result.native_bindings[1].inputs=[];
          if(bindingsFault==='graph')result.nodes[0].label='changed';
        }
        return result;
      }
      if(arg?.epoch){contextChecks++;if(contextLost&&clicked)throw Error('Node target document/workflow/DOM epoch changed');return;}
      if(typeof arg==='string' && ['source','target'].includes(arg))return 'MF;TF-1;Graph;'+arg;
      if(arg===tid)return true;
      if(arg===undefined && fn.toString().includes('getSelectionCells'))return [{edge:true,tid:wrongSelection?'another-link':tid}];
      throw Error('Unexpected evaluate: '+fn);
    },
    locator:selector=>({
      locator:child=>page.locator(child),
      count:async()=>selector.includes(';Graph;source|')&&!selector.includes(tid)?0:selector.includes('TargetBend')&&duplicate?2:1,
      isVisible:async()=>selector.includes('TargetBend')?bend:true,
      isEnabled:async()=>true,
      evaluate:async()=>({x:100,y:100}),
      waitFor:async()=>{},
      textContent:async()=> 'Удалить выделенную связь?',
      click:async()=>{if(selector.includes('msgbox;tlb;yes')){deleted++;graph.links=[];if(service){graph.foreign_links=[];graph.rest_connection_links=[];}}},
    }),
    mouse:{click:async()=>{clicked++;selectionChange?.(graph);},move:async()=>{}},
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
test('D31 native removal resolves the typed service edge rather than tabular port 0',async()=>{
  const f=await run({service:true});assert.equal(f.receipt.status,'SUCCEEDED',f.receipt.error);
  assert.equal(f.stats().clicked,1);assert.equal(f.stats().deleted,1);assert.ok(verifyNodeTargetEffect(f.effect,f.graph));
});
for(const fault of ['wrongSelection','selectionGuidChanged'])test('D31 service deletion preserves '+fault+' guard',async()=>{
  const f=await run({service:true,[fault]:true});assert.equal(f.receipt.status,'AMBIGUOUS');assert.equal(f.stats().deleted,0);
});

test('D19 removal resolves logical input 0 to the rendered REST Input_Data-2',async()=>{
  const f=await run({inputPort:2});assert.equal(f.receipt.status,'SUCCEEDED',f.receipt.error);
  assert.equal(f.stats().deleted,1);assert.ok(verifyNodeTargetEffect(f.effect,f.graph));
});
test('removal resolves both source and target native indexes from the same owned graph',async()=>{
  const f=await run({inputPort:2,outputPort:3});assert.equal(f.receipt.status,'SUCCEEDED',f.receipt.error);
  assert.equal(f.stats().clicked,1);assert.equal(f.stats().deleted,1);
});
for(const bindingsFault of ['missing','port','graph'])test('removal refuses '+bindingsFault+' native binding before a click',async()=>{
  const f=await run({inputPort:2,bindingsFault});assert.equal(f.receipt.status,'NOT_APPLIED');
  assert.equal(f.receipt.effect_possible,false);assert.equal(f.stats().clicked,0);assert.equal(f.stats().deleted,0);
});

test('owned link selection may redraw node DOM without changing the graph',async()=>{
  const f=await run({inputPort:2,selectionChange:g=>{for(const n of g.nodes)n.dom_epoch++;}});
  assert.equal(f.receipt.status,'SUCCEEDED',f.receipt.error);assert.equal(f.stats().deleted,1);
  assert.ok(verifyNodeTargetEffect(f.effect,f.graph));
});
for(const [name,change] of Object.entries({
  document:g=>{g.document_id='other';},
  workflow:g=>{g.workflow_ref.workflow_id='other';},
  graph_epoch:g=>{g.dom_epoch++;},
  node_identity:g=>{g.nodes[0].ref.node_id='other';},
  node_label:g=>{g.nodes[0].label='other';},
  node_added:g=>{g.nodes.push(structuredClone(g.nodes[0]));},
  link_identity:g=>{g.links[0].guid='other';},
  link_source:g=>{g.links[0].source='other';},
  link_output:g=>{g.links[0].output++;},
  link_target:g=>{g.links[0].target='other';},
  link_input:g=>{g.links[0].input++;},
  link_added:g=>{g.links.push({...g.links[0]});},
  foreign_link:g=>{g.foreign_links.push({...g.links[0]});},
}))test('selection redraw cannot hide a changed '+name,async()=>{
  const f=await run({selectionChange:g=>{for(const n of g.nodes)n.dom_epoch++;change(g);}});
  assert.equal(f.receipt.status,'AMBIGUOUS');assert.equal(f.receipt.effect_possible,true);
  assert.equal(f.stats().clicked,1);assert.equal(f.stats().deleted,0);
});

test('same endpoints cannot hide a changed native link GUID after selection',async()=>{
  const f=await run({selectionGuidChanged:true,selectionChange:g=>{for(const n of g.nodes)n.dom_epoch++;}});
  assert.equal(f.receipt.status,'AMBIGUOUS');assert.match(f.receipt.error,/graph changed before deletion/);
  assert.equal(f.stats().deleted,0);
});
