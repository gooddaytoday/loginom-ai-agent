import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionRuntime} from '../lib/executor.mjs';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createExecutionJournal} from '../lib/execution-journal.mjs';

// #763: recorded native geometry, not a widened positionMatches tolerance.
const requested={x:600,y:400},observed={x:601.6421119999986,y:395.0768416000001};
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const ref=node_id=>({document_id:'doc',workflow_id:'wf',node_id});
function fixture({lost=false,change,receiptStatus='SUCCEEDED',cleanup=true,completed=true,failJournal=false,record=async e=>e,label='Месяцы магазина'}={}){
 const graph={complete:true,interaction_ready:true,document_id:'doc',workflow_ref:workflow,dom_epoch:1,
  nodes:[{ref:ref('source'),type:'imports.text',label:'Source',position:{x:96,y:96},locked:false,inputs:[],outputs:[0]},
   {ref:ref('target'),type:'transform.group_data',label,position:{x:3096,y:208},locked:false,inputs:[0],outputs:[0],dom_epoch:3200}],
  links:[{source:'source',output:0,target:'target',input:0}],foreign_links:[]};
 const calls=[],events=[];let receipt;
 const request={operation_id:'move',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'existing',type:'transform.group_data',ref:ref('target'),position:requested},inputs:[],mode:'aggregate',parameters:{},mappings:[],finish:'execute',
  read:{ports:[0],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},execute:async()=>{throw Error('Unexpected public transport');},
  nodeTargetAdapterFactory:()=>createNodeTargetBrowserAdapter({origin:'http://example.test',build:'7.4.2',execute:async code=>{
   if(code.includes('function activatePreparedWorkflow'))return {status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,document_id:'doc',workflow_ref:workflow};
   if(code.includes('async function mutateGraph')){
    calls.push('move');graph.nodes[1].position=structuredClone(observed);graph.nodes[1].dom_epoch++;
    change?.(graph);
    receipt={status:receiptStatus,effect_possible:true,cleanup_complete:cleanup,after:structuredClone(graph),
     placement_navigation:{fully_visible:true,view:{scale:0.5131581182307065,scroll:{x:56,y:0},viewportWidth:1920,viewportHeight:945}}};
    if(lost)throw Error('Lost move reply');return structuredClone(receipt);
   }
   if(code.includes('async function readGraph'))return structuredClone(graph);
   assert.ok(code.includes('receipt_read'));return {output:{state:completed?'completed':'running',receipt:structuredClone(receipt)}};
  }}),
  nodeApplyHandlers:new Map([['transform.group_data',{revision:'1',modes:['aggregate'],validate:()=>{},configure:async()=>{calls.push('configure');throw Error('Must preserve committed settings');}}]]),
  nodeApplyDriverFactory:()=>Object.fromEntries(['verifySource','mapPorts','openWizard','finish','waitExecution','readOutput','verifyContinuation'].map(name=>[name,async()=>{
   calls.push(name);return {verified:true,cleanup_complete:true,effect_possible:false};
  }])),
  onRecord:async event=>{events.push(structuredClone(event));if(failJournal&&event.target_state?.move_mismatch)throw Error('disk unavailable');return record(event);}});
 return {runtime,request,graph,calls,events};
}

for(const corruptAck of [false,true])test('move failure inspection ACK through real journal with URL/Cyrillic label, corrupt='+corruptAck,async t=>{
 const directory=await mkdtemp(join(tmpdir(),'lab1041-move-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const journal=createExecutionJournal({directory,metadata:{sessionId:'offline-lab1041'}});
 const label='Итог https://example.org/путь_Кириллица';
 const f=fixture({lost:true,label,record:async event=>{const saved=await journal(event);if(corruptAck&&event.phase==='node_checkpoint')saved.result.status='SUCCEEDED';return saved;}});
 assert.equal((await f.runtime.runNodeApply(f.request)).status,'AMBIGUOUS');
 if(corruptAck)await assert.rejects(f.runtime.inspect({operationId:'move'}),/journal acknowledgement differs/);
 else assert.equal((await f.runtime.inspect({operationId:'move'})).output.outcome.status,'FAILED');
 assert.ok(f.events.some(event=>event.phase==='node_checkpoint'));assert.equal(f.graph.nodes[1].label,label);
 assert.deepEqual(f.calls,['verifySource','move']);
});

for(const lost of [false,true])test('#763 completed move mismatch releases apply without another drag, lost reply='+lost,async()=>{
 const f=fixture({lost}),before=structuredClone(f.graph);
 const first=await f.runtime.runNodeApply(f.request);
 if(lost){assert.equal(first.status,'AMBIGUOUS');assert.throws(()=>f.runtime.assertPreparationAllowed());}
 const outcome=lost?(await f.runtime.inspect({operationId:'move'})).output.outcome:first;
 assert.equal(outcome.status,'FAILED',JSON.stringify(outcome));
 assert.equal(outcome.error.code,'NODE_APPLY_STOPPED');
 assert.match(outcome.error.message,/position mismatch/);
 assert.equal(outcome.cleanup_complete,true);assert.equal(outcome.output.pending_phase,null);
 assert.equal(outcome.effect_possible,true);
 f.runtime.assertPreparationAllowed();
 assert.deepEqual(f.calls,['verifySource','move']);
 assert.deepEqual(f.graph,{...before,nodes:[before.nodes[0],{...before.nodes[1],position:observed,dom_epoch:3201}]});
 const checkpoint=f.events.find(e=>e.target_state?.move_mismatch);
 assert.deepEqual(checkpoint.target_state.move_mismatch.requested_position,requested);
 assert.deepEqual(checkpoint.target_state.move_mismatch.observed_position,observed);
 assert.equal(checkpoint.target_state.pending,null);
 const replay=await f.runtime.runNodeApply(f.request);
 assert.equal(replay.status,'FAILED');assert.deepEqual(f.calls,['verifySource','move']);
});

for(const [name,change] of [
 ['other node',g=>{g.nodes[0].label='foreign';}],
 ['target settings',g=>{g.nodes[1].label='foreign';}],
 ['links',g=>{g.links=[];}],
 ['foreign links',g=>{g.foreign_links.push('foreign');}],
 ['graph metadata',g=>{g.rest_connection_links=[{tid:'foreign'}];}],
 ['root epoch',g=>{g.dom_epoch++;}],
])for(const lost of [false,true])test('#763 retains pending on '+name+', lost reply='+lost,async()=>{
 const f=fixture({lost,change});
 assert.equal((await f.runtime.runNodeApply(f.request)).status,'AMBIGUOUS');
 const inspected=await f.runtime.inspect({operationId:'move'});
 assert.equal(inspected.output.state,'pending');assert.throws(()=>f.runtime.assertPreparationAllowed());
 assert.deepEqual(f.calls,['verifySource','move']);
 assert.ok(!f.events.some(e=>e.target_state?.move_mismatch));
});

for(const options of [{receiptStatus:'AMBIGUOUS'},{receiptStatus:'FAILED'},{cleanup:false},{lost:true,completed:false},{failJournal:true}])
test('#763 unknown completion or unacknowledged mismatch retains gate '+JSON.stringify(options),async()=>{
 const f=fixture(options);
 assert.equal((await f.runtime.runNodeApply(f.request)).status,'AMBIGUOUS');
 assert.throws(()=>f.runtime.assertPreparationAllowed());
 assert.deepEqual(f.calls,['verifySource','move']);
});
