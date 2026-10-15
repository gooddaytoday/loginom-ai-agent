import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {requireJavascriptGraphUnchanged,captureJavascriptNativeTopology} from './javascript-link-topology.mjs';

const source=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
const start=source.indexOf('    async verifyExecutionBoundary(boundary) {'),end=source.indexOf('    async executeNode(',start);
assert.ok(start>0&&end>start);
const make=()=>({complete:true,interaction_ready:true,document_id:'doc',workflow_ref:{workflow_id:'workflow'},dom_epoch:1,
  nodes:[{ref:{document_id:'doc',workflow_id:'workflow',node_id:'js'},type:'javascript',label:'JS',position:{x:280,y:80},inputs:[0],outputs:[0],other_ports:[],locked:false,dom_epoch:2}],links:[],foreign_links:[]});
for(const fault of ['ok','node-epoch','position','label','locked','graph-epoch','foreign-link','native','journal','journal-mutates'])
  test('actual boundary preserves evidence and strict refusal: '+fault,async()=>{
    const before=make(),after=make(),events=[],calls=[];
    if(['position','journal-mutates'].includes(fault))after.nodes[0].position.x=281;
    if(fault==='label')after.nodes[0].label='other';if(fault==='locked')after.nodes[0].locked=true;
    if(fault==='node-epoch')after.nodes[0].dom_epoch=3;if(fault==='graph-epoch')after.dom_epoch=3;
    if(fault==='foreign-link')after.foreign_links.push('unknown');
    const method=vm.runInNewContext('({'+source.slice(start,end)+'}).verifyExecutionBoundary',{
      structuredClone,requireJavascriptGraphUnchanged,captureJavascriptNativeTopology,
      accountGuard:async()=>calls.push('account'),graph:async()=>{calls.push('graph');return after;},
      page:{evaluate:async(fn,args)=>{assert.equal(fn,captureJavascriptNativeTopology);assert.equal(args.checkOnly,true);calls.push('native');if(fault==='native')throw Error('Owner replaced');}},
      record:async event=>{events.push(structuredClone(event));if(fault==='journal')throw Error('Cannot record');
        if(fault==='journal-mutates')event.after.nodes[0].position.x=280;return event;},
    });
    if(['ok','node-epoch'].includes(fault)){await method({before,native:{}});assert.equal(events.at(-1).phase,'execution_boundary_verified');}
    if(!['ok','node-epoch'].includes(fault)){
      await assert.rejects(method({before,native:{}}));assert.equal(events.some(e=>e.phase==='execution_boundary_verified'),false);
    }
    if(fault==='native'){assert.equal(events.length,0);assert.deepEqual(calls,['account','native']);}
    if(fault!=='native'){
      assert.deepEqual(calls,['account','native','graph']);assert.equal(events[0].phase,'execution_boundary_observed');
      assert.deepEqual(events[0].before,before);assert.deepEqual(events[0].after,after);
    }
  });

// Execute the actual mapping method; only its UI transport/Close procedure is
// synthetic. Evidence must survive a strict graph refusal, without another read.
const mappingStart=source.indexOf('    async readPortMapping('),mappingEnd=source.indexOf('    async prepareInput()',mappingStart);
assert.ok(mappingStart>0&&mappingEnd>mappingStart);
for(const fault of ['ok','lock','position','native','journal','journal-mutates'])
  test('actual mapping cleanup graph evidence: '+fault,async()=>{
    const before=make(),after=make(),events=[],calls=[];let reads=0;
    if(fault==='lock')before.nodes[0].locked=true;
    if(['position','journal-mutates'].includes(fault))after.nodes[0].position.x++;
    const method=vm.runInNewContext('({'+source.slice(mappingStart,mappingEnd)+'}).readPortMapping',{
      Date,Math,Error,AggregateError,structuredClone,deadline:Date.now()+10000,
      prepared:{document_id:'doc',workflow_ref:{workflow_id:'workflow'}},
      requireJavascriptTopology:graph=>requireJavascriptGraphUnchanged(graph,graph),requireJavascriptGraphUnchanged,captureJavascriptNativeTopology,
      graph:async()=>{reads++;return reads===1?before:after;},
      channel:()=>({openPort:async()=>calls.push('open'),observe:async()=>({node_mapping:{verified:true}})}),
      page:{evaluateHandle:async()=>({dispose:async()=>calls.push('dispose')}),evaluate:async(fn,args)=>{
        assert.equal(fn,captureJavascriptNativeTopology);assert.equal(args.checkOnly,true);if(fault==='native')throw Error('Owner changed');return true;
      }},
      closeJavascriptPortMapping:async({verifyGraph})=>{calls.push('close');await verifyGraph();},
      record:async event=>{events.push(structuredClone(event));if(event.phase==='port_mapping_original_graph_observed'){
        if(fault==='journal')throw Error('Journal failed');if(fault==='journal-mutates')event.after.nodes[0].position.x=280;
      }},
    });
    if(fault==='ok')await method({node_id:'js'},'input');
    if(fault!=='ok')await assert.rejects(method({node_id:'js'},'input'));
    assert.deepEqual(calls,['open','close','dispose']);assert.equal(reads,fault==='native'?1:2);
    assert.equal(events.some(e=>e.phase==='port_mapping_original_graph_verified'),fault==='ok');
    if(fault!=='native'){
      const diagnostic=events.find(e=>e.phase==='port_mapping_original_graph_observed');
      assert.deepEqual(diagnostic.before,before);assert.deepEqual(diagnostic.after,after);
    }
  });


for(const fault of ['opening-ambiguous','opening-transport','close'])test('actual mapping refusal retains cleanup uncertainty: '+fault,async()=>{
 const calls=[],before=make();
 const scope={Date,Math,Error,AggregateError,structuredClone,deadline:Date.now()+10000,nativeReadUncertain:false,
  prepared:{document_id:'doc',workflow_ref:{workflow_id:'workflow'}},
  requireJavascriptTopology:graph=>requireJavascriptGraphUnchanged(graph,graph),requireJavascriptGraphUnchanged,captureJavascriptNativeTopology,
  graph:async()=>before,
  channel:()=>({openPort:async()=>{calls.push('open');if(fault!=='close')throw Error(fault);},observe:async()=>({node_mapping:{verified:true}})}),
  page:{evaluateHandle:async()=>({dispose:async()=>calls.push('dispose')})},
  closeJavascriptPortMapping:async()=>{calls.push('close');throw Error('close');},record:async()=>{},
 };
 const context=vm.createContext(scope);
 const method=vm.runInContext('({'+source.slice(mappingStart,mappingEnd)+'}).readPortMapping',context);
 await assert.rejects(method({node_id:'js'},'input'),new RegExp(fault==='close'?'close':fault));
 assert.equal(scope.nativeReadUncertain,true);
 assert.deepEqual(calls,fault==='close'?['open','close','dispose']:['open','dispose']);
});
