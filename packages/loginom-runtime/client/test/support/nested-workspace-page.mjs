import assert from 'node:assert/strict';
import vm from 'node:vm';

// LAB-1543 DOM: entering keeps TF-1 and changes breadcrumbs; service GUIDs
// repeat. Leaving can retain the selected owner's breadcrumb.
export function nestedWorkspacePage({loseReply=false,foreignOwner=false,block=false,trialFail=null,loseDispatchReply=false,entryOnSelection=false,foreignSelection=false,playwrightErrors=false}={}) {
  class PackageTreeNode {}; class WorkFlowTreeNode {}; class ModelForm {};
  const prefix='MF;TF-1',tabTid='MF;cntMain;cntWorkspace;Workspace;t.br;tb-1';
  const element=(tid,text='')=>({tid,textContent:text,isConnected:true,getAttribute:()=>tid,
    getBoundingClientRect:()=>({width:20,height:20}),classList:{contains:()=>true},querySelectorAll:s=>s==='.maptree-icon-workflow'&&text==='Scenario'?[{}]:[]});
  const tab=element(tabTid),root=element(prefix+';ModelForm;cmpDiagram');
  const pkg=new PackageTreeNode();pkg.PackageFileName='/worker/nested.lgp';
  const outer=Object.assign(new WorkFlowTreeNode(),{ParentNode:pkg});
  const owner={FGuid:'supernode',ParentNode:outer};
  const inner=Object.assign(new WorkFlowTreeNode(),{ParentNode:{ParentNode:owner}});
  let current=outer,crumbs=['Server','Packages','Package','Module','Scenario'],clicks=0,masked=false;
  const states=new Map(),nodes=[];
  const add=(id,label,icon)=>{
    const node={FGuid:id,FIconCls:icon,FCell:{geometry:{x:100,y:100}},FPorts:[],data:{}};
    node.FLabel={parent:node,FCell:{parent:node.FCell,visible:true},FRawValue:label};
    states.set(node.FCell,{shape:{node:element(prefix+';Graph;'+label)}});
    states.set(node.FLabel.FCell,{text:{node:element(prefix+';Graph;'+label+';Label;Label',label)}});
    nodes.push(node);return node;
  };
  const composite=add('supernode','Подмодель','bg-vendor-icon-modelgeneric');
  owner.FModelNode=composite.data;
  const service=add('repeated-guid','Переменные_сценария','bg-vendor-icon-user-variables');
  const innerService=add('repeated-guid','Переменные_сценария','bg-vendor-icon-user-variables');
  const calc=add('calc','Калькулятор','bg-vendor-icon-calcdata');
  const input=add('input','Входной_узел','bg-vendor-icon-nullvendor');
  const output=add('output','Выходной_узел','bg-vendor-icon-nullvendor');
  const graph={container:root,view:{getState:cell=>states.get(cell)}};
  root.contains=e=>[...states.values()].some(s=>s.shape?.node===e||s.text?.node===e);
  root.querySelectorAll=()=>[];
  const diagram={FmxGraph:graph,GenericInputNode:input,GenericOutputNode:output,get FIsSubmodel(){return current===inner;},
    FNodes:{get FCollection(){return current===outer?[composite,service]:[calc,innerService,input,output];}}};
  const model=Object.assign(new ModelForm(),{FDiagram:diagram});
  const enter=element(prefix+';Graph;Подмодель;GenericEnterLabel;Label');
  composite.FEnterLabel={parent:composite,FCell:{parent:composite.FCell}};
  let entryVisible=!entryOnSelection,selections=0;
  composite.FEnterLabel.FCell.visible=entryVisible;
  if(entryVisible)states.set(composite.FEnterLabel.FCell,{text:{node:enter}});
  const selection=element(prefix+';Graph;Подмодель;NodesControls');
  composite.FControls={parent:foreignSelection?{}:composite,FCell:{parent:composite.FCell}};
  states.set(composite.FControls.FCell,{shape:{node:selection}});
  const leave=element(prefix+';Graph;LeaveSubmodelLabel;Label');
  const crumbsNow=()=>crumbs.map((v,i)=>element(prefix+';cnrNaviMode;b.s_'+crumbs.slice(0,i+1).join('>'),v));
  const all=()=>[tab,root,selection,...(current===outer?(entryVisible?[enter]:[]):[leave]),...crumbsNow(),...model.FDiagram.FNodes.FCollection.flatMap(n=>[states.get(n.FCell).shape.node,states.get(n.FLabel.FCell).text.node])];
  const mask={...element('mask'),matches:()=>true};
  const document={querySelectorAll:q=>q.startsWith('[data-tid^=')?crumbsNow():q.startsWith('[role=')?(masked||block?[mask]:[]):all().filter(e=>q==='[data-tid='+JSON.stringify(e.tid)+']')};
  const ref={workflow_id:'outer',tab_tid:tabTid,prefix,navigation_path:crumbsNow().map(e=>({tid:e.tid,label:e.textContent}))};
  const receipt={phase:'verified',workflowId:'outer',packageNode:pkg,tab,nodeTargetWorkflowNode:outer,crumbs:ref.navigation_path};
  const preparation={id:'doc',document,receipts:new Map([['initial',receipt]])};
  const app={Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelForm};
  const workspace={getActiveTab:()=>({Controller:{Node:{data:{get node(){return current===outer&&crumbs.length===6?owner:current;}}},FController:model}})};
  app.Application={FInstance:{FMainForm:{Items:{Workspace:workspace},FMapTree:{FServerConnection:{UserName:'worker'}}}}};
  const context=vm.createContext({document,location:{origin:'https://app.loginom.ai'},getComputedStyle:()=>({visibility:'visible'}),
    __loginomDockPreparationV1:preparation,bg:{app}});
  const page={evaluate:(fn,args)=>{
      let value;
      // Playwright rethrows a page error as "page.evaluate: Error: <message>\n    at ...".
      try{value=vm.runInContext('('+fn.toString()+')('+JSON.stringify(args)+')',context);}
      catch(error){if(playwrightErrors)throw Error('page.evaluate: Error: '+error.message+'\n    at eval (eval at evaluate (:291:30), <anonymous>:4:43)');throw error;}
      if(loseDispatchReply&&args?.mode==='dispatch'){loseDispatchReply=false;throw Error('lost dispatch reply');}
      return value;
    },
    locator:selector=>({hover:async()=>{
      assert.equal(selector,'[data-tid='+JSON.stringify(prefix+';Graph;Подмодель')+']');
      // Hover alone does not reveal the entry in the observed live DOM.
    },click:async options=>{if(selector.includes('NodesControls')){if(!options?.trial){selections++;entryVisible=true;composite.FEnterLabel.FCell.visible=true;states.set(composite.FEnterLabel.FCell,{text:{node:enter}});}return;}if(options?.trial){
      const failure=trialFail;trialFail=null;
      if(failure==='throw')throw Error('locator.click: Timeout exceeded (trial)');
      if(failure==='block')masked=true;
      return;
    }clicks++;if(selector.includes('GenericEnterLabel')){current=inner;crumbs.push('Подмодель','Модуль','Сценарий');if(foreignOwner)owner.FGuid='foreign';}else if(selector.includes('LeaveSubmodelLabel')){current=outer;crumbs=crumbs.slice(0,5).concat('Подмодель');}else if(selector.includes('cnrNaviMode'))crumbs=crumbs.slice(0,5);else throw Error('Unexpected click');masked=true;if(loseReply){loseReply=false;throw Error('lost click reply');}}}),
    waitForTimeout:async()=>{masked=false;},mouse:{up:async()=>{}}};
  return {page,ref,receipt,preparation,execute:code=>vm.runInNewContext('('+code+')')(page),
    unmask:()=>{masked=false;},clicks:()=>clicks,selections:()=>selections};
}
