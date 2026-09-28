import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLinkHover} from '../lib/node-target-browser.mjs';
import {samePlacementGraph} from '../lib/node-placement.mjs';
for(const fault of ['none','position','label','links','foreign_document','root_epoch','missing_source','prior_change'])test('link hover rebinding: '+fault,async()=>{
 const before={document_id:'doc',dom_epoch:1,nodes:[{ref:{node_id:'a'},dom_epoch:2,position:{x:64,y:64},label:'A'}],links:[]};
 const after=structuredClone(before);after.nodes[0].dom_epoch=3;
 if(fault==='position')after.nodes[0].position.x++;
 if(fault==='label')after.nodes[0].label='B';
 if(fault==='links')after.links.push({source:'a',target:'b'});
 if(fault==='foreign_document')after.document_id='other';
 if(fault==='root_epoch')after.dom_epoch++;
 let reads=0,moves=0;const source={count:async()=>fault==='missing_source'?0:1,evaluate:async()=>({x:100,y:100})};
 const page={locator:()=>({locator:()=>source}),mouse:{move:async()=>{moves++;}},evaluate:async()=>{}};
 const read=async()=>reads++<2?(fault==='prior_change'?after:before):after;
 const task={request:{workflow_ref:{prefix:'wf'}},effect:{before},source_tid:'port'};
 if(fault==='none'){const result=await prepareLinkHover(page,task,read,samePlacementGraph);assert.equal(result.nodes[0].dom_epoch,3);assert.equal(moves,1);}
 else {await assert.rejects(prepareLinkHover(page,task,read,samePlacementGraph));assert.equal(moves,['prior_change','missing_source'].includes(fault)?0:1);}
});
for(const permanent of [false,true])test('link hover waits boundedly for covered source: '+permanent,async()=>{
 const graph={document_id:'doc',dom_epoch:1,nodes:[],links:[]};let probes=0,moves=0,waits=0;
 const source={count:async()=>1,evaluate:async()=>{probes++;return permanent||probes<3?null:{x:10,y:10};}};
 const page={locator:()=>({locator:()=>source}),mouse:{move:async()=>{moves++;}},evaluate:async()=>{},waitForTimeout:async ms=>{assert.equal(ms,50);waits++;}};
 const task={request:{workflow_ref:{prefix:'wf'}},effect:{before:graph},source_tid:'port'};
 if(permanent){await assert.rejects(prepareLinkHover(page,task,async()=>graph,samePlacementGraph),/covered/);assert.equal(moves,0);assert.equal(probes,10);assert.equal(waits,10);}
 else{await prepareLinkHover(page,task,async()=>graph,samePlacementGraph);assert.equal(probes,3);assert.equal(waits,2);assert.equal(moves,1);}
});
for(const mode of ['transient','persistent','foreign'])test('link hover graph wait: '+mode,async()=>{
 const graph={document_id:'doc',dom_epoch:1,nodes:[],links:[]};let reads=0,waits=0,moves=0;
 const source={count:async()=>1,evaluate:async()=>({x:10,y:10})};
 const page={locator:()=>({locator:()=>source}),mouse:{move:async()=>{moves++;}},evaluate:async()=>{},waitForFunction:async(fn,arg,o)=>{assert.ok(o.timeout>0&&o.timeout<=15000);waits++;}};
 const task={deadline:Date.now()+10000,request:{workflow_ref:{prefix:'wf'}},effect:{before:graph},source_tid:'port'};
 const read=async()=>{reads++;if(mode==='foreign')throw Error('Prepared workflow changed');if(mode==='persistent'||reads===1)throw Error('Graph is blocked');return graph;};
 if(mode==='transient'){await prepareLinkHover(page,task,read,samePlacementGraph);assert.equal(moves,1);assert.equal(waits,1);}
 else{await assert.rejects(prepareLinkHover(page,task,read,samePlacementGraph));assert.equal(moves,0);assert.equal(waits,mode==='persistent'?2:0);}
});

for(const fault of ['epoch','label','many'])test('link hover strict refusal carries bounded evidence: '+fault,async()=>{
 const before={nodes:[{dom_epoch:1,label:'A'}]},after=structuredClone(before);
 if(fault==='epoch')after.nodes[0].dom_epoch=2;
 if(fault==='label')after.nodes[0].label='X'.repeat(1000);
 if(fault==='many')for(let i=0;i<100;i++)after['field'+i]=i;
 let effects=0;
 const page={locator:()=>{effects++;throw Error('Must not resolve gesture');},mouse:{move:async()=>{effects++;}}};
 await assert.rejects(prepareLinkHover(page,{effect:{before}},async()=>after,samePlacementGraph),error=>{
  const evidence=JSON.parse(error.message.slice('Graph changed before link hover: '.length));
  assert.ok(evidence.differences.length<=32);
  if(fault==='epoch')assert.deepEqual(evidence.differences,[{path:'$.nodes.0.dom_epoch',expected:1,observed:2}]);
  if(fault==='label')assert.equal(evidence.differences[0].observed.length,128);
  if(fault==='many')assert.equal(evidence.truncated,true);
  return true;
 });
 assert.equal(effects,0);
});
