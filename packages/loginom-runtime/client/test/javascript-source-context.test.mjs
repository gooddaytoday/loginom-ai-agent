import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {TextEncoder} from 'node:util';
import {makeJavascriptSourceContextCode,readJavascriptSourceBrowser,readJavascriptSourceContext} from '../lib/javascript-source-context.mjs';

const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
  navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]},
  node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
const owner={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node',surface:'wizard',tid:'MF;TF-1;WizrdMCF'};

function fixture(source='// ё\nlet x = 1;') {
  class WizardTreeNode{};class ModelNodeTreeNode{};
  const packageNode={},workflow={ParentNode:{ParentNode:packageNode}},data={},node=Object.assign(new ModelNodeTreeNode(),{ParentNode:workflow,FGuid:'node',FModelNode:data});
  const wizard=Object.assign(new WizardTreeNode(),{ParentNode:node});
  const input={isConnected:true,disabled:false,readOnly:false};
  const wrapper={isConnected:true,CodeMirror:null,getBoundingClientRect:()=>({width:100,height:50}),contains:value=>value===input};
  const lines=source.split('\n'),doc={lineCount:()=>lines.length,firstLine:()=>0,lastLine:()=>lines.length-1,getLine:index=>lines[index]};
  wrapper.CodeMirror={getDoc:()=>doc,getInputField:()=>input,getWrapperElement:()=>wrapper,getOption:()=>false};
  const page={isConnected:true,contains:value=>value===wrapper,getBoundingClientRect:()=>({width:100,height:50})};
  const root={isConnected:true,contains:value=>value===page||value===wrapper||value===input,
    getBoundingClientRect:()=>({width:300,height:200}),querySelectorAll:()=>[wrapper]};
  const model={FModelNode:data,FView:{el:{dom:root}}},card={Controller:{Node:{data:{node:wizard}},FController:model}};
  const tab={classList:{contains:value=>value==='x-tab-active'}};
  const receipt={phase:'verified',workflowId:'flow',nodeTargetWorkflowNode:workflow,tab,packageNode};
  const preparation={document:null,id:'doc',receipts:new Map([['prepare',receipt]])};
  const document={querySelectorAll:selector=>selector.includes(binding.workflow_ref.tab_tid)?[tab]
    :selector.includes('JavaScriptCodeWizard')?[page]:selector.includes('WizrdMCF')?[root]:[]};
  preparation.document=document;
  const form={FMapTree:{FServerConnection:{UserName:'jsteach'}},Items:{Workspace:{getActiveTab:()=>card}}};
  const app={Version:'7.4.2',WizardTreeNode,ModelNodeTreeNode,Application:{FInstance:{FMainForm:form}}};
  const context={document,bg:{app},__loginomDockPreparationV1:preparation,getComputedStyle:()=>({visibility:'visible'}),TextEncoder,binding};
  const read=()=>vm.runInNewContext('('+readJavascriptSourceBrowser.toString()+')({prepared:binding,account:"jsteach"})',context);
  return {read,node,receipt,form,doc,lines,root,wrapper,page,input,context};
}

test('prepared JavaScript source reader returns the full owned Unicode CodeMirror document',()=>{
  const source='import {InputTable} from "builtIn/Data";\n// ё 😀';
  const result=fixture(source).read();
  assert.equal(result.verified,true);
  assert.equal(result.source,source);
  assert.equal(result.source_utf8_bytes,Buffer.byteLength(source));
  assert.equal(result.source_lf_lines,2);
  assert.equal(fixture('').read().source,'');
});

test('prepared JavaScript source reader refuses foreign owner, blocked page and invalid document',()=>{
  for(const change of [f=>f.node.FGuid='other',f=>f.receipt.nodeTargetWorkflowNode={},
    f=>f.form.FMapTree.FServerConnection.UserName='other',f=>f.wrapper.CodeMirror.getOption=()=>true,
    f=>f.lines[0]='bad\rline',f=>f.lines[0]='x'.repeat(32769),f=>f.page.contains=()=>false]){
    const f=fixture();change(f);assert.equal(f.read().verified,false);
  }
});

test('source context refuses port surfaces and owner change across full read',async()=>{
  let evaluations=0;
  const page={evaluate:()=>{evaluations++;return {verified:true,source:'x'};}};
  for(const changed of [{...owner,input_port:{}},{...owner,output_port:{}},{...owner,surface:'graph'}])
    assert.equal((await readJavascriptSourceContext(page,binding,'jsteach',async()=>changed)).reason,'javascript_source_surface');
  assert.equal(evaluations,0);
  let reads=0;
  assert.equal((await readJavascriptSourceContext(page,binding,'jsteach',async()=>({...owner,node_id:++reads===1?'node':'other'}))).reason,'javascript_source_owner_changed');
  assert.equal(evaluations,1);
});

test('serialized source context validates input and preserves both prepared-owner reads',async()=>{
  assert.throws(()=>makeJavascriptSourceContextCode({},'jsteach'));
  assert.throws(()=>makeJavascriptSourceContextCode(binding,''));
  const calls=[],page={evaluate:async(fn,arg)=>{
    calls.push({fn:fn.toString(),arg});
    return arg?.prepared?{verified:true,source:'// owned',source_utf8_bytes:8,source_lf_lines:1}:{...owner};
  }};
  const result=await vm.runInNewContext('('+makeJavascriptSourceContextCode(binding,'jsteach')+')',{})(page);
  assert.equal(result.source,'// owned');
  assert.equal(calls.length,3);
  assert.equal(calls[1].arg.account,'jsteach');
  assert.equal(calls[0].fn,calls[2].fn);
});
