import test from 'node:test';
import assert from 'node:assert/strict';
import {proveReloadedNode} from '../lib/node-target.mjs';

const workflow = doc => ({workflow_id: doc+'-wf', prefix:'MF;TF', navigation_path:[{tid:'MF;TF;scenario',label:'Scenario'}]});
const graph = (doc, ids) => ({complete:true,interaction_ready:true,document_id:doc,workflow_ref:workflow(doc),dom_epoch:1,
  nodes:ids.map(node_id=>({ref:{document_id:doc,workflow_id:workflow(doc).workflow_id,node_id},dom_epoch:1,
    type:node_id==='filter'?'transform.filter_data':'imports.text',locked:false,inputs:[],outputs:[0]})),
  links:[],foreign_links:[]});
const baseline = graph('old',['source']), final_graph = graph('old',['source','filter']);
const node = final_graph.nodes[1].ref;
const operation = {nodeApply:{node,pending:{phase:'configure'},request:{target:{kind:'new',type:'transform.filter_data'}}},
  targetPhase:{completed:true,baseline,final_graph,targetId:node.node_id}};

test('new document accepts only the quiet retained graph or the complete pre-create graph',()=>{
  for(const retained of [true,false]){
    const fresh=graph('new',retained?['source','filter']:['source']);
    assert.deepEqual(proveReloadedNode(operation,fresh,structuredClone(fresh)),{
      node:retained?fresh.nodes[1].ref:null, target_state:retained?'retained':'absent',
    });
  }
});

test('reload proof refuses wrong workflow, a foreign edit, an unstable or locked graph and an existing target missing',()=>{
  for(const edit of [
    g=>{g.workflow_ref.navigation_path[0].label='Different';},
    g=>{g.nodes.push({...g.nodes[0],ref:{...g.nodes[0].ref,node_id:'foreign'}});},
    g=>{g.nodes[0].locked=true;},
    g=>{g.foreign_links.push('unexpected');},
    g=>{g.interaction_ready=false;},
  ]){
    const fresh=graph('new',['source','filter']);edit(fresh);
    assert.equal(proveReloadedNode(operation,fresh,fresh),null);
  }
  assert.equal(proveReloadedNode(operation,graph('new',['source']),graph('new',['source','filter'])),null);
  assert.equal(proveReloadedNode(operation,final_graph,final_graph),null);
  const existing=structuredClone(operation);
  existing.nodeApply.request.target.kind='existing';
  const missing=graph('new',['source']);
  assert.equal(proveReloadedNode(existing,missing,missing),null);
});

test('the native read-only package suffix does not change graph identity',()=>{
  const old=structuredClone(operation);
  const path=[
    {tid:'MF;TF;server',label:'Server'},{tid:'MF;TF;packages',label:'Packages'},
    {tid:'MF;TF;package',label:'Original'},{tid:'MF;TF;scenario',label:'Scenario'},
  ];
  old.targetPhase.final_graph.workflow_ref.navigation_path=path;
  old.targetPhase.baseline.workflow_ref.navigation_path=path;
  const fresh=graph('new',['source']);
  fresh.workflow_ref.navigation_path=structuredClone(path);
  fresh.workflow_ref.navigation_path[2].label+=' (только чтение)';
  assert.equal(proveReloadedNode(old,fresh,fresh),null);
  assert.deepEqual(proveReloadedNode(old,fresh,fresh,{readOnly:true}),{node:null,target_state:'absent'});
});
