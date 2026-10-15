import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readJavascriptSchema} from '../lib/javascript-schema-browser.mjs';
import {makeJavascriptSchemaContextCode,readJavascriptSchemaContext} from '../lib/javascript-schema-context.mjs';

const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
  navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]},
  node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
const owner={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node',surface:'wizard',tid:'MF;TF-1;WizrdMCF'};

test('JavaScript schema context brackets the native read with one unchanged prepared node',async()=>{
  const calls=[],page={evaluate:async(_fn,arg)=>{calls.push(arg);return {verified:true,form:'JavaScriptColumnsWizard'};}};
  const readNode=async()=>({...owner});
  const result=await readJavascriptSchemaContext(page,binding,readNode);
  assert.equal(result.verified,true);
  assert.equal(result.node_context.node_id,'node');
  assert.deepEqual(calls,[{prepared:binding}]);
});

test('JavaScript schema context refuses a port, an unverified surface and changed ownership',async()=>{
  let reads=0;
  const page={evaluate:()=>{reads++;return {verified:true};}};
  for(const changed of [{...owner,input_port:{}},{...owner,output_port:{}},{...owner,surface:'graph'},{...owner,verified:false}]){
    assert.equal((await readJavascriptSchemaContext(page,binding,async()=>changed)).reason,'javascript_node_surface');
  }
  assert.equal(reads,0);
  let count=0;
  const result=await readJavascriptSchemaContext(page,binding,async()=>({...owner,node_id:++count===1?'node':'other'}));
  assert.equal(result.reason,'javascript_node_changed');
  assert.equal(result.verified,false);
  assert.equal(reads,1);
});

test('serialized JavaScript schema context validates binding and executes both reader boundaries',async()=>{
  assert.throws(()=>makeJavascriptSchemaContextCode({}),/prepared node context/);
  const code=makeJavascriptSchemaContextCode(binding),events=[];
  const page={evaluate:async(fn,arg)=>{
    events.push({fn:fn.toString(),arg});
    return arg?.prepared?{verified:true,form:'JavaScriptColumnsWizard'}:{...owner};
  }};
  const result=await vm.runInNewContext('('+code+')',{})(page);
  assert.equal(result.verified,true);
  assert.equal(events.length,3);
  assert.equal(events[1].arg.prepared.node.node_id,'node');
  assert.equal(events[0].fn,events[2].fn);
});

test('prepared browser reader binds the exact native wizard before touching schema caches',()=>{
  class WizardTreeNode{};
  class ModelNodeTreeNode{};
  const workflow={},data={},node=Object.assign(new ModelNodeTreeNode(),{ParentNode:workflow,FGuid:'node',FModelNode:data});
  const wizard=Object.assign(new WizardTreeNode(),{ParentNode:node});
  const root={isConnected:true,querySelectorAll:()=>[]};
  const model={FModelNode:data,FView:{el:{dom:root}}};
  const tab={Controller:{Node:{data:{node:wizard}},FController:model}};
  const tabElement={classList:{contains:name=>name==='x-tab-active'}};
  const document={querySelectorAll:()=>[tabElement]};
  const receipt={phase:'verified',workflowId:'flow',nodeTargetWorkflowNode:workflow,tab:tabElement};
  const preparation={document,id:'doc',receipts:new Map([['prepare',receipt]])};
  const context={document,bg:{app:{WizardTreeNode,ModelNodeTreeNode,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>tab}}}}}}},
    __loginomDockPreparationV1:preparation};
  const read=()=>vm.runInNewContext('('+readJavascriptSchema.toString()+')({prepared:binding})',{...context,binding});
  assert.equal(read().reason,'Unique JavaScript schema page required');
  node.FGuid='foreign';
  assert.equal(read().reason,'Prepared JavaScript schema owner changed');
  node.FGuid='node';
  receipt.nodeTargetWorkflowNode={};
  assert.equal(read().reason,'Prepared JavaScript schema owner changed');
});
