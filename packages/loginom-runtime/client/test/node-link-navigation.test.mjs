import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';

for(const fault of ['none','node redraw','boundary layout','boundary y','ordinary position','workflow','root','port','link'])test('link navigation compares graph identity across channel serialization: '+fault,async()=>{
 const request={document_id:'doc',workflow_ref:{workflow_id:'nested',tab_tid:'tab',prefix:'wf',navigation_path:[]}};
 const before={complete:true,document_id:'doc',workflow_ref:request.workflow_ref,dom_epoch:1,nodes:['s','t'].map(id=>({ref:{document_id:'doc',workflow_id:'nested',node_id:id},label:id,type:'transform.calculator',dom_epoch:2,position:{x:80,y:80},inputs:[0],outputs:[0],locked:false})),links:[],foreign_links:[],interaction_ready:true};
 if(fault.startsWith('boundary'))Object.assign(before.nodes[1],{type:'control.supernode_output',boundary_role:'output'});
 const local=structuredClone(before);
 // A JSON channel may enumerate the same workflow fields in another order.
 local.workflow_ref={tab_tid:'tab',prefix:'wf',navigation_path:[],workflow_id:'nested'};
 if(fault==='boundary layout')local.nodes[1].position.x+=61;
 if(fault==='boundary y')local.nodes[1].position.y++;
 if(fault==='ordinary position')local.nodes[1].position.x++;
 if(fault==='node redraw')local.nodes[0].dom_epoch++;
 if(fault==='workflow')local.workflow_ref.workflow_id='foreign';
 if(fault==='root')local.dom_epoch++;
 if(fault==='port')local.nodes[0].outputs.push(1);
 if(fault==='link')local.links.push({source:'t',output:0,target:'s',input:0});
 let navigation=false,hover=false,gesture=false;
 const adapter=createNodeTargetBrowserAdapter({origin:'http://test',build:'7.4.2',pinned:{actions:new Map()},execute:async code=>{
  if(code.includes('const guard=async()=>{remaining();const graph=')){
   navigation=true;
   const page={evaluate:async fn=>fn.toString().includes("source_tid,target_tid,request")?{ready:true}:structuredClone(local)};
   return vm.runInNewContext('('+code+')')(page);
  }
  if(code.startsWith('async page=>(async function prepareLinkHover')){hover=true;return {status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};}
  if(code.includes('read_bindings":true'))return {...structuredClone(before),native_bindings:['s','t'].map(id=>({node_id:id,label:id,inputs:[0],outputs:[0]}))};
  if(code.includes('async function readGraph'))return structuredClone(before);
  gesture=true;throw Error('Unexpected gesture');
 }});
 await adapter.observe(request,Date.now()+10000);
 const run=()=>adapter.mutate({id:'connect',kind:'connect',before,parameters:{edge:{source:'s',output:0,target:'t',input:0}}},Date.now()+10000);
 if(['none','node redraw','boundary layout'].includes(fault)){assert.equal((await run()).status,'NOT_APPLIED');assert.equal(hover,true);}
 else await assert.rejects(run(),/Graph changed during link source navigation; next_step: dock_operation_inspect/);
 assert.equal(navigation,true);assert.equal(gesture,false);
});
