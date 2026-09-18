import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
const actions=JSON.parse(await readFile(new URL('../../executor/catalog/actions.json',import.meta.url))).actions;
const selectors=JSON.parse(await readFile(new URL('../../executor/catalog/selectors.json',import.meta.url))).selectors;
const pinned={actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s]))};
async function fixture(mode,targetType='exports.text'){
 let phase='setup',reads=0,waits=0,links=0;const controller=new AbortController();let deadline=Date.now()+10000;
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'tab',navigation_path:[]},target:{type:targetType}};
 const graph={complete:true,dom_epoch:1,nodes:[{ref:{node_id:'source'},dom_epoch:2},{ref:{node_id:'target'},dom_epoch:3}],links:[]};
 const adapter=createNodeTargetBrowserAdapter({origin:'http://example.test',build:'7.4.2',pinned,execute:async code=>{
  if(code.startsWith('async page=>{(page[Symbol')||code.startsWith('async page=>{page[Symbol'))return true;
  if(code.includes('page.waitForFunction')){waits++;if(mode==='cancel')controller.abort();if(mode==='deadline')await new Promise(r=>setTimeout(r,30));return true;}
  if(code.includes('async function readGraph')){
   if(phase==='setup')return structuredClone(graph);reads++;
   if(mode==='foreign')throw Error('Prepared workflow changed');
   if(mode==='mask_forever'||reads===1)throw Error('Graph is blocked');
   return mode==='changed'?{...graph,links:[{}]}:structuredClone(graph);
  }
  if(code.includes('page.evaluate(edge=>')){if(mode==='cancel_rebind')controller.abort();return {source:{label:'Source',index:0},target:{label:'Export',index:1}};}
  links++;return {status:'SUCCEEDED',effect_possible:true,cleanup_complete:true};
 }});
 await adapter.observe(request,deadline);phase='mutate';if(mode==='deadline')deadline=Date.now()+10;
 const effect={id:'effect',kind:'connect',before:graph,parameters:{edge:{source:'source',output:0,target:'target',input:0}}};
 let outcome,error;try{outcome=await adapter.mutate(effect,deadline,controller.signal);}catch(e){error=e;}
 return {outcome,error,reads,waits,links};
}
test('transient mask before export link waits read-only then invokes exactly one link primitive',async()=>{
 const r=await fixture('mask');assert.equal(r.outcome?.status,'SUCCEEDED',r.error?.message);assert.equal(r.links,1);assert.equal(r.reads,2);assert.equal(r.waits,1);
});
test('transient mask before an ordinary node link also waits read-only and invokes exactly one primitive',async()=>{
 const r=await fixture('mask','transform.group_data');assert.equal(r.outcome?.status,'SUCCEEDED',r.error?.message);assert.equal(r.links,1);assert.equal(r.reads,2);assert.equal(r.waits,1);
});
test('export link never starts after wrong graph, persistent mask, expired budget or cancellation',async()=>{
 for(const mode of ['foreign','changed','mask_forever','deadline','cancel','cancel_rebind']){const r=await fixture(mode);assert.equal(r.links,0,mode);assert.ok(r.error||r.outcome?.status==='NOT_APPLIED',mode);assert.ok(r.reads<=3,mode);}
});
