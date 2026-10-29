import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
import {runInNewContext} from 'node:vm';
const actions=JSON.parse(await readFile(new URL('../../executor/catalog/actions.json',import.meta.url))).actions;
const selectors=JSON.parse(await readFile(new URL('../../executor/catalog/selectors.json',import.meta.url))).selectors;
const pinned={actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s]))};
async function fixture(mode,targetType='exports.text'){
 let phase='setup',reads=0,waits=0,links=0;const controller=new AbortController();let deadline=Date.now()+10000;
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'tab',navigation_path:[]},target:{type:targetType}};
 const graph={complete:true,dom_epoch:1,nodes:[{ref:{node_id:'source'},dom_epoch:2},{ref:{node_id:'target'},dom_epoch:3}],links:[]};
 const page={evaluate:async()=>structuredClone(graph),locator:()=>{throw Error('Link hover source is covered');}};
 const adapter=createNodeTargetBrowserAdapter({origin:'http://example.test',build:'7.4.2',pinned,execute:async code=>{
  if(code.startsWith('async page=>{(page[Symbol')||code.startsWith('async page=>{page[Symbol'))return true;
  if(code.includes('function browserCapability')){links++;return {status:'SUCCEEDED',effect_possible:true,cleanup_complete:true};}
  if(code.includes('"receipt_read":true'))return runInNewContext('('+code+')(page)',{page});
  if(code.includes('async function prepareLinkHover'))return mode==='hover_failure'?runInNewContext('('+code+')(page)',{page}):structuredClone(graph);
  if(code.includes('page.waitForFunction')){waits++;if(mode==='cancel')controller.abort();if(mode==='deadline')await new Promise(r=>setTimeout(r,30));return true;}
  if(code.includes('async function readGraph')){
   if(code.includes('\"read_bindings\":true')){if(mode==='cancel_rebind')controller.abort();return {...structuredClone(graph),native_bindings:[{node_id:'source',label:'Source',outputs:[0]},{node_id:'target',label:'Export',inputs:[1]}]};}
   if(phase==='setup')return structuredClone(graph);reads++;
   if(mode==='foreign')throw Error('Prepared workflow changed');
   if(mode==='mask_forever'||reads===1&&mode!=='hover_failure')throw Error('Graph is blocked');
   const current=structuredClone(graph);
   if(mode.startsWith('epoch'))current.nodes[1].dom_epoch++;
   if(mode==='epoch_links')current.links.push({source:'source',target:'target'});
   if(mode==='epoch_root')current.dom_epoch++;
   if(mode==='epoch_owner')current.nodes[1].ref.node_id='other';
   if(mode==='epoch_locked')current.nodes[1].locked=true;
   if(mode==='epoch_ports')current.nodes[1].inputs=[1];
   return mode==='changed'?{...graph,links:[{}]}:current;
  }
  if(code.includes('page.evaluate(edge=>')){if(mode==='cancel_rebind')controller.abort();return {source:{label:'Source',index:0},target:{label:'Export',index:1}};}
  links++;return {status:'SUCCEEDED',effect_possible:true,cleanup_complete:true};
 }});
 await adapter.observe(request,deadline);phase='mutate';if(mode==='deadline')deadline=Date.now()+10;
 const effect={id:'effect',kind:'connect',before:graph,parameters:{edge:{source:'source',output:0,target:'target',input:0}}};
 let outcome,error;try{outcome=await adapter.mutate(effect,deadline,controller.signal);}catch(e){error=e;}
 const recovery=mode==='hover_failure'?await adapter.reconcile(effect,graph,deadline):null;
 return {outcome,error,reads,waits,links,recovery};
}
test('completed pre-hover failure retains its no-link receipt for release reconciliation',async()=>{
 const r=await fixture('hover_failure');assert.equal(r.links,0);assert.equal(r.outcome?.status,'FAILED',r.error?.message);
 assert.equal(r.outcome.phase,'preconditions');assert.equal(r.outcome.effect_possible,false);assert.equal(r.outcome.cleanup_complete,true);
 assert.equal(r.recovery.completed,true);assert.equal(r.recovery.cleanup_complete,true);assert.deepEqual(r.recovery.receipt,r.outcome);
});
test('transient mask before export link waits read-only then invokes exactly one link primitive',async()=>{
 const r=await fixture('mask');assert.equal(r.outcome?.status,'SUCCEEDED',r.error?.message);assert.equal(r.links,1);assert.equal(r.reads,2);assert.equal(r.waits,1);
});
test('transient mask before an ordinary node link also waits read-only and invokes exactly one primitive',async()=>{
 const r=await fixture('mask','transform.group_data');assert.equal(r.outcome?.status,'SUCCEEDED',r.error?.message);assert.equal(r.links,1);assert.equal(r.reads,2);assert.equal(r.waits,1);
});
test('export link never starts after wrong graph, persistent mask, expired budget or cancellation',async()=>{
 for(const mode of ['foreign','changed','mask_forever','deadline','cancel','cancel_rebind']){const r=await fixture(mode);assert.equal(r.links,0,mode);assert.ok(r.error||r.outcome?.status==='NOT_APPLIED',mode);assert.ok(r.reads<=3,mode);}
});

test('initial connect observation rebinds only node drawing epochs',async()=>{
 const r=await fixture('epoch','bg-vendor-icon-javascript');assert.equal(r.outcome?.status,'SUCCEEDED');assert.equal(r.links,1);
 for(const mode of ['epoch_links','epoch_root','epoch_owner','epoch_locked','epoch_ports']){
  const rejected=await fixture(mode,'bg-vendor-icon-javascript');
  assert.equal(rejected.links,0,mode);assert.equal(rejected.outcome?.status,'NOT_APPLIED',mode);
  assert.equal(rejected.outcome?.reason,'connect_graph_changed',mode);
 }
});
