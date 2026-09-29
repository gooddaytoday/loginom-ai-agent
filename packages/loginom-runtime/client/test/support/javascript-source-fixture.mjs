import vm from 'node:vm';
import {observeJavascriptSource,observeJavascriptSourceProcesses} from '../../lib/javascript-source-browser.mjs';

export const javascriptSourceOwner={document_id:'document',workflow_id:'workflow',node_id:'node',operation_id:'source-read',ui_epoch:3};

export function sourceFixture(initialSource='const value="Сумма ё😀";') {
 let source=initialSource,selected='';
 const visible={isConnected:true,getBoundingClientRect:()=>({x:10,y:10,width:100,height:30})};
 const input={...visible,disabled:false},document={activeElement:{}};
 const doc={lineCount:()=>source.split('\n').length,firstLine:()=>0,lastLine:()=>source.split('\n').length-1,
  getLine:i=>source.split('\n')[i],getSelection:()=>selected};
 const cm={getDoc:()=>doc,getInputField:()=>input,getOption:()=>false};
 const wrapper={...visible,CodeMirror:cm,contains:e=>e===input||e===wrapper};
 cm.getWrapperElement=()=>wrapper;
 const codePage={...visible,contains:e=>e===wrapper};
 const root={...visible,querySelectorAll:q=>q==='.CodeMirror'?[wrapper]:[codePage],contains:e=>e===input||e===wrapper};
 const nodeData={},workflow={},cell={},node={FGuid:'node',data:nodeData,FCell:cell};
 const native={FParentNode:{FParentNode:workflow,FGuid:'node',FModelNode:nodeData}},model={FModelNode:nodeData,FView:{el:{dom:root}}};
 const tab={Controller:{Node:{data:{node:native}},FController:model}},binding={document,workflow,tab,nodeData,native:node,cell,wizardAddress:{epoch:1,wizard:native,node}};
 const processRecord={internalId:'child',data:{id:'1.1',Status:3,ErrorDetails:'',ModelNode:nodeData},childNodes:[]};
 const processRoot={internalId:'root',data:{loaded:true},childNodes:[processRecord]},tree={id:'tree'},store={getRoot:()=>processRoot,isLoading:()=>false};
 document.querySelectorAll=q=>q.includes('trpProgress')?[tree]:q.includes('WizrdMCF')?[root]:[];
 document.elementFromPoint=()=>input;
 const environment={document,TextEncoder,innerWidth:1280,innerHeight:800,getComputedStyle:()=>({visibility:'visible'}),
  __loginomDockPreparationV1:{document,id:'document',receipts:new Map([['receipt',{phase:'verified',workflowId:'workflow',nodeTargetWorkflowNode:workflow}]])},
  bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>tab}},FMapTree:{FServerConnection:{UserName:'owner'}}}}}}},Ext:{getCmp:()=>({getStore:()=>store})}};
 const realm=vm.createContext(environment),observe=vm.runInContext('('+observeJavascriptSource.toString()+')',realm),processes=vm.runInContext('('+observeJavascriptSourceProcesses.toString()+')',realm);
 const context={root,native,binding,prefix:'workflow',account:'owner',build:'7.4.2'};
 return {environment,document,context,codePage,doc,cm,input,wrapper,tab,model,binding,node,processRoot,processRecord,store,observe,processes,
  setSource:value=>{source=value;},setSelection:value=>{selected=value;},getSource:()=>source,
  capture:()=>observe({context,owner:javascriptSourceOwner,epoch:1,capture:true}),
  read:held=>observe({context,owner:javascriptSourceOwner,epoch:1,held})};
}
