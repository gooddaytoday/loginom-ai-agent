import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {bindAddOnlyDrop, readAddOnlyDrop, settleAddOnlyDrop} from '../lib/node-add-only-window.mjs';

function fixture({window='wizard',sticky=false,modelData=true}={}){
  const prefix='MF;TF-1',workflow={},nodeData={},components=new Map(),elements=[];
  const app={ModelForm:class ModelForm{},ModelNodeTreeNode:class ModelNodeTreeNode{},
    WizardTreeNode:class WizardTreeNode{},Version:'7.4.2'};
  const nativeNodes=[],model=new app.ModelForm();
  const workflowRef={workflow_id:'wf',prefix,tab_tid:'tab'};
  const node={FGuid:'new',...(modelData?{data:nodeData}:{}),FIconCls:'icon'};
  const element=(tid,parent,role)=>{
    const e={id:tid,isConnected:true,role,children:[],classList:{contains:()=>true},
      contains(other){return this===other||this.children.includes(other);},
      getBoundingClientRect:()=>({width:10,height:10,x:0,y:0}),closest:()=>null,
      getAttribute:()=>tid,querySelectorAll:()=>e.children};
    if(parent)parent.children.push(e);
    elements.push(e);
    return e;
  };
  const canvas=element('canvas'),tab=element('tab');
  const receipt={phase:'verified',workflowId:'wf',nodeTargetWorkflowNode:workflow,tab};
  model.FDiagram={FNodes:{FCollection:nativeNodes},FmxGraph:{container:canvas}};
  const controller={FController:model,Node:{data:{node:workflow}}},card={Controller:controller};
  app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}};
  const wizardRoot=element(prefix+';WizrdMCF',null,'dialog');
  const close=element(prefix+';WizrdMCF;btnClose',wizardRoot);
  wizardRoot.isConnected=close.isConnected=false;
  const nodeTree=Object.assign(new app.ModelNodeTreeNode(),{FGuid:'new',FModelNode:nodeData,ParentNode:workflow});
  const wizardTree=Object.assign(new app.WizardTreeNode(),{ParentNode:nodeTree});
  const wizard=Object.assign(new (class WizardModelComponentForm{})(),{FModelNode:nodeData,FView:{el:{dom:wizardRoot}}});
  const dialog=element('owned-dialog',null,'dialog'),cancel=element('owned-dialog;btnCancel',dialog);
  dialog.isConnected=cancel.isConnected=false;
  components.set(dialog.id,{el:{dom:dialog},ownerCt:window==='foreign'?{}:{FModelNode:nodeData}});
  for(const button of [close,cancel])components.set(button.id,{el:{dom:button}});
  const document={
    querySelectorAll(selector){
      if(selector.startsWith('[data-tid='))return elements.filter(e=>e.id===JSON.parse(selector.slice(10,-1)));
      return elements.filter(e=>e.role==='dialog');
    },
    elementFromPoint:()=>cancel.isConnected?cancel:close,
  };
  const preparation={document,id:'doc',receipts:new Map([['prepare',receipt]]),
    nodeTargetDomEpochs:{objects:new WeakMap([[canvas,1]])}};
  const context=vm.createContext({__loginomDockPreparationV1:preparation,bg:{app},Ext:{getCmp:id=>components.get(id)},document,
    location:{origin:'https://example.invalid'},getComputedStyle:()=>({visibility:'visible'})});
  const local=fn=>vm.runInContext('('+fn.toString()+')',context);
  const binding=local(bindAddOnlyDrop)({
    request:{document_id:'doc',workflow_ref:workflowRef},origin:'https://example.invalid',build:'7.4.2',
    effect:{before:{dom_epoch:1,nodes:[]},parameters:{type:'node'}},types:{node:{icon_class:'icon'}},
  });
  nativeNodes.push(node);
  if(window==='wizard'){
    wizardRoot.isConnected=close.isConnected=true;
    controller.FController=wizard;
    controller.Node.data.node=wizardTree;
  }else if(window){
    dialog.isConnected=cancel.isConnected=true;
  }
  let time=0;
  const clicks=[],settledGraph={interaction_ready:true,nodes:[{ref:{node_id:'new'}}]};
  const wrap=value=>({
    getProperty:async key=>wrap(value[key]),jsonValue:async()=>value,dispose:async()=>{},
    asElement:()=>value===close||value===cancel?{value,click:async()=>{
      clicks.push(value.id);
      if(sticky)return;
      value.isConnected=false;
      if(value===close){
        wizardRoot.isConnected=false;
        controller.FController=model;
        controller.Node.data.node=workflow;
      }else dialog.isConnected=false;
    }}:null,
  });
  const page={
    evaluateHandle:async(fn,args)=>wrap(local(fn)({...args,expectedControl:args.expectedControl?.value})),
    waitForTimeout:async ms=>{time+=ms;},
  };
  const run=()=>settleAddOnlyDrop(page,binding,{readSurface:readAddOnlyDrop,readQuietGraph:async()=>settledGraph,
    now:()=>time,remaining:()=>{
      if(time>=800)throw Error('Graph deadline');
      return 800-time;
    }});
  return {run,clicks,settledGraph};
}

for(const [window,suffix] of [['wizard','btnClose'],['dialog','btnCancel'],[null,null]])test('add_only settles '+(window??'a quiet graph'),async()=>{
  const f=fixture({window});
  assert.deepEqual(await f.run(),f.settledGraph);
  assert.deepEqual(f.clicks.map(id=>id.split(';').at(-1)),suffix?[suffix]:[]);
});

test('add_only leaves a foreign window untouched',async()=>{
  const f=fixture({window:'foreign'});
  await assert.rejects(f.run(),/Graph deadline/);
  assert.deepEqual(f.clicks,[]);
});

test('add_only never repeats Close while native settlement is unconfirmed',async()=>{
  const f=fixture({sticky:true});
  await assert.rejects(f.run(),/Graph deadline/);
  assert.equal(f.clicks.length,1);
});

test('add_only observes a quiet node before Loginom has loaded its settings object',async()=>{
  const f=fixture({window:null,modelData:false});
  assert.deepEqual(await f.run(),f.settledGraph);
  assert.deepEqual(f.clicks,[]);
});
