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
