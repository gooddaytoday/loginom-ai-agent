import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {settleJavascriptCloseBoundary} from './javascript-close-boundary.mjs';
import {captureJavascriptNativeTopology} from './javascript-link-topology.mjs';
const node={document_id:'doc',workflow_id:'workflow',node_id:'js'};
const make=()=>({complete:true,interaction_ready:true,document_id:'doc',workflow_ref:{workflow_id:'workflow'},dom_epoch:1,
  nodes:[{ref:{...node},type:'javascript',label:'JS',position:{x:280,y:80},inputs:[0],outputs:[0],locked:false,dom_epoch:2},
    {ref:{...node,node_id:'input'},type:'imports.text',label:'Input',position:{x:96,y:80},inputs:[],outputs:[0],locked:false,dom_epoch:2}],
  links:[{source:'input',output:0,target:'js',input:0}],foreign_links:[]});
for(const fault of ['ready','unlock','stuck','foreign-lock','position','link','global-epoch','owner','journal','late-observation','late-journal','baseline-locked','wrong-node'])
  test('owned Close boundary '+fault,async()=>{
    const before=make(),events=[];let samples=0;
    if(fault==='baseline-locked')before.nodes[0].locked=true;
    const args={before,node:fault==='wrong-node'?{...node,workflow_id:'foreign'}:node,
      deadline:Date.now()+(fault==='stuck'?180:2000),
      observe:async()=>{
        samples++;if(fault==='owner')throw Error('Native owner replaced');
        const after=make();after.nodes[0].dom_epoch=3;
        if(fault==='unlock'&&samples===1||fault==='stuck')after.nodes[0].locked=true;
        if(fault==='foreign-lock')after.nodes[1].locked=true;
        if(fault==='position')after.nodes[0].position.x++;
        if(fault==='link')after.links=[];
        if(fault==='global-epoch')after.dom_epoch++;
        if(fault==='late-observation')await new Promise(resolve=>setTimeout(resolve,50));
        return after;
      },record:async event=>{
        events.push(structuredClone(event));
        if(fault==='journal')throw Error('Journal failed');
        if(fault==='late-journal')await new Promise(resolve=>setTimeout(resolve,50));
      }};
    if(fault.startsWith('late-'))args.deadline=Date.now()+20;
    if(['ready','unlock'].includes(fault)){
      await settleJavascriptCloseBoundary(args);
      assert.equal(samples,fault==='ready'?1:2);assert.equal(events.at(-1).phase,'javascript_close_boundary_settled');
      assert.deepEqual(before,make());
    }else{
      await assert.rejects(settleJavascriptCloseBoundary(args));
      assert.equal(events.some(e=>e.phase==='javascript_close_boundary_settled'),false);
      if(['baseline-locked','wrong-node'].includes(fault))assert.equal(samples,0);
      if(['position','link','foreign-lock','global-epoch','owner'].includes(fault))assert.equal(samples,1);
    }
  });
test('runtime Close settlement checks retained native identity on every observation',async()=>{
  const source=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
  const start=source.indexOf('    async settleClosedExecutionBoundary('),end=source.indexOf('    async captureExecutionBoundary()',start);
  assert.ok(start>0&&end>start);
  const calls=[],held={},before=make();let reads=0;
  const method=vm.runInNewContext('({'+source.slice(start,end)+'}).settleClosedExecutionBoundary',{
    settleJavascriptCloseBoundary,captureJavascriptNativeTopology,Math,deadline:Date.now()+2000,record:async()=>{},
    accountGuard:async()=>calls.push('account'),
    page:{evaluate:async(fn,args)=>{assert.equal(fn,captureJavascriptNativeTopology);assert.equal(args.previous,held);assert.equal(args.checkOnly,true);calls.push('native');}},
    graph:async()=>{calls.push('graph');const after=make();after.nodes[0].locked=reads++===0;return after;}
  });
  await method({before,native:held},node,Date.now()+2000);
  assert.deepEqual(calls,['account','native','graph','account','native','graph']);
});

for(const fault of ['unlocked','locked','foreign','position','native'])test('Done waits before admitting a new graph baseline: '+fault,async()=>{
  const source=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
  const start=source.indexOf('    async settleAppliedNode('),end=source.indexOf('    async settleClosedExecutionBoundary(',start);
  assert.ok(start>0&&end>start);
  const before=make(),events=[],held={dispose:async()=>events.push('disposed')};let reads=0;
  if(fault!=='unlocked')before.nodes[0].locked=true;
  const method=vm.runInNewContext('({'+source.slice(start,end)+'}).settleAppliedNode',{
    Math,structuredClone,deadline:Date.now()+2000,settleJavascriptCloseBoundary,captureJavascriptNativeTopology,
    requireJavascriptTopology:()=>{},accountGuard:async()=>{},record:async e=>events.push(e.phase),
    graph:async()=>{
      if(reads++===0)return before;
      const after=make();if(fault==='locked'&&reads===2)after.nodes[0].locked=true;
      if(fault==='position')after.nodes[0].position.x++;
      return after;
    },
    page:{evaluateHandle:async()=>held,evaluate:async(fn,args)=>{
      assert.equal(fn,captureJavascriptNativeTopology);assert.equal(args.previous,held);assert.equal(args.checkOnly,true);
      if(fault==='native')throw Error('Native changed');
    }},
  });
  if(['unlocked','locked'].includes(fault)){
    await method(node,Date.now()+2000);assert.equal(events.includes('javascript_done_unlock_verified'),true);
    assert.equal(before.nodes[0].locked,fault==='locked');assert.equal(events.at(-1),'disposed');
  }else{
    await assert.rejects(method(fault==='foreign'?{...node,workflow_id:'other'}:node,Date.now()+2000));
    assert.equal(events.includes('javascript_done_unlock_verified'),false);
    if(fault!=='foreign')assert.equal(events.at(-1),'disposed');
  }
});
