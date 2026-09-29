import {createNodeProcedure} from '../lib/node-procedure.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {makeNodeProcessControlCode,inspectNodeProcessControl,runNodeProcessControl} from '../lib/node-process-control.mjs';

function fixture(verb='right_click') {
 class ModelForm{};class WorkFlowTreeNode{};class PackageTreeNode{}
 const elements=[],ids=new WeakMap(),masks=[],make=(tid,box={x:10,y:10,width:100,height:20})=>{
  const e={tid,id:tid,isConnected:true,box,attrs:{},children:[],hidden:false,
   getAttribute(k){return k==='data-tid'?this.tid:this.attrs[k]??null;},
   getBoundingClientRect(){return {...this.box,width:this.hidden?0:this.box.width};},
   contains(child){return this===child||this.children.some(e=>e.contains(child));},
   closest(){return this.disabled?{}:null;},
   querySelectorAll(selector){return this.children.filter(e=>selector==='table.x-grid-item'?e.table:selector==='td[data-tid]'?e.td:false);}};
  e.classList={contains:c=>(e.attrs.class??'').split(' ').includes(c)};elements.push(e);ids.set(e,'ui-'+elements.length);return e;
 };
 const workflowRef={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]};
 const prefix='MF;ConsoleForm',base=prefix+';ProgressForm;',panel=make(prefix),tab=make(workflowRef.tab_tid);tab.attrs.class='x-tab-active';
 const grids=['treepanel;tree','grd;tbl'].map(s=>make(base+'trpProgress;'+s,{x:0,y:0,width:400,height:200}));panel.children=grids;
 const crumb=make(workflowRef.navigation_path[0].tid);crumb.textContent='Scenario';
 const graph=make(workflowRef.prefix+';ModelForm;cmpDiagram'),nodeDom=make(workflowRef.prefix+';Graph;JavaScript');graph.children=[nodeDom];
 const data={},owner={FGuid:'node',data,FCell:{}},model=Object.assign(new ModelForm(),{FDiagram:{FNodes:{FCollection:[owner]}}});
 const packageNode=new PackageTreeNode(),workflow=new WorkFlowTreeNode();workflow.ParentNode=packageNode;
 model.FDiagram.FmxGraph={container:graph,view:{getState:()=>({shape:{node:nodeDom}})}};
 const card={tab:{el:{dom:tab}},Controller:{FController:model,Node:{data:{node:workflow}}}},workspace={getActiveTab:()=>card};
 const record={isModel:true,internalId:'record',data:{id:'1.1',ModelNode:data,CanCancelProcess:true,Status:42,ProgressBarCls:'bg-progress-ptpsProcessing'},childNodes:[]};
 const group={isModel:true,internalId:'group',data:{id:'1',loaded:true},childNodes:[record]},root={isModel:true,internalId:'root',data:{loaded:true},childNodes:[group]};record.parentNode=group;
 const store={$className:'Ext.data.TreeStore',getRoot:()=>root,isLoading:()=>false,getAt:i=>i===1?record:null};
 const views=grids.map(e=>({el:{dom:e},getStore:()=>store}));
 const rows=grids.map(g=>{const r=make('row-'+g.id);r.table=true;r.attrs={'data-recordid':'record','data-boundview':g.id,'data-recordindex':'1',class:'x-grid-item-selected'};g.children=[r];return r;});
 const cell=make(base+'colProcess_Root>Task>Node');cell.td=true;rows[0].children=[cell];
 const menu=make('mnContextMenu'),cancel=make('mnContextMenu;mniCancel');menu.children=[cancel];
 make('mnContextMenu;mniShowNodeToProcess');make('mnContextMenu;mniShowCompletedProcesses');
 const receipt={phase:'verified',workflowId:'flow',tab,packageNode,nodeTargetWorkflowNode:workflow};
 const epoch={epoch:'epoch',revision:100,ids,observer:{takeRecords:()=>[]},captureMutations:()=>{}};
 const target=verb==='right_click'?cell:cancel;
 const document={querySelectorAll:q=>q.includes('role=')?masks:elements.filter(e=>q.startsWith('[data-tid^=')?e.tid.startsWith(JSON.parse(q.slice(11,-1))):q.includes('[data-tid='+JSON.stringify(e.tid)+']')),elementFromPoint:()=>target};
 const prep={document,id:'doc',receipts:new Map([['r',receipt]])};
 const env={document,location:{origin:'http://example'},bg:{app:{Version:'7.4.2',ModelForm,WorkFlowTreeNode,PackageTreeNode,Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}}},
  Ext:{getCmp:id=>views.find((v,i)=>grids[i].id===id)},innerWidth:1000,innerHeight:800,getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'}),__loginomDockPreparationV1:prep};
 const context=vm.createContext(env);context[Symbol.for('loginom-dock.workspace-ui.identity.v1')]=epoch;
 const execute=(fn,arg)=>vm.runInContext('('+fn.toString()+')',context)(arg);
 let hook=()=>{},disposed=0;const clicks=[];
 const page={evaluate:async(fn,args)=>execute(fn,args),evaluateHandle:async(fn,args)=>{const ticket=execute(fn,args);return {evaluate:async(fn,args)=>{hook();return vm.runInContext('('+fn.toString()+')',context)(ticket,args);},dispose:async()=>disposed++};},mouse:{click:async(...args)=>clicks.push(args),up:async()=>{}}};
 const task={binding:{document_id:'doc',workflow_ref:workflowRef,node:{document_id:'doc',workflow_id:'flow',node_id:'node'}},action:{verb,ref:ids.get(target)},
  proof:{root_id:'root',record_id:'record',process_id:'1.1',node_id:'node',owner_verified:true,can_cancel:true,source:'native_process_model_identity'},
  group_record_id:'group',group_id:'1',element:{ref:ids.get(target),tid:target.tid},operation_id:'stop:n1',deadline:Date.now()+10000,origin:'http://example',build:'7.4.2'};
 const readNode=async()=>({verified:true,surface:'graph',node_id:'node'});
 return {page,task,readNode,context,make,document,prep,epoch,owner,record,group,root,workflow,rows,grids,views,store,cell,cancel,menu,panel,tab,masks,clicks,
  setHook:h=>hook=h,get disposed(){return disposed;}};
}
for(const verb of ['right_click','cancel_process'])test('typed '+verb+' captures fresh browser epoch and one exact owned gesture',async()=>{
 const f=fixture(verb);const r=await runNodeProcessControl(f.page,f.task,f.readNode,inspectNodeProcessControl);
 assert.equal(r.status,'SUCCEEDED',JSON.stringify(r));assert.equal(f.clicks.length,1);assert.equal(f.disposed,1);
 assert.equal(f.clicks[0][2].button,verb==='right_click'?'right':'left');assert.equal(r.output.process_control.terminal_verified,false);
 assert.equal(r.trace[0].epoch.revision,100);
});
for(const [name,change] of Object.entries({
 foreign_owner:f=>f.record.data.ModelNode={},replaced_record:f=>f.group.childNodes=[{...f.record}],
 terminal:f=>{f.record.data.Status=3;f.record.data.CanCancelProcess=false;},ambiguous_state:f=>f.record.data.ProgressBarCls+=' bg-progress-ptpsExplicitCanceled',
 replaced_root:f=>f.store.getRoot=()=>({...f.root}),replaced_data:f=>f.record.data={...f.record.data},
 foreign_grid:f=>f.views[1].getStore=()=>({}),foreign_dom:f=>f.views[0].el.dom={},loading:f=>f.store.isLoading=()=>true,
 foreign_row:f=>f.rows[1].attrs['data-recordid']='other',foreign_ordinal:f=>f.store.getAt=()=>({...f.record}),
 replaced_ref:f=>f.epoch.ids.set(f.cell,'other'),hidden:f=>f.cell.hidden=true,disabled:f=>f.cell.disabled=true,
 clipped:f=>f.cell.box.y=195,moved:f=>f.cell.box.x+=10,covered:f=>f.document.elementFromPoint=()=>({}),
 mask:f=>f.masks.push(f.make('mask')),second_panel:f=>f.make('ConsoleForm'),expired:f=>f.task.deadline=0,
 foreign_ancestry:f=>f.workflow.ParentNode={},foreign_tab:f=>f.tab.attrs.class='',foreign_receipt:f=>f.prep.receipts.clear(),foreign_origin:f=>f.context.location.origin='http://foreign',
 epoch:f=>f.epoch.revision++,epoch_ABA:f=>{f.cell.box.x+=10;f.cell.box.x-=10;f.epoch.revision+=2;},
}))test('typed control refuses '+name+' without dispatch',async()=>{
 const f=fixture();f.setHook(()=>change(f));const r=await runNodeProcessControl(f.page,f.task,f.readNode,inspectNodeProcessControl);
 assert.equal(r.status,'NOT_APPLIED',JSON.stringify(r));assert.equal(r.effect_possible,false);assert.equal(r.cleanup_complete,true);assert.equal(f.clicks.length,0);assert.equal(f.disposed,1);
 if(name.startsWith('epoch'))assert.equal(r.error.code,'UI_EPOCH_CHANGED');
});
test('cancel refuses another selected row even when the menu ref is unchanged',async()=>{
 const f=fixture('cancel_process');f.setHook(()=>f.rows[1].attrs.class='');
 const r=await runNodeProcessControl(f.page,f.task,f.readNode,inspectNodeProcessControl);assert.equal(r.status,'NOT_APPLIED');assert.equal(f.clicks.length,0);
});
test('lost gesture reply stays ambiguous and is never repeated by the capability',async()=>{
 const f=fixture();f.page.mouse.click=async(...args)=>{f.clicks.push(args);throw Error('Lost reply');};
 const r=await runNodeProcessControl(f.page,f.task,f.readNode,inspectNodeProcessControl);
 assert.equal(r.status,'AMBIGUOUS');assert.equal(r.effect_possible,true);assert.equal(r.cleanup_complete,false);assert.equal(f.clicks.length,1);assert.equal(f.disposed,1);
});

function admission(f) {
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},context={...node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;JavaScript',locked:false};
 const execution={node,root_id:'root',group_id:'1',group_record_id:'group'};
 const snapshot={origin:f.task.origin,loginom_build:f.task.build,workflow_ref:f.task.binding.workflow_ref,
  dom_epoch:{document:'epoch',revision:1},prepared_node_context:context,wizard:{status:'absent'},scan:{complete:true},
  node_processes:{verified:true,inventory_complete:true,show_completed:true,root_id:'root',node_context:context,processes:[
   {process_id:'1',record_id:'group',parent_id:null,children_loaded:true},
   {process_id:'1.1',record_id:'record',parent_id:'1',owner:{verified:true,node_id:'node',source:'native_process_model_identity'},
    progress_state:{verified:true,state:'running',terminal:false,can_cancel:true}}]},
  ui:{masks:[],dialogs:[],truncated:{masks:false,dialogs:false},elements:[{...f.task.element,allowed_actions:[f.task.action.verb],
   ...(f.task.action.verb==='right_click'?{process_row:{record_id:'record'}}:{process_menu:{cancellation:f.task.proof}})}]}};
 const options={operation_id:'stop:n1',deadline:f.task.deadline,origin:f.task.origin,build:f.task.build};
 return {snapshot,execution,options};
}
for(const verb of ['right_click','cancel_process'])test('serialized Stop admission executes the real prepared-node reader for '+verb,async()=>{
 const f=fixture(verb),a=admission(f),code=makeNodeProcessControlCode(f.task.binding,a.snapshot,f.task.action,a.execution,a.options);
 const r=await Function('return ('+code+')')()(f.page);
 assert.equal(r.status,'SUCCEEDED',JSON.stringify(r));assert.equal(r.operation_id,'stop:n1');assert.equal(f.clicks.length,1);
});
for(const [name,alter] of Object.entries({wrong_verb:(f,a)=>f.task.action.verb='click',foreign_record:(f,a)=>a.snapshot.ui.elements[0].process_row.record_id='foreign',
 foreign_node:(f,a)=>a.execution.node.node_id='foreign',missing_history:(f,a)=>a.snapshot.node_processes.inventory_complete=false,
 expired:(f,a)=>a.options.deadline=0}))test('typed admission rejects '+name+' before browser access',()=>{
 const f=fixture(),a=admission(f);alter(f,a);
 assert.throws(()=>makeNodeProcessControlCode(f.task.binding,a.snapshot,f.task.action,a.execution,a.options));assert.equal(f.clicks.length,0);
});
for(const lost of [false,true])test('channel durably prepares typed Stop before browser dispatch'+(lost?' and retains lost reply':''),async()=>{
 const f=fixture(),a=admission(f),events=[],operation={id:'stop',deadline:f.task.deadline,action:{action_key:'node.apply',revision:'1'}};
 const channel=createNodeProcedure({operation,preparedNodeContext:f.task.binding,targetOrigin:f.task.origin,targetBuild:f.task.build,
  record:async e=>{events.push(e.phase);return structuredClone(e)},wrapMutation:(code,opts)=>({code,opts}),execute:async code=>{
   if(typeof code==='string')return {status:'SUCCEEDED',output:structuredClone(a.snapshot)};
   assert.equal(events.at(-1),'node_step_prepared');assert.ok(code.code.includes('runNodeProcessControl'));
   const r=await Function('return ('+code.code+')')()(f.page);if(lost)throw Error('transport lost');return r;
  }});
 const s=await channel.observe({condition:'owned Stop row',ready:()=>true});
 const run=()=>channel.perform({condition:'owned Stop',initialObservation:s,processControl:a.execution,ready:()=>true,
  resolve:()=>f.task.action,identity:()=>f.task.proof});
 if(lost){await assert.rejects(run(),/transport lost/);assert.equal(operation.transportUncertain,true);assert.equal(operation.cleanupConfirmed,false);}
 else {assert.equal((await run()).status,'SUCCEEDED');assert.equal(events.at(-1),'node_step_completed');}
 assert.equal(f.clicks.length,1);assert.equal(events.filter(e=>e==='node_step_prepared').length,1);
});

test('a failed durable Stop preparation never enters the browser capability',async()=>{
 const f=fixture(),a=admission(f);let mutations=0;
 const channel=createNodeProcedure({operation:{id:'stop',deadline:f.task.deadline,action:{action_key:'node.apply',revision:'1'}},
  preparedNodeContext:f.task.binding,targetOrigin:f.task.origin,targetBuild:f.task.build,
  record:async e=>{if(e.phase==='node_step_prepared')throw Error('disk failure');return structuredClone(e)},
  wrapMutation:()=>{mutations++;throw Error('unexpected browser dispatch')},execute:async()=>({status:'SUCCEEDED',output:structuredClone(a.snapshot)})});
 const s=await channel.observe({condition:'owned row',ready:()=>true});
 await assert.rejects(channel.perform({condition:'owned Stop',initialObservation:s,processControl:a.execution,ready:()=>true,
  resolve:()=>f.task.action,identity:()=>f.task.proof}),/disk failure/);
 assert.equal(mutations,0);assert.equal(f.clicks.length,0);
});

test('Playwright API error prefixes cannot erase the semantic epoch refusal',async()=>{
 const f=fixture(),original=f.page.evaluateHandle;f.setHook(()=>f.epoch.revision++);
 f.page.evaluateHandle=async(...args)=>{const handle=await original(...args),evaluate=handle.evaluate;
  handle.evaluate=async(...args)=>{try{return await evaluate(...args)}catch(error){throw Error('JSHandle.evaluate: '+error.message)}};return handle;};
 const r=await runNodeProcessControl(f.page,f.task,f.readNode,inspectNodeProcessControl);
 assert.equal(r.status,'NOT_APPLIED');assert.equal(r.error.code,'UI_EPOCH_CHANGED');assert.equal(r.effect_possible,false);assert.equal(f.clicks.length,0);
});
