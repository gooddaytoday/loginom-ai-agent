import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionRuntime} from '../lib/executor.mjs';

const workflow_ref={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',prefix:'MF;TF',
  navigation_path:[{tid:'scenario',label:'Scenario'}]};
const request={document_id:'doc',workflow_ref};
const ref=node_id=>({document_id:'doc',workflow_id:'wf',node_id});
const graph=()=>({complete:true,interaction_ready:true,document_id:'doc',workflow_ref:structuredClone(workflow_ref),
  nodes:[
    {ref:ref('source'),type:'imports.text',label:'Sales_CSV',inputs:[],outputs:[0]},
    {ref:ref('group'),type:'transform.group_data',label:'Groups_SwarmInfrastructure',inputs:[0],outputs:[0]}],
  links:[{source:'source',output:0,target:'group',input:0}],foreign_links:[]});
const runtime=observe=>createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},
  allowCandidate:true,nodeApplyDriverFactory:()=>{throw Error('No node operation allowed');},
  execute:async()=>{throw Error('No direct browser operation allowed');},
  nodeTargetAdapterFactory:()=>({observe})});

test('compact graph inventory exposes only complete verified node and edge identities',async()=>{
  let reads=0;
  const r=runtime(async()=>{reads++;return graph();});
  assert(r.tools.some(tool=>tool.name==='dock_graph_inventory'&&tool.annotations.readOnlyHint===true));
  const value=await r.graphInventory(request);
  assert.equal(reads,1);
  assert.deepEqual(value.nodes.map(node=>[node.id,node.type,node.label]),[
    ['source','imports.text','Sales_CSV'],['group','transform.group_data','Groups_SwarmInfrastructure']]);
  assert.deepEqual(value.links,[{source:'source',output:0,target:'group',input:0}]);
  assert.equal(value.complete,true);
  assert.equal(JSON.stringify(value).includes('dom_epoch'),false);
});

test('graph reader uses the typed browser transport envelope',async()=>{
  let calls=0;
  const r=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},allowCandidate:true,
    nodeApplyDriverFactory:()=>{},execute:async code=>{
      calls++;assert.match(code,/graph\.inventory\.transport/);
      return {status:'SUCCEEDED',output:{value:graph()}};
    },nodeTargetAdapterFactory:({execute})=>({observe:()=>execute('async page => true',{timeout:1000})})});
  assert.equal((await r.graphInventory(request)).nodes.length,2);
  assert.equal(calls,1);
});

for(const [name,change] of Object.entries({
  incomplete:g=>{g.complete=false;},
  dragging:g=>{g.interaction_ready=false;},
  changed_document:g=>{g.document_id='foreign';},
  changed_workflow:g=>{g.workflow_ref.workflow_id='foreign';},
  unknown_type:g=>{g.nodes[1].type='other';},
  duplicate_id:g=>{g.nodes[1].ref.node_id='source';},
  foreign_link:g=>{g.foreign_links=['foreign'];},
  missing_endpoint:g=>{g.links[0].target='foreign';},
  wrong_port:g=>{g.links[0].input=1;},
  duplicate_edge:g=>{g.links.push(structuredClone(g.links[0]));},
}))test('graph inventory refuses '+name,async()=>{
  const g=graph();change(g);
  await assert.rejects(runtime(async()=>g).graphInventory(request),/[Gg]raph/);
});

test('graph inventory is unavailable without the candidate node runtime',async()=>{
  const r=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},execute:async()=>{throw Error('No browser');}});
  assert.equal(r.tools.some(tool=>tool.name==='dock_graph_inventory'),false);
  await assert.rejects(r.graphInventory(request),/candidate runtime/);
});
