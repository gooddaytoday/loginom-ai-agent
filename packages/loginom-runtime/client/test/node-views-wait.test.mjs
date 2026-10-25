import test from 'node:test';
import assert from 'node:assert/strict';
import {runInContext} from 'node:vm';
import {makeWorkspaceUiCode,workspaceUiCapability} from '../lib/workspace-ui.mjs';
import {Page,build,origin} from './support/workspace-ui-fixture.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';

test('absolute node deadline rejects invalid or unbounded waits',()=>{
  for(const options of [{deadline:0},{deadline:-1},{deadline:Infinity},{deadline:NaN},{deadline:'60000'},
    {deadline:60000,opening_timeout_ms:undefined}])assert.throws(()=>makeWorkspaceUiCode({mode:'act',
      prepared_node_context:{},action:{verb:'open_node_views',ref:'ui-views'},opening_timeout_ms:60000,...options}),
    /Absolute node deadline/);
});

// LAB-148: the 10 s dispatch delay must consume the original 60 s budget.
for(const [readyAt,transportDelay] of [[54000,10000],[64000,10000],[64000,59000]])
test(`D50b dispatched views keep parent deadline: ready ${readyAt}, transport ${transportDelay}`,async()=>{
  let elapsed=1000,clicked=false,receipt;
  class Clock extends Date {static now(){return elapsed;}}
  const page=new Page({clock:Clock});
  page.add('g','MF;TF-1;Graph;Node');
  page.add('span','MF;TF-1;Graph;Node;Label;Label','Node',{x:30,y:80,width:100,height:15});
  page.add('g','MF;TF-1;Graph;Node;Visualizers','',{x:160,y:100,width:24,height:24});
  const node={document_id:'doc',workflow_id:'wf',node_id:'node-0'};
  const workflow_ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:page.tab.getAttribute('data-tid'),navigation_path:[{tid:'scenario',label:'Scenario'}]};
  const binding={document_id:'doc',workflow_ref,node};
  const reader=async()=>clicked&&elapsed<readyAt?{verified:false,surface_pending:true}:
    {verified:true,...node,surface:clicked?'views':'graph',tid:'MF;TF-1;'+(clicked?'ViewsForm':'Graph;Node'),...(!clicked?{locked:false}:{})};
  const observed=await runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
    {mode:'observe',expected_origin:origin,expected_build:build,prepared_node_context:binding},reader);
  const target=observed.output.ui.elements.find(e=>e.tid==='MF;TF-1;Graph;Node;Visualizers');
  const click=page.mouse.click;
  page.mouse.click=async(...args)=>{await click(...args);clicked=true;};
  page.waitForTimeout=async ms=>{elapsed+=ms;};
  page.context.readOwnedContext=reader;
  const operation={id:'parent',deadline:60000,action:{action_key:'node.apply',revision:'1'}};
  const channel=createNodeProcedure({operation,preparedNodeContext:binding,targetOrigin:origin,targetBuild:build,
    now:()=>elapsed,wait:async()=>{},record:async e=>structuredClone(e),wrapMutation:(code,receipt)=>({code,receipt}),
    execute:async code=>{
      if(typeof code==='string')return {status:'SUCCEEDED',output:structuredClone(observed.output)};
      elapsed+=transportDelay;
      // Execute the actual serialized dispatch, replacing only the native fixture reader.
      const script=code.code.replace(readPreparedNodeContext.toString(),'readOwnedContext');
      receipt=await runInContext('('+script+')',page.context)(page);
      return receipt;
    }});
  await channel.observe({condition:'own graph',ready:()=>true});
  const act=()=>channel.act({verb:'open_node_views',ref:target.ref});
  if(readyAt<operation.deadline){
    await act();assert.equal(receipt.status,'SUCCEEDED');assert.equal(elapsed,readyAt);
  }else{
    await assert.rejects(act());
    assert.equal(receipt.error.code,'UI_DEADLINE_EXCEEDED');
    assert.equal(receipt.status,transportDelay===59000?'NOT_APPLIED':'AMBIGUOUS');
  }
  assert.ok(elapsed<=60000,`parent deadline exceeded at ${elapsed}`);
  assert.equal(operation.deadline,60000);
  assert.equal(page.clickedPoints.length,transportDelay===59000?0:1);
});

// D50b: saved p17:128 and r4-base:82 contain one open_node_views
// gesture, then a pending native surface past the old 15 s local deadline.
for(const [name,delay] of [['p17',15004],['r4',32334],['q8',32546]]) {
  for(const fault of ['none','foreign_before','foreign_after','expired'])test('D50b '+name+' views settlement '+fault,async()=>{
    let elapsed=0,clicked=false;
    class Clock extends Date {static now(){return elapsed;}}
    const page=new Page({clock:Clock});
    page.add('g','MF;TF-1;Graph;Node');
    page.add('span','MF;TF-1;Graph;Node;Label;Label','Node',{x:30,y:80,width:100,height:15});
    page.add('g','MF;TF-1;Graph;Node;Visualizers','',{x:160,y:100,width:24,height:24});
    const node={document_id:'doc',workflow_id:'wf',node_id:'node-0'};
    const workflow_ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:page.tab.getAttribute('data-tid'),navigation_path:[{tid:'scenario',label:'Scenario'}]};
    const binding={document_id:'doc',workflow_ref,node};
    const reader=async()=>{
      if(fault==='foreign_before'||clicked&&fault==='foreign_after')return {verified:false,reason:'node_guid'};
      if(clicked&&(elapsed<=delay||fault==='expired'))return {verified:false,surface_pending:true};
      return {verified:true,...node,surface:clicked?'views':'graph',tid:'MF;TF-1;'+(clicked?'ViewsForm':'Graph;Node'),...(!clicked?{locked:false}:{})};
    };
    const execute=(options,read=reader)=>runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,{expected_origin:origin,expected_build:build,...options},read);
    const observed=await execute({mode:'observe',prepared_node_context:binding});
    // The foreign-before case changes ownership after the admitted snapshot.
    let snapshot=observed.output;
    if(fault==='foreign_before'){
      snapshot=(await execute({mode:'observe',prepared_node_context:binding},async()=>({verified:true,...node,surface:'graph',tid:'MF;TF-1;Graph;Node',locked:false}))).output;
    }
    assert.ok(snapshot?.ui,JSON.stringify(observed));
    const target=snapshot.ui.elements.find(e=>e.tid==='MF;TF-1;Graph;Node;Visualizers');
    assert.ok(target?.allowed_actions.includes('open_node_views'),JSON.stringify(target));
    const click=page.mouse.click;
    page.mouse.click=async(...args)=>{await click(...args);clicked=true;};
    page.waitForTimeout=async ms=>{elapsed+=ms;};
    const options={mode:'act',expected_origin:origin,expected_build:build,prepared_node_context:binding,
      opening_timeout_ms:60000,snapshot,action:{verb:'open_node_views',ref:target.ref}};
    assert.doesNotThrow(()=>makeWorkspaceUiCode(options));
    const result=await execute(options);
    assert.equal(page.clickedPoints.length,fault==='foreign_before'?0:1);
    if(fault==='none'){
      assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
      assert.equal(result.output.prepared_node_context.surface,'views');
      assert.ok(elapsed>delay&&elapsed<60000);
    }else{
      assert.equal(result.status,fault==='foreign_before'?'NOT_APPLIED':'AMBIGUOUS');
      assert.equal(result.error.code,fault==='expired'?'UI_DEADLINE_EXCEEDED':'PREPARED_NODE_CONTEXT_CHANGED');
      if(fault==='expired')assert.ok(elapsed<=60000);
    }
  });
}
